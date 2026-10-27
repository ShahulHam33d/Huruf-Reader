const fs = require('fs');
const path = require('path');

async function verifyPDF(filePath) {
  if (!filePath) {
    console.error('Usage: node verify.js <pdf-path>');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`File not found: ${absolutePath}`);
    process.exit(1);
  }

  const rawBuffer = fs.readFileSync(absolutePath);
  console.log(`========================================`);
  console.log(`HurufReader PDF Verification`);
  console.log(`File: ${absolutePath}`);
  console.log(`Size: ${rawBuffer.length} bytes`);
  console.log(`========================================`);

  const data = new Uint8Array(rawBuffer);
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBuffer),
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdfDoc = await loadingTask.promise;
  console.log(`Pages: ${pdfDoc.numPages}`);

  let totalAnnotations = 0;
  let highlightCount = 0;
  const failedPages = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    let page;
    try {
      page = await pdfDoc.getPage(pageNum);
    } catch (err) {
      const errMsg = err && err.message ? err.message : String(err);
      console.error(`Page ${pageNum} failed to load: ${errMsg}`);
      failedPages.push({ pageNum, error: errMsg });
      continue;
    }

    const annotations = await page.getAnnotations({ intent: 'any' });

    if (annotations.length > 0) {
      console.log(`\n--- Page ${pageNum} (${annotations.length} annotation(s)) ---`);
      for (let i = 0; i < annotations.length; i++) {
        const annot = annotations[i];
        totalAnnotations++;

        const typeName = annot.subtype || (annot.annotationType === 9 ? 'Highlight' : `Type_${annot.annotationType}`);
        if (annot.subtype === 'Highlight' || annot.annotationType === 9) {
          highlightCount++;
        }

        console.log(`[Annotation #${totalAnnotations}]`);
        console.log(`  Page:    ${pageNum}`);
        console.log(`  Type:    ${typeName} (annotationType: ${annot.annotationType})`);
        console.log(`  Rect:    [${annot.rect ? annot.rect.map(n => Math.round(n * 100) / 100).join(', ') : 'none'}]`);
        console.log(`  Color:   ${annot.color ? JSON.stringify(Array.from(annot.color)) : 'default / none'}`);
        if (annot.quadPoints) {
          console.log(`  Quads:   ${annot.quadPoints.length / 8} quad region(s)`);
        }
        if (annot.contentsObj && annot.contentsObj.str) {
          console.log(`  Text:    "${annot.contentsObj.str}"`);
        }
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Summary:`);
  console.log(`  Pages Checked: ${pdfDoc.numPages}`);
  console.log(`  Failed Pages: ${failedPages.length}`);
  if (failedPages.length > 0) {
    for (const f of failedPages) {
      console.error(`    Page ${f.pageNum}: ${f.error}`);
    }
  }
  console.log(`  Total Annotations: ${totalAnnotations}`);
  console.log(`  Highlight Annotations: ${highlightCount}`);

  // Check raw PDF structure for /Highlight subtype confirmation
  const rawString = rawBuffer.toString('latin1');
  const hasHighlightObject = /\/Subtype\s*\/Highlight/.test(rawString);
  const hasAnnotObject = /\/Type\s*\/Annot/.test(rawString);
  console.log(`  Raw PDF /Type /Annot present: ${hasAnnotObject}`);
  console.log(`  Raw PDF /Subtype /Highlight present: ${hasHighlightObject}`);
  console.log(`========================================\n`);

  return { totalAnnotations, highlightCount, hasHighlightObject, failedPages };
}

const targetPath = process.argv[2];
if (targetPath) {
  verifyPDF(targetPath).catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
  });
}

module.exports = { verifyPDF };
