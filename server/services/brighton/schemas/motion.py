# server/services/brighton/schemas/motion.py

SCHEMA = {
    "key": "motion",
    "name": "Motion and Memorandum",
    "sections": [
        {
            "key": "caption",
            "prompt": "Draft the Title and Introduction. (e.g., 'MOTION FOR TEMPORARY ORDERS AND MEMORANDUM IN SUPPORT'). Identify the parties and the motion type.",
        },
        {
            "key": "relief",
            "prompt": "RELIEF REQUESTED: Concisely state exactly what Petitioner/Respondent is asking the court to order. (e.g., 'Petitioner requests temporary exclusive use of the marital residence.')",
        },
        {
            "key": "facts",
            "prompt": "STATEMENT OF FACTS: Present the specific underlying facts from the hearing/transcript that justify the relief requested. Be objective and build the narrative.",
        },
        {
            "key": "basis",
            "prompt": "LEGAL BASIS: State the authority (Utah Rules of Civil Procedure Rule 7, Rule 101, or Utah Code Section 30-3-3). Argue why the law applies to these facts.",
        },
        {
            "key": "conclusion",
            "prompt": "CONCLUSION: Final short summary requesting the court grant the relief. End with 'RESPECTFULLY SUBMITTED' placeholder.",
        },
    ],
}
