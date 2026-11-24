const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  let pdfPath = args[0];
  let jsonPath = args[1];

  const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library/Application Support') : path.join(process.env.HOME, '.config'));
  const recoveryDir = path.join(appDataDir, 'hurufreader', 'recovery');

  if (!pdfPath) {
    if (fs.existsSync(recoveryDir)) {
      const files = fs.readdirSync(recoveryDir);
      const pdfs = files.filter(f => f.endsWith('.pdf') && !f.endsWith('.tmp.pdf'));
      if (pdfs.length > 0) {
        pdfPath = path.join(recoveryDir, pdfs[0]);
      }
    }
  }

  if (!pdfPath) {
    console.error('Usage: node headless-recovery-check.js <recoveryPdfPath> [recoveryJsonPath]');
    console.error(`No recovery PDFs found in default directory: ${recoveryDir}`);
    process.exit(1);
  }

  if (!jsonPath) {
    const ext = path.extname(pdfPath);
    const base = pdfPath.slice(0, -ext.length);
    const candidateJson = `${base}.json`;
    if (fs.existsSync(candidateJson)) {
      jsonPath = candidateJson;
    }
  }

  console.log('=== HurufReader Recovery Check ===');
  console.log(`PDF Path:  ${pdfPath}`);
  console.log(`JSON Path: ${jsonPath || '(not found)'}`);

  if (jsonPath && fs.existsSync(jsonPath)) {
    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      console.log('\n--- Companion JSON Metadata ---');
      console.log(jsonContent.trim());
      const parsed = JSON.parse(jsonContent);
      console.log(`Original File Name: ${parsed.originalFileName}`);
      console.log(`Original File Path: ${parsed.originalFilePath}`);
      console.log(`Timestamp:          ${parsed.timestamp}`);
    } catch (e) {
      console.error(`Error reading companion JSON: ${e.message}`);
    }
  } else {
    console.log('\n(No companion JSON file located)');
  }

  // Load PDF with pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let rawBuffer;
  try {
    rawBuffer = fs.readFileSync(pdfPath);
  } catch (err) {
    console.error(`Failed to read PDF file: ${err.message}`);
    process.exit(1);
  }

  // Trim junk bytes if present
  let buffer = rawBuffer;
  const headerIndex = buffer.subarray(0, 1024).indexOf('%PDF-');
  if (headerIndex > 0) {
    buffer = buffer.subarray(headerIndex);
    console.log(`Trimmed ${headerIndex} junk bytes before %PDF- header`);
  } else if (headerIndex === -1) {
    console.error('Error: %PDF- header not found in first 1024 bytes');
    process.exit(1);
  }

  console.log('\n--- PDF Parsing & Verification ---');
  let doc;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      standardFontDataUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts/') + '/',
      cMapUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/cmaps/') + '/',
      cMapPacked: true
    });
    doc = await loadingTask.promise;
    console.log('Successfully loaded document.');
    console.log(`Page Count: ${doc.numPages}`);
  } catch (err) {
    console.error(`Failed to load PDF with pdfjs-dist: ${err.message}`);
    process.exit(1);
  }

  const failedPages = [];
  const annotationCounts = {};

  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const annotations = await page.getAnnotations({ intent: 'any' });
      for (const annot of annotations) {
        const subtype = annot.subtype || annot.type || 'Unknown';
        annotationCounts[subtype] = (annotationCounts[subtype] || 0) + 1;
      }
    } catch (err) {
      console.error(`Page ${i} failed to render or parse:`, err.message);
      failedPages.push(i);
    }
  }

  console.log(`Failed Pages: ${failedPages.length > 0 ? failedPages.join(', ') : 'None'}`);
  console.log('\n--- Annotation Counts Per Type ---');
  const countKeys = Object.keys(annotationCounts);
  if (countKeys.length === 0) {
    console.log('  (no annotations found)');
  } else {
    for (const type of countKeys.sort()) {
      console.log(`  ${type}: ${annotationCounts[type]}`);
    }
  }
  console.log('==================================');
}

main().catch(err => {
  console.error('Fatal error during headless recovery check:', err);
  process.exit(1);
});
