# HurufReader — Phase 0 Architecture

## Stack & Pinned Versions
- **Runtime / Shell**: Electron `44.7.0` (Node `24.16.0`, Chromium `134`)
- **PDF Engine**: PDF.js (`pdfjs-dist` `6.4.299`)
- **Language & Styling**: Plain JavaScript (ES Modules + CommonJS), Stock CSS

## Folder Structure
```
HurufReader/
├── main.js             # Electron main process (lifecycle, menus, native dialogs, IPC)
├── preload.js          # Context bridge (secure minimal IPC)
├── index.html          # Viewer host DOM
├── renderer.js         # PDF.js viewer & annotation editor integration
├── verify.js           # CLI verification tool using pdfjs-dist
├── package.json        # Manifest & pinned dependencies
└── ARCHITECTURE.md     # Architectural specification
```

## IPC Flow
1. **Open (Ctrl+O)**: Main triggers `dialog.showOpenDialog()`, reads binary buffer, sends `open-pdf` event to renderer. Renderer invokes `PDFViewerApplication.open()`.
2. **Save As (Ctrl+Shift+S)**: Main sends `request-save-pdf`. Renderer calls `PDFViewerApplication.pdfDocument.saveDocument()`, gets bytes with serialized annotations, invokes `save-pdf-bytes`. Main shows `dialog.showSaveDialog()`, validates target is not the original file, and writes bytes.

## Security Settings
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- `enableScripting: false` configured in PDF.js display & worker options
- Remote navigation & window popups denied (`will-navigate`, `setWindowOpenHandler`)
- Content Security Policy: `default-src 'self'`, no external network access

## Findings from Verification & Stress Testing
- `pdfDocument.saveDocument()` produces standard PDF `/Type /Annot` with `/Subtype /Highlight` dictionary entries and QuadPoints, compatible with Adobe Acrobat and Edge.
- Highlight editor requires `annotationEditorHighlightColors` configuration for color map resolution during selection.

## Known PDF Quirks
- **Leading Junk Bytes**: Files with bytes before `%PDF-` (e.g., `\r\n`) cause corrupt Save As outputs because PDF.js writes incremental updates using absolute offsets but resolves xrefs relative to `%PDF-`.
- **Fix**: Main process scans the first 1024 bytes on open and strips leading bytes before `%PDF-` in memory without modifying the original file on disk.
