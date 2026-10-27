# HurufReader

HurufReader is a Windows PDF reader built with Electron and PDF.js, featuring native file handling, text highlighting, and standards-compliant PDF saving.

## Prerequisites
- Node.js (v20+ or v24)
- npm

## Installation & Launch

```bash
# Install dependencies (pinned exact versions)
npm install

# Start the HurufReader application
npm start
```

## Running Verification

To inspect PDF annotations directly via Node using PDF.js:

```bash
# Verify original file (e.g. sample.pdf)
node verify.js sample.pdf

# Verify saved highlighted file (e.g. sample_saved.pdf)
node verify.js sample_saved.pdf
```

## Manual Verification Test

1. Launch HurufReader using `npm start`.
2. Open a text PDF via **File > Open** (`Ctrl+O`).
3. Select and highlight two sentences using the cursor.
4. Save the annotated PDF via **File > Save As** (`Ctrl+Shift+S`) to a new file name.
5. Open the saved copy in **Adobe Acrobat Reader** and **Microsoft Edge**:
   - The highlights must be clearly visible in both applications.
6. Reopen the saved copy in **HurufReader**:
   - The highlights must persist and render identically.
