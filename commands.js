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
  redo
};

