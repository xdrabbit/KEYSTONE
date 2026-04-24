"""
drafter.py — The Drafter.

Takes a scaffolded .lmd file and fills each [PENDING] section
by calling the Claude API with the attorney's voice profile
and the hearing facts as context.

Each section is drafted independently but with full facts context.
This keeps token usage manageable and output quality high.
"""

import os
import re
import sys
import time
from pathlib import Path
from dotenv import load_dotenv
import anthropic

load_dotenv()

# Load schemas and voice
sys.path.insert(0, str(Path(__file__).parent))
from voice import get_system_prompt
from schemas.court_order import SCHEMA as COURT_ORDER_SCHEMA

SCHEMA_MAP = {
    "court_order": COURT_ORDER_SCHEMA,
}

MODEL = "claude-sonnet-4-20250514"


def parse_lmd(content: str) -> dict:
    """
    Parse a .lmd file into its components:
    - metadata (frontmatter)
    - facts
    - sections dict {key: content}
    """
    # Extract frontmatter
    fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    metadata = {}
    if fm_match:
        for line in fm_match.group(1).splitlines():
            if ": " in line:
                key, _, value = line.partition(": ")
                metadata[key.strip()] = value.strip()

    # Extract facts block
    facts = ""
    facts_match = re.search(r"::facts::\n(.*?)(?=\n::|$)", content, re.DOTALL)
    if facts_match:
        facts = facts_match.group(1).strip()

    # Extract all sections
    sections = {}
    section_matches = re.finditer(r"::(\w+)::\n(.*?)(?=\n::|$)", content, re.DOTALL)
    for match in section_matches:
        key = match.group(1)
        value = match.group(2).strip()
        if key != "facts":
            sections[key] = value

    return {"metadata": metadata, "facts": facts, "sections": sections}


def build_section_prompt(section_key: str, section_prompt: str, facts: str, metadata: dict, drafted_so_far: str) -> str:
    """
    Build the user prompt for drafting a single section.
    Includes facts, metadata, what's been drafted so far, and section instructions.
    """
    meta_lines = "\n".join(f"  {k}: {v}" for k, v in metadata.items() if v)

    prompt = f"""You are drafting the '{section_key}' section of a court order.

CASE METADATA:
{meta_lines}

HEARING FACTS (from transcript or summary):
{facts}

{"SECTIONS DRAFTED SO FAR:" if drafted_so_far else ""}
{drafted_so_far}

YOUR TASK — Draft the '{section_key}' section:
{section_prompt}

Write only the content for this section. No preamble, no explanation.
Start writing immediately."""

    return prompt


def draft_section(
    client: anthropic.Anthropic,
    section_key: str,
    section_prompt: str,
    facts: str,
    metadata: dict,
    drafted_so_far: str,
    voice_key: str,
) -> str:
    """Draft a single section using the Claude API."""
    system_prompt = get_system_prompt(voice_key)
    user_prompt = build_section_prompt(section_key, section_prompt, facts, metadata, drafted_so_far)

    print(f"  [Drafter] Drafting section: {section_key}...")

    response = client.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    return response.content[0].text.strip()


def draft(lmd_path: str, output_path: str = None) -> str:
    """
    Main Drafter function.

    Reads a scaffolded .lmd file, fills each [PENDING] section
    by calling Claude, writes the completed .lmd file.
    Returns path to completed .lmd file.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set in environment or .env file")

    client = anthropic.Anthropic(api_key=api_key)

    # Parse the .lmd file
    content = Path(lmd_path).read_text(encoding="utf-8")
    parsed = parse_lmd(content)

    metadata = parsed["metadata"]
    facts = parsed["facts"]
    sections = parsed["sections"]
    voice_key = metadata.get("voice", "blaine_edwards")
    doc_type = metadata.get("document_type", "court_order")

    if not facts:
        raise ValueError("No ::facts:: block found in .lmd file. Run architect.py first.")

    # Get schema for section prompts
    schema = SCHEMA_MAP.get(doc_type)
    if not schema:
        raise ValueError(f"No schema found for document type: {doc_type}")

    section_prompts = {s["key"]: s["prompt"] for s in schema["sections"]}

    # Draft each pending section in order
    drafted_so_far = ""
    completed_sections = {}

    for section in schema["sections"]:
        key = section["key"]
        current_content = sections.get(key, "[PENDING]")

        if current_content == "[PENDING]":
            drafted_text = draft_section(
                client=client,
                section_key=key,
                section_prompt=section_prompts[key],
                facts=facts,
                metadata=metadata,
                drafted_so_far=drafted_so_far,
                voice_key=voice_key,
            )
            completed_sections[key] = drafted_text
            drafted_so_far += f"\n\n[{key.upper()}]\n{drafted_text}"
            time.sleep(0.5)  # be kind to the API
        else:
            completed_sections[key] = current_content
            drafted_so_far += f"\n\n[{key.upper()}]\n{current_content}"

    # Rebuild the .lmd with completed sections
    output_lines = []

    # Frontmatter
    output_lines.append("---")
    for key, value in metadata.items():
        output_lines.append(f"{key}: {value}")
    output_lines.append("---")
    output_lines.append("")

    # Facts (preserved)
    output_lines.append("::facts::")
    output_lines.append(facts)
    output_lines.append("")

    # Completed sections
    for section in schema["sections"]:
        key = section["key"]
        output_lines.append(f"::{key}::")
        output_lines.append(completed_sections.get(key, ""))
        output_lines.append("")

    completed_content = "\n".join(output_lines)

    # Write output
    if not output_path:
        stem = Path(lmd_path).stem
        output_path = f"{stem}_drafted.lmd"

    Path(output_path).write_text(completed_content, encoding="utf-8")
    print(f"[Drafter] Complete: {output_path}")
    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LegalMD Drafter")
    parser.add_argument("--input", required=True, help="Path to scaffolded .lmd file")
    parser.add_argument("--output", default=None, help="Output path for completed .lmd")
    args = parser.parse_args()

    draft(args.input, args.output)
