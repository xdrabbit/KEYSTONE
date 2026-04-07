"""
schemas/court_order.py — Court order document schema.

Defines the sections required for a Utah family court order,
what the Architect puts in each section prompt, and
what the Drafter is asked to generate.
"""

SCHEMA = {
    "document_type": "court_order",
    "display_name": "Court Order",
    "required_metadata": [
        "court",
        "case_number",
        "judge",
        "petitioner",
        "respondent",
        "hearing_date",
        "attorney_petitioner",
        "motion_type",
    ],
    "optional_metadata": [
        "commissioner",
        "attorney_respondent",
        "hearing_time",
        "hearing_method",  # WebEx, in person, etc.
    ],
    "sections": [
        {
            "key": "intro",
            "label": "Introduction Paragraph",
            "prompt": """Write the opening paragraph for this court order.
It must begin with "THIS MATTER came before the Court on [DATE]"
and include: motion type, who was present, how they appeared
(in person / via WebEx), who represented them, and close with
the standard phrase about reviewing filings, hearing arguments,
and considering applicable law before entering findings and order.
Do not include findings yet. One paragraph only.""",
        },
        {
            "key": "findings",
            "label": "Findings of Fact",
            "prompt": """Write the FINDINGS OF FACT section.
Consolidate into 3 to 5 numbered findings maximum.
Do not enumerate every fact — pick the ones that legally matter.
Use "The Court finds" or "The Court notes" as anchors.
Do not include dollar amounts unless legally required.
Do not editorialize or argue. State findings neutrally and precisely.
Start with "FINDINGS OF FACT" as a header, then numbered items.""",
        },
        {
            "key": "order",
            "label": "Order",
            "prompt": """Write the IT IS ORDERED section.
Begin with "IT IS ORDERED:" on its own line.
Use numbered items. Use "shall" for all obligations — never "will" or "must".
For multi-part obligations use sub-lettered items (a, b, c).
Reserve contempt and attorney fees in a single clean item if applicable.
The final numbered item must always be the next review hearing date and time.
Do not use "IT IS HEREBY ORDERED, ADJUDGED, AND DECREED" — ever.
Close with a line break then: *************** END OF ORDER ***************""",
        },
        {
            "key": "signature",
            "label": "Signature Block",
            "prompt": """Write the signature block.
Include:
- [SIGNATURE OF THE COURT APPEARING IN THE TOP MARGIN OF THE FIRST PAGE]
- APPROVED AS TO FORM:
- Petitioner's firm and attorney signature line
- Respondent's firm and attorney signature line (signed with permission)
Follow the exact format used in Utah Fourth District family court orders.""",
        },
    ],
}
