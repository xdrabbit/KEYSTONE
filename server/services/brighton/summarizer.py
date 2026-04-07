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
ATTORNEY PETITIONER: [Name | Firm | Address | City | State | Zip | Phone | Email] - use placeholders like | NOVEL LAW GROUP if not clear.
ATTORNEY RESPONDENT: [Name | Firm]

SOURCE PRIORITY:
- Use the oral ruling reflected below as the source of substance.
- Use prior orders if mentioned as source of structure.

CASE HISTORY:
- [Date]: [Event]
- [Date]: [Event]

TRANSCRIPT RULING NOTES:
- Be very precise and use quotes for key rulings by the Commissioner/Judge.
- Mention specific property items (e.g., Jeep Wrangler, John Deere Gator).
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
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    
    return response.content[0].text

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python summarizer.py <recording_id> <db_path>")
        sys.exit(1)
        
    recording_id = sys.argv[1]
    db_path = sys.argv[2]
    
    try:
        transcript, info = get_transcript(recording_id, db_path)
        if not info:
            print(f"Error: Recording {recording_id} not found in database.")
            sys.exit(1)
            
        facts = summarize_to_facts(transcript, info)
        print(facts)
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)
