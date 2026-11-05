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
const modeHighlightBtn = document.getElementById('modeHighlightBtn');
const modeFreeTextBtn = document.getElementById('modeFreeTextBtn');
const modeInkBtn = document.getElementById('modeInkBtn');
const modeStampBtn = document.getElementById('modeStampBtn');

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

function updateModeButtonsUI(mode) {
  currentAnnotationMode = mode;
  if (modeHighlightBtn) modeHighlightBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.HIGHLIGHT);
  if (modeFreeTextBtn) modeFreeTextBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.FREETEXT);
  if (modeInkBtn) modeInkBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.INK);
  if (modeStampBtn) modeStampBtn.classList.toggle('active', mode === pdfjsLib.AnnotationEditorType.STAMP);
}

function handleModeButtonClick(targetMode) {
  const nextMode = (currentAnnotationMode === targetMode)
    ? pdfjsLib.AnnotationEditorType.NONE
    : targetMode;

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
  } catch (err) {
    console.error('Error applying annotationEditorMode:', err);
  }
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

if (modeHighlightBtn) modeHighlightBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.HIGHLIGHT));
if (modeFreeTextBtn) modeFreeTextBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.FREETEXT));
if (modeInkBtn) modeInkBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.INK));
if (modeStampBtn) modeStampBtn.addEventListener('click', () => handleModeButtonClick(pdfjsLib.AnnotationEditorType.STAMP));

eventBus.on('annotationeditormodechanged', ({ mode }) => {
  updateModeButtonsUI(mode);
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

eventBus.on('pagesinit', () => {
  pdfViewer.currentScaleValue = 'page-width';
  numPages.textContent = pdfViewer.pagesCount;
  pageNumber.max = pdfViewer.pagesCount;
  try {
    pdfViewer.annotationEditorMode = { mode: currentAnnotationMode };
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

// Track Unsaved Changes
function attachModifiedTracking(doc) {
  if (doc && doc.annotationStorage) {
    doc.annotationStorage.onSetModified = () => {
      if (window.viewerAPI) {
        window.viewerAPI.setModified(true);
      }
    };
    doc.annotationStorage.onResetModified = () => {
      if (window.viewerAPI) {
        window.viewerAPI.setModified(false);
      }
    };
  }
}

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
        window.viewerAPI.setModified(false);
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
}
