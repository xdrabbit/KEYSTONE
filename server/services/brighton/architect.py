"""
architect.py — The Architect.

Reads hearing facts, selects the right document schema,
extracts metadata, and scaffolds a .lmd file ready for the Drafter.

The Architect doesn't write content — it sets the stage.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

# Load schemas
SCHEMA_MAP = {}
try:
    from schemas.court_order import SCHEMA as COURT_ORDER_SCHEMA
    from schemas.motion import SCHEMA as MOTION_SCHEMA
    SCHEMA_MAP["court_order"] = COURT_ORDER_SCHEMA
    SCHEMA_MAP["motion"] = MOTION_SCHEMA
except ImportError:
    pass


def load_facts(path: str) -> str:
    """Load hearing facts from a text file."""
    return Path(path).read_text(encoding="utf-8").strip()


def detect_document_type(facts: str) -> str:
    """
    Auto-detect document type from facts text.
    Falls back to court_order if uncertain.
    """
    facts_lower = facts.lower()
    if any(kw in facts_lower for kw in ["motion to enforce", "review hearing", "findings of fact", "commissioner"]):
        return "court_order"
    if any(kw in facts_lower for kw in ["motion to modify", "motion for", "memorandum"]):
        return "motion"
    return "court_order"


def build_lmd_header(metadata: dict) -> str:
    """Build the YAML frontmatter block for the .lmd file."""
    lines = ["---"]
    for key, value in metadata.items():
        lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines)


def build_lmd_scaffold(schema: dict, metadata: dict, facts: str) -> str:
    """
    Build the full .lmd scaffold with metadata header
    and empty section blocks ready for the Drafter.
    """
    parts = []

    # Frontmatter
    parts.append(build_lmd_header(metadata))
    parts.append("")

    # Facts block — preserved for Drafter context
    parts.append("::facts::")
    parts.append(facts)
    parts.append("")

    # Section scaffolds
    for section in schema["sections"]:
        parts.append(f"::{section['key']}::")
        parts.append("[PENDING]")
        parts.append("")

    return "\n".join(parts)


def extract_metadata(facts: str) -> dict:
    """Extract metadata from facts text."""
    meta = {}

    # Map fact-file headers to LMD frontmatter keys
    mapping = {
        "HEARING": "hearing_date",
        "MOTION": "motion_type",
        "COURT": "court",
        "CASE NUMBER": "case_number",
        "JUDGE": "judge",
        "COMMISSIONER": "commissioner",
        "PETITIONER": "petitioner",
        "RESPONDENT": "respondent",
        "ATTORNEY PETITIONER": "attorney_petitioner",
        "ATTORNEY RESPONDENT": "attorney_respondent",
    }

    for line in facts.splitlines():
        if ":" in line:
            key, _, val = line.partition(":")
            clean_key = key.strip().upper()
            if clean_key in mapping:
                meta[mapping[clean_key]] = val.strip()

    return meta


def scaffold(
    facts_path: str,
    document_type: str = None,
    metadata_overrides: dict = None,
    output_path: str = None,
) -> str:
    """
    Main Architect function.

    Loads facts, selects schema, builds .lmd scaffold.
    Returns path to the scaffolded .lmd file.
    """
    facts = load_facts(facts_path)

    # Detect or use provided document type
    doc_type = document_type or detect_document_type(facts)
    if doc_type not in SCHEMA_MAP:
        raise ValueError(f"Unknown document type: {doc_type}. Available: {list(SCHEMA_MAP.keys())}")

    schema = SCHEMA_MAP[doc_type]

    # Build metadata from facts
    metadata = {
        "document_type": doc_type,
        "generated_at": datetime.now().isoformat(),
        "court": "Fourth Judicial District, Utah County",
        "case_number": "",
        "judge": "",
        "commissioner": "",
        "petitioner": "",
        "respondent": "",
        "hearing_date": "",
        "attorney_petitioner": "",
        "attorney_respondent": "",
        "motion_type": "",
        "voice": "blaine_edwards",
    }

    # Extract from facts text and update
    extracted = extract_metadata(facts)
    metadata.update(extracted)

    # Apply any overrides
    if metadata_overrides:
        metadata.update(metadata_overrides)

    # Build scaffold
    lmd_content = build_lmd_scaffold(schema, metadata, facts)

    # Write output
    if not output_path:
        stem = Path(facts_path).stem
        output_path = f"{stem}.lmd"

    Path(output_path).write_text(lmd_content, encoding="utf-8")
    print(f"[Architect] Scaffolded: {output_path}")
    return output_path


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="LegalMD Architect")
    parser.add_argument("--input", required=True, help="Path to hearing facts text file")
    parser.add_argument("--type", default=None, help="Document type (court_order, motion, decree)")
    parser.add_argument("--output", default=None, help="Output .lmd path")
    parser.add_argument("--meta", default=None, help="JSON string of metadata overrides")
    args = parser.parse_args()

    meta = json.loads(args.meta) if args.meta else None
    scaffold(args.input, args.type, meta, args.output)
