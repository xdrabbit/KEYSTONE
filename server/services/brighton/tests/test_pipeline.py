"""
Brighton pipeline tests: synthetic fixtures through architect -> drafter -> renderer.

No paid calls: the Anthropic client is replaced with a fake, so the drafter's
real parse/assemble code runs but nothing leaves the machine.

Run from the repo root (needs `npm install` for the docx renderer):
    python3 -m unittest discover -s server/services/brighton/tests -v
"""

import importlib
import os
import re
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

BRIGHTON_DIR = Path(__file__).resolve().parent.parent
EXAMPLES = BRIGHTON_DIR / "examples"
TRANSCRIPT = EXAMPLES / "synthetic_hearing_transcript.txt"
FACTS = EXAMPLES / "synthetic_hearing_facts.txt"
sys.path.insert(0, str(BRIGHTON_DIR))

import architect  # noqa: E402
import drafter  # noqa: E402
import renderer  # noqa: E402
import summarizer  # noqa: E402

CANNED = {
    "intro": (
        "THIS MATTER came before the Court on March 12, 2031, on Petitioner's "
        "Motion to Enforce Parent-Time and Child Support."
    ),
    "findings": (
        "FINDINGS OF FACT\n"
        "1. The Court finds that Respondent was repeatedly late to exchanges.\n"
        "2. The Court finds, by stipulation, child support arrears through February 2031."
    ),
    "order": (
        "IT IS ORDERED:\n"
        "1. Friday exchanges shall occur at 6:00 p.m. at the Juniper Public Library.\n"
        "2. Respondent shall pay arrears of $1,850 within 30 days.\n"
        "a. Payment shall be made through the Office of Recovery Services.\n"
        "3. A review hearing shall be held on May 14, 2031, at 9:00 a.m."
    ),
}


class FakeAnthropic:
    """Stands in for anthropic.Anthropic; records calls, returns canned sections."""

    calls = []

    def __init__(self, *args, **kwargs):
        self.messages = SimpleNamespace(create=self._create)

    def _create(self, **kwargs):
        FakeAnthropic.calls.append(kwargs)
        prompt = kwargs["messages"][0]["content"]
        key = re.search(r"drafting the '(\w+)' section", prompt).group(1)
        text = CANNED.get(key, f"[{key} section]")
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)])


def docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    return re.sub(r"<[^>]+>", " ", xml)


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        FakeAnthropic.calls = []

    def tearDown(self):
        self.tmp.cleanup()

    def run_pipeline(self, source: Path, meta=None) -> Path:
        lmd = architect.scaffold(str(source), "court_order", meta, str(self.dir / "o.lmd"))
        with mock.patch.object(drafter.anthropic, "Anthropic", FakeAnthropic), mock.patch.dict(
            os.environ, {"ANTHROPIC_API_KEY": "test-key-not-real"}
        ):
            drafted = drafter.draft(lmd, str(self.dir / "o_drafted.lmd"))
        out = renderer.render(drafted, str(self.dir / "order.docx"))
        return Path(out)

    def test_facts_fixture_architect_extracts_metadata(self):
        lmd = architect.scaffold(str(FACTS), None, None, str(self.dir / "f.lmd"))
        parsed = drafter.parse_lmd(Path(lmd).read_text(encoding="utf-8"))
        meta = parsed["metadata"]
        self.assertEqual(meta["document_type"], "court_order")
        self.assertEqual(meta["case_number"], "990000123")
        self.assertEqual(meta["petitioner"], "Dana R. Whitlock")
        self.assertEqual(meta["respondent"], "Corwin J. Whitlock")
        self.assertEqual(meta["commissioner"], "Vance")
        self.assertEqual(meta["court"], "Ninth Judicial District, Juniper County")
        self.assertIn("ISSUE 2", parsed["facts"])
        self.assertTrue(parsed["sections"])
        self.assertTrue(all(v == "[PENDING]" for v in parsed["sections"].values()))

    def test_transcript_fixture_to_docx_with_mocked_drafter(self):
        meta = {
            "case_number": "990000123",
            "petitioner": "Dana R. Whitlock",
            "respondent": "Corwin J. Whitlock",
            "hearing_date": "March 12, 2031",
            "attorney_petitioner": "Lucinda Arroyo | Arroyo Family Law",
        }
        out = self.run_pipeline(TRANSCRIPT, meta)

        # Drafter was called once per schema section, with the configured model
        # and the transcript as context — and never touched the network.
        self.assertGreaterEqual(len(FakeAnthropic.calls), 3)
        for call in FakeAnthropic.calls:
            self.assertEqual(call["model"], drafter.MODEL)
            self.assertIn("Juniper Public Library", call["messages"][0]["content"])

        self.assertTrue(out.exists())
        self.assertGreater(out.stat().st_size, 2000)
        text = docx_text(out)
        for needle in [
            "Dana R. Whitlock",
            "Corwin J. Whitlock",
            "Case No. 990000123",
            "Lucinda Arroyo",
            "THIS MATTER came before the Court",
            "FINDINGS OF FACT",
            "IT IS ORDERED:",
            "$1,850",
            "Office of Recovery Services",
            "May 14, 2031",
            "END OF ORDER",
        ]:
            self.assertIn(needle, text)
        self.assertNotIn("[PENDING]", text)

    def test_facts_fixture_to_docx_with_mocked_drafter(self):
        out = self.run_pipeline(FACTS)
        text = docx_text(out)
        self.assertIn("NINTH JUDICIAL DISTRICT, JUNIPER COUNTY", text)
        self.assertIn("Commissioner Vance", text)


class SummarizerInputTest(unittest.TestCase):
    def test_accepts_transcript_file_path(self):
        transcript, info = summarizer.get_transcript_from_file(str(TRANSCRIPT), "March 12, 2031")
        self.assertIn("[Commissioner Vance]:", transcript)
        self.assertEqual(info["original_name"], TRANSCRIPT.name)
        self.assertEqual(info["created_at"], "March 12, 2031")

    def test_missing_transcript_file_is_an_error(self):
        with self.assertRaises(FileNotFoundError):
            summarizer.get_transcript_from_file("/nonexistent/transcript.txt")

    def test_cli_file_mode_calls_model_once_and_writes_facts(self):
        class FakeSummarizerClient(FakeAnthropic):
            def _create(self, **kwargs):
                FakeAnthropic.calls.append(kwargs)
                return SimpleNamespace(content=[SimpleNamespace(type="text", text="HEARING: March 12, 2031")])

        FakeAnthropic.calls = []
        with tempfile.TemporaryDirectory() as d, mock.patch.object(
            summarizer.anthropic, "Anthropic", FakeSummarizerClient
        ), mock.patch.dict(os.environ, {"ANTHROPIC_API_KEY": "test-key-not-real"}):
            out = Path(d) / "facts.txt"
            rc = summarizer.main(["--transcript-file", str(TRANSCRIPT), "--output", str(out)])
            self.assertEqual(rc, 0)
            self.assertEqual(out.read_text(encoding="utf-8").strip(), "HEARING: March 12, 2031")
        self.assertEqual(len(FakeAnthropic.calls), 1)
        self.assertEqual(FakeAnthropic.calls[0]["model"], summarizer.MODEL)


class ModelConfigTest(unittest.TestCase):
    RETIRED = "claude-sonnet-4-20250514"

    def test_no_retired_model_ids(self):
        for name in ["drafter.py", "summarizer.py"]:
            self.assertNotIn(self.RETIRED, (BRIGHTON_DIR / name).read_text(encoding="utf-8"))

    def test_models_are_env_overridable(self):
        try:
            with mock.patch.dict(
                os.environ,
                {"BRIGHTON_DRAFTER_MODEL": "drafter-override", "BRIGHTON_SUMMARIZER_MODEL": "summarizer-override"},
            ):
                self.assertEqual(importlib.reload(drafter).MODEL, "drafter-override")
                self.assertEqual(importlib.reload(summarizer).MODEL, "summarizer-override")
        finally:
            env = {k: v for k, v in os.environ.items() if not k.startswith("BRIGHTON_")}
            with mock.patch.dict(os.environ, env, clear=True):
                self.assertEqual(importlib.reload(drafter).MODEL, drafter.DEFAULT_MODEL)
                self.assertEqual(importlib.reload(summarizer).MODEL, summarizer.DEFAULT_MODEL)


class VoiceRegistryTest(unittest.TestCase):
    def test_profiles_present_and_synthetic(self):
        import voice

        for key in ["blaine_edwards", "generic_utah_family", "judicial_officer"]:
            self.assertTrue(voice.get_system_prompt(key))
        with self.assertRaises(ValueError):
            voice.get_voice("no_such_voice")


if __name__ == "__main__":
    unittest.main()
