## 🛡️ Universal Gmail Bulk Attachment Downloader v1.2.1 (Security Hardening Release)

Version **1.2.1** delivers critical security hardening across the extension, eliminating DOM XSS vectors, spreadsheet formula injections in CSV exports, and untrusted URL execution paths.

---

### 🔒 Security Enhancements & Fixes

1. **DOM XSS Elimination (`CWE-79`)**:
   - Implemented `escapeHtml()` sanitizer.
   - All email metadata (`sender`, `subject`, `date`, `filename`, `subpath`, and search queries) are now strictly sanitized before rendering into the preview modal and toast alerts.
2. **CSV Formula / Command Injection Neutralization (`CWE-1236`)**:
   - Implemented `sanitizeCsvCell()` across both standalone CSV exports and in-ZIP `manifest.csv` archives.
   - Formula execution triggers (`=`, `+`, `-`, `@`, `\t`, `\r`) are automatically neutralized to prevent remote formula execution when opening manifests in Microsoft Excel, LibreOffice, or Google Sheets.
3. **Strict URL Scheme & Origin Validation (`CWE-918`)**:
   - Added `isSafeDownloadUrl()` and `isSafeGmailUrl()`.
   - Rejects untrusted schemes (`javascript:`, `file:`) and restricts outbound downloads/fetches strictly to `https://mail.google.com/*`, Google CDN origins (`*.google.com`, `*.googleusercontent.com`), or safe `blob:`/`data:` URIs.
4. **Subfolder & Path Traversal Sanitization (`CWE-22`)**:
   - Added `cleanSubfolderName()` and `sanitizeDownloadFilename()` to strip `..` traversal sequences and reserved operating system characters (`: * ? " < > |`).
5. **Content Security Policy**:
   - Hardened `manifest.json` with an explicit `"content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }`.

---

### 📦 Installation Guide

1. Download **`gmail-bulk-attachment-downloader-v1.2.1.zip`** from the Assets below.
2. Unzip/extract to a folder on your computer.
3. Navigate to `chrome://extensions/` in Google Chrome and enable **Developer mode**.
4. Click **Load unpacked** (or click Reload if already loaded) and select the folder.

---

**Full Changelog**: https://github.com/siddik-web/gmail-attachment-download-helper/compare/v1.2.0...v1.2.1
