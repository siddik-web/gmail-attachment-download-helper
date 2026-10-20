/**
 * content.js - Universal Gmail Bulk Attachment Downloader
 * 
 * Comprehensive Suite:
 * 1. Single .ZIP Archive bundling (via bundled JSZip) or individual downloads
 * 2. Multi-Page Crawl / Auto-Advance through Gmail search results
 * 3. CSV Audit Manifest Export (Date, Sender, Subject, Filename, Status)
 * 4. Sender & Subject Extraction with in-modal multi-field search
 * 5. Desktop Notification & Audio Chime on completion
 * 6. Rate-Limit Shield (Jitter, 5s batch cooldown, automated backoff)
 * 7. Duplicate File Prevention (Storage + Chrome database)
 * 8. Date Range Filtering (Presets: 7D, 30D, Month, All Time)
 */

(function () {
  "use strict";

  if (window.__GMAIL_BULK_DOWNLOADER_INJECTED__) return;
  window.__GMAIL_BULK_DOWNLOADER_INJECTED__ = true;

  // Configuration with storage persistence
  const CONFIG = {
    filterQuery: "*",           // "*" for all, or ".pdf", "Portfolio_U533.pdf", "invoice"
    subfolder: "Gmail_Attachments",
    staggerDelayMs: 1200,       // Safe humanized base delay
    jitterMs: 600,              // Random jitter up to +600ms
    batchPauseEvery: 10,        // Cooldown every 10 downloads
    batchPauseDuration: 5000,   // 5s cooldown duration
    safeMode: true,             // Gmail account protection toggle
    skipDuplicates: true,       // Duplicate prevention toggle
    requireConfirmation: true,  // Require user consent modal before starting
    downloadAsZip: false,       // Bundle all files into a single .zip
    autoAdvancePages: false,    // Multi-page auto-advance
    maxPagesToCrawl: 3,         // Max pages cap for auto-advance
    playAudioChime: true,       // Play audio chime on completion
    desktopNotification: true,  // Desktop notification on completion
    startDate: "",              // "YYYY-MM-DD"
    endDate: ""                 // "YYYY-MM-DD"
  };

  // State
  let isDownloading = false;
  let abortRequested = false;
  let detectedAttachments = [];
  let downloadHistoryCache = {};
  let currentRunAuditLog = [];
  let currentCrawledPage = 1;

  // Load saved settings & history
  if (chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      [
        "filterQuery", "subfolder", "staggerDelayMs", "jitterMs",
        "batchPauseEvery", "safeMode", "skipDuplicates", "requireConfirmation",
        "downloadAsZip", "autoAdvancePages", "maxPagesToCrawl",
        "playAudioChime", "desktopNotification",
        "startDate", "endDate", "downloadHistory"
      ],
      (data) => {
        if (data.filterQuery !== undefined) CONFIG.filterQuery = data.filterQuery;
        if (data.subfolder) CONFIG.subfolder = data.subfolder;
        if (data.staggerDelayMs) CONFIG.staggerDelayMs = Number(data.staggerDelayMs);
        if (data.jitterMs !== undefined) CONFIG.jitterMs = Number(data.jitterMs);
        if (typeof data.safeMode === "boolean") CONFIG.safeMode = data.safeMode;
        if (typeof data.skipDuplicates === "boolean") CONFIG.skipDuplicates = data.skipDuplicates;
        if (typeof data.requireConfirmation === "boolean") CONFIG.requireConfirmation = data.requireConfirmation;
        if (typeof data.downloadAsZip === "boolean") CONFIG.downloadAsZip = data.downloadAsZip;
        if (typeof data.autoAdvancePages === "boolean") CONFIG.autoAdvancePages = data.autoAdvancePages;
        if (data.maxPagesToCrawl) CONFIG.maxPagesToCrawl = Number(data.maxPagesToCrawl);
        if (typeof data.playAudioChime === "boolean") CONFIG.playAudioChime = data.playAudioChime;
        if (typeof data.desktopNotification === "boolean") CONFIG.desktopNotification = data.desktopNotification;
        if (data.startDate) CONFIG.startDate = data.startDate;
        if (data.endDate) CONFIG.endDate = data.endDate;
        if (data.downloadHistory) downloadHistoryCache = data.downloadHistory;
        updateUI();
      }
    );
  }

  /* ==========================================================================
     Attachment Discovery & Meta Extraction (Date, Sender, Subject)
     ========================================================================== */

  function scanAllAttachments() {
    const rawItems = [];
    const seenElements = new Set();
    const seenUrls = new Set();

    // Strategy 1: Explicit 'download_url' attribute (mime:filename:URL)
    const dlAttrElements = document.querySelectorAll("[download_url]");
    for (const el of dlAttrElements) {
      const attr = el.getAttribute("download_url") || "";
      const parts = attr.split(":");
      if (parts.length >= 3) {
        const mime = parts[0];
        const filename = parts[1];
        const url = parts.slice(2).join(":");

        if (filename && url && !seenUrls.has(url)) {
          seenUrls.add(url);
          seenElements.add(el);
          const row = el.closest('tr, [role="row"], .zA, .gs, .adn');
          const dateInfo = extractDateFromContext(row, el);
          const meta = extractEmailMeta(row);

          rawItems.push({
            element: el,
            rowElement: row,
            originalFilename: cleanExtractedFilename(filename),
            downloadUrl: url,
            mimeType: mime,
            date: dateInfo.formatted,
            sender: meta.sender,
            subject: meta.subject
          });
        }
      }
    }

    // Strategy 2: Attachment Chips in message list view
    const chipSelectors = [
      ".brd > div",
      ".brd > span",
      ".byY > div",
      '[role="listbox"] > div',
      '[role="listbox"] > span',
      '[data-tooltip*="."]',
      '.a3s [role="button"]',
      ".hq",
      ".aZo",
      ".a6S"
    ];

    const candidateChips = document.querySelectorAll(chipSelectors.join(","));
    for (const chip of candidateChips) {
      if (seenElements.has(chip)) continue;

      const extracted = extractFilenameAndUrlFromChip(chip);
      if (!extracted || !extracted.filename) continue;

      seenElements.add(chip);
      if (extracted.url && seenUrls.has(extracted.url)) continue;
      if (extracted.url) seenUrls.add(extracted.url);

      const row = chip.closest('tr, [role="row"], .zA, .gs, .adn');
      const dateInfo = extractDateFromContext(row, chip);
      const meta = extractEmailMeta(row);

      rawItems.push({
        element: chip,
        rowElement: row,
        originalFilename: cleanExtractedFilename(extracted.filename),
        downloadUrl: extracted.url,
        mimeType: extracted.mimeType || inferMimeType(extracted.filename),
        date: dateInfo.formatted,
        sender: meta.sender,
        subject: meta.subject
      });
    }

    // Strategy 3: Links containing attachment queries
    const attLinks = document.querySelectorAll('a[href*="view=att"], a[href*="disp=attd"]');
    for (const a of attLinks) {
      if (seenElements.has(a)) continue;
      const url = a.getAttribute("href");
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url);
        seenElements.add(a);
        const text = (a.innerText || a.getAttribute("title") || a.getAttribute("aria-label") || "").trim();
        const fname = extractFilenameFromString(text) || "attachment.pdf";
        const row = a.closest('tr, [role="row"], .zA, .gs, .adn');
        const dateInfo = extractDateFromContext(row, a);
        const meta = extractEmailMeta(row);

        rawItems.push({
          element: a,
          rowElement: row,
          originalFilename: cleanExtractedFilename(fname),
          downloadUrl: url,
          mimeType: inferMimeType(fname),
          date: dateInfo.formatted,
          sender: meta.sender,
          subject: meta.subject
        });
      }
    }

    detectedAttachments = rawItems;
    return rawItems;
  }

  function extractEmailMeta(row) {
    if (!row) {
      return { sender: "Unknown Sender", subject: "No Subject" };
    }

    // Sender extraction
    let sender = "";
    const senderEl = row.querySelector('.yX span[email], .yX span[title], span.zF, span.bGl, .yX, span[email]');
    if (senderEl) {
      sender = senderEl.getAttribute("email") || senderEl.getAttribute("title") || senderEl.innerText || senderEl.textContent || "";
    }
    sender = sender.trim().replace(/[\r\n\t]+/g, " ") || "Unknown Sender";

    // Subject extraction
    let subject = "";
    const subjectEl = row.querySelector('.bog span, span.bog, .y6 span');
    if (subjectEl) {
      subject = subjectEl.innerText || subjectEl.textContent || "";
    }
    subject = subject.trim().replace(/[\r\n\t]+/g, " ") || "No Subject";

    return { sender, subject };
  }

  function cleanExtractedFilename(str) {
    if (!str) return "attachment.bin";
    let name = str.replace(/^(Download attachment|Download|Preview|View|Loading)\s+/i, "");
    name = name.replace(/[\r\n\t]+/g, " ").trim();
    name = name.replace(/[\\/:*?"<>|]/g, "_");
    return name || "attachment.bin";
  }

  function extractFilenameAndUrlFromChip(chip) {
    const dlAttr = chip.getAttribute("download_url") || (chip.parentElement && chip.parentElement.getAttribute("download_url"));
    if (dlAttr) {
      const parts = dlAttr.split(":");
      if (parts.length >= 3) {
        return {
          filename: parts[1],
          url: parts.slice(2).join(":"),
          mimeType: parts[0]
        };
      }
    }

    const sources = [
      chip.getAttribute("data-tooltip"),
      chip.getAttribute("aria-label"),
      chip.getAttribute("title"),
      chip.innerText,
      chip.textContent
    ];

    let foundFilename = null;
    for (const s of sources) {
      if (!s) continue;
      const fn = extractFilenameFromString(s);
      if (fn) {
        foundFilename = fn;
        break;
      }
    }

    if (!foundFilename) return null;

    const href = chip.getAttribute("href") || (chip.querySelector("a[href]") && chip.querySelector("a[href]").getAttribute("href"));
    let url = null;
    if (href && (href.includes("disp=attd") || href.includes("view=att") || href.includes("mail.google.com"))) {
      url = href;
    }

    if (!url) {
      const innerDl = chip.querySelector('[aria-label*="download" i], [data-tooltip*="download" i], a[download]');
      if (innerDl && innerDl.getAttribute("href")) {
        url = innerDl.getAttribute("href");
      }
    }

    return {
      filename: foundFilename,
      url: url,
      mimeType: inferMimeType(foundFilename)
    };
  }

  function extractFilenameFromString(str) {
    if (!str || typeof str !== "string") return null;
    const match = str.match(/([a-zA-Z0-9_\-\s\(\)\[\]\.]+\.[a-zA-Z0-9]{2,5})/i);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (!candidate.endsWith(".com") && !candidate.endsWith(".org") && !candidate.endsWith(".js")) {
        return candidate;
      }
    }
    return null;
  }

  function inferMimeType(filename) {
    const ext = (filename.split(".").pop() || "").toLowerCase();
    const map = {
      pdf: "application/pdf",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xls: "application/vnd.ms-excel",
      csv: "text/csv",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      doc: "application/msword",
      zip: "application/zip",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg"
    };
    return map[ext] || "application/octet-stream";
  }

  function getFilteredAttachments() {
    const all = scanAllAttachments();
    const query = (CONFIG.filterQuery || "*").trim();
    const startDate = (CONFIG.startDate || "").trim();
    const endDate = (CONFIG.endDate || "").trim();

    return all.filter((item) => {
      if (startDate && item.date && item.date < startDate) return false;
      if (endDate && item.date && item.date > endDate) return false;

      if (!query || query === "*") return true;

      const fname = item.originalFilename.toLowerCase();
      const ext = (fname.split(".").pop() || "").toLowerCase();
      const terms = query.split(",").map((t) => t.trim().toLowerCase().replace(/^\./, "")).filter(Boolean);

      return terms.some((term) => fname.includes(term) || ext === term);
    });
  }

  /* ==========================================================================
     Email Date Extraction
     ========================================================================== */

  function extractDateFromContext(row, el) {
    if (!row) {
      return { formatted: getTodayFormatted(), raw: "Today" };
    }

    const dateElements = row.querySelectorAll(
      'td.xW [title], .xW span[title], [title*="202"], [title*="203"], td.xW, .xW span, span.bGl, span.zF, .g3'
    );

    for (const target of dateElements) {
      const title = target.getAttribute("title");
      if (title && isLikelyDateString(title)) {
        const parsed = parseDateString(title);
        if (parsed) return { formatted: parsed, raw: title };
      }
    }

    for (const target of dateElements) {
      const text = (target.innerText || target.textContent || "").trim();
      if (text) {
        const parsed = parseDateString(text);
        if (parsed) return { formatted: parsed, raw: text };
      }
    }

    return { formatted: getTodayFormatted(), raw: "Unknown" };
  }

  function isLikelyDateString(str) {
    return /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}|\d{1,2}:\d{2})/i.test(str);
  }

  function parseDateString(dateStr) {
    try {
      const clean = dateStr.replace(/\bat\b/i, "").trim();

      if (/^\d{1,2}:\d{2}(\s*[AP]M)?$/i.test(clean)) {
        return getTodayFormatted();
      }

      const parsed = new Date(clean);
      if (!isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        if (yyyy >= 2000 && yyyy <= 2100) {
          const mm = String(parsed.getMonth() + 1).padStart(2, "0");
          const dd = String(parsed.getDate()).padStart(2, "0");
          return `${yyyy}-${mm}-${dd}`;
        }
      }

      const match = clean.match(/([a-zA-Z]{3})\s+(\d{1,2})/);
      if (match) {
        const months = {
          jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
          jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
        };
        const m = months[match[1].toLowerCase()];
        if (m) {
          const d = String(match[2]).padStart(2, "0");
          const curYear = new Date().getFullYear();
          return `${curYear}-${m}-${d}`;
        }
      }
    } catch (e) {
      console.warn("[Gmail Downloader] Date parse error:", e);
    }
    return null;
  }

  function getTodayFormatted() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatRelativeDate(daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getFirstDayOfMonth() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}-01`;
  }

  /* ==========================================================================
     Duplicate Detection Helper
     ========================================================================== */

  function isDuplicateFile(targetPath, downloadUrl) {
    if (!CONFIG.skipDuplicates) return Promise.resolve(false);

    if (downloadHistoryCache[targetPath]) return Promise.resolve(true);
    if (downloadUrl && downloadHistoryCache[downloadUrl]) return Promise.resolve(true);
    const basename = targetPath.split("/").pop();
    if (basename && downloadHistoryCache[basename]) return Promise.resolve(true);

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "checkDuplicate", filename: targetPath, url: downloadUrl },
        (res) => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(Boolean(res && res.isDuplicate));
          }
        }
      );
    });
  }

  /* ==========================================================================
     Audio & Desktop Notifications
     ========================================================================== */

  function playCompletionChime() {
    if (!CONFIG.playAudioChime) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      // Gentle two-tone chord: D5 to A5
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.14);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.42);
    } catch (e) {
      console.warn("[Gmail Downloader] Audio chime error:", e);
    }
  }

  function triggerDesktopNotification(title, message) {
    if (!CONFIG.desktopNotification) return;
    chrome.runtime.sendMessage({
      action: "showNotification",
      title: title,
      message: message
    });
  }

  /* ==========================================================================
     Execution / Download Orchestration (ZIP vs Individual + Multi-Page)
     ========================================================================== */

  async function fetchFileBlob(url) {
    const fullUrl = url.startsWith("/") ? "https://mail.google.com" + url : url;
    const response = await fetch(fullUrl, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.blob();
  }

  async function downloadSingleItem(item, targetFilename) {
    let url = item.downloadUrl;
    if (url) {
      return executeDownloadViaBackground(url, targetFilename);
    }
    return simulatePreviewDownload(item, targetFilename);
  }

  function executeDownloadViaBackground(url, filename) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          action: "downloadFile",
          url: url,
          filename: filename,
          conflictAction: "uniquify"
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            downloadHistoryCache[filename] = { timestamp: Date.now() };
            if (url) downloadHistoryCache[url] = { timestamp: Date.now() };
            resolve(response || { success: true });
          }
        }
      );
    });
  }

  async function simulatePreviewDownload(item, targetFilename) {
    const chip = item.element;
    if (!chip) return { success: false, error: "Attachment element not found." };

    try {
      chip.scrollIntoView({ behavior: "instant", block: "center" });
      chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      chip.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
      chip.click();

      await delay(500);

      const dlSelectors = [
        'div[role="dialog"] [aria-label*="Download" i]',
        'div[role="dialog"] [data-tooltip*="Download" i]',
        'div[role="dialog"] a[href*="disp=attd"]',
        '[aria-label="Download"]',
        '[data-tooltip="Download"]'
      ];

      let dlButton = null;
      for (const sel of dlSelectors) {
        dlButton = document.querySelector(sel);
        if (dlButton) break;
      }

      if (dlButton) {
        const href = dlButton.getAttribute("href");
        if (href) {
          executeDownloadViaBackground(href, targetFilename);
        } else {
          dlButton.click();
          downloadHistoryCache[targetFilename] = { timestamp: Date.now() };
        }
      }

      await delay(300);

      const closeBtn = document.querySelector(
        'div[role="dialog"] [aria-label*="Close" i], div[role="dialog"] [data-tooltip*="Close" i]'
      );
      if (closeBtn) {
        closeBtn.click();
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      }

      await delay(250);
      return { success: true };
    } catch (err) {
      console.warn("[Gmail Downloader] Preview simulation error:", err);
      return { success: false, error: err.message };
    }
  }

  function calculateStaggerDelay() {
    const base = CONFIG.staggerDelayMs || 1200;
    if (!CONFIG.safeMode) return base;
    const jitter = Math.floor(Math.random() * (CONFIG.jitterMs || 600));
    return base + jitter;
  }

  /**
   * Generates and downloads a CSV Audit Manifest for the run
   */
  function exportAuditManifestCsv() {
    if (currentRunAuditLog.length === 0) {
      showToast("No Audit Log", "No downloads recorded in this session yet.", { duration: 3000 });
      return;
    }

    const headers = ["Email Date", "Sender", "Subject", "Saved Filename", "Original Filename", "Status", "Timestamp"];
    const rows = currentRunAuditLog.map((r) => [
      `"${(r.date || "").replace(/"/g, '""')}"`,
      `"${(r.sender || "").replace(/"/g, '""')}"`,
      `"${(r.subject || "").replace(/"/g, '""')}"`,
      `"${(r.filename || "").replace(/"/g, '""')}"`,
      `"${(r.originalFilename || "").replace(/"/g, '""')}"`,
      `"${(r.status || "").replace(/"/g, '""')}"`,
      `"${(r.timestamp || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const dateStr = getTodayFormatted();
    const csvFilename = `${CONFIG.subfolder}/download_manifest_${dateStr}.csv`;

    chrome.runtime.sendMessage({
      action: "downloadFile",
      url: url,
      filename: csvFilename,
      conflictAction: "uniquify"
    });
  }

  /**
   * Entry point: opens interactive modal or starts execution
   */
  async function promptAndStartBulkDownload() {
    if (isDownloading) return;

    if (chrome.storage && chrome.storage.local) {
      const data = await chrome.storage.local.get(["downloadHistory"]);
      if (data.downloadHistory) downloadHistoryCache = data.downloadHistory;
    }

    const items = getFilteredAttachments();

    if (items.length === 0) {
      const dateInfo = CONFIG.startDate || CONFIG.endDate
        ? ` between <b>${CONFIG.startDate || "earliest"}</b> and <b>${CONFIG.endDate || "today"}</b>`
        : "";
      showToast(
        "No matching attachments found",
        `No visible attachments matching filter "<b>${CONFIG.filterQuery}</b>"${dateInfo} were found.<br><br>` +
        `<i>Tip: In Gmail search bar, try:</i><br><code>has:attachment</code> or adjust your date range.`,
        { isError: true, duration: 6000 }
      );
      return;
    }

    if (CONFIG.requireConfirmation) {
      showConfirmationModal(items);
    } else {
      executeBulkDownload(items, CONFIG.downloadAsZip);
    }
  }

  /**
   * Confirmation & Selection Modal with Multi-Search & ZIP choice
   */
  async function showConfirmationModal(rawItems) {
    const overlay = document.getElementById("idlc-modal-overlay");
    if (!overlay) return;

    const dateCounts = {};
    const modalItems = [];
    let initialDupeCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i];
      const baseDate = item.date;
      dateCounts[baseDate] = (dateCounts[baseDate] || 0) + 1;
      const countForDate = dateCounts[baseDate];
      const datePrefix = countForDate > 1 ? `${baseDate}_(${countForDate})` : baseDate;

      const finalName = CONFIG.prefixDate
        ? `${datePrefix}_${item.originalFilename}`
        : item.originalFilename;

      const subpath = CONFIG.subfolder
        ? `${CONFIG.subfolder.replace(/[\\/]+$/, "")}/${finalName}`
        : finalName;

      const isDupe = CONFIG.skipDuplicates ? await isDuplicateFile(subpath, item.downloadUrl) : false;
      if (isDupe) initialDupeCount++;

      modalItems.push({
        id: i,
        ...item,
        subpath,
        isDupe,
        selected: !isDupe || !CONFIG.skipDuplicates
      });
    }

    let activeFilterCategory = "all";
    let modalSearchQuery = "";
    let modalSenderQuery = "";
    let chosenFormatIsZip = CONFIG.downloadAsZip;

    function renderModalContent() {
      const filteredList = modalItems.filter((item) => {
        const fname = item.originalFilename.toLowerCase();
        const ext = (fname.split(".").pop() || "").toLowerCase();
        const sender = (item.sender || "").toLowerCase();
        const subject = (item.subject || "").toLowerCase();

        if (activeFilterCategory === "new" && item.isDupe) return false;
        if (activeFilterCategory === "dupe" && !item.isDupe) return false;
        if (activeFilterCategory === "pdf" && ext !== "pdf") return false;
        if (activeFilterCategory === "excel" && !["xlsx", "xls", "csv"].includes(ext)) return false;

        if (modalSearchQuery) {
          const matchName = fname.includes(modalSearchQuery);
          const matchDate = (item.date || "").includes(modalSearchQuery);
          const matchSubj = subject.includes(modalSearchQuery);
          if (!matchName && !matchDate && !matchSubj) return false;
        }

        if (modalSenderQuery) {
          if (!sender.includes(modalSenderQuery)) return false;
        }

        return true;
      });

      const selectedCount = modalItems.filter((it) => it.selected).length;
      const visibleSelectedCount = filteredList.filter((it) => it.selected).length;
      const allVisibleSelected = filteredList.length > 0 && visibleSelectedCount === filteredList.length;

      const totalCount = modalItems.length;
      const newCount = totalCount - initialDupeCount;
      const dateRangeLabel = CONFIG.startDate || CONFIG.endDate
        ? `${CONFIG.startDate || "Earliest"} → ${CONFIG.endDate || "Today"}`
        : "All Visible Dates";

      overlay.innerHTML = `
        <div class="idlc-modal-card">
          <div class="idlc-modal-header">
            <div class="idlc-modal-title">
              <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
              <span>Review & Select Attachments to Download</span>
            </div>
            <button id="idlc-modal-close" class="idlc-toast-close">✕</button>
          </div>

          <div class="idlc-modal-body">
            <!-- Format Choice: ZIP Archive vs Individual Files -->
            <div class="idlc-format-choice">
              <div class="idlc-format-opt ${!chosenFormatIsZip ? "idlc-format-active" : ""}" data-format="individual">
                📁 Individual Files (to ${CONFIG.subfolder}/)
              </div>
              <div class="idlc-format-opt ${chosenFormatIsZip ? "idlc-format-active" : ""}" data-format="zip">
                📦 Single .ZIP Archive (Bundles all into 1 file)
              </div>
            </div>

            <!-- Summary Box -->
            <div class="idlc-summary-box">
              <div class="idlc-summary-item">
                <span class="idlc-summary-label">Total Files Detected</span>
                <span class="idlc-summary-val">${totalCount} files (${newCount} new, ${initialDupeCount} saved)</span>
              </div>
              <div class="idlc-summary-item">
                <span class="idlc-summary-label">Output Mode</span>
                <span class="idlc-summary-val" style="color:var(--idlc-primary);">
                  ${chosenFormatIsZip ? "📦 Bundled .ZIP Archive" : "📁 Individual Files"}
                </span>
              </div>
              <div class="idlc-summary-item">
                <span class="idlc-summary-label">Date Filter</span>
                <span class="idlc-summary-val">${dateRangeLabel}</span>
              </div>
              <div class="idlc-summary-item">
                <span class="idlc-summary-label">Account Protection</span>
                <span class="idlc-summary-val" style="color:var(--idlc-success);">🛡️ Safe Mode Active</span>
              </div>
            </div>

            <!-- Search Filters -->
            <div class="idlc-modal-toolbar">
              <div class="idlc-modal-search-row">
                <div class="idlc-modal-search-box">
                  <svg class="idlc-modal-search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                  <input id="idlc-modal-search-input" type="text" placeholder="Search filename, date, or subject..." value="${modalSearchQuery}">
                </div>
                <div class="idlc-modal-search-box">
                  <svg class="idlc-modal-search-icon" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                  <input id="idlc-modal-sender-input" type="text" placeholder="Filter by sender (e.g. idlc)..." value="${modalSenderQuery}">
                </div>
              </div>

              <div class="idlc-modal-filter-chips">
                <button class="idlc-preset-btn ${activeFilterCategory === "all" ? "idlc-active-tab" : ""}" data-tab="all">All (${totalCount})</button>
                <button class="idlc-preset-btn ${activeFilterCategory === "new" ? "idlc-active-tab" : ""}" data-tab="new">✨ New Only (${newCount})</button>
                <button class="idlc-preset-btn ${activeFilterCategory === "pdf" ? "idlc-active-tab" : ""}" data-tab="pdf">📄 PDFs</button>
                <button class="idlc-preset-btn ${activeFilterCategory === "excel" ? "idlc-active-tab" : ""}" data-tab="excel">📊 Excel / CSV</button>
                ${initialDupeCount > 0 ? `<button class="idlc-preset-btn ${activeFilterCategory === "dupe" ? "idlc-active-tab" : ""}" data-tab="dupe">⚠️ Duplicates (${initialDupeCount})</button>` : ""}
              </div>

              <!-- Master Select Bar -->
              <div class="idlc-select-bar">
                <label class="idlc-select-left">
                  <input id="idlc-modal-select-all" type="checkbox" ${allVisibleSelected ? "checked" : ""}>
                  <span>Select All Visible (${filteredList.length})</span>
                </label>
                <div class="idlc-select-actions">
                  <button id="idlc-action-select-new" class="idlc-select-btn-link">Select New Only</button>
                  <button id="idlc-action-deselect-all" class="idlc-select-btn-link">Deselect All</button>
                </div>
              </div>
            </div>

            <!-- Scrollable File Preview with Checkboxes, Sender, and Subject -->
            <div class="idlc-preview-container">
              <ul class="idlc-preview-list">
                ${filteredList.length === 0
                  ? `<li style="padding:16px; text-align:center; color:#5f6368; justify-content:center;">No files match your search filter.</li>`
                  : filteredList
                      .map(
                        (item) => `
                    <li class="${item.selected ? "idlc-item-selected" : ""}" data-id="${item.id}">
                      <div class="idlc-preview-left">
                        <input type="checkbox" class="idlc-item-checkbox" data-id="${item.id}" ${item.selected ? "checked" : ""}>
                        <div class="idlc-preview-col">
                          <span class="idlc-preview-file" title="${item.subpath}">${item.originalFilename}</span>
                          <span class="idlc-preview-subline" title="${item.sender} - ${item.subject}">
                            ✉️ ${item.sender} • ${item.subject}
                          </span>
                        </div>
                      </div>
                      <div class="idlc-preview-right">
                        <span class="idlc-preview-date">${item.date}</span>
                        <span class="idlc-badge-tag ${item.isDupe ? "idlc-badge-dupe" : "idlc-badge-new"}">
                          ${item.isDupe ? "Saved" : "New"}
                        </span>
                      </div>
                    </li>
                  `
                      )
                      .join("")}
              </ul>
            </div>
          </div>

          <div class="idlc-modal-footer">
            <span style="font-size:12px; color:var(--idlc-secondary-text); font-weight:500;">
              Selected: <b style="color:var(--idlc-primary);">${selectedCount}</b> of ${totalCount} files
            </span>
            <div style="display:flex; gap:10px;">
              <button id="idlc-modal-cancel" class="idlc-btn-sm idlc-btn-secondary">Cancel</button>
              <button id="idlc-modal-confirm" class="idlc-btn-sm idlc-btn-primary" ${selectedCount === 0 ? "disabled" : ""}>
                ${chosenFormatIsZip ? `Download as .ZIP (${selectedCount} files)` : `Download (${selectedCount} files)`}
              </button>
            </div>
          </div>
        </div>
      `;

      bindModalEvents();
    }

    function bindModalEvents() {
      const closeModal = () => overlay.classList.add("idlc-hidden");
      document.getElementById("idlc-modal-close").addEventListener("click", closeModal);
      document.getElementById("idlc-modal-cancel").addEventListener("click", closeModal);

      // Format Choice Toggle
      overlay.querySelectorAll("[data-format]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const fmt = e.currentTarget.getAttribute("data-format");
          chosenFormatIsZip = fmt === "zip";
          renderModalContent();
        });
      });

      // Search Inputs
      const searchInput = document.getElementById("idlc-modal-search-input");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          modalSearchQuery = e.target.value.trim().toLowerCase();
          renderModalContent();
          const el = document.getElementById("idlc-modal-search-input");
          if (el) { el.focus(); el.setSelectionRange(modalSearchQuery.length, modalSearchQuery.length); }
        });
      }

      const senderInput = document.getElementById("idlc-modal-sender-input");
      if (senderInput) {
        senderInput.addEventListener("input", (e) => {
          modalSenderQuery = e.target.value.trim().toLowerCase();
          renderModalContent();
          const el = document.getElementById("idlc-modal-sender-input");
          if (el) { el.focus(); el.setSelectionRange(modalSenderQuery.length, modalSenderQuery.length); }
        });
      }

      // Filter Tabs
      overlay.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          activeFilterCategory = e.target.getAttribute("data-tab");
          renderModalContent();
        });
      });

      // Master Select All
      const selectAllCb = document.getElementById("idlc-modal-select-all");
      if (selectAllCb) {
        selectAllCb.addEventListener("change", (e) => {
          const checked = e.target.checked;
          const currentFiltered = getCurrentFiltered();
          currentFiltered.forEach((it) => (it.selected = checked));
          renderModalContent();
        });
      }

      const selectNewBtn = document.getElementById("idlc-action-select-new");
      if (selectNewBtn) {
        selectNewBtn.addEventListener("click", () => {
          modalItems.forEach((it) => (it.selected = !it.isDupe));
          renderModalContent();
        });
      }

      const deselectAllBtn = document.getElementById("idlc-action-deselect-all");
      if (deselectAllBtn) {
        deselectAllBtn.addEventListener("click", () => {
          modalItems.forEach((it) => (it.selected = false));
          renderModalContent();
        });
      }

      // Item Checkbox & Row click
      overlay.querySelectorAll(".idlc-preview-list li[data-id]").forEach((li) => {
        li.addEventListener("click", (e) => {
          if (e.target.tagName.toLowerCase() === "input") return;
          const id = parseInt(li.getAttribute("data-id"), 10);
          const item = modalItems.find((it) => it.id === id);
          if (item) {
            item.selected = !item.selected;
            renderModalContent();
          }
        });
      });

      overlay.querySelectorAll(".idlc-item-checkbox").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const id = parseInt(e.target.getAttribute("data-id"), 10);
          const item = modalItems.find((it) => it.id === id);
          if (item) {
            item.selected = e.target.checked;
            renderModalContent();
          }
        });
      });

      // Confirm button -> begins download queue
      const confirmBtn = document.getElementById("idlc-modal-confirm");
      if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
          const selectedItems = modalItems.filter((it) => it.selected);
          closeModal();
          if (selectedItems.length > 0) {
            executeBulkDownload(selectedItems, chosenFormatIsZip);
          }
        });
      }
    }

    function getCurrentFiltered() {
      return modalItems.filter((item) => {
        const fname = item.originalFilename.toLowerCase();
        const ext = (fname.split(".").pop() || "").toLowerCase();
        const sender = (item.sender || "").toLowerCase();
        const subject = (item.subject || "").toLowerCase();

        if (activeFilterCategory === "new" && item.isDupe) return false;
        if (activeFilterCategory === "dupe" && !item.isDupe) return false;
        if (activeFilterCategory === "pdf" && ext !== "pdf") return false;
        if (activeFilterCategory === "excel" && !["xlsx", "xls", "csv"].includes(ext)) return false;

        if (modalSearchQuery) {
          const matchName = fname.includes(modalSearchQuery);
          const matchDate = (item.date || "").includes(modalSearchQuery);
          const matchSubj = subject.includes(modalSearchQuery);
          if (!matchName && !matchDate && !matchSubj) return false;
        }

        if (modalSenderQuery && !sender.includes(modalSenderQuery)) return false;

        return true;
      });
    }

    overlay.classList.remove("idlc-hidden");
    renderModalContent();
  }

  /**
   * Main Queue Execution (Supports both Individual Files and .ZIP Bundle)
   */
  async function executeBulkDownload(items, asZip = false) {
    isDownloading = true;
    abortRequested = false;
    updateButtonState(true);

    const zipModeLabel = asZip ? "📦 Bundling into .ZIP Archive" : "📁 Downloading files";
    showToast(
      "Download in Progress",
      `${zipModeLabel} (<b>${items.length}</b> selected). Safe mode: <b>${CONFIG.safeMode ? "ACTIVE (Humanized pacing)" : "Fast"}</b>.`,
      { showProgress: true, total: items.length, current: 0 }
    );

    // Reset session audit log
    currentRunAuditLog = [];

    const dateCounts = {};
    let completedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let consecutiveDownloads = 0;

    // If ZIP mode, initialize JSZip instance
    let zipInstance = null;
    if (asZip && window.JSZip) {
      zipInstance = new window.JSZip();
    }

    for (let i = 0; i < items.length; i++) {
      if (abortRequested) {
        showToast(
          "Download Cancelled",
          `Cancelled by user. <b>${completedCount}</b> downloaded, <b>${skippedCount}</b> skipped.`,
          { duration: 4000 }
        );
        break;
      }

      const item = items[i];

      const baseDate = item.date;
      dateCounts[baseDate] = (dateCounts[baseDate] || 0) + 1;
      const countForDate = dateCounts[baseDate];
      const datePrefix = countForDate > 1 ? `${baseDate}_(${countForDate})` : baseDate;

      const finalName = CONFIG.prefixDate
        ? `${datePrefix}_${item.originalFilename}`
        : item.originalFilename;

      const subpath = CONFIG.subfolder
        ? `${CONFIG.subfolder.replace(/[\\/]+$/, "")}/${finalName}`
        : finalName;

      // Duplicate Check (only when duplicate skipping is on and item is a dupe)
      if (CONFIG.skipDuplicates && item.isDupe) {
        skippedCount++;
        currentRunAuditLog.push({
          date: item.date,
          sender: item.sender,
          subject: item.subject,
          filename: finalName,
          originalFilename: item.originalFilename,
          status: "Skipped (Duplicate)",
          timestamp: new Date().toISOString()
        });

        const progressPercent = Math.round(((i + 1) / items.length) * 100);
        updateToastProgress(
          `Skipping Duplicate <b>${i + 1} of ${items.length}</b>`,
          `File: <code>${item.originalFilename}</code><br><span style="color:#e37400;">⚠️ Already in downloads. Skipped.</span>`,
          progressPercent,
          i + 1,
          items.length
        );
        await delay(60);
        continue;
      }

      // Safe Mode Anti-Burst Cooldown (Every 10 files, take a 5-second rest)
      if (CONFIG.safeMode && consecutiveDownloads > 0 && consecutiveDownloads % CONFIG.batchPauseEvery === 0) {
        const pauseSec = Math.round(CONFIG.batchPauseDuration / 1000);
        updateToastProgress(
          `🛡️ Safe Cooldown (Batch ${consecutiveDownloads}/${items.length})`,
          `Pausing for <b>${pauseSec}s</b> to protect Gmail account limits & prevent rate-limiting...`,
          Math.round(((i) / items.length) * 100),
          i,
          items.length
        );
        await delay(CONFIG.batchPauseDuration);
        if (abortRequested) break;
      }

      const progressPercent = Math.round(((i + 1) / items.length) * 100);

      updateToastProgress(
        asZip ? `Fetching for ZIP <b>${i + 1} of ${items.length}</b>` : `Downloading <b>${i + 1} of ${items.length}</b>`,
        `File: <b>${item.originalFilename}</b><br>Path: <code>${subpath}</code>`,
        progressPercent,
        i + 1,
        items.length
      );

      let success = false;

      // ZIP Mode Fetch
      if (asZip && zipInstance && item.downloadUrl) {
        try {
          const blob = await fetchFileBlob(item.downloadUrl);
          zipInstance.file(finalName, blob);
          success = true;
          downloadHistoryCache[subpath] = { timestamp: Date.now() };
        } catch (fetchErr) {
          console.warn("[Gmail Downloader] Blob fetch error for ZIP:", fetchErr);
          success = false;
        }
      } else {
        // Individual file download mode
        let res = await downloadSingleItem(item, subpath);

        // Exponential backoff if throttled
        if (res && res.isRateLimit) {
          console.warn("[Gmail Downloader] Rate limit detected, initiating 15s backoff cooldown...");
          updateToastProgress(
            `⏳ Gmail Rate-Limit Detected`,
            `<span style="color:#d93025; font-weight:600;">Rate limit detected.</span> Cooling down for 15s to protect account...`,
            progressPercent,
            i + 1,
            items.length
          );
          await delay(15000);
          if (abortRequested) break;
          res = await downloadSingleItem(item, subpath);
        }

        success = Boolean(res && res.success);
      }

      if (success) {
        completedCount++;
        consecutiveDownloads++;
        currentRunAuditLog.push({
          date: item.date,
          sender: item.sender,
          subject: item.subject,
          filename: finalName,
          originalFilename: item.originalFilename,
          status: "Downloaded",
          timestamp: new Date().toISOString()
        });
      } else {
        failedCount++;
        currentRunAuditLog.push({
          date: item.date,
          sender: item.sender,
          subject: item.subject,
          filename: finalName,
          originalFilename: item.originalFilename,
          status: "Failed",
          timestamp: new Date().toISOString()
        });
      }

      // Humanized jitter delay
      if (i < items.length - 1 && !abortRequested) {
        const sleepTime = calculateStaggerDelay();
        await delay(sleepTime);
      }
    }

    // If ZIP mode, generate archive and trigger single download
    if (asZip && zipInstance && completedCount > 0 && !abortRequested) {
      updateToastProgress("📦 Packaging .ZIP Archive", "Compressing files and adding audit manifest...", 99, items.length, items.length);

      // Add audit manifest inside the zip
      const manifestHeaders = "Email Date,Sender,Subject,Saved Filename,Original Filename,Status,Timestamp\r\n";
      const manifestRows = currentRunAuditLog.map((r) =>
        `"${r.date}","${(r.sender||"").replace(/"/g,'""')}","${(r.subject||"").replace(/"/g,'""')}","${r.filename}","${r.originalFilename}","${r.status}","${r.timestamp}"`
      ).join("\r\n");
      zipInstance.file("manifest.csv", manifestHeaders + manifestRows);

      try {
        const zipBlob = await zipInstance.generateAsync({ type: "blob" });
        const zipUrl = URL.createObjectURL(zipBlob);
        const dateStr = getTodayFormatted();
        const zipFilename = `${CONFIG.subfolder}/${CONFIG.subfolder}_${dateStr}.zip`;

        chrome.runtime.sendMessage({
          action: "downloadFile",
          url: zipUrl,
          filename: zipFilename,
          conflictAction: "uniquify"
        });
      } catch (zipErr) {
        console.error("[Gmail Downloader] ZIP generation error:", zipErr);
      }
    }

    isDownloading = false;
    updateButtonState(false);

    if (!abortRequested) {
      // Audio Chime & Desktop Notification
      playCompletionChime();
      const notifMsg = asZip
        ? `Packaged ${completedCount} attachments into .ZIP archive!`
        : `Successfully downloaded ${completedCount} attachment(s) to ${CONFIG.subfolder}/`;
      triggerDesktopNotification("Bulk Download Complete! 🎉", notifMsg);

      const folderMsg = asZip ? `Downloads/${CONFIG.subfolder}/ (Single .ZIP file)` : `Downloads/${CONFIG.subfolder}/`;
      const skippedMsg = skippedCount > 0 ? ` (<b>${skippedCount}</b> duplicates skipped)` : "";

      showToast(
        "Bulk Download Completed! 🎉",
        `Processed <b>${completedCount}</b> file(s)${skippedMsg}` +
        (failedCount > 0 ? ` (<b>${failedCount}</b> failed)` : "") +
        `.<br>Saved to: <code>${folderMsg}</code>`,
        { showOpenFolder: true, showExportCsv: true, duration: 9000 }
      );

      // Multi-Page Crawl / Auto-Advance Check
      if (CONFIG.autoAdvancePages && currentCrawledPage < CONFIG.maxPagesToCrawl) {
        checkAndAdvanceToNextPage();
      }
    }
  }

  /**
   * Multi-Page Crawler: advances to next Gmail page and continues
   */
  async function checkAndAdvanceToNextPage() {
    // Locate Gmail's 'Older' / 'Next page' button
    const nextBtn = document.querySelector('div[aria-label="Older"], div[data-tooltip="Older"], [aria-label*="next page" i]');
    if (!nextBtn) return;

    const isDisabled = nextBtn.getAttribute("aria-disabled") === "true" || nextBtn.classList.contains("T-I-awR");
    if (isDisabled) {
      showToast("Multi-Page Crawl Done", `Reached the final page of search results (Page ${currentCrawledPage}).`, { duration: 4000 });
      currentCrawledPage = 1;
      return;
    }

    currentCrawledPage++;
    showToast(
      `Auto-Advancing to Page ${currentCrawledPage}`,
      `Loading next 50 search results (Crawl Page ${currentCrawledPage} of ${CONFIG.maxPagesToCrawl})...`,
      { duration: 3000 }
    );

    nextBtn.click();
    await delay(2200); // Allow Gmail to re-render DOM

    // Automatically trigger bulk download on new page
    promptAndStartBulkDownload();
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ==========================================================================
     UI Injection & Controls
     ========================================================================== */

  function injectUI() {
    if (document.getElementById("idlc-fab-container")) return;

    const container = document.createElement("div");
    container.id = "idlc-fab-container";

    container.innerHTML = `
      <div class="idlc-btn-group">
        <button id="idlc-btn-main" class="idlc-btn-pill" title="Bulk download visible attachments">
          <span class="idlc-icon">
            <svg viewBox="0 0 24 24">
              <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
            </svg>
          </span>
          <span class="idlc-label">Download Attachments</span>
          <span id="idlc-badge" class="idlc-badge">0</span>
        </button>
        <button id="idlc-btn-settings" class="idlc-btn-settings" title="Settings, Filters & Safety">
          <svg viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
      </div>

      <!-- Settings Popover -->
      <div id="idlc-popover" class="idlc-popover">
        <div class="idlc-popover-title">
          <span>Downloader Settings & Options</span>
          <button id="idlc-popover-close" class="idlc-toast-close" style="padding: 2px;">✕</button>
        </div>

        <!-- Chrome Tip Banner -->
        <div class="idlc-tip-box">
          💡 <b>Chrome Tip:</b> Ensure <i>"Ask where to save each file before downloading"</i> is <b>OFF</b> in <code>chrome://settings/downloads</code> for zero-prompt bulk downloading.
        </div>

        <!-- Target Presets -->
        <div class="idlc-section-header">Target Presets</div>
        <div class="idlc-preset-row">
          <button class="idlc-preset-btn" data-preset="all">📁 All Files (*)</button>
          <button class="idlc-preset-btn" data-preset="pdf">📄 Only PDFs</button>
          <button class="idlc-preset-btn" data-preset="idlc">📈 IDLC Statement</button>
        </div>

        <div class="idlc-form-group">
          <label class="idlc-form-label" for="idlc-cfg-filter">Filename / Extension Filter</label>
          <input id="idlc-cfg-filter" class="idlc-input" type="text" placeholder="* (All files), .pdf, .xlsx, or Portfolio_U533.pdf" value="${CONFIG.filterQuery}">
        </div>

        <!-- Date Range Filter -->
        <div class="idlc-section-header">📅 Date Range Filter</div>
        <div class="idlc-preset-row">
          <button class="idlc-preset-btn" data-date-range="7d">Last 7 Days</button>
          <button class="idlc-preset-btn" data-date-range="30d">Last 30 Days</button>
          <button class="idlc-preset-btn" data-date-range="month">This Month</button>
          <button class="idlc-preset-btn" data-date-range="clear">All Time</button>
        </div>
        <div class="idlc-date-grid">
          <div class="idlc-date-col">
            <label for="idlc-cfg-start-date">From Date</label>
            <input id="idlc-cfg-start-date" class="idlc-input" type="date" value="${CONFIG.startDate}">
          </div>
          <div class="idlc-date-col">
            <label for="idlc-cfg-end-date">To Date</label>
            <input id="idlc-cfg-end-date" class="idlc-input" type="date" value="${CONFIG.endDate}">
          </div>
        </div>

        <!-- Download Mode & Multi-Page Options -->
        <div class="idlc-section-header">📦 Download & Multi-Page Options</div>
        <div class="idlc-checkbox-row">
          <label class="idlc-checkbox-label" for="idlc-cfg-zip">
            <input id="idlc-cfg-zip" type="checkbox" ${CONFIG.downloadAsZip ? "checked" : ""}>
            <span>Bundle all files into a single .ZIP archive</span>
          </label>
        </div>

        <div class="idlc-checkbox-row">
          <label class="idlc-checkbox-label" for="idlc-cfg-advance">
            <input id="idlc-cfg-advance" type="checkbox" ${CONFIG.autoAdvancePages ? "checked" : ""}>
            <span>Auto-advance through next pages (crawl)</span>
          </label>
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:11px; color:#5f6368;">Max:</span>
            <input id="idlc-cfg-max-pages" type="number" min="1" max="10" style="width:40px; padding:2px 4px; font-size:11px;" value="${CONFIG.maxPagesToCrawl}">
          </div>
        </div>

        <div class="idlc-checkbox-row">
          <label class="idlc-checkbox-label" for="idlc-cfg-confirm">
            <input id="idlc-cfg-confirm" type="checkbox" ${CONFIG.requireConfirmation ? "checked" : ""}>
            <span>Review & select files before downloading</span>
          </label>
        </div>

        <!-- Duplicate Prevention -->
        <div class="idlc-section-header">🛡️ Duplicate Prevention</div>
        <div class="idlc-checkbox-row">
          <label class="idlc-checkbox-label" for="idlc-cfg-skip-dupes">
            <input id="idlc-cfg-skip-dupes" type="checkbox" ${CONFIG.skipDuplicates ? "checked" : ""}>
            <span>Skip already downloaded files</span>
          </label>
          <button id="idlc-btn-clear-history" class="idlc-btn-danger-link" title="Reset download history cache">Clear History</button>
        </div>

        <!-- Account Safety & Rate Limits -->
        <div class="idlc-section-header">🔒 Account Safety & Rate Limits</div>
        <div class="idlc-checkbox-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
          <label class="idlc-checkbox-label" for="idlc-cfg-safe-mode" style="font-weight:600;">
            <input id="idlc-cfg-safe-mode" type="checkbox" ${CONFIG.safeMode ? "checked" : ""}>
            <span>Safe Mode (Anti-Throttle & Anti-Lockout)</span>
          </label>
          <span style="font-size:10.5px; color:#5f6368; line-height:1.3;">
            Humanized random pacing + 5s cooldown every 10 downloads to safeguard your Gmail account.
          </span>
        </div>

        <!-- Destination Folder -->
        <div class="idlc-section-header">💾 Save Destination</div>
        <div class="idlc-form-group">
          <label class="idlc-form-label" for="idlc-cfg-subfolder">Subfolder (in Downloads/)</label>
          <input id="idlc-cfg-subfolder" class="idlc-input" type="text" value="${CONFIG.subfolder}">
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          <input id="idlc-cfg-prefix-date" type="checkbox" ${CONFIG.prefixDate ? "checked" : ""}>
          <label class="idlc-form-label" for="idlc-cfg-prefix-date" style="cursor:pointer; margin:0;">Prepend email date prefix (<code>YYYY-MM-DD_file.ext</code>)</label>
        </div>

        <div class="idlc-settings-actions">
          <button id="idlc-btn-export-csv-manual" class="idlc-select-btn-link" style="font-size:11px;">📊 Export Last CSV Manifest</button>
          <button id="idlc-cfg-save" class="idlc-btn-sm idlc-btn-primary">Apply & Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    const toast = document.createElement("div");
    toast.id = "idlc-toast";
    toast.className = "idlc-hidden";
    document.body.appendChild(toast);

    const modalOverlay = document.createElement("div");
    modalOverlay.id = "idlc-modal-overlay";
    modalOverlay.className = "idlc-hidden";
    document.body.appendChild(modalOverlay);

    document.getElementById("idlc-btn-main").addEventListener("click", promptAndStartBulkDownload);

    const settingsBtn = document.getElementById("idlc-btn-settings");
    const popover = document.getElementById("idlc-popover");
    const popoverClose = document.getElementById("idlc-popover-close");
    const saveCfgBtn = document.getElementById("idlc-cfg-save");
    const clearHistoryBtn = document.getElementById("idlc-btn-clear-history");
    const exportCsvManualBtn = document.getElementById("idlc-btn-export-csv-manual");

    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.toggle("idlc-open");
    });

    popoverClose.addEventListener("click", () => popover.classList.remove("idlc-open"));

    // Quick Presets
    popover.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const preset = e.target.getAttribute("data-preset");
        const filterInput = document.getElementById("idlc-cfg-filter");
        const folderInput = document.getElementById("idlc-cfg-subfolder");

        if (preset === "all") {
          filterInput.value = "*";
          folderInput.value = "Gmail_Attachments";
        } else if (preset === "pdf") {
          filterInput.value = ".pdf";
          folderInput.value = "PDF_Attachments";
        } else if (preset === "idlc") {
          filterInput.value = "Portfolio_U533.pdf";
          folderInput.value = "IDLC_Statements";
        }
      });
    });

    // Date Range Quick Buttons
    popover.querySelectorAll("[data-date-range]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const range = e.target.getAttribute("data-date-range");
        const startInput = document.getElementById("idlc-cfg-start-date");
        const endInput = document.getElementById("idlc-cfg-end-date");
        const today = getTodayFormatted();

        if (range === "7d") {
          startInput.value = formatRelativeDate(7);
          endInput.value = today;
        } else if (range === "30d") {
          startInput.value = formatRelativeDate(30);
          endInput.value = today;
        } else if (range === "month") {
          startInput.value = getFirstDayOfMonth();
          endInput.value = today;
        } else if (range === "clear") {
          startInput.value = "";
          endInput.value = "";
        }
      });
    });

    // Clear History Button
    clearHistoryBtn.addEventListener("click", () => {
      if (confirm("Clear local download history cache? Previously downloaded files can then be downloaded again.")) {
        downloadHistoryCache = {};
        chrome.runtime.sendMessage({ action: "clearDownloadHistory" }, () => {
          showToast("History Cleared", "Download history reset. Duplicate check refreshed.", { duration: 2500 });
        });
      }
    });

    if (exportCsvManualBtn) {
      exportCsvManualBtn.addEventListener("click", exportAuditManifestCsv);
    }

    // Save Configuration
    saveCfgBtn.addEventListener("click", () => {
      const q = document.getElementById("idlc-cfg-filter").value.trim() || "*";
      const sf = document.getElementById("idlc-cfg-subfolder").value.trim() || "Gmail_Attachments";
      const pd = document.getElementById("idlc-cfg-prefix-date").checked;
      const sd = document.getElementById("idlc-cfg-skip-dupes").checked;
      const sm = document.getElementById("idlc-cfg-safe-mode").checked;
      const rc = document.getElementById("idlc-cfg-confirm").checked;
      const dz = document.getElementById("idlc-cfg-zip").checked;
      const ap = document.getElementById("idlc-cfg-advance").checked;
      const mp = parseInt(document.getElementById("idlc-cfg-max-pages").value, 10) || 3;
      const startDate = document.getElementById("idlc-cfg-start-date").value;
      const endDate = document.getElementById("idlc-cfg-end-date").value;

      CONFIG.filterQuery = q;
      CONFIG.subfolder = sf;
      CONFIG.prefixDate = pd;
      CONFIG.skipDuplicates = sd;
      CONFIG.safeMode = sm;
      CONFIG.requireConfirmation = rc;
      CONFIG.downloadAsZip = dz;
      CONFIG.autoAdvancePages = ap;
      CONFIG.maxPagesToCrawl = mp;
      CONFIG.startDate = startDate;
      CONFIG.endDate = endDate;

      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({
          filterQuery: q,
          subfolder: sf,
          prefixDate: pd,
          skipDuplicates: sd,
          safeMode: sm,
          requireConfirmation: rc,
          downloadAsZip: dz,
          autoAdvancePages: ap,
          maxPagesToCrawl: mp,
          startDate: startDate,
          endDate: endDate
        });
      }

      popover.classList.remove("idlc-open");
      updateUI();

      const zipMsg = dz ? " | Output: <b>ZIP</b>" : " | Output: <b>Individual</b>";
      showToast("Settings Saved", `Filter: <b>${q}</b>${zipMsg}<br>Safe Mode: <b>${sm ? "ON 🛡️" : "OFF"}</b>`, { duration: 3500 });
    });

    document.addEventListener("click", (e) => {
      if (!popover.contains(e.target) && !settingsBtn.contains(e.target)) {
        popover.classList.remove("idlc-open");
      }
    });

    updateUI();
  }

  function updateButtonState(running) {
    const btn = document.getElementById("idlc-btn-main");
    if (!btn) return;

    if (running) {
      btn.disabled = true;
      btn.innerHTML = `
        <span class="idlc-spinner"></span>
        <span class="idlc-label">Processing...</span>
      `;
    } else {
      btn.disabled = false;
      const label = CONFIG.filterQuery === "*" ? "Download Attachments" : `Download (${CONFIG.filterQuery})`;
      btn.innerHTML = `
        <span class="idlc-icon">
          <svg viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
        </span>
        <span class="idlc-label">${label}</span>
        <span id="idlc-badge" class="idlc-badge">0</span>
      `;
      updateUI();
    }
  }

  function updateUI() {
    const badge = document.getElementById("idlc-badge");
    const btn = document.getElementById("idlc-btn-main");
    if (!badge || !btn || isDownloading) return;

    const items = getFilteredAttachments();
    const count = items.length;

    badge.textContent = count;

    if (count > 0) {
      badge.classList.add("idlc-badge-active");
      btn.classList.add("idlc-active-items");
      const dateInfo = CONFIG.startDate || CONFIG.endDate
        ? ` (${CONFIG.startDate || "earliest"} to ${CONFIG.endDate || "today"})`
        : "";
      btn.title = `Found ${count} attachment(s) matching "${CONFIG.filterQuery}"${dateInfo}. Click to review!`;
    } else {
      badge.classList.remove("idlc-badge-active");
      btn.classList.remove("idlc-active-items");
      btn.title = `0 attachments matching current filters in view.`;
    }
  }

  let toastTimeout = null;

  function showToast(title, bodyHtml, options = {}) {
    const toast = document.getElementById("idlc-toast");
    if (!toast) return;

    if (toastTimeout) clearTimeout(toastTimeout);

    let progressHtml = "";
    if (options.showProgress) {
      progressHtml = `
        <div class="idlc-progress-track">
          <div id="idlc-progress-bar" class="idlc-progress-fill" style="width: 0%;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 4px;">
          <span id="idlc-progress-text" style="font-size:11.5px; color:var(--idlc-secondary-text);">0 of ${options.total || 0}</span>
          <button id="idlc-btn-cancel" class="idlc-btn-sm idlc-btn-secondary" style="padding: 2px 8px; font-size:11px;">Cancel</button>
        </div>
      `;
    }

    let actionBtnsHtml = "";
    if (options.showOpenFolder || options.showExportCsv) {
      actionBtnsHtml = `<div class="idlc-toast-actions">`;
      if (options.showExportCsv) {
        actionBtnsHtml += `<button id="idlc-btn-toast-csv" class="idlc-btn-sm idlc-btn-secondary" style="font-size:11.5px;">📊 Export CSV</button>`;
      }
      if (options.showOpenFolder) {
        actionBtnsHtml += `<button id="idlc-btn-open-folder" class="idlc-btn-sm idlc-btn-primary" style="font-size:11.5px;">Open Folder</button>`;
      }
      actionBtnsHtml += `</div>`;
    }

    toast.innerHTML = `
      <div class="idlc-toast-header">
        <span class="idlc-toast-title">
          <svg style="width:16px; height:16px; fill:var(--idlc-primary);" viewBox="0 0 24 24">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          ${title}
        </span>
        <button id="idlc-toast-dismiss" class="idlc-toast-close">✕</button>
      </div>
      <div class="idlc-toast-body">${bodyHtml}</div>
      ${progressHtml}
      ${actionBtnsHtml}
    `;

    toast.classList.remove("idlc-hidden");

    document.getElementById("idlc-toast-dismiss").addEventListener("click", () => {
      toast.classList.add("idlc-hidden");
    });

    if (options.showProgress) {
      const cancelBtn = document.getElementById("idlc-btn-cancel");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          abortRequested = true;
          cancelBtn.disabled = true;
          cancelBtn.textContent = "Cancelling...";
        });
      }
    }

    if (options.showExportCsv) {
      const csvBtn = document.getElementById("idlc-btn-toast-csv");
      if (csvBtn) csvBtn.addEventListener("click", exportAuditManifestCsv);
    }

    if (options.showOpenFolder) {
      const folderBtn = document.getElementById("idlc-btn-open-folder");
      if (folderBtn) {
        folderBtn.addEventListener("click", () => {
          chrome.runtime.sendMessage({ action: "openDownloadsFolder" });
        });
      }
    }

    if (options.duration) {
      toastTimeout = setTimeout(() => {
        toast.classList.add("idlc-hidden");
      }, options.duration);
    }
  }

  function updateToastProgress(title, bodyHtml, percent, current, total) {
    const toast = document.getElementById("idlc-toast");
    if (!toast || toast.classList.contains("idlc-hidden")) return;

    const bar = document.getElementById("idlc-progress-bar");
    if (bar) bar.style.width = `${percent}%`;

    const progressText = document.getElementById("idlc-progress-text");
    if (progressText) progressText.textContent = `${current} of ${total} (${percent}%)`;

    const body = toast.querySelector(".idlc-toast-body");
    if (body) body.innerHTML = bodyHtml;
  }

  /* ==========================================================================
     SPA Resilience & Lifecycle
     ========================================================================== */

  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!document.getElementById("idlc-fab-container")) {
        injectUI();
      }
      updateUI();
    }, 350);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener("popstate", () => setTimeout(updateUI, 500));
  window.addEventListener("hashchange", () => setTimeout(updateUI, 500));

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "triggerBulkDownload") {
      promptAndStartBulkDownload();
      sendResponse({ status: "modal_opened" });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectUI);
  } else {
    injectUI();
  }
})();
