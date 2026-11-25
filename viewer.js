import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.mjs';
import * as pdfjsViewer from './node_modules/pdfjs-dist/web/pdf_viewer.mjs';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs';

// DOM Elements
const container = document.getElementById('viewerContainer');
const viewer = document.getElementById('viewer');
const mainView = document.getElementById('mainView');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const tabThumbnailsBtn = document.getElementById('tabThumbnailsBtn');
const tabOutlineBtn = document.getElementById('tabOutlineBtn');
const thumbnailView = document.getElementById('thumbnailView');
const outlineView = document.getElementById('outlineView');
const pagePrev = document.getElementById('pagePrev');
const pageNext = document.getElementById('pageNext');
const pageNumber = document.getElementById('pageNumber');
const numPages = document.getElementById('numPages');
const zoomOut = document.getElementById('zoomOut');
const zoomIn = document.getElementById('zoomIn');
const scaleSelect = document.getElementById('scaleSelect');
const findToggle = document.getElementById('findToggle');
const findBar = document.getElementById('findBar');
const findInput = document.getElementById('findInput');
const findPrev = document.getElementById('findPrev');
const findNext = document.getElementById('findNext');
const findHighlightAll = document.getElementById('findHighlightAll');
const findMsg = document.getElementById('findMsg');
const findClose = document.getElementById('findClose');

// Annotation Toolbar Elements
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const modeHighlightBtn = document.getElementById('modeHighlightBtn');
const modeFreeTextBtn = document.getElementById('modeFreeTextBtn');
const modeInkBtn = document.getElementById('modeInkBtn');
const modeStampBtn = document.getElementById('modeStampBtn');

// Annotation Parameters Elements
const paramsHighlight = document.getElementById('paramsHighlight');
const paramHighlightColor = document.getElementById('paramHighlightColor');
const paramsFreeText = document.getElementById('paramsFreeText');
const paramFreeTextColor = document.getElementById('paramFreeTextColor');
const paramFreeTextSize = document.getElementById('paramFreeTextSize');
const paramsInk = document.getElementById('paramsInk');
const paramInkColor = document.getElementById('paramInkColor');
const paramInkThickness = document.getElementById('paramInkThickness');

// Password Modal Elements
const passwordOverlay = document.getElementById('passwordOverlay');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');
const passwordCancelBtn = document.getElementById('passwordCancelBtn');
const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');

// Setup PDF.js Viewer Components
const eventBus = new pdfjsViewer.EventBus();
const linkService = new pdfjsViewer.PDFLinkService({ eventBus });
const findController = new pdfjsViewer.PDFFindController({ linkService, eventBus });

const DEFAULT_HIGHLIGHT_COLORS = 'yellow=#fff066,green=#48da63,blue=#33bbff,pink=#ff66b2,coral=#ff8059';

const pdfViewer = new pdfjsViewer.PDFViewer({
  container,
  viewer,
  eventBus,
  linkService,
  findController,
  annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE,
  annotationEditorMode: pdfjsLib.AnnotationEditorType.NONE,
  annotationEditorHighlightColors: DEFAULT_HIGHLIGHT_COLORS,
  enableScripting: false,
  imageResourcesPath: './node_modules/pdfjs-dist/web/images/'
});
linkService.setViewer(pdfViewer);

let currentDoc = null;
let currentUIManager = null;
let currentAnnotationMode = pdfjsLib.AnnotationEditorType.NONE;
let shouldPromptStampPicker = false;

function updateModeButtonsUI(mode) {
  currentAnnotationMode = mode;
  if (modeHighlightBtn) modeHighlightBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.HIGHLIGHT);
  if (modeFreeTextBtn) modeFreeTextBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.FREETEXT);
  if (modeInkBtn) modeInkBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.INK);
  if (modeStampBtn) modeStampBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.STAMP);

  // Tool options visibility (visible only for active mode)
  if (paramsHighlight) paramsHighlight.classList.toggle('hidden', mode !== pdfjsLib.AnnotationEditorType.HIGHLIGHT);
  if (paramsFreeText) paramsFreeText.classList.toggle('hidden', mode !== pdfjsLib.AnnotationEditorType.FREETEXT);
  if (paramsInk) paramsInk.classList.toggle('hidden', mode !== pdfjsLib.AnnotationEditorType.INK);
}

function resetToNormalMode() {
  if (window.viewerAPI && window.viewerAPI.setAnnotationMode) {
    window.viewerAPI.setAnnotationMode(pdfjsLib.AnnotationEditorType.NONE);
  }
  applyAnnotationMode(pdfjsLib.AnnotationEditorType.NONE);
}

async function triggerStampImagePicker() {
  if (!window.viewerAPI || !window.viewerAPI.pickImageStamp) {
    resetToNormalMode();
    return;
  }
  let success = false;
  try {
    const result = await window.viewerAPI.pickImageStamp();
    if (!result || !result.bytes) {
      return;
    }

    const file = new File([result.bytes], result.name, {
      type: result.mimeType,
      lastModified: Date.now()
    });

    let testBitmap = null;
    try {
      testBitmap = await createImageBitmap(file);
    } catch (decodeErr) {
      console.error('Failed to decode stamp image:', decodeErr);
      if (window.viewerAPI.reportStampError) {
        window.viewerAPI.reportStampError({
          fileName: result.name,
          error: decodeErr.message || String(decodeErr)
        });
      }
      return;
    } finally {
      if (testBitmap) {
        testBitmap.close();
      }
    }

    eventBus.dispatch('switchannotationeditorparams', {
      type: pdfjsLib.AnnotationEditorParamsType.CREATE,
      value: { bitmapFile: file }
    });
    success = true;
    changedSinceLastRecoveryWrite = true;
    setTabUnsavedChanges(true, 'image stamp created');
  } catch (err) {
    console.error('Error in triggerStampImagePicker:', err);
    if (window.viewerAPI.reportStampError) {
      window.viewerAPI.reportStampError({
        fileName: 'stamp',
        error: err.message || String(err)
      });
    }
  } finally {
    if (!success) {
      resetToNormalMode();
    }
  }
}

function handleModeButtonClick(targetMode) {
  const nextMode = (currentAnnotationMode === targetMode)
    ? pdfjsLib.AnnotationEditorType.NONE
    : targetMode;

  shouldPromptStampPicker = (targetMode === pdfjsLib.AnnotationEditorType.STAMP && nextMode === pdfjsLib.AnnotationEditorType.STAMP);

  if (window.viewerAPI && window.viewerAPI.setAnnotationMode) {
    window.viewerAPI.setAnnotationMode(nextMode);
  } else {
    applyAnnotationMode(nextMode);
  }
}

function applyAnnotationMode(mode) {
  try {
    pdfViewer.annotationEditorMode = { mode };
    updateModeButtonsUI(mode);
    if (mode === pdfjsLib.AnnotationEditorType.STAMP && shouldPromptStampPicker) {
      shouldPromptStampPicker = false;
      triggerStampImagePicker();
    }
  } catch (err) {
    console.error('Error applying annotationEditorMode:', err);
  }
}

function applyDefaultAnnotationParams() {
  if (!pdfjsLib || !pdfjsLib.AnnotationEditorParamsType) return;
  const P = pdfjsLib.AnnotationEditorParamsType;
  if (paramHighlightColor) {
    eventBus.dispatch('switchannotationeditorparams', { type: P.HIGHLIGHT_COLOR, value: paramHighlightColor.value });
  }
  if (paramFreeTextColor) {
    eventBus.dispatch('switchannotationeditorparams', { type: P.FREETEXT_COLOR, value: paramFreeTextColor.value });
  }
  if (paramFreeTextSize) {
    const val = Number(paramFreeTextSize.value);
    if (!isNaN(val) && val > 0) {
      eventBus.dispatch('switchannotationeditorparams', { type: P.FREETEXT_SIZE, value: val });
    }
  }
  if (paramInkColor) {
    eventBus.dispatch('switchannotationeditorparams', { type: P.INK_COLOR, value: paramInkColor.value });
  }
  if (paramInkThickness) {
    const val = Number(paramInkThickness.value);
    if (!isNaN(val) && val > 0) {
      eventBus.dispatch('switchannotationeditorparams', { type: P.INK_THICKNESS, value: val });
    }
  }
}

function initAnnotationParamsUI() {
  if (paramHighlightColor) {
    paramHighlightColor.addEventListener('input', () => {
      eventBus.dispatch('switchannotationeditorparams', {
        type: pdfjsLib.AnnotationEditorParamsType.HIGHLIGHT_COLOR,
        value: paramHighlightColor.value
      });
    });
  }
  if (paramFreeTextColor) {
    paramFreeTextColor.addEventListener('input', () => {
      eventBus.dispatch('switchannotationeditorparams', {
        type: pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR,
        value: paramFreeTextColor.value
      });
    });
  }
  if (paramFreeTextSize) {
    paramFreeTextSize.addEventListener('input', () => {
      const val = Number(paramFreeTextSize.value);
      if (!isNaN(val) && val > 0) {
        eventBus.dispatch('switchannotationeditorparams', {
          type: pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE,
          value: val
        });
      }
    });
  }
  if (paramInkColor) {
    paramInkColor.addEventListener('input', () => {
      eventBus.dispatch('switchannotationeditorparams', {
        type: pdfjsLib.AnnotationEditorParamsType.INK_COLOR,
        value: paramInkColor.value
      });
    });
  }
  if (paramInkThickness) {
    paramInkThickness.addEventListener('input', () => {
      const val = Number(paramInkThickness.value);
      if (!isNaN(val) && val > 0) {
        eventBus.dispatch('switchannotationeditorparams', {
          type: pdfjsLib.AnnotationEditorParamsType.INK_THICKNESS,
          value: val
        });
      }
    });
  }

  eventBus.on('annotationeditorparamschanged', ({ details }) => {
    if (!details || !Array.isArray(details)) return;
    for (const [type, value] of details) {
      if (type === pdfjsLib.AnnotationEditorParamsType.HIGHLIGHT_COLOR && paramHighlightColor) {
        paramHighlightColor.value = value;
      } else if (type === pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR && paramFreeTextColor) {
        paramFreeTextColor.value = value;
      } else if (type === pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE && paramFreeTextSize) {
        paramFreeTextSize.value = value;
      } else if (type === pdfjsLib.AnnotationEditorParamsType.INK_COLOR && paramInkColor) {
        paramInkColor.value = value;
      } else if (type === pdfjsLib.AnnotationEditorParamsType.INK_THICKNESS && paramInkThickness) {
        paramInkThickness.value = value;
      }
    }
  });
}

async function commitAnnotations() {
  if (pdfViewer && pdfjsLib && pdfjsLib.AnnotationEditorType) {
    try {
      pdfViewer.annotationEditorMode = { mode: pdfjsLib.AnnotationEditorType.NONE };
      updateModeButtonsUI(pdfjsLib.AnnotationEditorType.NONE);
    } catch (err) {
      console.error('Error leaving annotation editor mode:', err);
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  }
}

async function commitAndSaveDocument() {
  if (!currentDoc) {
    return null;
  }
  const prevMode = currentAnnotationMode;
  try {
    await commitAnnotations();
    const bytes = await currentDoc.saveDocument();
    return bytes;
  } finally {
    if (pdfViewer && pdfjsLib && pdfjsLib.AnnotationEditorType) {
      try {
        pdfViewer.annotationEditorMode = { mode: prevMode };
        updateModeButtonsUI(prevMode);
      } catch (err) {
        console.error('Error restoring annotation mode after save:', err);
        try {
          pdfViewer.annotationEditorMode = { mode: pdfjsLib.AnnotationEditorType.NONE };
        } catch (_) {}
        updateModeButtonsUI(pdfjsLib.AnnotationEditorType.NONE);
      }
    }
  }
}

if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    if (window.viewerAPI && window.viewerAPI.undo) {
      window.viewerAPI.undo();
    } else if (currentUIManager) {
      currentUIManager.undo();
    }
  });
}

if (redoBtn) {
  redoBtn.addEventListener('click', () => {
    if (window.viewerAPI && window.viewerAPI.redo) {
      window.viewerAPI.redo();
    } else if (currentUIManager) {
      currentUIManager.redo();
    }
  });
}

if (modeHighlightBtn) modeHighlightBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.HIGHLIGHT));
if (modeFreeTextBtn) modeFreeTextBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.FREETEXT));
if (modeInkBtn) modeInkBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.INK));
if (modeStampBtn) modeStampBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.STAMP));

eventBus.on('annotationeditormodechanged', ({ mode }) => {
  updateModeButtonsUI(mode);
});

eventBus.on('editingstateschanged', ({ details }) => {
  if (!details) return;
  if (details.hasSomethingToUndo) {
    changedSinceLastRecoveryWrite = true;
    setTabUnsavedChanges(true, 'editingstateschanged (undo available)');
  }
  if (typeof details.hasSomethingToUndo === 'boolean' && undoBtn) {
    undoBtn.disabled = !details.hasSomethingToUndo;
  }
  if (typeof details.hasSomethingToRedo === 'boolean' && redoBtn) {
    redoBtn.disabled = !details.hasSomethingToRedo;
  }
});

// Route keyboard shortcuts to commands when not typing in text input
window.addEventListener('keydown', (e) => {
  const isZ = e.key === 'z' || e.key === 'Z';
  const isY = e.key === 'y' || e.key === 'Y';
  if (!e.ctrlKey && !e.metaKey) return;

  if (isZ || isY) {
    const el = document.activeElement;
    const isTextInput = (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number')) ||
                        el instanceof HTMLTextAreaElement ||
                        el?.isContentEditable;
    if (isTextInput) {
      // Normal text-field undo/redo inside input or editable text box
      return;
    }

    e.preventDefault();
    if (isY || (isZ && e.shiftKey)) {
      if (window.viewerAPI && window.viewerAPI.redo) {
        window.viewerAPI.redo();
      } else if (currentUIManager) {
        currentUIManager.redo();
      }
    } else if (isZ) {
      if (window.viewerAPI && window.viewerAPI.undo) {
        window.viewerAPI.undo();
      } else if (currentUIManager) {
        currentUIManager.undo();
      }
    }
  }
});

// Expose PDFViewerApplication for compatibility
window.PDFViewerApplication = {
  pdfDocument: null,
  pdfViewer,
  eventBus,
  linkService,
  findController,
  uiManager: null,

  async saveDocument() {
    if (!this.pdfDocument) throw new Error('No PDF document loaded.');
    return await commitAndSaveDocument();
  }
};

eventBus.on('annotationeditoruimanager', ({ uiManager }) => {
  currentUIManager = uiManager;
  window.PDFViewerApplication.uiManager = uiManager;
});

initAnnotationParamsUI();

eventBus.on('pagesinit', () => {
  pdfViewer.currentScaleValue = 'page-width';
  numPages.textContent = pdfViewer.pagesCount;
  pageNumber.max = pdfViewer.pagesCount;
  try {
    pdfViewer.annotationEditorMode = { mode: currentAnnotationMode };
    applyDefaultAnnotationParams();
  } catch (e) {
    console.error('Error setting annotationEditorMode:', e);
  }
});

eventBus.on('pagechanging', (evt) => {
  pageNumber.value = evt.pageNumber;
  updateActiveThumbnail(evt.pageNumber);
});

// Sidebar Toggle & Tabs
sidebarToggle.addEventListener('click', () => {
  const isHidden = sidebar.classList.toggle('hidden');
  mainView.classList.toggle('sidebar-open', !isHidden);
  sidebarToggle.classList.toggle('active', !isHidden);
  if (!isHidden) {
    renderVisibleThumbnails();
  }
});

tabThumbnailsBtn.addEventListener('click', () => {
  tabThumbnailsBtn.classList.add('active');
  tabOutlineBtn.classList.remove('active');
  thumbnailView.style.display = 'flex';
  outlineView.style.display = 'none';
  renderVisibleThumbnails();
});

tabOutlineBtn.addEventListener('click', () => {
  tabOutlineBtn.classList.add('active');
  tabThumbnailsBtn.classList.remove('active');
  outlineView.style.display = 'block';
  thumbnailView.style.display = 'none';
});

// Page Navigation
pagePrev.addEventListener('click', () => {
  if (pdfViewer.currentPageNumber > 1) {
    pdfViewer.currentPageNumber--;
  }
});

pageNext.addEventListener('click', () => {
  if (pdfViewer.currentPageNumber < pdfViewer.pagesCount) {
    pdfViewer.currentPageNumber++;
  }
});

pageNumber.addEventListener('change', () => {
  const val = parseInt(pageNumber.value, 10);
  if (val >= 1 && val <= pdfViewer.pagesCount) {
    pdfViewer.currentPageNumber = val;
  } else {
    pageNumber.value = pdfViewer.currentPageNumber;
  }
});

// Zoom Controls
zoomIn.addEventListener('click', () => {
  pdfViewer.currentScale = Math.min(10.0, (pdfViewer.currentScale || 1.0) * 1.15);
  scaleSelect.value = 'custom';
});

zoomOut.addEventListener('click', () => {
  pdfViewer.currentScale = Math.max(0.25, (pdfViewer.currentScale || 1.0) / 1.15);
  scaleSelect.value = 'custom';
});

scaleSelect.addEventListener('change', () => {
  if (scaleSelect.value !== 'custom') {
    pdfViewer.currentScaleValue = scaleSelect.value;
  }
});

// Ctrl + Scroll Zoom
container.addEventListener('wheel', (e) => {
  if (e.ctrlKey) {
    e.preventDefault();
    if (e.deltaY < 0) {
      pdfViewer.currentScale = Math.min(10.0, (pdfViewer.currentScale || 1.0) * 1.1);
    } else if (e.deltaY > 0) {
      pdfViewer.currentScale = Math.max(0.25, (pdfViewer.currentScale || 1.0) / 1.1);
    }
    scaleSelect.value = 'custom';
  }
}, { passive: false });

// Find Bar
function openFindBar() {
  findBar.classList.remove('hidden');
  findInput.focus();
  findInput.select();
}

function closeFindBar() {
  findBar.classList.add('hidden');
  eventBus.dispatch('findbarclose', { source: window });
}

findToggle.addEventListener('click', () => {
  if (findBar.classList.contains('hidden')) {
    openFindBar();
  } else {
    closeFindBar();
  }
});

findClose.addEventListener('click', closeFindBar);

function executeFind(type, findPrevious = false) {
  const query = findInput.value;
  if (!query) {
    findMsg.textContent = '';
    return;
  }
  eventBus.dispatch('find', {
    source: window,
    type,
    query,
    phraseSearch: true,
    caseSensitive: false,
    entireWord: false,
    highlightAll: findHighlightAll.checked,
    findPrevious
  });
}

findInput.addEventListener('input', () => {
  executeFind('');
});

findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    executeFind('again', e.shiftKey);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeFindBar();
  }
});

findNext.addEventListener('click', () => executeFind('again', false));
findPrev.addEventListener('click', () => executeFind('again', true));

findHighlightAll.addEventListener('change', () => {
  eventBus.dispatch('findhighlightallchange', {
    source: window,
    highlightAll: findHighlightAll.checked
  });
});

eventBus.on('updatefindmatchescount', ({ matchesCount }) => {
  if (matchesCount && matchesCount.total > 0) {
    findMsg.textContent = `${matchesCount.current} of ${matchesCount.total}`;
  } else {
    findMsg.textContent = '0 of 0';
  }
});

eventBus.on('updatefindcontrolstate', ({ state }) => {
  if (state === pdfjsViewer.FindState.NOT_FOUND) {
    findMsg.textContent = 'Phrase not found';
  }
});

// Keyboard shortcuts inside viewer
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    openFindBar();
  }
});

// Outline and Thumbnails Rendering
async function loadOutline(doc) {
  outlineView.innerHTML = '';
  try {
    const outline = await doc.getOutline();
    if (!outline || outline.length === 0) {
      outlineView.innerHTML = '<div style="padding: 10px; color: var(--text-color); opacity: 0.7;">No outline / bookmarks in document.</div>';
      return;
    }

    function appendOutlineNodes(items, parentEl) {
      for (const item of items) {
        const node = document.createElement('div');
        node.className = 'outline-node';

        const row = document.createElement('div');
        row.className = 'outline-item-row';

        const hasChildren = Array.isArray(item.items) && item.items.length > 0;
        let childContainer = null;
        let toggleBtn = null;

        if (hasChildren) {
          toggleBtn = document.createElement('span');
          toggleBtn.className = 'outline-toggle';
          toggleBtn.textContent = '▼';
          toggleBtn.title = 'Expand / Collapse';
          row.appendChild(toggleBtn);
        } else {
          const placeholder = document.createElement('span');
          placeholder.className = 'outline-toggle-placeholder';
          row.appendChild(placeholder);
        }

        const link = document.createElement('a');
        link.className = 'outline-item';
        link.textContent = item.title;
        link.title = item.title;
        if (item.bold) link.style.fontWeight = 'bold';
        if (item.italic) link.style.fontStyle = 'italic';
        if (item.color) {
          link.style.color = `rgb(${item.color[0]}, ${item.color[1]}, ${item.color[2]})`;
        }

        const toggleExpansion = () => {
          if (!childContainer || !toggleBtn) return;
          const isCollapsed = childContainer.classList.toggle('hidden');
          toggleBtn.textContent = isCollapsed ? '▶' : '▼';
        };

        if (item.dest) {
          link.href = '#';
          link.addEventListener('click', (e) => {
            e.preventDefault();
            linkService.goToDestination(item.dest);
          });
        } else if (item.url) {
          link.href = item.url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        } else {
          link.classList.add('no-dest');
          if (hasChildren) {
            link.style.cursor = 'pointer';
            link.addEventListener('click', (e) => {
              e.preventDefault();
              toggleExpansion();
            });
          }
        }

        row.appendChild(link);
        node.appendChild(row);

        if (hasChildren) {
          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleExpansion();
          });

          childContainer = document.createElement('div');
          childContainer.className = 'outline-children';
          appendOutlineNodes(item.items, childContainer);

          if (typeof item.count === 'number' && item.count < 0) {
            childContainer.classList.add('hidden');
            toggleBtn.textContent = '▶';
          }

          node.appendChild(childContainer);
        }

        parentEl.appendChild(node);
      }
    }
    appendOutlineNodes(outline, outlineView);
  } catch (err) {
    console.error('Error loading outline:', err);
  }
}

// Lazy Thumbnail Rendering
const renderedThumbnails = new Set();
const renderingThumbnails = new Set();
const thumbnailQueue = [];
let isProcessingThumbnailQueue = false;
let thumbnailObserver = null;

function cleanupThumbnails() {
  if (thumbnailObserver) {
    thumbnailObserver.disconnect();
    thumbnailObserver = null;
  }
  thumbnailQueue.length = 0;
  renderedThumbnails.clear();
  renderingThumbnails.clear();
  isProcessingThumbnailQueue = false;
}

function enqueueThumbnailRender(pageNum, itemEl) {
  if (renderedThumbnails.has(pageNum) || renderingThumbnails.has(pageNum)) {
    return;
  }
  thumbnailQueue.push({ pageNum, itemEl });
  processThumbnailQueue();
}

async function processThumbnailQueue() {
  if (isProcessingThumbnailQueue || thumbnailQueue.length === 0) {
    return;
  }
  isProcessingThumbnailQueue = true;

  while (thumbnailQueue.length > 0) {
    const task = thumbnailQueue.shift();
    const { pageNum, itemEl } = task;
    if (!currentDoc || renderedThumbnails.has(pageNum)) {
      continue;
    }

    renderingThumbnails.add(pageNum);
    try {
      const page = await currentDoc.getPage(pageNum);
      if (!currentDoc) break;
      const canvas = itemEl.querySelector('canvas');
      if (canvas) {
        const viewport = page.getViewport({ scale: 0.15 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        renderedThumbnails.add(pageNum);
        if (thumbnailObserver) {
          thumbnailObserver.unobserve(itemEl);
        }
      }
    } catch (e) {
      console.error(`Thumbnail render error for page ${pageNum}:`, e);
    } finally {
      renderingThumbnails.delete(pageNum);
    }
  }

  isProcessingThumbnailQueue = false;
}

function renderVisibleThumbnails() {
  if (!currentDoc || sidebar.classList.contains('hidden') || thumbnailView.style.display === 'none') {
    return;
  }
  const sidebarContentEl = document.getElementById('sidebarContent');
  if (!sidebarContentEl) return;
  const containerRect = sidebarContentEl.getBoundingClientRect();
  if (containerRect.height === 0) return;

  const items = thumbnailView.querySelectorAll('.thumbnail-item');
  for (const item of items) {
    const pageNum = parseInt(item.dataset.page, 10);
    if (renderedThumbnails.has(pageNum) || renderingThumbnails.has(pageNum)) continue;
    const rect = item.getBoundingClientRect();
    if (rect.bottom >= containerRect.top - 300 && rect.top <= containerRect.bottom + 300) {
      enqueueThumbnailRender(pageNum, item);
    }
  }
}

function initThumbnails(numPagesTotal) {
  cleanupThumbnails();
  thumbnailView.innerHTML = '';

  const sidebarContentEl = document.getElementById('sidebarContent');
  thumbnailObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const pageNum = parseInt(entry.target.dataset.page, 10);
        if (!renderedThumbnails.has(pageNum) && !renderingThumbnails.has(pageNum)) {
          enqueueThumbnailRender(pageNum, entry.target);
        }
      }
    }
  }, {
    root: sidebarContentEl,
    rootMargin: '300px 0px'
  });

  for (let i = 1; i <= numPagesTotal; i++) {
    const item = document.createElement('div');
    item.className = 'thumbnail-item' + (i === 1 ? ' selected' : '');
    item.dataset.page = i;

    const canvas = document.createElement('canvas');
    canvas.className = 'thumbnail-canvas';
    canvas.width = 80;
    canvas.height = 110;
    item.appendChild(canvas);

    const label = document.createElement('span');
    label.className = 'thumbnail-label';
    label.textContent = String(i);
    item.appendChild(label);

    item.addEventListener('click', () => {
      pdfViewer.scrollPageIntoView({ pageNumber: i });
    });

    thumbnailView.appendChild(item);
    thumbnailObserver.observe(item);
  }
}

function updateActiveThumbnail(activePage) {
  const items = thumbnailView.querySelectorAll('.thumbnail-item');
  items.forEach(el => {
    if (parseInt(el.dataset.page, 10) === activePage) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

// Track Unsaved Changes (Sticky flag)
let tabHasUnsavedChanges = false;
let changedSinceLastRecoveryWrite = false;

function setTabUnsavedChanges(value, reason) {
  const nextVal = Boolean(value);
  if (tabHasUnsavedChanges !== nextVal) {
    tabHasUnsavedChanges = nextVal;
    if (nextVal) {
      console.log(`[modified] Flag set: ${reason}`);
      if (window.viewerAPI) {
        window.viewerAPI.setModified(true);
      }
    } else {
      console.log(`[modified] Flag cleared: ${reason}`);
      if (window.viewerAPI) {
        window.viewerAPI.setModified(false);
      }
    }
  }
}

function attachModifiedTracking(doc) {
  if (doc && doc.annotationStorage) {
    doc.annotationStorage.onSetModified = () => {
      changedSinceLastRecoveryWrite = true;
      setTabUnsavedChanges(true, 'annotationStorage.onSetModified');
    };
    doc.annotationStorage.onResetModified = () => {
      // Step 2: Ignore onResetModified and any reset caused by autosave, the commit helper, or leaving a mode.
    };
  }
}

// Autosave & Recovery Tracking
let lastUserActivityTime = Date.now();
let lastRecoverySaveTime = 0;
let isRecoverySaveInProgress = false;

function recordUserActivity() {
  lastUserActivityTime = Date.now();
}

window.addEventListener('pointerdown', recordUserActivity, { passive: true });
window.addEventListener('pointermove', recordUserActivity, { passive: true });
window.addEventListener('keydown', recordUserActivity, { passive: true });
window.addEventListener('wheel', recordUserActivity, { passive: true });

function isUserTypingInTextBox() {
  const el = document.activeElement;
  if (!el) return false;
  return (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number' || el.type === 'search' || !el.type)) ||
         el instanceof HTMLTextAreaElement ||
         el.isContentEditable ||
         Boolean(el.closest && el.closest('.freeTextEditor, .annotationEditor'));
}

setInterval(async () => {
  if (!currentDoc || isRecoverySaveInProgress || !tabHasUnsavedChanges || !changedSinceLastRecoveryWrite) {
    return;
  }
  const now = Date.now();
  if (now - lastRecoverySaveTime < 30000) {
    return;
  }
  if (now - lastUserActivityTime < 5000) {
    return;
  }
  if (isUserTypingInTextBox()) {
    return;
  }

  isRecoverySaveInProgress = true;
  try {
    const bytes = await commitAndSaveDocument();
    if (bytes && window.viewerAPI && window.viewerAPI.saveRecoveryBytes) {
      const res = await window.viewerAPI.saveRecoveryBytes(bytes);
      if (res && res.success) {
        changedSinceLastRecoveryWrite = false;
        lastRecoverySaveTime = Date.now();
      }
    }
  } catch (err) {
    console.error('Autosave recovery error:', err);
  } finally {
    isRecoverySaveInProgress = false;
  }
}, 1000);

// Load Document Function
async function openDocument(bufferData) {
  if (currentDoc) {
    cleanupThumbnails();
    await currentDoc.destroy();
    currentDoc = null;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(bufferData),
    enableScripting: false,
    isEvalSupported: false,
    cMapUrl: './node_modules/pdfjs-dist/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/'
  });

  // Password Prompt Handling
  loadingTask.onPassword = (updatePassword, reason) => {
    passwordOverlay.classList.remove('hidden');
    passwordInput.value = '';
    passwordInput.focus();
    if (reason === 2) {
      passwordError.textContent = 'Invalid password. Please try again.';
    } else {
      passwordError.textContent = '';
    }

    const submit = () => {
      const pwd = passwordInput.value;
      passwordOverlay.classList.add('hidden');
      updatePassword(pwd);
    };

    passwordSubmitBtn.onclick = submit;
    passwordInput.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') cancel();
    };

    const cancel = () => {
      passwordOverlay.classList.add('hidden');
      updatePassword(new Error('Password cancelled'));
      if (window.viewerAPI) {
        window.viewerAPI.closeCurrentTab();
      }
    };

    passwordCancelBtn.onclick = cancel;
  };

  const doc = await loadingTask.promise;
  currentDoc = doc;
  window.PDFViewerApplication.pdfDocument = doc;
  pdfViewer.setDocument(doc);
  linkService.setDocument(doc, null);
  findController.setDocument(doc);

  attachModifiedTracking(doc);
  loadOutline(doc);
  initThumbnails(doc.numPages);

  return doc;
}

// Theme Application
function applyTheme({ darkMode, invertColors }) {
  if (darkMode) {
    document.documentElement.classList.add('dark-theme');
  } else {
    document.documentElement.classList.remove('dark-theme');
  }

  if (invertColors) {
    document.documentElement.classList.add('invert-page-colors');
  } else {
    document.documentElement.classList.remove('invert-page-colors');
  }
}

// Wire IPC from Preload
if (window.viewerAPI) {
  window.viewerAPI.onLoadDocument(async (payload) => {
    try {
      if (payload.theme) {
        applyTheme(payload.theme);
      }
      if (payload.hasUnsavedChanges) {
        changedSinceLastRecoveryWrite = true;
        setTabUnsavedChanges(true, 'restored or edited document');
      } else {
        tabHasUnsavedChanges = false;
        changedSinceLastRecoveryWrite = false;
      }
      await openDocument(payload.buffer);
    } catch (err) {
      console.error('Error loading PDF in tab view:', err);
    }
  });

  window.viewerAPI.onRequestSave(async () => {
    if (!currentDoc) {
      return;
    }
    try {
      const bytes = await commitAndSaveDocument();
      if (!bytes) return;
      const res = await window.viewerAPI.savePDFBytes(bytes);
      if (res && res.success) {
        currentDoc.annotationStorage.resetModified();
        changedSinceLastRecoveryWrite = false;
        setTabUnsavedChanges(false, 'Save As completed successfully');
      }
    } catch (err) {
      console.error('Error saving PDF in tab:', err);
    }
  });

  window.viewerAPI.onThemeUpdated((theme) => {
    applyTheme(theme);
  });

  if (window.viewerAPI.onSetAnnotationMode) {
    window.viewerAPI.onSetAnnotationMode((mode) => {
      applyAnnotationMode(mode);
    });
  }

  if (window.viewerAPI.onRequestCommit) {
    window.viewerAPI.onRequestCommit(async () => {
      await commitAnnotations();
    });
  }

  if (window.viewerAPI.onUndo) {
    window.viewerAPI.onUndo(() => {
      const el = document.activeElement;
      const isTextInput = (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number')) ||
                          el instanceof HTMLTextAreaElement ||
                          el?.isContentEditable;
      if (isTextInput) {
        document.execCommand('undo');
        return;
      }
      if (currentUIManager) {
        changedSinceLastRecoveryWrite = true;
        setTabUnsavedChanges(true, 'undo action');
        currentUIManager.undo();
      }
    });
  }

  if (window.viewerAPI.onRedo) {
    window.viewerAPI.onRedo(() => {
      const el = document.activeElement;
      const isTextInput = (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number')) ||
                          el instanceof HTMLTextAreaElement ||
                          el?.isContentEditable;
      if (isTextInput) {
        document.execCommand('redo');
        return;
      }
      if (currentUIManager) {
        changedSinceLastRecoveryWrite = true;
        setTabUnsavedChanges(true, 'redo action');
        currentUIManager.redo();
      }
    });
  }

  if (window.viewerAPI.onRequestBytes) {
    window.viewerAPI.onRequestBytes(async () => {
      if (!currentDoc) {
        throw new Error('No document loaded.');
      }
      return await commitAndSaveDocument();
    });
  }

  const pageOpsOverlay = document.getElementById('pageOpsOverlay');
  const pageOpsTitle = document.getElementById('pageOpsTitle');
  const pageOpsTotal = document.getElementById('pageOpsTotal');
  const pageOpsSplitModeGroup = document.getElementById('pageOpsSplitModeGroup');
  const pageOpsSplitMode = document.getElementById('pageOpsSplitMode');
  const pageOpsSplitEveryGroup = document.getElementById('pageOpsSplitEveryGroup');
  const pageOpsSplitEvery = document.getElementById('pageOpsSplitEvery');
  const pageOpsRangeGroup = document.getElementById('pageOpsRangeGroup');
  const pageOpsRangeLabel = document.getElementById('pageOpsRangeLabel');
  const pageOpsRangeInput = document.getElementById('pageOpsRangeInput');
  const pageOpsRotateGroup = document.getElementById('pageOpsRotateGroup');
  const pageOpsRotateSelect = document.getElementById('pageOpsRotateSelect');
  const pageOpsError = document.getElementById('pageOpsError');
  const pageOpsCancelBtn = document.getElementById('pageOpsCancelBtn');
  const pageOpsSubmitBtn = document.getElementById('pageOpsSubmitBtn');

  let activePageOp = null;

  function syncSplitModalFields() {
    if (activePageOp !== 'split') {
      pageOpsSplitModeGroup.classList.add('hidden');
      pageOpsSplitEveryGroup.classList.add('hidden');
      pageOpsRangeGroup.classList.remove('hidden');
      pageOpsRangeLabel.textContent = 'Pages (e.g. 1-3, 5, 8-10):';
      return;
    }
    pageOpsSplitModeGroup.classList.remove('hidden');
    if (pageOpsSplitMode.value === 'every') {
      pageOpsSplitEveryGroup.classList.remove('hidden');
      pageOpsRangeGroup.classList.add('hidden');
    } else {
      pageOpsSplitEveryGroup.classList.add('hidden');
      pageOpsRangeGroup.classList.remove('hidden');
      pageOpsRangeLabel.textContent = 'Ranges (e.g. 1-3; 4-6):';
    }
  }

  function closePageOpsModal() {
    activePageOp = null;
    if (pageOpsOverlay) {
      pageOpsOverlay.classList.add('hidden');
    }
  }

  function openPageOpsModal(op) {
    if (!currentDoc || !pageOpsOverlay) return;
    activePageOp = op;
    const titles = {
      extract: 'Extract Pages',
      delete: 'Delete Pages',
      rotate: 'Rotate Pages',
      split: 'Split Document'
    };
    pageOpsTitle.textContent = titles[op] || 'Page Operation';
    pageOpsTotal.textContent = String(currentDoc.numPages);
    pageOpsError.textContent = '';
    pageOpsRangeInput.value = '';
    pageOpsSplitEvery.value = '2';
    pageOpsSplitMode.value = 'every';
    pageOpsRotateSelect.value = '90';
    pageOpsRotateGroup.classList.toggle('hidden', op !== 'rotate');
    syncSplitModalFields();
    pageOpsOverlay.classList.remove('hidden');
    if (op === 'split' && pageOpsSplitMode.value === 'every') {
      pageOpsSplitEvery.focus();
    } else {
      pageOpsRangeInput.focus();
    }
  }

  async function submitPageOpsModal() {
    if (!activePageOp || !window.viewerAPI.executePageOp) return;
    pageOpsError.textContent = '';
    pageOpsSubmitBtn.disabled = true;
    try {
      let payload;
      if (activePageOp === 'split') {
        if (pageOpsSplitMode.value === 'every') {
          payload = { op: 'split', spec: { mode: 'every', every: Number(pageOpsSplitEvery.value) } };
        } else {
          payload = { op: 'split', spec: { mode: 'ranges', ranges: pageOpsRangeInput.value } };
        }
      } else if (activePageOp === 'rotate') {
        payload = { op: 'rotate', range: pageOpsRangeInput.value, degrees: Number(pageOpsRotateSelect.value) };
      } else {
        payload = { op: activePageOp, range: pageOpsRangeInput.value };
      }

      const res = await window.viewerAPI.executePageOp(payload);
      if (res && res.validationError) {
        pageOpsError.textContent = res.validationError;
        return;
      }
      closePageOpsModal();
    } catch (err) {
      pageOpsError.textContent = err.message || String(err);
    } finally {
      pageOpsSubmitBtn.disabled = false;
    }
  }

  if (pageOpsSplitMode) {
    pageOpsSplitMode.addEventListener('change', syncSplitModalFields);
  }
  if (pageOpsCancelBtn) {
    pageOpsCancelBtn.addEventListener('click', closePageOpsModal);
  }
  if (pageOpsSubmitBtn) {
    pageOpsSubmitBtn.addEventListener('click', submitPageOpsModal);
  }
  if (pageOpsOverlay) {
    pageOpsOverlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePageOpsModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        submitPageOpsModal();
      }
    });
  }

  if (window.viewerAPI.onOpenPageOpsModal) {
    window.viewerAPI.onOpenPageOpsModal((op) => {
      openPageOpsModal(op);
    });
  }
}
