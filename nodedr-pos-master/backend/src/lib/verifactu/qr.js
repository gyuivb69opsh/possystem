// QR rendering helpers for the VERI*FACTU invoice QR: error correction M (as AEAT requires), drawn from the
// code's own modules so no image file is involved.
const QRCode = require('qrcode');

function modules(data) {
  const qr = QRCode.create(data, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, get: (x, y) => !!qr.modules.get(x, y) };
}

/** Inline SVG at a CSS size such as "35mm". */
function qrSvg(data, size) {
  const m = modules(data);
  const cells = [];
  for (let y = 0; y < m.size; y += 1) {
    for (let x = 0; x < m.size; x += 1) if (m.get(x, y)) cells.push(`M${x},${y}h1v1h-1z`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.size} ${m.size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR tributario"><path d="${cells.join('')}" fill="#000"/></svg>`;
}

/** Draws the QR into a PDFKit document with its top-left corner at (x, y), `sizePt` points wide. */
function drawQrPdf(doc, data, x, y, sizePt) {
  const m = modules(data);
  const cell = sizePt / m.size;
  doc.save();
  doc.fillColor('#000');
  for (let r = 0; r < m.size; r += 1) {
    for (let c = 0; c < m.size; c += 1) {
      if (m.get(c, r)) doc.rect(x + c * cell, y + r * cell, cell + 0.2, cell + 0.2).fill();
    }
  }
  doc.restore();
}

/**
 * Native ESC/POS QR (GS ( k, model 2, error correction M, centred) as a Buffer. Module size 6 prints a
 * VERI*FACTU URL at about 33 mm on 203 dpi paper, inside AEAT's 30-40 mm range.
 */
function escposQr(data, moduleSize = 6) {
  const bytes = Buffer.from(data, 'utf8');
  const len = bytes.length + 3;
  return Buffer.concat([
    Buffer.from([0x1b, 0x61, 1]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, moduleSize]),
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31]),
    Buffer.from([0x1d, 0x28, 0x6b, len & 0xff, len >> 8, 0x31, 0x50, 0x30]),
    bytes,
    Buffer.from([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]),
    Buffer.from('\n'),
    Buffer.from([0x1b, 0x61, 0]),
  ]);
}

module.exports = { qrSvg, drawQrPdf, escposQr };
