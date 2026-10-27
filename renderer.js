import * as pdfjsLib from './node_modules/pdfjs-dist/build/pdf.mjs';
import * as pdfjsViewer from './node_modules/pdfjs-dist/web/pdf_viewer.mjs';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs';

const container = document.getElementById('viewerContainer');
const viewer = document.getElementById('viewer');
const emptyState = document.getElementById('emptyState');

const eventBus = new pdfjsViewer.EventBus();
const linkService = new pdfjsViewer.PDFLinkService({ eventBus });

const DEFAULT_HIGHLIGHT_COLORS = 'yellow=#fff066,green=#48da63,blue=#33bbff,pink=#ff66b2,coral=#ff8059';

const pdfViewer = new pdfjsViewer.PDFViewer({
  container,
  viewer,
  eventBus,
  linkService,
  annotationMode: pdfjsLib.AnnotationMode.ENABLE_STORAGE,
  annotationEditorMode: pdfjsLib.AnnotationEditorType.HIGHLIGHT,
  annotationEditorHighlightColors: DEFAULT_HIGHLIGHT_COLORS,
  enableScripting: false,
  imageResourcesPath: './node_modules/pdfjs-dist/web/images/'
});
linkService.setViewer(pdfViewer);

let currentUIManager = null;

eventBus.on('annotationeditoruimanager', ({ uiManager }) => {
  currentUIManager = uiManager;
  window.PDFViewerApplication.uiManager = uiManager;
});

eventBus.on('pagesinit', () => {
  pdfViewer.currentScaleValue = 'page-width';
  try {
    pdfViewer.annotationEditorMode = { mode: pdfjsLib.AnnotationEditorType.HIGHLIGHT };
  } catch (e) {
    console.error('Error setting annotationEditorMode:', e);
  }
});

// Global PDFViewerApplication
window.PDFViewerApplication = {
  pdfDocument: null,
  pdfViewer: pdfViewer,
  eventBus: eventBus,
  linkService: linkService,
  uiManager: currentUIManager,

  async open(data, filePath) {
    if (this.pdfDocument) {
      await this.pdfDocument.destroy();
      this.pdfDocument = null;
    }

    if (emptyState) {
      emptyState.style.display = 'none';
    }

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(data),
      enableScripting: false,
      isEvalSupported: false,
      cMapUrl: './node_modules/pdfjs-dist/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './node_modules/pdfjs-dist/standard_fonts/'
    });

    const doc = await loadingTask.promise;
    this.pdfDocument = doc;
    pdfViewer.setDocument(doc);
    linkService.setDocument(doc, null);
    return doc;
  },

  async saveDocument() {
    if (!this.pdfDocument) {
      throw new Error('No PDF document loaded.');
    }
    return await this.pdfDocument.saveDocument();
  }
};

// Wire IPC from preload
if (window.hurufAPI) {
  window.hurufAPI.onOpenPDF(async (payload) => {
    try {
      await window.PDFViewerApplication.open(payload.buffer, payload.filePath);
    } catch (err) {
      console.error('Error opening PDF in renderer:', err);
      alert(`Error loading PDF: ${err.message}`);
    }
  });

  window.hurufAPI.onRequestSave(async () => {
    if (!window.PDFViewerApplication.pdfDocument) {
      alert('No PDF is currently open.');
      return;
    }
    try {
      const bytes = await window.PDFViewerApplication.pdfDocument.saveDocument();
      await window.hurufAPI.savePDFBytes(bytes);
    } catch (err) {
      console.error('Error saving PDF in renderer:', err);
      alert(`Error saving PDF: ${err.message}`);
    }
  });
}
