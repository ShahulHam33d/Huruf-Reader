# HurufReader — Architecture

## Stack & Pinned Dependencies
- Electron 44.7.0 (Chromium 134, Node 24.16.0), plain JavaScript, pdfjs-dist 6.4.299.
- Security: contextIsolation true, nodeIntegration false, sandbox true, strict CSP, no network.

## Multi-Document Tab Architecture
- **Tab Management**: One Electron `WebContentsView` per document tab. Each view loads `viewer.html` hosting an independent PDF.js viewer instance.
- **Main Window (`index.html`)**: Renders native tab strip (title, unsaved dot, close button, `+` button) and empty state ("Open a PDF with Ctrl+O").
- **View Switching**: `mainWindow.contentView.addChildView()` / `removeChildView()`, bounds pegged to window content below tab bar (y: 40).
- **Navigation Shortcuts**: `Ctrl+O` (open), `Ctrl+W` (close), `Ctrl+Tab` / `Ctrl+Shift+Tab` (cycle tabs). Duplicate file opens switch to existing tab.

## IPC Flow
- **Tabs**: `tabBarAPI` sends `tab-switch`, `tab-close`, `tab-open-dialog`. Main broadcasts `tabs-updated`.
- **Viewer**: `viewerAPI` receives `load-document` (buffer + theme). Sends `tab-set-modified` and `save-pdf-bytes`.
- **Save As**: Main triggers `request-save-pdf`. Viewer serializes via `pdfDocument.saveDocument()`. Main displays `showSaveDialog()`, blocks overwrite of original file, and writes bytes.

## Unsaved Changes Tracking
- Monitored via PDF.js `pdfDocument.annotationStorage.onSetModified` and `onResetModified`.
- Modified tabs display a dot indicator on the tab bar.
- Tab/window close with unsaved changes shows native dialog with 3 choices: [Save As, Discard, Cancel].

## Dark Mode & Invert Page Colors
- `View > Dark Mode` (`Ctrl+Shift+D`): toggles `.dark-theme` on tab bar and viewer interface.
- `View > Invert Page Colors`: toggles `.invert-page-colors` applying CSS filter (`invert(0.9) hue-rotate(180deg)`) on page rendering. PDF data remains unaltered.
- State saved to `%APPDATA%/hurufreader/settings.json` and restored on startup.

## Error Handling
- **Corrupted / Invalid**: Missing `%PDF-` header or unparseable PDF triggers native error dialog with plain-language message without opening a tab; technical errors logged to console.
- **Password Protected**: Captured via PDF.js `loadingTask.onPassword`, prompting in-viewer password dialog with retry on failure and clean tab closure on cancel.
- **Missing / Inaccessible**: Native error dialog shown on file read failure.

## Known PDF Quirks
- **Leading Junk Bytes**: Files with junk bytes before `%PDF-` break xref resolution during Save As. Main trims initial bytes before `%PDF-` in memory for every file opened.

## Command Layer (`commands.js`)
- Centralized dispatch in the main process with typed parameters: `openFile`, `closeTab`, `switchTab`, `saveAs`, `setDarkMode`, `setInvertColors`, `setAnnotationMode`, `undo`, `redo`.
- Context callbacks supplied by `main.js` via `initCommands(ctx)`. Menu items, shortcuts, and IPC calls route through this module.
- Validates annotation editor modes against supported types (`NONE`, `HIGHLIGHT`, `FREETEXT`, `INK`, `STAMP`).

## Annotation Tools & Editor Integration
- Uses PDF.js built-in `AnnotationEditorType` (Highlight, FreeText, Ink, Stamp). Each tab tracks its own active mode.
- **Tool Options (`AnnotationEditorParamsType`)**:
  - Controls shown beside toolbar, visible only for the active mode.
  - Highlight: color (`#ffff00` default).
  - FreeText: color (`#000000` default) and size (12pt default).
  - Ink: color (`#ff0000` default) and thickness (3 default).
  - Synced bidirectionally via `switchannotationeditorparams` and `annotationeditorparamschanged`.
- **Image Stamp**:
  - Stamp button switches to stamp mode and opens native file dialog (`PNG` or `JPEG` only, capped at 10 MB with native error dialog).
  - Bytes passed over IPC to tab, instantiated as an in-memory `File`, and placed via `AnnotationEditorParamsType.CREATE`. Never loads from URLs.
- **Commit & Save Pipeline**:
  - `commitAndSaveDocument` temporarily switches mode to `NONE` to flush active drawing sessions into `annotationStorage` before `saveDocument()` serializes, then restores previous mode.
  - Close-tab and close-app checks invoke tab commit before evaluating `tab.modified` state so uncommitted drawings trigger the save prompt.

## Undo / Redo Architecture
- **PDF.js Editor Integration**: Reuses `AnnotationEditorUIManager.undo()` and `redo()`. Each tab's viewer instance maintains its own isolated command history stack.
- **Button State Tracking**: `editingstateschanged` event on `eventBus` provides `details.hasSomethingToUndo` and `details.hasSomethingToRedo`, keeping toolbar Undo/Redo buttons accurately enabled or disabled without polling.
- **Single Command Path**: Toolbar buttons, shortcuts (`Ctrl+Z`, `Ctrl+Y`, `Ctrl+Shift+Z`), and application menu items (`Edit > Undo`, `Edit > Redo`) route through `commands.undo(tabId)` / `commands.redo(tabId)` over IPC.
- **Text-Field Undo Safety**: Focused inputs (find bar, page number input) and editable FreeText boxes bypass annotation undo to preserve native browser text editing undo.
