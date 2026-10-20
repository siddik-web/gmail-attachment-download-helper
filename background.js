/**
 * background.js - Service Worker for Universal Gmail Bulk Attachment Downloader
 * Manifest V3 compatible
 * Includes rate limit detection, duplicate check, notifications, and download management.
 */

// Initialize storage structure if not present
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["downloadHistory"], (res) => {
    if (!res.downloadHistory) {
      chrome.storage.local.set({ downloadHistory: {} });
    }
  });
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "downloadFile") {
    handleDownload(message, sendResponse);
    return true; // async
  } else if (message.action === "checkDuplicate") {
    checkDuplicate(message, sendResponse);
    return true;
  } else if (message.action === "clearDownloadHistory") {
    chrome.storage.local.set({ downloadHistory: {} }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "openDownloadsFolder") {
    chrome.downloads.showDefaultFolder();
    sendResponse({ success: true });
    return true;
  } else if (message.action === "showNotification") {
    showNotification(message.title, message.message);
    sendResponse({ success: true });
    return true;
  }
});

/**
 * Triggers Chrome Desktop Notification
 */
function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title || "Gmail Attachment Downloader",
      message: message || "Bulk download finished.",
      priority: 1
    });
  } catch (e) {
    console.warn("[Gmail Downloader] Notification error:", e);
  }
}

/**
 * Checks if a file has already been downloaded (by filename, URL, or Chrome downloads history)
 */
async function checkDuplicate(request, sendResponse) {
  const { filename, url } = request;

  try {
    const data = await chrome.storage.local.get(["downloadHistory"]);
    const history = data.downloadHistory || {};

    if (filename && history[filename]) {
      sendResponse({ isDuplicate: true, reason: "history", timestamp: history[filename].timestamp });
      return;
    }

    if (url && history[url]) {
      sendResponse({ isDuplicate: true, reason: "history_url", timestamp: history[url].timestamp });
      return;
    }

    const basename = filename ? filename.split("/").pop() : "";
    if (basename) {
      chrome.downloads.search({ state: "complete" }, (items) => {
        if (chrome.runtime.lastError) {
          sendResponse({ isDuplicate: false });
          return;
        }

        const match = items && items.some((item) => {
          if (!item.filename) return false;
          const nativeBasename = item.filename.replace(/\\/g, "/").split("/").pop();
          return nativeBasename === basename || (url && item.url === url);
        });

        if (match) {
          sendResponse({ isDuplicate: true, reason: "chrome_downloads" });
        } else {
          sendResponse({ isDuplicate: false });
        }
      });
      return;
    }

    sendResponse({ isDuplicate: false });
  } catch (err) {
    console.warn("[Gmail Downloader] Error checking duplicate:", err);
    sendResponse({ isDuplicate: false });
  }
}

/**
 * Executes file download using chrome.downloads API and records into history
 */
async function handleDownload(request, sendResponse) {
  const { url, filename, conflictAction = "uniquify" } = request;

  if (!url) {
    sendResponse({ success: false, error: "Missing download URL." });
    return;
  }

  try {
    let downloadUrl = url;
    if (downloadUrl.startsWith("/")) {
      downloadUrl = "https://mail.google.com" + downloadUrl;
    }

    chrome.downloads.download(
      {
        url: downloadUrl,
        filename: filename,
        conflictAction: conflictAction,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message || "";
          console.warn("[Gmail Downloader] Direct download note:", errMsg);

          if (errMsg.toLowerCase().includes("user gesture") || errMsg.toLowerCase().includes("blocked")) {
            sendResponse({ success: false, error: "RATE_LIMIT_CHROME: Download blocked by browser limit.", isRateLimit: true });
            return;
          }

          attemptFetchFallback(downloadUrl, filename, conflictAction, sendResponse);
        } else {
          recordDownloadSuccess(filename, downloadUrl);
          sendResponse({ success: true, downloadId });
        }
      }
    );
  } catch (err) {
    console.error("[Gmail Downloader] Exception in handleDownload:", err);
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Fallback: fetch blob with cookies and convert to data URI
 */
async function attemptFetchFallback(url, filename, conflictAction, sendResponse) {
  try {
    const response = await fetch(url, { credentials: "include" });

    if (response.status === 429) {
      sendResponse({ success: false, error: "HTTP 429: Gmail rate limit reached. Backing off.", isRateLimit: true });
      return;
    }
    if (response.status === 503) {
      sendResponse({ success: false, error: "HTTP 503: Service temporarily unavailable. Backing off.", isRateLimit: true });
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result;
      chrome.downloads.download(
        {
          url: dataUrl,
          filename: filename,
          conflictAction: conflictAction,
          saveAs: false
        },
        (downloadId) => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
          } else {
            recordDownloadSuccess(filename, url);
            sendResponse({ success: true, downloadId });
          }
        }
      );
    };
    reader.onerror = () => {
      sendResponse({ success: false, error: "Failed to convert downloaded blob to data URL." });
    };
    reader.readAsDataURL(blob);
  } catch (error) {
    console.error("[Gmail Downloader] Fallback fetch failed:", error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Records successful download in storage to prevent duplicate downloads
 */
async function recordDownloadSuccess(filename, url) {
  try {
    const data = await chrome.storage.local.get(["downloadHistory"]);
    const history = data.downloadHistory || {};
    const now = Date.now();

    if (filename) {
      history[filename] = { timestamp: now, url: url };
      const basename = filename.split("/").pop();
      if (basename) history[basename] = { timestamp: now, url: url };
    }
    if (url && !url.startsWith("data:")) {
      history[url] = { timestamp: now, filename: filename };
    }

    await chrome.storage.local.set({ downloadHistory: history });
  } catch (err) {
    console.warn("[Gmail Downloader] Could not save download history:", err);
  }
}

// When user clicks the extension action icon in the toolbar, notify the active tab
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id && tab.url && tab.url.includes("mail.google.com")) {
    chrome.tabs.sendMessage(tab.id, { action: "triggerBulkDownload" }, (response) => {
      if (chrome.runtime.lastError) {
        console.log("[Gmail Downloader] Tab message response:", chrome.runtime.lastError.message);
      }
    });
  }
});
