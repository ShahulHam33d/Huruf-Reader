const fs = require('fs');
const path = require('path');
const { PDFDocument, degrees: pdfDegrees } = require('pdf-lib');

const MAX_SPLIT_FILES = 200;
const ALLOWED_ROTATIONS = new Set([90, 180, 270, -90]);

function validationError(message) {
  const err = new Error(message);
  err.isValidationError = true;
  return err;
}

/**
 * Trim leading junk bytes before the %PDF- header (within first 1024 bytes).
 * @param {Buffer|Uint8Array} bytes
 * @returns {Buffer}
 */
function trimJunkBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    throw new Error('PDF data is empty.');
  }
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const headerIndex = buf.subarray(0, 1024).indexOf('%PDF-');
  if (headerIndex > 0) {
    return buf.subarray(headerIndex);
  }
  return buf;
}

/**
 * Parse a 1-based page range string such as "1-3, 5, 8-10".
 * Spaces are allowed, duplicates are removed, and results are sorted ascending.
 * @param {string} rangeStr
 * @param {number} [totalPages]
 * @returns {number[]}
 */
function parsePageRange(rangeStr, totalPages) {
  if (typeof rangeStr !== 'string' || rangeStr.trim().length === 0) {
    throw validationError('Page selection cannot be empty.');
  }

  const tokens = rangeStr.split(',').map(t => t.trim());
  const pagesSet = new Set();

  for (const token of tokens) {
    if (!token) {
      throw validationError(`Invalid empty token in page range "${rangeStr}".`);
    }

    if (token.includes('-')) {
      const parts = token.split('-').map(p => p.trim());
      if (parts.length !== 2 || !/^\d+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) {
        throw validationError(`Invalid page range "${token}". Use positive integers like "1-3".`);
      }
      const start = Number(parts[0]);
      const end = Number(parts[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1) {
        throw validationError(`Page numbers must be positive integers (>= 1) in "${token}".`);
      }
      if (start > end) {
        throw validationError(`Invalid range "${token}": start page cannot be greater than end page.`);
      }
      if (typeof totalPages === 'number' && end > totalPages) {
        throw validationError(`Page ${end} is out of range (document has ${totalPages} page${totalPages === 1 ? '' : 's'}).`);
      }
      for (let p = start; p <= end; p++) {
        pagesSet.add(p);
      }
    } else {
      if (!/^\d+$/.test(token)) {
        throw validationError(`Invalid page number "${token}". Use positive integers.`);
      }
      const page = Number(token);
      if (!Number.isInteger(page) || page < 1) {
        throw validationError(`Page numbers must be positive integers (>= 1), got "${token}".`);
      }
      if (typeof totalPages === 'number' && page > totalPages) {
        throw validationError(`Page ${page} is out of range (document has ${totalPages} page${totalPages === 1 ? '' : 's'}).`);
      }
      pagesSet.add(page);
    }
  }

  if (pagesSet.size === 0) {
    throw validationError('Page selection cannot be empty.');
  }

  return Array.from(pagesSet).sort((a, b) => a - b);
}

/**
 * Validate an array of 1-based page numbers (or parse if a string is supplied).
 * @param {number[]|string} pages
 * @param {number} totalPages
 * @returns {number[]}
 */
function normalizePages(pages, totalPages) {
  if (typeof pages === 'string') {
    return parsePageRange(pages, totalPages);
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    throw validationError('Page selection cannot be empty.');
  }
  const set = new Set();
  for (const p of pages) {
    if (typeof p !== 'number' || !Number.isInteger(p)) {
      throw validationError(`Invalid page number "${p}": must be an integer.`);
    }
    if (p < 1 || p > totalPages) {
      throw validationError(`Page ${p} is out of range (document has ${totalPages} page${totalPages === 1 ? '' : 's'}).`);
    }
    set.add(p);
  }
  return Array.from(set).sort((a, b) => a - b);
}

/**
 * Extract the specified 1-based pages into a new PDF.
 * @param {Buffer|Uint8Array} bytes
 * @param {number[]|string} pages
 * @returns {Promise<Uint8Array>}
 */
async function extractPages(bytes, pages) {
  const trimmed = trimJunkBytes(bytes);
  const srcDoc = await PDFDocument.load(trimmed);
  const totalPages = srcDoc.getPageCount();
  const validPages = normalizePages(pages, totalPages);

  const newDoc = await PDFDocument.create();
  const indices = validPages.map(p => p - 1);
  const copiedPages = await newDoc.copyPages(srcDoc, indices);
  for (const page of copiedPages) {
    newDoc.addPage(page);
  }
  return await newDoc.save();
}

/**
 * Delete the specified 1-based pages and return the remaining PDF bytes.
 * @param {Buffer|Uint8Array} bytes
 * @param {number[]|string} pages
 * @returns {Promise<Uint8Array>}
 */
async function deletePages(bytes, pages) {
  const trimmed = trimJunkBytes(bytes);
  const doc = await PDFDocument.load(trimmed);
  const totalPages = doc.getPageCount();
  const validPages = normalizePages(pages, totalPages);

  if (validPages.length >= totalPages) {
    throw validationError('Cannot delete every page in the document.');
  }

  const descIndices = validPages.map(p => p - 1).sort((a, b) => b - a);
  for (const idx of descIndices) {
    doc.removePage(idx);
  }
  return await doc.save();
}

/**
 * Rotate the specified 1-based pages by degrees (90, 180, 270, or -90),
 * adding to each page's existing rotation.
 * @param {Buffer|Uint8Array} bytes
 * @param {number[]|string} pages
 * @param {number} degrees
 * @returns {Promise<Uint8Array>}
 */
async function rotatePages(bytes, pages, degrees) {
  if (typeof degrees !== 'number' || !Number.isInteger(degrees) || !ALLOWED_ROTATIONS.has(degrees)) {
    throw validationError('Rotation degrees must be 90, 180, 270, or -90.');
  }

  const trimmed = trimJunkBytes(bytes);
  const doc = await PDFDocument.load(trimmed);
  const totalPages = doc.getPageCount();
  const validPages = normalizePages(pages, totalPages);

  for (const p of validPages) {
    const page = doc.getPage(p - 1);
    const currentAngle = page.getRotation().angle || 0;
    const nextAngle = ((currentAngle + degrees) % 360 + 360) % 360;
    page.setRotation(pdfDegrees(nextAngle));
  }
  return await doc.save();
}

/**
 * Split a PDF according to spec:
 * - { mode: 'every', every: N }
 * - { mode: 'ranges', ranges: string | string[] } (semicolon- or comma-separated ranges)
 * Returns an array of Uint8Array PDFs, capped at 200 output files.
 * @param {Buffer|Uint8Array} bytes
 * @param {object} spec
 * @returns {Promise<{ parts: Uint8Array[], pageGroups: number[][] }>}
 */
async function splitPdf(bytes, spec) {
  if (!spec || typeof spec !== 'object') {
    throw validationError('Split specification is required.');
  }

  const trimmed = trimJunkBytes(bytes);
  const srcDoc = await PDFDocument.load(trimmed);
  const totalPages = srcDoc.getPageCount();
  const pageGroups = [];

  if (spec.mode === 'every' || typeof spec.every === 'number') {
    const n = spec.every;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      throw validationError('Pages per part must be a positive integer (>= 1).');
    }
    for (let start = 1; start <= totalPages; start += n) {
      const group = [];
      for (let p = start; p < start + n && p <= totalPages; p++) {
        group.push(p);
      }
      pageGroups.push(group);
    }
  } else if (spec.mode === 'ranges' || spec.ranges !== undefined) {
    let rawGroups;
    if (Array.isArray(spec.ranges)) {
      rawGroups = spec.ranges;
    } else if (typeof spec.ranges === 'string') {
      const str = spec.ranges.trim();
      if (!str) {
        throw validationError('Split ranges cannot be empty.');
      }
      rawGroups = str.includes(';') ? str.split(';') : str.split(',');
    } else {
      throw validationError('Split ranges must be a string or an array of range strings.');
    }

    for (const partStr of rawGroups) {
      if (typeof partStr !== 'string' || !partStr.trim()) {
        throw validationError('Split ranges cannot contain empty parts.');
      }
      pageGroups.push(parsePageRange(partStr, totalPages));
    }
  } else {
    throw validationError('Invalid split mode. Use "every" or "ranges".');
  }

  if (pageGroups.length === 0) {
    throw validationError('Split produced no output parts.');
  }
  if (pageGroups.length > MAX_SPLIT_FILES) {
    throw validationError(`Split would produce ${pageGroups.length} files, exceeding the limit of ${MAX_SPLIT_FILES}.`);
  }

  const parts = [];
  for (const group of pageGroups) {
    const newDoc = await PDFDocument.create();
    const indices = group.map(p => p - 1);
    const copied = await newDoc.copyPages(srcDoc, indices);
    for (const page of copied) {
      newDoc.addPage(page);
    }
    parts.push(await newDoc.save());
  }

  return { parts, pageGroups };
}

/**
 * Get a non-overwriting file path <base>_part<n>.pdf (adding _1, _2, ... if needed).
 * @param {string} outputDir
 * @param {string} baseName
 * @param {number} partNumber
 * @returns {string}
 */
function getUniquePartPath(outputDir, baseName, partNumber) {
  const stem = `${baseName}_part${partNumber}`;
  let candidate = path.join(outputDir, `${stem}.pdf`);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(outputDir, `${stem}_${suffix}.pdf`);
    suffix++;
  }
  return candidate;
}

/**
 * Write split PDF parts to outputDir without overwriting existing files.
 * @param {Uint8Array[]} parts
 * @param {string} outputDir
 * @param {string} originalFileName
 * @returns {string[]}
 */
function writeSplitParts(parts, outputDir, originalFileName) {
  const cleanName = (originalFileName || 'document.pdf')
    .replace(/^\(edited\)\s+/i, '')
    .replace(/^\(recovered\)\s+/i, '');
  const baseName = path.basename(cleanName, path.extname(cleanName)) || 'document';

  const writtenPaths = [];
  for (let i = 0; i < parts.length; i++) {
    const outPath = getUniquePartPath(outputDir, baseName, i + 1);
    fs.writeFileSync(outPath, Buffer.from(parts[i]));
    writtenPaths.push(outPath);
  }
  return writtenPaths;
}

module.exports = {
  MAX_SPLIT_FILES,
  trimJunkBytes,
  parsePageRange,
  extractPages,
  deletePages,
  rotatePages,
  splitPdf,
  getUniquePartPath,
  writeSplitParts
};
