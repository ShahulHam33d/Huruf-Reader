const fs = require('fs');
const path = require('path');

async function runHeadlessSuite() {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const testDir = path.resolve(__dirname, 'test-pdfs');
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.pdf'));

  console.log('============================================================');
  console.log('HurufReader Phase 1 Headless Verification Suite');
  console.log(`Directory: ${testDir}`);
  console.log(`Found ${files.length} PDF file(s)`);
  console.log('============================================================\n');

  for (const fileName of files) {
    const fullPath = path.join(testDir, fileName);
    console.log(`--- Testing: ${fileName} ---`);

    let rawBuffer;
    try {
      rawBuffer = fs.readFileSync(fullPath);
    } catch (err) {
      console.log(`Read Error: ${err.message}`);
      console.log(`Load Result: FAILED\n`);
      continue;
    }

    // Exact Open Path Logic (trim included)
    let buffer = rawBuffer;
    const headerIndex = buffer.subarray(0, 1024).indexOf('%PDF-');
    let trimmedBytes = 0;
    if (headerIndex > 0) {
      trimmedBytes = headerIndex;
      buffer = buffer.subarray(headerIndex);
      console.log(`Open Path Trim: Trimmed ${headerIndex} bytes before %PDF-`);
    } else if (headerIndex === -1) {
      console.log(`Open Path Trim: Header %PDF- not found in first 1024 bytes`);
      console.log(`Load Result: FAILED (Corrupted / Invalid PDF header)\n`);
      continue;
    } else {
      console.log(`Open Path Trim: No junk bytes (header at offset 0)`);
    }

    // Load via PDF.js with same options
    let isEncrypted = false;
    let doc = null;
    try {
      const loadingTask = pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        isEvalSupported: false,
        useSystemFonts: true
      });

      loadingTask.onPassword = (updatePassword, reason) => {
        isEncrypted = true;
        // Do not provide password to record encrypted state cleanly
        updatePassword(new Error('Password Required'));
      };

      doc = await loadingTask.promise;
    } catch (err) {
      if (err.name === 'PasswordException' || err.message.includes('Password Required')) {
        isEncrypted = true;
        console.log(`Encrypted: YES (Password protected)`);
        console.log(`Page Count: Unknown (Encrypted)`);
        console.log(`Failed Pages: None (Not decrypted)`);
        console.log(`Load Result: SUCCESS (Password prompt triggered)\n`);
        continue;
      } else {
        console.log(`Encrypted: NO`);
        console.log(`Load Error: ${err.name} - ${err.message}`);
        console.log(`Load Result: FAILED\n`);
        continue;
      }
    }

    console.log(`Encrypted: ${isEncrypted ? 'YES' : 'NO'}`);
    console.log(`Page Count: ${doc.numPages}`);

    const failedPages = [];
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      try {
        await doc.getPage(pageNum);
      } catch (err) {
        failedPages.push({ pageNum, error: err.message || String(err) });
      }
    }

    console.log(`Failed Pages Count: ${failedPages.length}`);
    if (failedPages.length > 0) {
      for (const fp of failedPages) {
        console.log(`  Page ${fp.pageNum} Error: ${fp.error}`);
      }
    }
    console.log(`Load Result: ${failedPages.length === 0 ? 'PASSED' : 'PARTIAL FAILURE'}\n`);
  }

  console.log('============================================================');
  console.log('Headless Verification Completed');
  console.log('============================================================');
}

runHeadlessSuite().catch(err => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
