## 🎉 Universal Gmail Bulk Attachment Downloader v1.2.0

We are excited to announce the first official release of **Gmail Bulk Attachment Downloader** (Manifest V3), a productivity extension designed to streamline discovering, selecting, and bulk-downloading email attachments from Gmail.

---

### ✨ Highlights & Key Features

- 📦 **Single .ZIP Archive Bundler**: Save all selected attachments into a single `.zip` file on the fly (e.g., `Attachments_2026-10-20.zip`) with an included `manifest.csv` audit index. Avoids multiple Windows file prompts and keeps your Downloads directory clean.
- ⏭️ **Multi-Page Auto-Advance Crawling**: Automatically scans multi-page Gmail search queries (`1–50 of many`) and downloads files sequentially across pages up to your desired limit.
- 📊 **CSV Audit Manifest Export**: Export a timestamped spreadsheet recording `Email Date`, `Sender`, `Subject`, `Saved Filename`, `Original Filename`, `Status`, and `Timestamp`.
- ✉️ **In-Modal Sender & Subject Filtering**: Inspect senders and subjects right inside the review dialog, with instantaneous real-time keyword search.
- 🛡️ **Anti-Ban Rate-Limit Shield**:
  - Human-like organic jitter delays (1200ms – 1800ms).
  - Anti-burst batch cooldown (5-second pause every 10 downloads).
  - Automated 15-second exponential backoff on HTTP 429 warnings.
- 🔒 **100% Client-Side Privacy**: Operates entirely within your local browser session using Gmail's active DOM. Zero third-party servers, zero tracking, and no credentials ever leave your machine.
- 🚫 **Duplicate Prevention**: Intelligently tracks downloaded items to avoid re-downloading files you already possess.

---

### 📦 Installation Guide

1. Download **`gmail-bulk-attachment-downloader-v1.2.0.zip`** from the Assets section below.
2. Unzip/extract the archive to a folder on your computer.
3. In Google Chrome, navigate to `chrome://extensions/`.
4. Toggle **Developer mode** on (top-right corner).
5. Click **Load unpacked** (top-left corner) and select the extracted folder.
6. Open [Gmail](https://mail.google.com/) and search for your emails—the **"Download Attachments"** button will appear ready for use!

---

**Full Changelog**: https://github.com/siddik-web/gmail-attachment-download-helper/commits/v1.2.0
