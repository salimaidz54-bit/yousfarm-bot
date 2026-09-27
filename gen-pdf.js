const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const mdPath = path.join(__dirname, 'BOT_COMMANDS.md');
const pdfPath = path.join(__dirname, 'BOT_COMMANDS.pdf');
const markdown = fs.readFileSync(mdPath, 'utf8');

// Try to use Arial for Arabic support
const arialPath = 'C:\\Windows\\Fonts\\arial.ttf';
const hasArial = fs.existsSync(arialPath);

const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'portrait' });
doc.pipe(fs.createWriteStream(pdfPath));

if (hasArial) {
  try { doc.registerFont('Arabic', arialPath); doc.font('Arabic'); } catch(e){ console.log('font error', e.message)}
} else {
  doc.font('Helvetica');
}

doc.fontSize(18).text('بوت YousFarm — دليل الأوامر الكامل + أوامر التيرمينال', { align: 'center' });
doc.moveDown(0.5);
doc.fontSize(9).fillColor('gray').text('YousFarm DZ Telegram Store Bot — Complete Commands Guide', { align: 'center' });
doc.moveDown(1);
doc.fillColor('black').fontSize(9);

// Simple markdown to text conversion for PDF
const lines = markdown.split('\n');
lines.forEach(line => {
  if (!line.trim()) { doc.moveDown(0.3); return; }
  if (line.startsWith('# ')) {
    doc.moveDown(0.4);
    doc.fontSize(14).fillColor('#0088cc').text(line.replace(/^#+\s*/, ''), { align: 'right' });
    doc.fontSize(9).fillColor('black');
  } else if (line.startsWith('## ')) {
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor('#006699').text(line.replace(/^#+\s*/, ''), { align: 'right' });
    doc.fontSize(9).fillColor('black');
  } else if (line.startsWith('### ')) {
    doc.fontSize(10).fillColor('#333').text(line.replace(/^#+\s*/, ''), { align: 'right' });
    doc.fontSize(9).fillColor('black');
  } else if (line.startsWith('|')) {
    // table row - just as text
    doc.fontSize(7).text(line, { align: 'right' });
    doc.fontSize(9);
  } else if (line.startsWith('```')) {
    doc.fillColor('#555');
  } else if (line.startsWith('- ') || line.startsWith('* ')) {
    doc.text('• ' + line.substring(2), { align: 'right' });
  } else if (line.startsWith('1. ') || /^\d+\./.test(line)) {
    doc.text(line, { align: 'right' });
  } else {
    doc.text(line, { align: 'right', features: ['rtla'] });
  }
  if (doc.y > 750) { doc.addPage(); if (hasArial) doc.font('Arabic'); }
});

doc.end();
console.log('PDF generated at', pdfPath, 'hasArial:', hasArial);
