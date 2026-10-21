# ExHentai Library Toolkit

**Current version: 1.2.0**

All-in-one userscript for ExHentai / E-Hentai: **LANraragi duplicate checking**, browser-only original-image ZIP downloads, metadata packaging, quick favorites, search and UI enhancements.

**[简体中文](README.md) | English**

---

## Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [How duplicate checking works](#how-duplicate-checking-works)
- [FAQ](#faq)
- [Disclaimer](#disclaimer)
- [Changelog](#changelog)
- [Credits](#credits)

---

## Features

| Feature | Description |
| --- | --- |
| LANraragi duplicate check | Shows `✔` (already in library), `≈` (highly similar) or `?` (possible) on gallery lists; clicking a badge opens the matching archive page |
| Original-image ZIP download | Runs entirely in the browser — no gallery-dl, Python or local service. Choose originals or resized images; the ZIP is written while images download |
| Metadata packaging | Bundles `metadata.json` plus a LANraragi-compatible `info.json`; a metadata-only ZIP is also available |
| Quick favorites | One-click favoriting on both detail and list pages, with a configurable default category |
| Global search | Search entry on list pages that jumps to the site's advanced search |
| Translation highlighting | Highlights Chinese or English translations depending on the UI language |
| Uncensored label | Marks galleries that actually carry the `uncensored` tag (not guessed from titles) and batches page-count lookups for the duplicate-check hints |
| Floating panels | Separate tool and download launchers; draggable with remembered position, one panel open at a time |

---

## Installation

### Requirements

- A userscript manager: [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey
- Browser baseline: Chrome / Edge 67+, Firefox 68+, Safari 14+
  - Streaming ZIP writes use OPFS (Chrome 86+, Firefox 111+, Safari 15.2+). Without it the downloader falls back to in-memory mode with a 512 MB limit and labels it in the status line.

### Option 1: Install from a script site

1. Sign in to [Greasy Fork](https://greasyfork.org/) and enable adult content in your account settings.
2. Search for **ExHentai Library Toolkit**, open the script page and click install.
3. Confirm in your userscript manager, then reload ExHentai / E-Hentai.

Adult scripts can also be found on [Sleazy Fork](https://sleazyfork.org/). Those account settings belong to the script site, not to the image boards.

### Option 2: Install from the repository file (recommended for testing)

1. Download `ExHentai_Library_Toolkit.user.js` from this repository.
2. Drag the file into a browser window, or use your manager's "Utilities → Import".
3. Confirm the installed version is **1.2.0** (the panel footer shows the version too), then reload the page.

### Updating and removing

- **Update:** script-site installs update automatically; file installs can be overwritten by importing the same script again.
- **Remove:** delete the script in your userscript manager. Its stored settings and caches can be cleared afterwards if needed.

### Upgrading from 1.1.x to 1.2.0

- The duplicate-check cache moved to a new namespace (URL cache `v9`), so the first visit after upgrading re-checks galleries instead of reusing old misses.
- Failed lookups no longer show a red `LRR !`: rows stay unmarked and the reason is summarised in the tool panel.
- The panel footer now reads the version from `@version` at runtime instead of hard-coding it.

---

## Usage

### 1. First run: configure LANraragi (optional)

Duplicate checking is optional; downloads, favorites, search and the other enhancements work without it.

1. Click the floating tool button and open **tool settings**.
2. Enter **LRR server**, e.g. `http://192.168.1.100:3000` (include `http://` or `https://`).
3. Enter the **API key**: required when LANraragi has a password enabled, may be left empty otherwise.
4. Enable **duplicate checking** and adjust **primary concurrency** (default 8) and **fallback search concurrency** (default 2) if needed.
5. Click **Save & Reload**.
6. Click **Test LRR connection**; the status line shows `LRR: online · version x.y.z · N archives`.

> **Note:** the API key is stored in plain text in the userscript's own storage (`GM_setValue`) and is only sent in the `Authorization` header. It never appears in URLs, ZIP files or console logs — but avoid publishing screenshots or exported settings that contain it.

### 2. Gallery lists: reading the badges

Open any list page (front page, search results, favorites, tags…). The script checks galleries automatically and inserts a badge next to each title:

| Badge | Meaning | What to do |
| --- | --- | --- |
| Green `LRR ✔` | An archive with a matching source URL exists | Skip it |
| Blue/purple `LRR ≈` | A highly similar title exists | Open it and verify the edition/top volume |
| Orange `LRR ?` | Possibly in the library, but evidence is weak | Open it and confirm |
| No badge | Not in the library, or the lookup failed | Usually "not there"; failures are reported in the panel |

- **Click** a badge to open that archive's page in LANraragi (`server/reader?id=<archive id>`); it falls back to a search page only when no archive id is available.
- **Hover** a badge to see the verdict, possible-match reason, candidate title and page-count comparison.
- In thumbnail mode the badge sits on the top-left corner of the cover; in other modes it is placed before the title.

### 3. Page counts and deleted pages

Archives often have the opening scanlation-credit page and trailing ad pages removed, so page counts legitimately differ:

- Page counts **never** affect a verdict; deleting pages cannot make a gallery go undetected.
- The tooltip shows the site page count next to the library page count:
  - within about 12% (at least 4 pages) — "likely removed credit/ad pages, still the same work";
  - larger gaps — "likely a different edition, please verify".
- The site count comes from a batched gdata request and therefore requires **Uncensored label** to be enabled; otherwise only the library count is shown.

### 4. Detail page: downloading a gallery

Open the download panel from the download floating button:

1. **ZIP name**: original/Japanese title by default, or switch to the English/Chinese/Romaji title.
2. **Download originals**, or uncheck it to use the displayed compressed/resized images.
3. **Parallel tasks**: 1–4 is a safe range; higher values are more likely to be throttled.
4. Optionally **Check download source** to validate the image pages and original-image entry without downloading.
5. Click **Download Gallery**: images are numbered `001.ext`, `002.ext`…, packed into a ZIP and handed to the browser.

Behaviour notes:

- File extensions follow the real image format (JPEG becomes `.jpg`; PNG/WebP keep their extension — no transcoding).
- If a download is running, reloading or closing the page triggers the browser's native confirmation.
- Site-level errors (quota/GP exhausted, IP ban, suspended account, HTML error pages) stop the task immediately; transient per-image errors are retried and re-resolved.
- Without OPFS the downloader uses in-memory mode with a 512 MB limit and stops with a clear message instead of crashing the tab.

**Metadata-only ZIP**: choose the title type, then click **Download Metadata ZIP**. The archive contains only `metadata.json` and `info.json`, downloads no images and needs no directory picker. The Chinese UI prefixes the name with `[仅元数据]`.

### 5. Favorites, search and UI enhancements

- **Quick favorites** on both detail and list pages; the default category (0–9) is configurable.
- **Global search** adds a search field on list pages that jumps to the site's advanced search.
- **Translation highlighting** follows the UI language.
- **Uncensored label** marks galleries carrying the real `uncensored` tag, next to the duplicate badge.

### 6. Floating panels and userscript menu

- Two floating buttons: **tools** (settings and duplicate checking) and **download**.
- Clicking toggles a panel; only one is visible at a time. Hold the panel title to drag it, and the position is remembered.
- The userscript menu mirrors the same actions:

| Menu command | Action |
| --- | --- |
| ⚙ Open LRR Settings | Opens the tool panel |
| ⬇ Open Image ZIP Download | Opens the download panel |
| 🔄 Rescan Current Page | Clears this page's related caches and re-checks |
| 📂 Rescan LRR Archive Folder | Triggers a full LANraragi rescan |
| 🧹 Clear LRR Cache | Clears all duplicate-check caches |
| 🟢 Test LRR Connection | Checks server status and archive count |

### 7. Rescans and caches

- **Rescan current page** clears only this page's related caches, useful after importing new archives.
- **Rescan archive folder** calls LANraragi's Shinobu endpoint (`POST /api/shinobu/rescan`): it clears the file scan map, restarts the file watcher and rescans the configured archive directory. This is a heavy operation and may take minutes on large libraries:
  - the script polls `/api/info` every 3 seconds and shows indexing progress in the status line;
  - once the archive count settles it reports "rescan finished" — click **Rescan current page** afterwards to refresh markers;
  - polling stops after 5 minutes and asks you to check LANraragi directly;
  - failures map to readable reasons: 401/403 (wrong or unauthorised API key), 404 (wrong address or path prefix), 400 (LANraragi's own error text).
- **Clear LRR cache** removes every cached entry and rescans the current page.

---

## How duplicate checking works

Checking runs in two layers, and only confirmed matches produce a badge:

1. **URL lookup**: cross-site variants of the gallery URL are passed to LANraragi's `urlfinder` plugin; a hit means `✔`. A hit also registers the library title as a reliable alias that helps classify other entries on the same page.
2. **Title lookup**: first a strict "author + main title" match, then up to four recall queries (including leading/trailing fragments of unspaced CJK titles). Queries are only used for recall — **the verdict always uses the complete title**.

Identity is verified before similarity: numbers/volumes (`Vol.02`, `第2巻`, `第十二話`), volume markers including bare `上`/`下`, prequels/sequels, extras and compilations must agree; otherwise the candidate is rejected.

Similarity combines bigram Dice and edit distance:

| Case | Subject length | Edit similarity | Dice |
| --- | --- | --- | --- |
| Author evidence | ≥ 8 chars | ≥ 0.88 | ≥ 0.80 |
| No author evidence | ≥ 12 chars | ≥ 0.94 | ≥ 0.92 |
| Short titles | exact equality after normalisation | — | — |

Cache lifetimes:

| Cache | Lifetime |
| --- | --- |
| URL hit | 30 minutes |
| URL miss | 5 minutes |
| Verified title match | 30 minutes |
| Title miss / possible match | 5 minutes |

Every cache key includes the LANraragi server identity, so switching servers never reuses another library's verdicts. Failed lookups are never cached as misses, never mark a row, and are retried at most twice.

---

## FAQ

**Q: No badges at all?**
Check that duplicate checking is enabled, the server URL is filled in, and **Test LRR connection** succeeds. If it does, those galleries simply aren't in the library — "not in the library" means no badge at all.

**Q: The same work shows `≈` instead of `✔`.**
`✔` requires a source-URL match. Archives imported from other sources, or a missing `urlfinder` plugin, leave only title matching, which produces `≈`. Open the badge to confirm.

**Q: I delete credit and ad pages — does that break checking?**
No. Page counts never participate in the verdict; they are shown as a hint only (see "Page counts and deleted pages").

**Q: Old results persist after switching LANraragi servers.**
Cache keys include the server, so no cross-server reuse happens. Any remaining miss expires within 5 minutes, or click **Clear LRR cache**.

**Q: Downloads fail or report throttling/bans.**
The script detects quota exhaustion, temporary IP bans and suspended accounts and stops. Lower **Parallel tasks**, wait for the block to expire, and avoid sustained high concurrency.

**Q: "In-memory mode" after downloading?**
Your browser lacks OPFS (older Safari/Firefox or disabled storage), so the ZIP is assembled in memory with a 512 MB cap. Use compressed images, fewer pages, or a browser with OPFS support.

**Q: Clicking a badge opens a 404.**
Archive pages live at `server/reader?id=<archive id>`. A 404 usually means the **LRR server** value is missing a path prefix, or the archive was deleted. Verify the address with **Test LRR connection**.

**Q: "Rescan archive folder" returns 401/404.**
401/403 means the API key is wrong or unauthorised; 404 means the address or path prefix is wrong. If LANraragi has no password enabled, the key may be left empty.

**Q: Won't this hammer the site or LANraragi?**
Defaults are primary concurrency 8, fallback search concurrency 2 and download parallelism 2, with most results served from cache. Lower them if your network or server is slow; identical queries are merged.

**Q: Where is the API key stored?**
In the userscript's own storage (`GM_setValue`), in plain text, and only used for the `Authorization` header. It never enters ZIP files, URLs or logs — but other scripts in the same browser profile could read it, so avoid configuring it on shared browsers.

---

## Disclaimer

This project is an unofficial third-party script. It is not affiliated with, authorised by, or associated with ExHentai, E-Hentai, LANraragi, or their developers and operators.

The script is provided for browsing assistance, local library management and personal study only. Users are responsible for ensuring that their use complies with the laws of their jurisdiction, the rules of the sites they visit, and the licensing of the content they access.

The script performs network requests, image downloads and local library access. Because site rules, network conditions, account permissions, LANraragi configuration, browsers and userscript managers vary, some features may break, be restricted or behave unexpectedly.

Any account restrictions, data loss, failed downloads, access problems, server load or other direct or indirect damages arising from the use of this script are the user's own responsibility.

Please keep request rates and concurrency reasonable. Do not use this script for malicious requests, bulk abuse or any behaviour that could disrupt the sites or services involved.

The script stores the LANraragi address and API key in local browser storage. Evaluate the risks of shared devices, browser sync and screenshots on your own.

---

## Changelog

### 1.2.0

- Added: clicking a duplicate badge opens the matching archive page (`/reader?id=`), falling back to search only when no archive id exists.
- Added: badge tooltips compare site and library page counts; gaps within about 12% (at least 4 pages) are attributed to removed credit/ad pages. Page counts never affect the verdict.
- Added: after triggering an archive-folder rescan the script polls indexing progress and reports completion once the archive count settles.
- Fixed: bare volume markers (上/下/中/前/後/番外) were ignored during identity checks, so different volumes could be merged.
- Fixed: failed lookups no longer show a red `LRR !`; failures are summarised in the panel and retried automatically, while unmatched rows stay unmarked.
- Fixed: an `error` from the LANraragi plugin is no longer cached as "not in library"; a `success: 0` without an error message is treated as a miss.
- Fixed: the URL cache was not scoped per server and misses lived too long; misses now expire after 5 minutes and keys include the server.
- Fixed: without OPFS the in-memory ZIP had no limit and could crash the tab; it is now capped at 512 MB with an in-memory mode indicator.
- Fixed: the search fallback used `?search=` instead of LANraragi's `?filter=`.
- Improved: "Rescan archive folder" no longer requires an API key, and 401/403/404/400 produce readable errors.
- Maintenance: the panel footer reads the version from `@version`; versions are bumped only on release.

### 1.1.5

- Added the orange `LRR ?` possible-match hint and alias propagation from confirmed source-URL hits.
- Fixed title misses caused by quoted search terms; title caches upgraded to v8.

Older changes are available in the git history.

---

## Credits

Thanks to the original **ExHentai Lanraragi Checker** script. **ExHentai Library Toolkit** is a derivative work that integrates and extends duplicate checking, downloading, metadata handling and UI enhancements. Thanks to the original authors and contributors.

- Repository: <https://github.com/Alog6437/ExHentai-Library-Toolkit>
- Issues: <https://github.com/Alog6437/ExHentai-Library-Toolkit/issues>
