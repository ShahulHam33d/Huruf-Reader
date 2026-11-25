const fs = require('fs');
const os = require('os');
const path = require('path');
const pageops = require('./pageops');

async function inspectWithPdfJs(pdfjsLib, bytes) {
  const trimmed = pageops.trimJunkBytes(bytes);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(trimmed),
    isEvalSupported: false,
    standardFontDataUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts/') + '/',
    cMapUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/cmaps/') + '/',
    cMapPacked: true
  });
  const doc = await loadingTask.promise;

  let failedPages = 0;
  let firstPageRotation = null;
  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      if (i === 1) {
        firstPageRotation = page.rotate;
      }
    } catch (err) {
      failedPages++;
    }
  }
  const result = {
    pageCount: doc.numPages,
    failedPages,
    firstPageRotation
  };
  await loadingTask.destroy();
  return result;
}

async function inspectOutlineAndLinks(pdfjsLib, bytes, pagesToCheck) {
  const trimmed = pageops.trimJunkBytes(bytes);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(trimmed),
    isEvalSupported: false,
    standardFontDataUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/standard_fonts/') + '/',
    cMapUrl: path.resolve(__dirname, 'node_modules/pdfjs-dist/cmaps/') + '/',
    cMapPacked: true
  });
  const doc = await loadingTask.promise;

  const outline = await doc.getOutline();
  const outlineCount = Array.isArray(outline) ? outline.length : 0;

  let linkCount = 0;
  let nonLinkAnnotCount = 0;
  const maxPage = Math.min(doc.numPages, pagesToCheck || doc.numPages);
  for (let i = 1; i <= maxPage; i++) {
    const page = await doc.getPage(i);
    const annots = await page.getAnnotations({ intent: 'any' });
    for (const a of annots) {
      if (a.subtype === 'Link') linkCount++;
      else nonLinkAnnotCount++;
    }
  }
  await loadingTask.destroy();
  return { outlineCount, linkCount, nonLinkAnnotCount };
}

async function main() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const testDir = path.resolve(__dirname, 'test-pdfs');
  const targets = [
    'Dream_Textbook.pdf',
    'CIO NATIONAL SCIENCE OLYMPIAD 2026_18-09-2026.pdf',
    'mys-smg.pdf'
  ];

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hurufreader-pageops-'));
  console.log('=== HurufReader Phase 3A Headless PageOps Check ===');
  console.log(`Temp split dir: ${tempRoot}\n`);

  try {
    for (const fileName of targets) {
      const fullPath = path.join(testDir, fileName);
      const rawBytes = fs.readFileSync(fullPath);
      const trimmedBytes = pageops.trimJunkBytes(rawBytes);

      console.log(`--- File: ${fileName} ---`);

      // 1. Extract "2-4"
      try {
        const extracted = await pageops.extractPages(trimmedBytes, pageops.parsePageRange('2-4'));
        const extractInfo = await inspectWithPdfJs(pdfjsLib, extracted);
        console.log(`  extract("2-4")      -> pages=${extractInfo.pageCount}, failed=${extractInfo.failedPages}, page1Rotation=${extractInfo.firstPageRotation}`);
        if (fileName === 'Dream_Textbook.pdf') {
          var dreamExtracted = extracted;
        }
      } catch (extErr) {
        console.log(`  extract("2-4")      -> rejected: ${extErr.message}`);
        const extracted23 = await pageops.extractPages(trimmedBytes, pageops.parsePageRange('2-3'));
        const extractInfo23 = await inspectWithPdfJs(pdfjsLib, extracted23);
        console.log(`  extract("2-3")      -> pages=${extractInfo23.pageCount}, failed=${extractInfo23.failedPages}, page1Rotation=${extractInfo23.firstPageRotation}`);
      }

      // 2. Delete "1"
      const deleted = await pageops.deletePages(trimmedBytes, pageops.parsePageRange('1'));
      const deleteInfo = await inspectWithPdfJs(pdfjsLib, deleted);
      console.log(`  delete("1")         -> pages=${deleteInfo.pageCount}, failed=${deleteInfo.failedPages}, page1Rotation=${deleteInfo.firstPageRotation}`);

      // 3. Rotate "1-2" by 90
      const rotated = await pageops.rotatePages(trimmedBytes, pageops.parsePageRange('1-2'), 90);
      const rotateInfo = await inspectWithPdfJs(pdfjsLib, rotated);
      console.log(`  rotate("1-2", 90)   -> pages=${rotateInfo.pageCount}, failed=${rotateInfo.failedPages}, page1Rotation=${rotateInfo.firstPageRotation}`);

      // 4. Split every 2 pages
      const subDir = path.join(tempRoot, path.basename(fileName, '.pdf').replace(/[^a-zA-Z0-9_-]/g, '_'));
      fs.mkdirSync(subDir, { recursive: true });
      try {
        const splitRes = await pageops.splitPdf(trimmedBytes, { mode: 'every', every: 2 });
        const written = pageops.writeSplitParts(splitRes.parts, subDir, fileName);
        console.log(`  split(every 2)      -> wrote ${written.length} file(s)`);
        for (let idx = 0; idx < written.length; idx++) {
          const partBytes = fs.readFileSync(written[idx]);
          const partInfo = await inspectWithPdfJs(pdfjsLib, partBytes);
          console.log(`    part ${idx + 1} (${path.basename(written[idx])}): pages=${partInfo.pageCount}, failed=${partInfo.failedPages}, page1Rotation=${partInfo.firstPageRotation}`);
        }
      } catch (splitErr) {
        console.log(`  split(every 2)      -> rejected: ${splitErr.message}`);
      }

      // Step 7: Check outline/links on Dream_Textbook.pdf
      if (fileName === 'Dream_Textbook.pdf') {
        const origMeta = await inspectOutlineAndLinks(pdfjsLib, trimmedBytes, 15);
        const extMeta = await inspectOutlineAndLinks(pdfjsLib, dreamExtracted);
        const delMeta = await inspectOutlineAndLinks(pdfjsLib, deleted, 15);
        console.log('  [Step 7 Known Limits on Dream_Textbook.pdf]');
        console.log(`    Original (first 15 pages checked for links): outlineTopItems=${origMeta.outlineCount}, links=${origMeta.linkCount}, otherAnnots=${origMeta.nonLinkAnnotCount}`);
        console.log(`    After extract("2-4"):                        outlineTopItems=${extMeta.outlineCount}, links=${extMeta.linkCount}, otherAnnots=${extMeta.nonLinkAnnotCount}`);
        console.log(`    After delete("1") (first 15 pages):          outlineTopItems=${delMeta.outlineCount}, links=${delMeta.linkCount}, otherAnnots=${delMeta.nonLinkAnnotCount}`);
      }
      console.log('');
    }

    // Error / validation test cases
    console.log('--- Validation & Error Cases ---');
    const cioBytes = pageops.trimJunkBytes(fs.readFileSync(path.join(testDir, 'CIO NATIONAL SCIENCE OLYMPIAD 2026_18-09-2026.pdf')));

    const errorCases = [
      {
        name: 'Out-of-range page ("999")',
        fn: () => pageops.extractPages(cioBytes, '999')
      },
      {
        name: 'Empty selection ("   ")',
        fn: () => pageops.extractPages(cioBytes, '   ')
      },
      {
        name: 'Deleting all pages ("1-3" on 3-page PDF)',
        fn: () => pageops.deletePages(cioBytes, '1-3')
      },
      {
        name: 'Bad range string ("1-abc")',
        fn: () => Promise.resolve(pageops.parsePageRange('1-abc'))
      }
    ];

    for (const tc of errorCases) {
      try {
        await tc.fn();
        console.log(`  [FAIL] ${tc.name}: expected error but succeeded`);
      } catch (err) {
        console.log(`  [PASS] ${tc.name} -> ${err.message}`);
      }
    }
    console.log('==============================================');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Fatal error in pageops-check.js:', err);
  process.exit(1);
});
