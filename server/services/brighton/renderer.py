"""
renderer.py — The Renderer.

Converts a completed .lmd file to a formatted .docx
using the Node.js docx library via render.js.

The .lmd is parsed, content is extracted section by section,
and passed to render.js which handles all Word formatting.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_completed_lmd(content: str) -> dict:
    """Parse a completed .lmd file into metadata + sections."""
    # Frontmatter
    fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    metadata = {}
    if fm_match:
        for line in fm_match.group(1).splitlines():
            if ": " in line:
                key, _, value = line.partition(": ")
                metadata[key.strip()] = value.strip()

    # All sections including facts
    sections = {}
    section_matches = re.finditer(r"::(\w+)::\n(.*?)(?=\n::|$)", content, re.DOTALL)
    for match in section_matches:
        key = match.group(1)
        value = match.group(2).strip()
        sections[key] = value

    return {"metadata": metadata, "sections": sections}


def render(lmd_path: str, output_path: str = None) -> str:
    """
    Main Renderer function.

    Parses completed .lmd, passes JSON payload to render.js,
    which produces the final .docx file.
    Returns path to .docx file.
    """
    content = Path(lmd_path).read_text(encoding="utf-8")
    parsed = parse_completed_lmd(content)

    if not output_path:
        stem = Path(lmd_path).stem.replace("_drafted", "")
        output_path = f"{stem}_final.docx"

    # Build payload for render.js
    payload = {
        "metadata": parsed["metadata"],
        "sections": parsed["sections"],
        "output_path": str(Path(output_path).absolute()),
    }

    # Write payload to temp file
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp_path = tmp.name

    try:
        # Call render.js
        render_js = Path(__file__).parent / "render.js"
        result = subprocess.run(
            ["node", str(render_js), tmp_path],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            print(f"[Renderer] Error:\n{result.stderr}")
            raise RuntimeError(f"render.js failed: {result.stderr}")

        print(f"[Renderer] Complete: {output_path}")
        return output_path

    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LegalMD Renderer")
    parser.add_argument("--input", required=True, help="Path to completed .lmd file")
    parser.add_argument("--output", default=None, help="Output .docx path")
    args = parser.parse_args()

    render(args.input, args.output)
