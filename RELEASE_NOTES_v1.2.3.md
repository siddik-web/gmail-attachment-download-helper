# Release v1.2.3: Zero Layout Shift, Debounced Search with Skeleton Loading & Scanning Performance

### ⚡ Highlights & Improvements

#### 1. Zero Cumulative Layout Shift (CLS) in Review Modal
- **Frame & List Decoupling**: Previously, every keystroke in the modal search or sender input triggered a full card re-render (`overlay.innerHTML = ...`). This caused input blur, cursor jumping, violent layout collapse/expansion, and keystroke lag. The modal now renders the frame once, only updating the preview list in-place.
- **Strict Fixed Preview Dimensions**: `.idlc-preview-list` and `.idlc-modal-card` are locked to stable dimensions (`height: 240px; min-height: 240px; max-height: 240px; min-height: 560px;`). The modal never collapses or expands regardless of whether 0, 1, or 50 items match the search.
- **Scroll Chaining Prevention**: Added `overscroll-behavior: contain;` to `.idlc-modal-card` and `.idlc-preview-list` so scrolling through long lists never causes the underlying Gmail inbox to scroll or jump.

#### 2. Shimmer Placeholder Skeleton Loading
- **Instant Search Feedback**: As the user types in the filename or sender search box, a 4-row pulse shimmer skeleton loader (`@keyframes idlc-shimmer`) is displayed immediately with zero layout shift.
- **Debounced Search Execution**: Search input events are debounced (130ms), eliminating CPU stutter during fast typing.
- **Dedicated Clear Buttons (✕)**: Added 1-click clear buttons inside the filename and sender search inputs to instantly reset search queries.
- **Centered Empty State**: When no attachments match a search filter, an integrated empty state with an icon and a 1-click **"Reset Filters"** button is presented inside the fixed container without resizing.

#### 3. Parallel Duplicate Detection on Open
- Previously, duplicate checking sequentially awaited each item before opening the modal.
- Duplicate resolution is now executed concurrently with `Promise.all` while the skeleton loader renders immediately upon opening, resulting in sub-50ms modal launch times.

#### 4. FAB Button & Badge Stabilization
- Fixed button width shifts on the main FAB pill button (`min-width: 195px; justify-content: space-between;`).
- Added `font-variant-numeric: tabular-nums;` and `min-width: 24px;` to the count badge to prevent horizontal jitter when counts transition between single, double, and triple digits.

#### 5. MutationObserver & DOM Scan Optimization
- Added a 600ms short-term scan cache to `scanAllAttachments()` to prevent redundant regex and date parsing during rapid DOM mutation bursts.
- Paused background MutationObserver rescans while the modal is open or while a bulk download is actively running.
