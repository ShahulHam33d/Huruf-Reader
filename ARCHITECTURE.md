# HurufReader — Architecture

## Stack & Pinned Dependencies
- Electron 44.7.0 (Chromium 134, Node 24.16.0), plain JavaScript, pdfjs-dist 6.4.299, pdf-lib 1.17.1 (main process only).
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

## Autosave & Crash Recovery
- **Storage**: Strictly writes to `%APPDATA%/hurufreader/recovery/`. Never writes to the user's original PDF or chosen file path.
- **Trigger**: Every 30s max, only if unsaved changes exist and user is idle for >= 5s. Skips if typing inside text inputs.
- **Safe Writes**: Atomic write to `<id>.tmp.pdf` / `<id>.tmp.json`, then renamed over `<id>.pdf` / `<id>.json`. JSON stores only `originalFilePath`, `originalFileName`, and `timestamp` (ISO string).
- **Cleanup**: Recovery files deleted on successful Save As, on Discard (close tab / close app), and on clean close of unmodified tabs. Retained on Cancel. Startup purges files older than 14 days.
- **Startup Restore**: Prompts user (`[Restore, Discard, Ask Me Later]`). Restored tabs open with `(recovered) <name>`, marked modified, and open through standard probe and junk-byte trim pipeline.

## Page Operations (Phase 3A)
- **Main-Process Engine (`pageops.js`)**: Uses `pdf-lib 1.17.1` exclusively in the main process for `extractPages`, `deletePages`, `rotatePages`, and `splitPdf`, plus a shared 1-based range parser (`"1-3, 5, 8-10"`, sorted and deduplicated) and leading junk-byte trim.
- **Non-Destructive Flow**: Operations read committed bytes from the source tab via `commitAndSaveDocument()` (preserving unsaved annotations), never modify the source tab or original file, and open Extract/Delete/Rotate results in a new `(edited) <name>` tab marked unsaved.
- **Split**: Supports "every N pages" or range lists, capped at 200 files, prompting for an output folder and writing `<original>_partN.pdf` (appending `_1`, `_2`, ... to avoid overwriting).
- **Commands & UI**: Exposed via `commands.js` (`extractPages`, `deletePages`, `rotatePages`, `splitPdf`). The `Pages` menu opens a plain-HTML modal inside `viewer.html` with inline validation, `Cancel`, and `Esc` support.
- **Known Limits**: Extracting pages into a new `PDFDocument` drops document-level `/Outlines` (bookmarks); deleting pages preserves `/Outlines` on the remaining document, though targets pointing to deleted pages become invalid. Page-level `/Annots` (such as links) on copied pages are preserved.

## Merge & Reorder (Phase 3B)
- **Merge (`mergePdfs`)**: Copies pages from 2–20 inputs (300 MB total cap) into a new `(merged)` tab marked unsaved. Probed on add so password-protected, damaged, or unreadable files are named in an inline error and excluded.
- **Reorder & Move (`reorderPages`, `movePages`)**: `reorderPages` validates a full 1-based permutation of every page; `movePages` builds that order from the range parser (`toPosition = total + 1` appends to end) and opens `(edited) <name>`.
- **Known Limits**: Merging and moving build a new `PDFDocument` via `copyPages`, which preserves page-level annotations/links but drops document-level `/Outlines` (bookmarks).
