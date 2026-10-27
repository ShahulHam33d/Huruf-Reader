const fs = require('fs');
const path = require('path');

async function runHeadlessCheck() {
  const filePath = path.resolve(__dirname, 'test-pdfs/Dream_Textbook.pdf');
  console.log(`[Headless Check] Target: ${filePath}`);

  // Step 1 logic
  let fileBuffer = fs.readFileSync(filePath);
  const headerIndex = fileBuffer.subarray(0, 1024).indexOf('%PDF-');
  console.log(`[Step 1] %PDF- header search index: ${headerIndex}`);

  if (headerIndex > 0) {
    fileBuffer = fileBuffer.subarray(headerIndex);
    console.log(`[Step 1] Trimmed ${headerIndex} bytes before %PDF- header`);
  } else {
    console.log(`[Step 1] No trimming needed (header at index ${headerIndex})`);
  }

  // Load via pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBuffer),
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  console.log(`[PDF.js] Loaded document with ${totalPages} pages`);

  let succeededPages = 0;
  const failedPages = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      await pdfDoc.getPage(pageNum);
      succeededPages++;
    } catch (err) {
      failedPages.push({ pageNum, error: err.message || String(err) });
    }
  }

  console.log(`[getPage Check] Succeeded: ${succeededPages}/${totalPages} pages`);
  if (failedPages.length > 0) {
    console.log(`[getPage Check] Failed pages:`, failedPages);
  }

  // Confirm last startxref value points exactly at the start of an "obj" line in trimmed bytes
  const text = fileBuffer.toString('latin1');
  const matches = [...text.matchAll(/startxref\s*(\r?\n|\r)\s*(\d+)/g)];
  if (matches.length === 0) {
    console.error('[startxref Check] No startxref found');
    return;
  }

  const lastMatch = matches[matches.length - 1];
  const startXrefOffset = parseInt(lastMatch[2], 10);
  console.log(`[startxref Check] Last startxref value: ${startXrefOffset}`);

  const snippetAtOffset = fileBuffer.subarray(startXrefOffset, startXrefOffset + 40).toString('latin1');
  const firstLine = snippetAtOffset.split(/\r?\n/)[0];
  console.log(`[startxref Check] Bytes at offset ${startXrefOffset}: "${firstLine}"`);

  const isObjStart = /^\d+\s+\d+\s+obj/.test(snippetAtOffset);
  console.log(`[startxref Check] Points exactly at start of obj line: ${isObjStart}`);
}

runHeadlessCheck().catch((err) => {
  console.error('[Headless Check] Error:', err);
  process.exit(1);
});
