# HurufReader

HurufReader is a Windows PDF reader built with Electron and PDF.js, featuring multi-document tabs, text highlighting, PDF.js stock viewer controls, dark mode, display page inversion, and native error handling.

## Prerequisites
- Node.js (v20+ or v24)
- npm

## Installation & Launch

```bash
# Install pinned dependencies
npm install

# Start the application
npm start
```

## Automated Verification

```bash
# Run headless verification across all test-suite PDFs
node headless-verify.js

# Verify specific PDF annotations and PDF structure
node verify.js sample_saved.pdf
node verify.js test-pdfs/Dream_Textbook.pdf
```

## Manual Test Checklist

### 1. Tabs (Step 1)
- [ ] **Open Multiple PDFs**: Open 2 or more PDFs using `Ctrl+O` or the `+` button in the tab bar. Confirm each opens in a new tab with its own scroll and view state.
- [ ] **Duplicate Prevention**: Try opening a PDF that is already open. Verify HurufReader switches to the existing tab instead of opening a duplicate.
- [ ] **Tab Switching**: Switch tabs by clicking tab headers, pressing `Ctrl+Tab` (next), and pressing `Ctrl+Shift+Tab` (previous).
- [ ] **Tab Closing**: Close active tab using `Ctrl+W` or clicking `×` on the tab header.
- [ ] **Empty State**: Close all open tabs. Confirm an empty window appears displaying: `Open a PDF with Ctrl+O`.

### 2. Unsaved Changes (Step 2)
- [ ] **Dot Indicator**: Select text and add a highlight. Verify a dot indicator appears on the tab header.
- [ ] **Prompt on Tab Close**: Click `×` or press `Ctrl+W` on a modified tab. Confirm native dialog displays with `[Save As, Discard, Cancel]`.
- [ ] **Cancel Choice**: Choose `Cancel`. Confirm the tab remains open and unclosed.
- [ ] **Save As Choice**: Choose `Save As`. Confirm `showSaveDialog` opens. Verify attempting to overwrite original file is blocked. Save to new name and confirm tab closes.
- [ ] **Discard Choice**: Choose `Discard`. Confirm tab closes without saving.
- [ ] **Prompt on Window Close**: Close window while multiple tabs have unsaved changes. Confirm each modified tab prompts sequentially; cancelling halts window closure.

### 3. Stock Viewer Features (Step 3)
- [ ] **Sidebar (Outline & Thumbnails)**: Click the sidebar toggle icon. Switch between "Thumbnails" and "Outline" tabs. Click a thumbnail to jump to page. Click an outline item to jump to section destination.
- [ ] **Find Bar**: Press `Ctrl+F` or click search icon. Type a search term, verify match count (e.g. `1 of 12`), use Next/Previous buttons and Enter/Shift+Enter. Toggle "Highlight All". Press `Escape` to close find bar.
- [ ] **Zoom Controls**: Use Zoom In (`+`), Zoom Out (`-`), and preset scale options (Page Width, Page Fit, 100%, 150%). Use `Ctrl + Mouse Wheel` to zoom smoothly.
- [ ] **Page Navigation & Go-to-Page**: Use Page Up/Down buttons. Type a page number into the input box and press Enter to jump to that page.

### 4. Dark Mode & Page Inversion (Step 4)
- [ ] **Dark Mode**: Toggle `View > Dark Mode` (`Ctrl+Shift+D`). Confirm the tab bar, toolbar, sidebar, and container darken.
- [ ] **Invert Page Colors**: Toggle `View > Invert Page Colors`. Confirm page content colors invert via CSS filter without modifying PDF data.
- [ ] **Persistence**: Quit the application and restart. Confirm Dark Mode and Invert Page Colors choices are restored from `%APPDATA%/hurufreader/settings.json`.

### 5. Clean Errors (Step 5)
- [ ] **Corrupted / Invalid File**: Attempt to open a text or corrupted file. Confirm native error dialog appears with file name and plain-language message, console logs error, and no tab opens.
- [ ] **Password-Protected File**: Open a password-protected PDF. Confirm the viewer's password modal displays. Enter invalid password to view retry error. Click Cancel to confirm the tab closes cleanly.
- [ ] **Missing / Permission File**: Attempt to open a deleted or locked file. Confirm native error dialog appears without blank screen or crash.

### 6. Annotation Tools (Phase 2A)
- [ ] **Mode Switching**: Click Highlight, Text box, Draw, and Stamp buttons on the toolbar. Confirm the active button highlights and the tab enters that mode. Click the active button again to return to normal mode.
- [ ] **Tool Options**: Verify option controls appear beside the toolbar only for the active mode:
  - Highlight: color picker (default yellow).
  - Text box: color picker (default black) and font size (default 12).
  - Draw: color picker (default red) and stroke thickness (default 3).
- [ ] **Highlighting**: Enter Highlight mode, select text, and verify text is highlighted in the selected color.
- [ ] **FreeText Box**: Enter Text box mode, click on page, type text. Verify font size and color controls affect new and selected text boxes.
- [ ] **Freehand Draw (Ink)**: Enter Draw mode, sketch freehand strokes in chosen color and thickness.
- [ ] **Image Stamp**: Click Image stamp button. Confirm native file dialog opens for PNG/JPEG. Select image under 10 MB and verify it is placed as a stamp on the page. Confirm files >10 MB or unreadable files trigger a native error dialog and are rejected.
- [ ] **Select, Move & Delete**: Select a placed annotation (Text, Ink, Stamp). Drag to move. Press `Delete` key and confirm annotation is deleted.
- [ ] **Unsaved Changes & Persistence**: Confirm adding any of the four annotation types displays the unsaved dot indicator. Save As to a new file, reopen, and confirm all annotations persist and verify cleanly.

### 7. Undo / Redo (Phase 2B-1)
- [ ] **Initial State**: On opening a PDF or new tab, verify Undo and Redo toolbar buttons are both disabled.
- [ ] **Undo Placement**: Add an annotation (Highlight, FreeText, Draw, or Stamp). Confirm the Undo button enables and Redo remains disabled.
- [ ] **Execute Undo**: Click the Undo button (or press `Ctrl+Z`, or select `Edit > Undo`). Confirm the annotation is removed, Redo enables, and if no prior actions exist, Undo disables.
- [ ] **Execute Redo**: Click the Redo button (or press `Ctrl+Y` / `Ctrl+Shift+Z`, or select `Edit > Redo`). Confirm the undone annotation reappears, Undo enables, and Redo disables.
- [ ] **Multiple Steps**: Add multiple strokes or annotations. Verify repeatedly undoing walks backward through each step and redoing walks forward.
- [ ] **Safety in Text Inputs**: Open the find bar (`Ctrl+F`), type text, and press `Ctrl+Z`. Confirm only typed text inside the input is undone without triggering annotation undo. Verify the same in the page-number input and while editing text inside a FreeText box.
- [ ] **Tab Isolation**: Open two tabs. Add an annotation in Tab 1 and another in Tab 2. Confirm undoing in Tab 2 only affects Tab 2 without altering Tab 1's state.

### 8. Autosave & Crash Recovery (Phase 2B-2)
- [ ] **Idle Autosave Trigger**: Open a PDF, add an annotation (dot indicator appears). Wait 5 seconds idle. Check `%APPDATA%/hurufreader/recovery/` and confirm `<id>.pdf` and `<id>.json` are created safely.
- [ ] **Typing Suppression**: In a modified tab, focus inside a text box (e.g. FreeText box, find bar, or page input) and type continuously. Confirm autosave is postponed until 5 seconds after typing ceases.
- [ ] **Save As Cleanup**: Perform `Save As` on the modified tab to a new file. Verify the corresponding recovery `.pdf` and `.json` in the recovery folder are immediately deleted.
- [ ] **Clean Close & Discard Cleanup**: Open a PDF, modify it, then close the tab and choose `Discard`. Verify recovery files are deleted. Close an unmodified tab and verify no orphaned recovery files remain.
- [ ] **Cancel Safety**: Modify a tab, attempt to close the tab or window, and click `Cancel`. Confirm recovery files in `%APPDATA%/hurufreader/recovery/` remain intact.
- [ ] **Crash Simulation & Restore**: Open a PDF, add annotations, wait >= 5 seconds for autosave to write to disk. Simulate an unexpected crash by killing the process in PowerShell:
  ```powershell
  taskkill /F /IM electron.exe
  ```
  Restart HurufReader (`npm start`). Confirm native recovery prompt appears: `Restore unsaved documents? HurufReader closed unexpectedly.` with buttons `[Restore, Discard, Ask Me Later]`.
- [ ] **Restore Flow**: Click `Restore`. Confirm the tab reopens titled `(recovered) <filename>`, displays the unsaved-changes dot, and contains all annotations intact. Verify Save As works and blocks overwriting the original file.
- [ ] **Discard Flow**: Crash or leave recovery files, restart, click `Discard`. Confirm recovery files are deleted and app starts with an empty window.
- [ ] **Ask Me Later Flow**: Restart with recovery files, click `Ask Me Later`. Confirm recovery files are preserved on disk and app starts with an empty window.
- [ ] **Corrupted Recovery Resilience**: Corrupt a recovery `.pdf` file in the recovery folder. Restart and click `Restore`. Confirm a native error dialog appears, the corrupt file is skipped gracefully, and the app does not crash.
