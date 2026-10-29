const fs = require('fs');
const path = require('path');

async function checkPdfOutline(fileName) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const filePath = path.resolve(__dirname, 'test-pdfs', fileName);

  console.log(`====================================================`);
  console.log(`Checking PDF: ${fileName}`);
  console.log(`Path: ${filePath}`);

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    console.error(`Failed to read file: ${err.message}`);
    return;
  }

  const headerIdx = buffer.subarray(0, 1024).indexOf('%PDF-');
  if (headerIdx > 0) {
    buffer = buffer.subarray(headerIdx);
  }

  const doc = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise;

  console.log(`Total Pages: ${doc.numPages}`);
  const outline = await doc.getOutline();
  const hasOutline = outline !== null && outline !== undefined && outline.length > 0;
  console.log(`getOutline() returns items: ${hasOutline ? `YES (${outline.length} top-level item(s))` : 'NO (null or empty)'}`);

  if (hasOutline) {
    const itemsToCheck = outline.slice(0, 5);
    console.log(`--- First ${itemsToCheck.length} item(s) ---`);
    for (let i = 0; i < itemsToCheck.length; i++) {
      const item = itemsToCheck[i];
      console.log(`[Item #${i + 1}] Title: "${item.title}"`);
      console.log(`  Raw dest: ${JSON.stringify(item.dest)}`);
      console.log(`  URL: ${item.url || 'none'}`);

      if (!item.dest) {
        console.log(`  Destination resolves to a page number: NO (has no destination)`);
        continue;
      }

      let explicitDest = item.dest;
      if (typeof explicitDest === 'string') {
        try {
          explicitDest = await doc.getDestination(explicitDest);
          console.log(`  Named dest resolved: ${JSON.stringify(explicitDest)}`);
        } catch (e) {
          console.log(`  Named dest resolution failed: ${e.message}`);
        }
      }

      if (Array.isArray(explicitDest) && explicitDest.length > 0) {
        const destRef = explicitDest[0];
        try {
          let pageIndex;
          if (typeof destRef === 'number') {
            pageIndex = destRef;
          } else if (destRef && typeof destRef === 'object') {
            pageIndex = await doc.getPageIndex(destRef);
          }
          if (typeof pageIndex === 'number' && pageIndex >= 0) {
            console.log(`  Destination resolves to a page number: YES (Page ${pageIndex + 1})`);
          } else {
            console.log(`  Destination resolves to a page number: NO (invalid index ${pageIndex})`);
          }
        } catch (e) {
          console.log(`  Destination resolves to a page number: NO (getPageIndex error: ${e.message})`);
        }
      } else {
        console.log(`  Destination resolves to a page number: NO (not an explicit destination array)`);
      }
    }
  }
  console.log(`====================================================\n`);
}

async function main() {
  await checkPdfOutline('Dream_Textbook.pdf');
  await checkPdfOutline('mys-smg.pdf');
}

main().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
