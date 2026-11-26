/**
 * HurufReader Command Layer
 *
 * Plain named command functions with typed parameters for operations:
 * - openFile(filePath?: string)
 * - closeTab(tabId?: string)
 * - switchTab(tabId: string)
 * - saveAs(tabId?: string)
 * - setDarkMode(enabled?: boolean)
 * - setInvertColors(enabled?: boolean)
 * - setAnnotationMode(tabId: string, mode: number)
 */

let ctx = null;

// Supported annotation editor modes (NONE: 0 plus the four active modes)
let supportedModes = new Set([0, 3, 9, 13, 15]);

// Dynamically resolve against pdfjs-dist
import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjsLib) => {
  if (pdfjsLib && pdfjsLib.AnnotationEditorType) {
    const types = pdfjsLib.AnnotationEditorType;
    supportedModes = new Set([
      types.NONE,
      types.HIGHLIGHT,
      types.FREETEXT,
      types.INK,
      types.STAMP
    ]);
  }
}).catch(() => {});

/**
 * Initialize commands module with application context callbacks.
 * @param {object} context
 */
function initCommands(context) {
  ctx = context;
}

/**
 * Open a PDF file. If filePath is provided, opens directly; otherwise prompts with native file dialog.
 * @param {string} [filePath]
 * @returns {Promise<boolean>}
 */
async function openFile(filePath) {
  if (!ctx) return false;
  if (typeof filePath === 'string' && filePath.trim().length > 0) {
    return await ctx.openPDFPath(filePath.trim());
  }
  return await ctx.handleOpenFile();
}

/**
 * Close a tab. Prompts if unsaved changes exist.
 * @param {string} [tabId]
 * @returns {Promise<boolean>}
 */
async function closeTab(tabId) {
  if (!ctx) return false;
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return false;
  return await ctx.closeTab(targetId);
}

/**
 * Switch active tab.
 * @param {string} tabId
 * @returns {boolean}
 */
function switchTab(tabId) {
  if (!ctx || typeof tabId !== 'string' || !tabId) return false;
  return ctx.switchTab(tabId);
}

/**
 * Trigger Save As for a tab.
 * @param {string} [tabId]
 * @returns {Promise<boolean>}
 */
async function saveAs(tabId) {
  if (!ctx) return false;
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return false;
  return await ctx.triggerSaveAs(targetId);
}

/**
 * Set or toggle Dark Mode.
 * @param {boolean} [enabled]
 * @returns {boolean}
 */
function setDarkMode(enabled) {
  if (!ctx) return false;
  const value = typeof enabled === 'boolean' ? enabled : undefined;
  return ctx.toggleDarkMode(value);
}

/**
 * Set or toggle Invert Page Colors.
 * @param {boolean} [enabled]
 * @returns {boolean}
 */
function setInvertColors(enabled) {
  if (!ctx) return false;
  const value = typeof enabled === 'boolean' ? enabled : undefined;
  return ctx.toggleInvertColors(value);
}

/**
 * Set annotation editor mode for a tab.
 * @param {string} [tabId]
 * @param {number} mode - pdfjs AnnotationEditorType value
 * @returns {boolean}
 */
function setAnnotationMode(tabId, mode) {
  if (!ctx) return false;
  if (typeof mode !== 'number' || !supportedModes.has(mode)) {
    return false;
  }
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return false;
  return ctx.setTabAnnotationMode(targetId, mode);
}

/**
 * Undo last annotation action in a tab.
 * @param {string} [tabId]
 * @returns {boolean}
 */
function undo(tabId) {
  if (!ctx || !ctx.undo) return false;
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return false;
  return ctx.undo(targetId);
}

/**
 * Redo last undone annotation action in a tab.
 * @param {string} [tabId]
 * @returns {boolean}
 */
function redo(tabId) {
  if (!ctx || !ctx.redo) return false;
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return false;
  return ctx.redo(targetId);
}

/**
 * Extract pages from a tab into a new edited tab.
 * @param {string} [tabId]
 * @param {string} rangeStr
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function extractPages(tabId, rangeStr) {
  if (!ctx || !ctx.extractPages) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (typeof rangeStr !== 'string' || rangeStr.trim().length === 0) {
    return { success: false, validationError: 'Page selection cannot be empty.' };
  }
  return await ctx.extractPages(targetId, rangeStr.trim());
}

/**
 * Delete pages from a tab into a new edited tab.
 * @param {string} [tabId]
 * @param {string} rangeStr
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function deletePages(tabId, rangeStr) {
  if (!ctx || !ctx.deletePages) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (typeof rangeStr !== 'string' || rangeStr.trim().length === 0) {
    return { success: false, validationError: 'Page selection cannot be empty.' };
  }
  return await ctx.deletePages(targetId, rangeStr.trim());
}

/**
 * Rotate pages in a tab into a new edited tab.
 * @param {string} [tabId]
 * @param {string} rangeStr
 * @param {number} degrees
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function rotatePages(tabId, rangeStr, degrees) {
  if (!ctx || !ctx.rotatePages) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (typeof rangeStr !== 'string' || rangeStr.trim().length === 0) {
    return { success: false, validationError: 'Page selection cannot be empty.' };
  }
  if (typeof degrees !== 'number' || !Number.isInteger(degrees) || ![90, 180, 270, -90].includes(degrees)) {
    return { success: false, validationError: 'Rotation must be 90, 180, 270, or -90 degrees.' };
  }
  return await ctx.rotatePages(targetId, rangeStr.trim(), degrees);
}

/**
 * Split a tab's PDF into separate files in a chosen folder.
 * @param {string} [tabId]
 * @param {object} spec
 * @returns {Promise<{success: boolean, validationError?: string, error?: string, count?: number}>}
 */
async function splitPdf(tabId, spec) {
  if (!ctx || !ctx.splitPdf) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (!spec || typeof spec !== 'object') {
    return { success: false, validationError: 'Split specification is required.' };
  }
  if (spec.mode === 'every') {
    if (typeof spec.every !== 'number' || !Number.isInteger(spec.every) || spec.every < 1) {
      return { success: false, validationError: 'Pages per part must be a positive integer (>= 1).' };
    }
  } else if (spec.mode === 'ranges') {
    const validStr = typeof spec.ranges === 'string' && spec.ranges.trim().length > 0;
    const validArr = Array.isArray(spec.ranges) && spec.ranges.length > 0;
    if (!validStr && !validArr) {
      return { success: false, validationError: 'Split ranges cannot be empty.' };
    }
  } else {
    return { success: false, validationError: 'Invalid split mode.' };
  }
  return await ctx.splitPdf(targetId, spec);
}

/**
 * Merge 2 or more PDF byte buffers into a new "(merged)" tab.
 * @param {Array<Buffer|Uint8Array|number[]>} listOfBytes
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function mergePdfs(listOfBytes) {
  if (!ctx || !ctx.mergePdfs) return { success: false, error: 'Not initialized' };
  if (!Array.isArray(listOfBytes) || listOfBytes.length < 2) {
    return { success: false, validationError: 'Select at least 2 PDF files to merge.' };
  }
  if (listOfBytes.length > 20) {
    return { success: false, validationError: 'Cannot merge more than 20 files at once.' };
  }
  let totalBytes = 0;
  for (const item of listOfBytes) {
    if (!item || typeof item.length !== 'number') {
      return { success: false, validationError: 'Invalid PDF data in merge list.' };
    }
    totalBytes += item.length;
  }
  if (totalBytes > 300 * 1024 * 1024) {
    return { success: false, validationError: 'Total input size exceeds the 300 MB limit.' };
  }
  return await ctx.mergePdfs(listOfBytes);
}

/**
 * Reorder all pages of a tab's PDF into a new "(edited)" tab.
 * @param {string} [tabId]
 * @param {number[]} order
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function reorderPages(tabId, order) {
  if (!ctx || !ctx.reorderPages) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (!Array.isArray(order) || order.length === 0) {
    return { success: false, validationError: 'Page order cannot be empty.' };
  }
  for (const p of order) {
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1) {
      return { success: false, validationError: 'Page order must contain positive integers.' };
    }
  }
  return await ctx.reorderPages(targetId, order);
}

/**
 * Move selected pages before toPosition (or to end if total+1) into a new "(edited)" tab.
 * @param {string} [tabId]
 * @param {string} rangeStr
 * @param {number} toPosition
 * @returns {Promise<{success: boolean, validationError?: string, error?: string}>}
 */
async function movePages(tabId, rangeStr, toPosition) {
  if (!ctx || !ctx.movePages) return { success: false, error: 'Not initialized' };
  const targetId = typeof tabId === 'string' && tabId ? tabId : ctx.getActiveTabId();
  if (!targetId) return { success: false, error: 'No active tab' };
  if (typeof rangeStr !== 'string' || rangeStr.trim().length === 0) {
    return { success: false, validationError: 'Page selection cannot be empty.' };
  }
  if (typeof toPosition !== 'number' || !Number.isInteger(toPosition) || toPosition < 1) {
    return { success: false, validationError: '"Move before page" must be a positive integer.' };
  }
  return await ctx.movePages(targetId, rangeStr.trim(), toPosition);
}

module.exports = {
  initCommands,
  openFile,
  closeTab,
  switchTab,
  saveAs,
  setDarkMode,
  setInvertColors,
  setAnnotationMode,
  undo,
  redo,
  extractPages,
  deletePages,
  rotatePages,
  splitPdf,
  mergePdfs,
  reorderPages,
  movePages
};

