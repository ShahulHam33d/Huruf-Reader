const fs = require('fs');
const path = require('path');
const pageops = require('./pageops');

function getFirstLineFromTextContent(textContent) {
  if (!textContent || !Array.isArray(textContent.items)) return '';
  const parts = [];
  for (const item of textContent.items) {
    const str = (item.str || '').trim();
    if (!str) {
      if (item.hasEOL && parts.length > 0) break;
      continue;
    }
    parts.push(str);
    if (item.hasEOL) break;
    if (parts.join(' ').length >= 80) break;
  }
  return parts.join(' ').slice(0, 80);
}

async function inspectResult(pdfjsLib, bytes) {
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
  let page1FirstLine = '';
  let lastPageFirstLine = '';

  for (let i = 1; i <= doc.numPages; i++) {
    try {
      const page = await doc.getPage(i);
      if (i === 1) {
        page1FirstLine = getFirstLineFromTextContent(await page.getTextContent());
      }
      if (i === doc.numPages) {
        lastPageFirstLine = getFirstLineFromTextContent(await page.getTextContent());
      }
    } catch (err) {
      failedPages++;
    }
  }

  const pageCount = doc.numPages;
  await loadingTask.destroy();
  return { pageCount, failedPages, page1FirstLine, lastPageFirstLine };
}

async function inspectAnnotationsAndOutline(pdfjsLib, bytes) {
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
  const counts = {};

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const annots = await page.getAnnotations({ intent: 'any' });
    for (const a of annots) {
      const subtype = a.subtype || 'Unknown';
      counts[subtype] = (counts[subtype] || 0) + 1;
    }
  }

  await loadingTask.destroy();
  return { outlineCount, counts };
}

async function main() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const testDir = path.resolve(__dirname, 'test-pdfs');

  const cioBytes = pageops.trimJunkBytes(
    fs.readFileSync(path.join(testDir, 'CIO NATIONAL SCIENCE OLYMPIAD 2026_18-09-2026.pdf'))
  );
  const mysBytes = pageops.trimJunkBytes(
    fs.readFileSync(path.join(testDir, 'mys-smg.pdf'))
  );
  const dreamBytes = pageops.trimJunkBytes(
    fs.readFileSync(path.join(testDir, 'Dream_Textbook.pdf'))
  );

  console.log('=== HurufReader Phase 3B Headless PageOps Check ===\n');

  // 1. Merge CIO + mys-smg
  const mergedCioMys = await pageops.mergePdfs([cioBytes, mysBytes]);
  const infoCioMys = await inspectResult(pdfjsLib, mergedCioMys);
  console.log(`merge(CIO, mys-smg)          -> pages=${infoCioMys.pageCount}, failed=${infoCioMys.failedPages}, page1="${infoCioMys.page1FirstLine}", lastPage="${infoCioMys.lastPageFirstLine}"`);

  // 2. Merge Dream_Textbook + CIO (timed + memory)
  const memBefore = process.memoryUsage();
  const t0 = performance.now();
  const mergedDreamCio = await pageops.mergePdfs([dreamBytes, cioBytes]);
  const elapsedMs = performance.now() - t0;
  const memAfter = process.memoryUsage();
  const infoDreamCio = await inspectResult(pdfjsLib, mergedDreamCio);
  console.log(`merge(Dream_Textbook, CIO)   -> pages=${infoDreamCio.pageCount}, failed=${infoDreamCio.failedPages}, page1="${infoDreamCio.page1FirstLine}", lastPage="${infoDreamCio.lastPageFirstLine}"`);
  console.log(`  perf: elapsedMs=${elapsedMs.toFixed(1)} ms (${(elapsedMs / 1000).toFixed(2)} s), rssMB=${(memAfter.rss / (1024 * 1024)).toFixed(1)}, heapUsedDeltaMB=${((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(1)}`);

  // 3. Move "3" to before page 1 in CIO
  const movedCio = await pageops.movePages(cioBytes, '3', 1);
  const infoMovedCio = await inspectResult(pdfjsLib, movedCio);
  console.log(`move(CIO, "3", 1)            -> pages=${infoMovedCio.pageCount}, failed=${infoMovedCio.failedPages}, page1="${infoMovedCio.page1FirstLine}", lastPage="${infoMovedCio.lastPageFirstLine}"`);

  // 4. Move "1-2" to the end (toPosition = 6) in mys-smg
  const movedMys = await pageops.movePages(mysBytes, '1-2', 6);
  const infoMovedMys = await inspectResult(pdfjsLib, movedMys);
  console.log(`move(mys-smg, "1-2", 6)      -> pages=${infoMovedMys.pageCount}, failed=${infoMovedMys.failedPages}, page1="${infoMovedMys.page1FirstLine}", lastPage="${infoMovedMys.lastPageFirstLine}"`);

  // 5. Reverse the order of mys-smg via reorderPages
  const reversedMys = await pageops.reorderPages(mysBytes, [5, 4, 3, 2, 1]);
  const infoReversedMys = await inspectResult(pdfjsLib, reversedMys);
  console.log(`reorder(mys-smg, [5..1])     -> pages=${infoReversedMys.pageCount}, failed=${infoReversedMys.failedPages}, page1="${infoReversedMys.page1FirstLine}", lastPage="${infoReversedMys.lastPageFirstLine}"`);

  // 6. Error / validation cases
  console.log('\n--- Validation & Error Cases ---');
  const errorCases = [
    ['duplicate pages in order', () => pageops.reorderPages(mysBytes, [1, 2, 2, 4, 5])],
    ['missing page in order', () => pageops.reorderPages(mysBytes, [1, 2, 3, 4])],
    ['out-of-range move', () => pageops.movePages(mysBytes, '1', 7)],
    ['one input file only', () => pageops.mergePdfs([cioBytes])],
    ['corrupted input among valid ones', () => pageops.mergePdfs([cioBytes, Buffer.from('not a pdf file')])]
  ];

  for (const [label, fn] of errorCases) {
    try {
      await fn();
      console.log(`  ${label}: UNEXPECTEDLY SUCCEEDED`);
    } catch (err) {
      console.log(`  ${label}: rejected -> ${err.message}`);
    }
  }

  // 7. Annotations, links & outline survival check
  console.log('\n--- Annotations, Links & Outline Survival ---');
  const dreamOrigMeta = await inspectAnnotationsAndOutline(pdfjsLib, dreamBytes);
  const dreamMergedMeta = await inspectAnnotationsAndOutline(pdfjsLib, mergedDreamCio);
  const dreamMoved = await pageops.movePages(dreamBytes, '1-2', 5);
  const dreamMovedMeta = await inspectAnnotationsAndOutline(pdfjsLib, dreamMoved);
  console.log(`  Dream_Textbook original : outlineTopLevel=${dreamOrigMeta.outlineCount}, annots=${JSON.stringify(dreamOrigMeta.counts)}`);
  console.log(`  Dream_Textbook + CIO    : outlineTopLevel=${dreamMergedMeta.outlineCount}, annots=${JSON.stringify(dreamMergedMeta.counts)}`);
  console.log(`  Dream_Textbook moved    : outlineTopLevel=${dreamMovedMeta.outlineCount}, annots=${JSON.stringify(dreamMovedMeta.counts)}`);

  const sampleSavedPath = path.join(testDir, 'sample_saved123.pdf');
  if (fs.existsSync(sampleSavedPath)) {
    const sampleBytes = pageops.trimJunkBytes(fs.readFileSync(sampleSavedPath));
    const sampleOrigMeta = await inspectAnnotationsAndOutline(pdfjsLib, sampleBytes);
    const sampleMerged = await pageops.mergePdfs([sampleBytes, cioBytes]);
    const sampleMergedMeta = await inspectAnnotationsAndOutline(pdfjsLib, sampleMerged);
    const sampleMoved = await pageops.movePages(await pageops.mergePdfs([sampleBytes, cioBytes]), '1', 4);
    const sampleMovedMeta = await inspectAnnotationsAndOutline(pdfjsLib, sampleMoved);
    console.log(`  sample_saved123 original: outlineTopLevel=${sampleOrigMeta.outlineCount}, annots=${JSON.stringify(sampleOrigMeta.counts)}`);
    console.log(`  sample_saved123 + CIO   : outlineTopLevel=${sampleMergedMeta.outlineCount}, annots=${JSON.stringify(sampleMergedMeta.counts)}`);
    console.log(`  sample_saved123+CIO mov : outlineTopLevel=${sampleMovedMeta.outlineCount}, annots=${JSON.stringify(sampleMovedMeta.counts)}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
