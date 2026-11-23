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
