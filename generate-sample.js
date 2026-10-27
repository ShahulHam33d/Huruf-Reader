const fs = require('fs');

// Generate a valid minimal PDF 1.4 with selectable text for testing
function generateSamplePDF() {
  const content = `BT
/F1 18 Tf
50 720 Td
(HurufReader Architecture Spike Phase 0) Tj
0 -36 Td
/F1 12 Tf
(This is the first sentence that will be tested with highlighting in HurufReader.) Tj
0 -24 Td
(This is the second sentence that will be tested with highlighting in HurufReader.) Tj
0 -24 Td
(Adobe Acrobat and Microsoft Edge will render these highlights identically.) Tj
ET`;

  const contentLength = Buffer.byteLength(content, 'utf8');

  let pdf = `%PDF-1.4
%âãÏÓ
1 0 obj
<<
  /Type /Catalog
  /Pages 2 0 R
>>
endobj
2 0 obj
<<
  /Type /Pages
  /Kids [3 0 R]
  /Count 1
>>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Contents 4 0 R
  /Resources <<
    /Font <<
      /F1 5 0 R
    >>
  >>
>>
endobj
4 0 obj
<<
  /Length ${contentLength}
>>
stream
${content}
endstream
endobj
5 0 obj
<<
  /Type /Font
  /Subtype /Type1
  /BaseFont /Helvetica
>>
endobj
`;

  const lines = pdf.split('\n');
  const offsets = [];
  let currentOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] + (i < lines.length - 1 ? '\n' : '');
    const match = line.match(/^(\d+)\s+0\s+obj/);
    if (match) {
      offsets[parseInt(match[1], 10)] = currentOffset;
    }
    currentOffset += Buffer.byteLength(line, 'utf8');
  }

  const xrefOffset = currentOffset;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  }
  const trailer = `trailer
<<
  /Size 6
  /Root 1 0 R
>>
startxref
${xrefOffset}
%%EOF\n`;

  return Buffer.from(pdf + xref + trailer, 'utf8');
}

const sampleBuffer = generateSamplePDF();
fs.writeFileSync('sample.pdf', sampleBuffer);
console.log('sample.pdf generated successfully:', sampleBuffer.length, 'bytes');
