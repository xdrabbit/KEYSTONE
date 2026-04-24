const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const db = require('../database');

function getTranscriptData(recordingId) {
  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId);
  if (!recording) throw new Error('Recording not found');

  const segments = db.prepare(
    'SELECT * FROM segments WHERE recording_id = ? ORDER BY start_time'
  ).all(recordingId);

  const speakerLabels = db.prepare(
    'SELECT * FROM speaker_labels WHERE recording_id = ?'
  ).all(recordingId);

  const speakerMap = {};
  for (const sl of speakerLabels) {
    speakerMap[sl.original_label] = sl.display_name;
  }

  return { recording, segments, speakerMap };
}

function formatTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function exportMarkdown(recordingId) {
  const { recording, segments, speakerMap } = getTranscriptData(recordingId);

  let md = `# ${recording.original_name}\n\n`;
  md += `**Date:** ${recording.created_at}\n`;
  if (recording.duration) md += `**Duration:** ${formatTimestamp(recording.duration)}\n`;
  if (recording.language) md += `**Language:** ${recording.language}\n`;
  md += '\n---\n\n';

  let lastSpeaker = null;
  for (const seg of segments) {
    const speaker = speakerMap[seg.speaker] || seg.speaker || 'Unknown';
    const timestamp = formatTimestamp(seg.start_time);

    if (speaker !== lastSpeaker) {
      md += `\n**${speaker}** [${timestamp}]\n\n`;
      lastSpeaker = speaker;
    }
    md += `${seg.text} `;
  }

  return md.trim();
}

function exportPDF(recordingId) {
  const { recording, segments, speakerMap } = getTranscriptData(recordingId);
  const doc = new PDFDocument({ margin: 50, size: 'A4' });

  // Title
  doc.fontSize(20).font('Helvetica-Bold').text(recording.original_name, { align: 'center' });
  doc.moveDown(0.5);

  // Metadata
  doc.fontSize(10).font('Helvetica').fillColor('#666666');
  doc.text(`Date: ${recording.created_at}`);
  if (recording.duration) doc.text(`Duration: ${formatTimestamp(recording.duration)}`);
  if (recording.language) doc.text(`Language: ${recording.language}`);
  doc.moveDown(0.5);

  // Divider
  doc.strokeColor('#cccccc').lineWidth(1)
    .moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // Transcript
  doc.fillColor('#000000');
  let lastSpeaker = null;

  for (const seg of segments) {
    const speaker = speakerMap[seg.speaker] || seg.speaker || 'Unknown';
    const timestamp = formatTimestamp(seg.start_time);

    if (speaker !== lastSpeaker) {
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#2563eb')
        .text(`${speaker}`, { continued: true });
      doc.font('Helvetica').fontSize(9).fillColor('#888888')
        .text(`  [${timestamp}]`);
      doc.moveDown(0.2);
      lastSpeaker = speaker;
    }

    doc.fontSize(10).font('Helvetica').fillColor('#333333')
      .text(seg.text, { align: 'left', lineGap: 2 });
  }

  return doc;
}

async function exportDocx(recordingId) {
  const { recording, segments, speakerMap } = getTranscriptData(recordingId);

  const children = [];

  // Title
  children.push(new Paragraph({
    text: recording.original_name,
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 200 },
  }));

  // Metadata
  const metaLines = [`Date: ${recording.created_at}`];
  if (recording.duration) metaLines.push(`Duration: ${formatTimestamp(recording.duration)}`);
  if (recording.language) metaLines.push(`Language: ${recording.language}`);

  for (const line of metaLines) {
    children.push(new Paragraph({
      children: [new TextRun({ text: line, size: 20, color: '666666' })],
      spacing: { after: 40 },
    }));
  }

  children.push(new Paragraph({ text: '', spacing: { after: 200 } }));

  // Transcript
  let lastSpeaker = null;
  for (const seg of segments) {
    const speaker = speakerMap[seg.speaker] || seg.speaker || 'Unknown';
    const timestamp = formatTimestamp(seg.start_time);

    if (speaker !== lastSpeaker) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: speaker, bold: true, size: 22, color: '2563EB' }),
          new TextRun({ text: `  [${timestamp}]`, size: 18, color: '888888' }),
        ],
        spacing: { before: 200, after: 80 },
      }));
      lastSpeaker = speaker;
    }

    children.push(new Paragraph({
      children: [new TextRun({ text: seg.text, size: 20 })],
      spacing: { after: 40 },
    }));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { exportMarkdown, exportPDF, exportDocx };
