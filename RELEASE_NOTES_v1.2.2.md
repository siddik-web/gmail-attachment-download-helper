## 🔄 Universal Gmail Bulk Attachment Downloader v1.2.2 (Lifecycle & SPA Resilience)

Version **1.2.2** addresses the `Extension context invalidated` error that occurs in Google Chrome when an unpacked extension is reloaded or updated in `chrome://extensions/` while a Gmail tab remains open in the background.

---

### 🛠️ Improvements & Fixes

1. **Context Invalidation Guard**:
   - Wrapped all `chrome.runtime.sendMessage` and `chrome.storage` calls inside an `isExtensionValid()` validation check and `safeSendMessage()` promise handler.
   - Prevents unhandled promise rejections (`Uncaught Error: Extension context invalidated`) when extension files are reloaded in developer mode.
2. **Graceful Tab Reconnection Banner**:
   - If the extension is reloaded in the browser while Gmail is active, orphaned MutationObservers and timers automatically detach to prevent console noise.
   - Displays a non-intrusive prompt allowing the user to reload the tab with one click (`window.location.reload()`) to seamlessly reconnect to the updated service worker.
3. **Hero Banner in README**:
   - Official release with the new hero banner asset included.

---

### 📦 Installation / Update

1. Download **`gmail-bulk-attachment-downloader-v1.2.2.zip`** from Assets below.
2. Unzip/extract to a local folder.
3. In Chrome, visit `chrome://extensions/` and click the **Reload** button on the extension card (or click **Load unpacked**).
4. Refresh your open Gmail tab (`F5`).

---

**Full Changelog**: https://github.com/siddik-web/gmail-attachment-download-helper/compare/v1.2.1...v1.2.2
