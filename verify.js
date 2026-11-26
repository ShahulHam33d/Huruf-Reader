const fs = require('fs');
const path = require('path');

function classifyWidgetType(annot) {
  if (annot.fieldType === 'Tx') return 'text';
  if (annot.fieldType === 'Btn') {
    if (annot.checkBox) return 'checkbox';
    if (annot.radioButton) return 'radio';
    if (annot.pushButton) return 'button';
    return 'button';
  }
  if (annot.fieldType === 'Ch') {
    return annot.combo ? 'dropdown' : 'listbox';
  }
  return annot.fieldType || 'unknown';
}

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

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(rawBuffer),
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdfDoc = await loadingTask.promise;
  console.log(`Pages: ${pdfDoc.numPages}`);

  let totalAnnotations = 0;
  const counts = {
    Highlight: 0,
    FreeText: 0,
    Ink: 0,
    Stamp: 0,
    Link: 0,
    Widget: 0,
    Other: 0
  };
  const formFields = [];
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

        const subtype = annot.subtype || '';
        const typeId = annot.annotationType;

        let typeName = 'Other';
        if (subtype === 'Highlight' || typeId === 9) {
          typeName = 'Highlight';
          counts.Highlight++;
        } else if (subtype === 'FreeText' || typeId === 3) {
          typeName = 'FreeText';
          counts.FreeText++;
        } else if (subtype === 'Ink' || typeId === 15) {
          typeName = 'Ink';
          counts.Ink++;
        } else if (subtype === 'Stamp' || typeId === 13) {
          typeName = 'Stamp';
          counts.Stamp++;
        } else if (subtype === 'Link' || typeId === 2) {
          typeName = 'Link';
          counts.Link++;
        } else if (subtype === 'Widget' || typeId === 20) {
          typeName = 'Widget';
          counts.Widget++;
        } else {
          typeName = subtype || `Type_${typeId}`;
          counts.Other++;
        }

        console.log(`[Annotation #${totalAnnotations}]`);
        console.log(`  Page:      ${pageNum}`);
        console.log(`  Type:      ${typeName} (annotationType: ${annot.annotationType}, subtype: "${annot.subtype || ''}")`);
        console.log(`  Rect:      [${annot.rect ? annot.rect.map(n => Math.round(n * 100) / 100).join(', ') : 'none'}]`);
        console.log(`  Color:     ${annot.color ? JSON.stringify(Array.from(annot.color)) : 'default / none'}`);

        if (typeName === 'Widget') {
          const fieldName = annot.fieldName || annot.id || '(unnamed)';
          const fieldType = classifyWidgetType(annot);
          const fieldValue = annot.fieldValue !== undefined ? annot.fieldValue : '';
          const readOnly = Boolean(annot.readOnly);
          formFields.push({
            name: fieldName,
            fieldType,
            value: fieldValue,
            readOnly,
            page: pageNum
          });
          console.log(`  Name:      "${fieldName}"`);
          console.log(`  FieldType: ${fieldType}`);
          console.log(`  Value:     ${JSON.stringify(fieldValue)}`);
          console.log(`  ReadOnly:  ${readOnly}`);
        } else if (typeName === 'Ink') {
          const pathCount = annot.inkLists ? annot.inkLists.length : (annot.paths ? annot.paths.length : 0);
          const thickness = annot.borderStyle && typeof annot.borderStyle.width === 'number'
            ? annot.borderStyle.width
            : (annot.borderWidth ?? 'default');
          const opacity = annot.opacity ?? 1;
          console.log(`  Ink Paths: ${pathCount}`);
          console.log(`  Thickness: ${thickness}`);
          console.log(`  Opacity:   ${opacity}`);
        } else if (typeName === 'Highlight' && annot.quadPoints) {
          console.log(`  Quads:     ${annot.quadPoints.length / 8} quad region(s)`);
        } else if (typeName === 'FreeText' && annot.contentsObj && annot.contentsObj.str) {
          console.log(`  Text:      "${annot.contentsObj.str}"`);
        }
      }
    }
  }

  // Raw byte regex matching
  const rawString = rawBuffer.toString('latin1');
  const countMatches = (regex) => (rawString.match(regex) || []).length;

  const rawInkSubtypeMatches = countMatches(/\/Subtype\s*\/Ink\b/g);
  const rawInkListMatches = countMatches(/\/InkList\b/g);
  const rawHighlightMatches = countMatches(/\/Subtype\s*\/Highlight\b/g);
  const rawFreeTextMatches = countMatches(/\/Subtype\s*\/FreeText\b/g);
  const rawStampMatches = countMatches(/\/Subtype\s*\/Stamp\b/g);
  const rawAnnotMatches = countMatches(/\/Type\s*\/Annot\b/g);

  console.log(`\n========================================`);
  console.log(`Summary:`);
  console.log(`  Pages Checked:         ${pdfDoc.numPages}`);
  console.log(`  Failed Pages:          ${failedPages.length}`);
  console.log(`  Total Annotations:     ${totalAnnotations}`);
  console.log(`  Counts by Type:`);
  console.log(`    Highlight:           ${counts.Highlight}`);
  console.log(`    FreeText:            ${counts.FreeText}`);
  console.log(`    Ink:                 ${counts.Ink}`);
  console.log(`    Stamp:               ${counts.Stamp}`);
  console.log(`    Link:                ${counts.Link}`);
  console.log(`    Widget (Form Field): ${counts.Widget}`);
  console.log(`    Other:               ${counts.Other}`);
  console.log(`  Raw Byte Searches:`);
  console.log(`    /Type /Annot:        ${rawAnnotMatches}`);
  console.log(`    /Subtype /Highlight: ${rawHighlightMatches}`);
  console.log(`    /Subtype /FreeText:  ${rawFreeTextMatches}`);
  console.log(`    /Subtype /Ink:       ${rawInkSubtypeMatches}`);
  console.log(`    /InkList:            ${rawInkListMatches}`);
  console.log(`    /Subtype /Stamp:     ${rawStampMatches}`);
  console.log(`========================================\n`);

  if (failedPages.length > 0) {
    for (const f of failedPages) {
      console.error(`Page ${f.pageNum} getPage failure: ${f.error}`);
    }
    throw new Error(`Verification failed: ${failedPages.length} page(s) failed getPage`);
  }

  return {
    totalAnnotations,
    counts,
    formFields,
    rawMatches: {
      rawAnnotMatches,
      rawHighlightMatches,
      rawFreeTextMatches,
      rawInkSubtypeMatches,
      rawInkListMatches,
      rawStampMatches
    },
    failedPages
  };
}

const targetPath = process.argv[2];
if (targetPath) {
  verifyPDF(targetPath).catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
  });
}

module.exports = { verifyPDF };
