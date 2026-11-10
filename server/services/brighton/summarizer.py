import os
import sys
import sqlite3
import json
from pathlib import Path
from dotenv import load_dotenv
import anthropic

# Locate the .env file in the same directory as the script or in the server root
# For ghost-scribe, .env is usually in the root
# We'll try to find it.
env_path = Path(__file__).parent / ".env"
if not env_path.exists():
    env_path = Path(__file__).parent.parent.parent / ".env"
    
load_dotenv(dotenv_path=env_path)

# Model is env-overridable so the next model retirement is a .env change,
# not a code change. See .env.example (BRIGHTON_SUMMARIZER_MODEL).
DEFAULT_MODEL = "claude-sonnet-5-5"
MODEL = os.getenv("BRIGHTON_SUMMARIZER_MODEL") or DEFAULT_MODEL


def get_transcript_from_file(transcript_path, hearing_date=None):
    """
    Load a transcript from a plain-text file instead of the Ghost Scribe DB.

    Returns the same (transcript, recording_info) shape as get_transcript(),
    so summarize_to_facts() works unchanged.
    """
    path = Path(transcript_path)
    if not path.is_file():
        raise FileNotFoundError(f"Transcript file not found: {transcript_path}")
    transcript = path.read_text(encoding="utf-8").strip()
    if not transcript:
        raise ValueError(f"Transcript file is empty: {transcript_path}")
    info = {
        "original_name": path.name,
        "created_at": hearing_date or "not provided - take the date from the transcript",
    }
    return transcript, info


def get_transcript(recording_id, db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get speaker display names
    cursor.execute("SELECT original_label, display_name FROM speaker_labels WHERE recording_id = ?", (recording_id,))
    speaker_map = {row['original_label']: row['display_name'] for row in cursor.fetchall()}
    
    # Get segments
    cursor.execute("SELECT speaker, text, start_time FROM segments WHERE recording_id = ? ORDER BY start_time", (recording_id,))
    segments = cursor.fetchall()
    
    transcript_lines = []
    for s in segments:
        speaker = speaker_map.get(s['speaker'], s['speaker']) if s['speaker'] else "Unknown"
        transcript_lines.append(f"[{speaker}]: {s['text']}")
        
    # Get recording metadata
    cursor.execute("SELECT original_name, created_at FROM recordings WHERE id = ?", (recording_id,))
    recording = cursor.fetchone()
    
    conn.close()
    return "\n".join(transcript_lines), recording

def summarize_to_facts(transcript, recording_info):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback to check parent directory .env if not found
        api_key = os.getenv("ANTHROPIC_API_KEY")
        
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not found in environment variables.")

    client = anthropic.Anthropic(api_key=api_key)
    
    system_prompt = """You are a legal assistant specializing in summarizing Utah family court hearings.
Your job is to take a raw, diarized transcript and convert it into a structured "Hearing Facts" document for Brighton.

The format MUST be exactly like this:

HEARING: [Date]
MOTION: [Summary of the motion or hearing type]
COURT: [e.g., Fourth Judicial District, Utah County - guess if not clear but defaults to Utah Fourth District]
CASE NUMBER: [Case number if mentioned]
JUDGE: [Judge name if mentioned]
COMMISSIONER: [Commissioner name if mentioned]
PETITIONER: [Petitioner name]
RESPONDENT: [Respondent name]
ATTORNEY PETITIONER: [Name | Firm | Address | City | State | Zip | Phone | Email] - use bracketed placeholders like [Firm] if not clear.
ATTORNEY RESPONDENT: [Name | Firm]

HEADER RULES:
- Header values are bare values only: names without roles, notes, or parentheticals
  (write "JUDGE: Jane Doe", never "JUDGE: Jane Doe (assigned judge)").
- How each party appeared goes on its own line:
PETITIONER APPEARANCE: [in person / WebEx]
RESPONDENT APPEARANCE: [in person / WebEx]

SOURCE PRIORITY:
- Use the oral ruling reflected below as the source of substance.
- Use prior orders if mentioned as source of structure.

CASE HISTORY:
- [Date]: [Event]
- [Date]: [Event]

TRANSCRIPT RULING NOTES:
- Be very precise and use quotes for key rulings by the Commissioner/Judge.
- Mention specific items, amounts, dates, times, and locations exactly as ruled.
- Mention specific findings of contempt or compliance.

ISSUES BEFORE THE COURT TODAY:
1. [ISSUE NAME]
[Brief description of facts]
RULING: [Precise ruling of the court]

NEXT STEPS:
- [Next action item]

Return ONLY the facts document, no intro or outro."""

    user_prompt = f"""Summarize the following hearing transcript:
    
ORIGINAL NAME: {recording_info['original_name']}
HEARING DATE: {recording_info['created_at']}

TRANSCRIPT:
{transcript}"""

    response = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    
    return "".join(
        block.text for block in response.content if getattr(block, "type", "text") == "text"
    ).strip()

USAGE = """Usage:
  python summarizer.py <recording_id> <db_path>
  python summarizer.py --transcript-file <path> [--hearing-date <date>] [--output <facts.txt>]"""


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(
        description="Brighton Summarizer: hearing transcript -> Hearing Facts",
        usage=USAGE,
    )
    parser.add_argument("recording_id", nargs="?", help="Ghost Scribe recording ID")
    parser.add_argument("db_path", nargs="?", help="Path to the Ghost Scribe SQLite DB")
    parser.add_argument("--transcript-file", help="Plain-text transcript file (instead of a recording ID)")
    parser.add_argument("--hearing-date", default=None, help="Hearing date, if not stated in the transcript")
    parser.add_argument("--output", default=None, help="Write facts to this file instead of stdout")
    args = parser.parse_args(argv)

    try:
        if args.transcript_file:
            transcript, info = get_transcript_from_file(args.transcript_file, args.hearing_date)
        elif args.recording_id and args.db_path:
            transcript, info = get_transcript(args.recording_id, args.db_path)
            if not info:
                print(f"Error: Recording {args.recording_id} not found in database.", file=sys.stderr)
                return 1
        else:
            print(USAGE, file=sys.stderr)
            return 1

        facts = summarize_to_facts(transcript, info)
        if args.output:
            Path(args.output).write_text(facts + "\n", encoding="utf-8")
            print(f"[Summarizer] Wrote facts: {args.output}", file=sys.stderr)
        else:
            print(facts)
        return 0
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
