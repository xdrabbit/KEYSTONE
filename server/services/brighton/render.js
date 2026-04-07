/**
 * render.js — LegalMD Word Document Renderer
 *
 * Receives a JSON payload from renderer.py and produces
 * a properly formatted Utah family court order .docx file.
 *
 * Usage: node render.js payload.json
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  PageNumber,
  Header,
  Footer,
  TabStopType,
  TabStopPosition,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ── Helpers ───────────────────────────────────────────────────────────────────

function spacer(lines = 1) {
  return Array(lines)
    .fill(null)
    .map(
      () =>
        new Paragraph({
          children: [new TextRun("")],
          spacing: { after: 0 },
        })
    );
}

function centeredBold(text, size = 24) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, size, font: "Times New Roman" })],
    spacing: { after: 120 },
  });
}

function sectionHeader(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, font: "Times New Roman" })],
    spacing: { before: 240, after: 120 },
  });
}

function bodyParagraph(text, options = {}) {
  return new Paragraph({
    children: [
      new TextRun({
        text,
        size: 24,
        font: "Times New Roman",
        ...options,
      }),
    ],
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function numberedItem(number, text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${number}. ${text}`,
        size: 24,
        font: "Times New Roman",
      }),
    ],
    indent: { left: 720, hanging: 360 },
    spacing: { after: 120 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function subItem(letter, text) {
  return new Paragraph({
    children: [
      new TextRun({
        text: `${letter}. ${text}`,
        size: 24,
        font: "Times New Roman",
      }),
    ],
    indent: { left: 1440, hanging: 360 },
    spacing: { after: 100 },
    alignment: AlignmentType.JUSTIFIED,
  });
}

function divider() {
  return new Paragraph({
    children: [new TextRun("")],
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
    },
    spacing: { after: 120 },
  });
}

function endMarker() {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text: "*************** END OF ORDER ***************",
        size: 24,
        font: "Times New Roman",
      }),
    ],
    spacing: { before: 240, after: 240 },
  });
}

// ── Section Parsers ───────────────────────────────────────────────────────────

/**
 * Parse a block of text into paragraphs.
 * Handles numbered items (1. 2. 3.) and sub-items (a. b. c.)
 */
function parseTextBlock(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const paragraphs = [];

  for (const line of lines) {
    // Skip the END OF ORDER marker — we add it explicitly
    if (line.includes("END OF ORDER")) continue;

    // Numbered item: starts with digit + period
    const numMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (numMatch) {
      paragraphs.push(numberedItem(numMatch[1], numMatch[2]));
      continue;
    }

    // Sub-item: starts with letter + period
    const subMatch = line.match(/^([a-z])\.\s+(.+)/i);
    if (subMatch && subMatch[1].length === 1) {
      paragraphs.push(subItem(subMatch[1], subMatch[2]));
      continue;
    }

    // Section header (all caps, no period at end)
    if (line === line.toUpperCase() && !line.endsWith(".") && line.length > 3) {
      paragraphs.push(sectionHeader(line));
      continue;
    }

    // Regular paragraph
    paragraphs.push(bodyParagraph(line));
  }

  return paragraphs;
}

// ── Attorney Header ───────────────────────────────────────────────────────────

function buildAttorneyHeader(metadata) {
  const parts = (metadata.attorney_petitioner || "").split("|").map((s) => s.trim());
  const [name, firm, address, city, phone, email] = parts;

  const lines = [];
  if (name) lines.push(new Paragraph({ children: [new TextRun({ text: name, size: 24, font: "Times New Roman" })] }));
  if (firm) lines.push(new Paragraph({ children: [new TextRun({ text: firm, size: 24, font: "Times New Roman" })] }));
  if (address) lines.push(new Paragraph({ children: [new TextRun({ text: address, size: 24, font: "Times New Roman" })] }));
  if (city) lines.push(new Paragraph({ children: [new TextRun({ text: city, size: 24, font: "Times New Roman" })] }));
  if (phone) lines.push(new Paragraph({ children: [new TextRun({ text: phone, size: 24, font: "Times New Roman" })] }));
  if (email) lines.push(new Paragraph({ children: [new TextRun({ text: email, size: 24, font: "Times New Roman", italics: true })] }));

  lines.push(new Paragraph({ children: [new TextRun({ text: "Attorney for Petitioner", size: 24, font: "Times New Roman", italics: true })] }));

  return lines;
}

// ── Court Caption Table ───────────────────────────────────────────────────────

function buildCaption(metadata) {
  // Utah court caption — two-column layout using tab stops
  const court = metadata.court || "Fourth Judicial District Court, Utah County";
  const docTitle = buildDocumentTitle(metadata);

  return [
    ...spacer(1),
    centeredBold(court.toUpperCase(), 24),
    centeredBold("STATE OF UTAH", 24),
    ...spacer(1),
    new Paragraph({
      children: [
        new TextRun({ text: "In the Matter of the Marriage of", size: 24, font: "Times New Roman", italics: true }),
      ],
    }),
    new Paragraph({ children: [new TextRun({ text: "", size: 24 })] }),
    new Paragraph({
      children: [new TextRun({ text: metadata.petitioner || "", size: 24, bold: true, font: "Times New Roman" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "          Petitioner,", size: 24, font: "Times New Roman" })] }),
    new Paragraph({ children: [new TextRun({ text: "and", size: 24, font: "Times New Roman" })] }),
    new Paragraph({
      children: [new TextRun({ text: metadata.respondent || "", size: 24, bold: true, font: "Times New Roman" })],
    }),
    new Paragraph({ children: [new TextRun({ text: "          Respondent.", size: 24, font: "Times New Roman" })] }),
    ...spacer(1),
    new Paragraph({
      children: [new TextRun({ text: docTitle, size: 24, bold: true, font: "Times New Roman" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Case No. ${metadata.case_number || ""}`, size: 24, font: "Times New Roman" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `Judge ${metadata.judge || ""}`, size: 24, font: "Times New Roman" })],
    }),
    metadata.commissioner
      ? new Paragraph({
          children: [new TextRun({ text: `Commissioner ${metadata.commissioner}`, size: 24, font: "Times New Roman" })],
        })
      : null,
  ].filter(Boolean);
}

function buildDocumentTitle(metadata) {
  const date = metadata.hearing_date
    ? new Date(metadata.hearing_date).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  return `ORDER ON REVIEW HEARING HELD ON ${date.toUpperCase()}`;
}

// ── Main Builder ──────────────────────────────────────────────────────────────

function buildDocument(payload) {
  const { metadata, sections } = payload;
  const children = [];

  // Attorney header
  children.push(...buildAttorneyHeader(metadata));
  children.push(...spacer(2));

  // Court caption
  children.push(...buildCaption(metadata));
  children.push(...spacer(1));
  children.push(divider());

  // Intro paragraph
  if (sections.intro) {
    children.push(...parseTextBlock(sections.intro));
  }

  // Findings
  if (sections.findings) {
    children.push(...parseTextBlock(sections.findings));
  }

  children.push(...spacer(1));

  // Order
  if (sections.order) {
    children.push(...parseTextBlock(sections.order));
  }

  children.push(endMarker());

  // Signature
  if (sections.signature) {
    children.push(...parseTextBlock(sections.signature));
  }

  return new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children,
      },
    ],
  });
}

// ── Entry Point ───────────────────────────────────────────────────────────────

async function main() {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    console.error("Usage: node render.js payload.json");
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const doc = buildDocument(payload);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(payload.output_path, buffer);
  console.log(`[render.js] Written: ${payload.output_path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
