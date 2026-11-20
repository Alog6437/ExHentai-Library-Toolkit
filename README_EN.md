# ExHentai Library Toolkit

**Current version: 1.3.12**

All-in-one userscript for ExHentai / E-Hentai: **LANraragi duplicate checking**, browser-only original-image ZIP downloads with optional metadata, Chinese/English translation highlighting and uncensored labels.

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
| Metadata packaging | Optionally bundles `metadata.json` and a LANraragi-compatible `info.json` inside the image ZIP |
| Translation highlighting | Highlights Chinese or English translations depending on the UI language |
| Uncensored label | Marks galleries that actually carry the `uncensored` tag (not guessed from titles) and batches page-count lookups for the duplicate-check hints |
| Compact toolkit | A single small launcher; Download / Check / Settings share one compact panel with infrequent options collapsed |

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
3. Confirm the installed version is **1.3.12** (the panel footer shows the version too), then reload the page.

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

Duplicate checking is optional; downloads, translation highlighting and uncensored labels work without it.

1. Click the small **EL launcher** in the top-right corner, select **Settings**, and expand the LRR connection group.
2. Enter **LRR server**, e.g. `http://192.168.1.100:3000` (include `http://` or `https://`).
3. Enter the **API key** only when configuring or replacing it. Saved keys are never populated into the page input; saving a blank input preserves the existing key. Select **Clear saved API key** to delete it (clearing takes precedence over replacement). No key is needed when LANraragi authentication is disabled.
4. Enable **duplicate checking**. Defaults normally suffice; expand **LRR performance** only if you need to change primary concurrency (default 8) or fallback search concurrency (default 2).
5. Click **Save & Reload**.
6. Click **Test LRR connection**; the status line shows `LRR: online · version x.y.z · N archives`.

> **Note:** the API key is stored in plain text in the userscript's own storage (`GM_setValue`) and is only sent in the `Authorization` header. It never appears in URLs, ZIP files or console logs. Settings show only whether a key is configured and clear temporary input on save, never displaying the saved value. This reduces accidental exposure but is not complete isolation: the host page and other page scripts can still read a newly typed key while it is in the input. Avoid publishing screenshots or exported settings that contain it.

Primary duplicate checks and fallback searches each share a stable concurrency pool within the page. Dynamically added galleries, overlapping scans and manual rescans do not create extra pools. Stale/detached queued galleries are skipped; in-flight requests continue occupying their slots until completion. Limits do not extend across tabs or include independent index synchronization, connection tests or downloads.

### 2. Gallery lists: reading the badges

Open any list page (front page, search results, favorites, tags…). The script checks galleries against its persistent local library index and inserts a badge next to each title; remote lookup remains available while no local index is ready:

| Badge | Meaning | What to do |
| --- | --- | --- |
| Green `LRR ✔` | An archive with a matching source URL exists | Skip it |
| Blue/purple `LRR ≈` | A highly similar title exists | Open it and verify the edition/top volume |
| Orange `LRR ?` | Possibly in the library, but evidence is weak | Open it and confirm |
| No badge | Not in the library, or the lookup failed | Usually "not there"; failures are reported in the panel |

- **Click** a badge to open that archive's page in LANraragi (`server/reader?id=<archive id>`); it falls back to a search page only when no archive id is available.
- **Hover** a badge to see the verdict, possible-match reason, candidate title and page-count comparison.
- In thumbnail mode the badge sits on the top-left corner of the cover; in other modes it is placed before the title.

#### Persistent local library index

- The first enabled session fetches library metadata in bulk through LANraragi's `/api/archives`, without per-archive requests or downloading comic files.
- Only necessary metadata such as archive IDs, titles, tags and page counts is stored in the userscript manager's persistent storage. No folder permission is needed; closing the browser or rebooting does not clear it.
- Background synchronization runs every **30 minutes**, isolated by server and credentials. Metadata is refreshed even when archive counts stay unchanged, so renames, tag edits and equal-count replacements are included.
- The **Check** tab displays indexed archive count, last successful synchronization and current status, with a **Sync now** action. Existing manual page rescans and query-cache clearing also trigger synchronization; failures never delete the saved complete index.
- A complete previous snapshot remains usable during updates. Validation or storage errors preserve it and trigger retry backoff. Misses in an expired snapshot can fall back to remote lookup.
- Source URL, author, volume and story-part verification remain strict; matching page counts never establish a duplicate.
- Synchronization only runs while a matching page and the script are active. Reopening loads the saved index before refreshing it if needed. Removing the script and its stored data clears the index.

### 3. Page counts and deleted pages

Archives often have the opening scanlation-credit page and trailing ad pages removed, so page counts legitimately differ:

- Page counts **never** affect a verdict; deleting pages cannot make a gallery go undetected.
- The tooltip shows the site page count next to the library page count:
  - within about 12% (at least 4 pages) — "likely removed credit/ad pages, still the same work";
  - larger gaps — "likely a different edition, please verify".
- The site count comes from a batched gdata request and therefore requires **Uncensored label** to be enabled; otherwise only the library count is shown.

### 4. Detail page: downloading a gallery

Click the **EL launcher** in the top-right corner and select **Download**:

1. **ZIP name**: original/Japanese title by default, or switch to the English/Chinese/Romaji title.
2. **Download originals**, or uncheck it to use the displayed compressed/resized images.
3. **Parallel tasks**: new configurations default to 5; existing saved settings are preserved, so select 5 manually after upgrading if desired. Lower this on weak connections or when throttled; more parallelism is not always faster.
4. Click **Download Gallery**: gallery information and image sources are validated and resolved automatically, images retain their original filenames and extensions without automatic numbering or `.jpeg` to `.jpg` normalization, packed into a ZIP and handed to the browser. No separate source check is needed.

Behaviour notes:

- Downloads and ZIP writes use a bounded pipeline: workers continue after queue admission instead of waiting for each disk write. ZIP writes remain serialized, and recovery/export waits for the queue to drain.
- The write queue holds at most 10 images and normally up to 64 MiB, including the active write. A larger single image is admitted alone. Each network worker may additionally hold one image awaiting admission, so **64 MiB is not a total tab-memory limit**; the in-memory ZIP limit of 512 MB still applies. Runtime diagnostics include queue peaks, disk-write time and backpressure wait time. Actual throughput still depends on the image source and network.
- **Current speed** is the combined image traffic over the last 5 seconds divided by 5 seconds, refreshed every second; it warms up over the first 5 seconds and falls to zero after traffic stops. **Average speed** divides total image bytes received by active runtime, excluding pauses and manual recovery waits but including ordinary network waits, retry backoff and write-queue backpressure. Received bytes include failed/retried traffic and differ from bytes written to the ZIP. These are display improvements, not a throughput boost.
- “Auto archive naming” is the default beside the original-image checkbox. It compares all authoritative response filenames in gallery page order using deterministic natural sorting. Strictly increasing, unambiguous names stay unchanged; otherwise every image gets a page prefix whose width matches the total page count, e.g. `01_original.JPEG` for 13 pages. Missing pages conservatively trigger uniform prefixes with gaps preserved. This reproduces the requested archive-style behavior, not undocumented official logic or every OS collation rule.
- “Original names” and “Numbered names” remain available. Numbered mode uses `001.JPEG`, `002.png` etc. All modes retain extension spelling/case without compression or transcoding. Saving settings or starting a download remembers the choice. Existing saved preferences are not forcibly replaced; select auto to switch.
- All images and metadata live directly at ZIP root without subdirectories. `metadata.json` includes ordered original-to-output `image_files` mappings and the `image_naming` mode (`auto_prefixed` records the auto decision). Auto mode finalizes names by patching local headers and central-directory names without buffering all images or adding HTTP requests; patch failures abort rather than export a corrupt ZIP. Original mode explicitly rejects duplicate filenames without overwriting or renaming; numbered mode separates duplicate basenames by page number and preserves missing-page gaps in partial exports.
- Names come from the image response's `Content-Disposition`, the image-page filename or a real image URL. Resized images use the actual downloaded file's name/extension. Unknown or unsafe names and extension/response-format conflicts fail explicitly into the existing recovery flow rather than inventing names, changing extensions or silently sanitizing characters.
- If a download is running, reloading or closing the page triggers the browser's native confirmation.
- Pause/resume aborts active network requests while preserving images already written to the ZIP. Resuming only fetches unfinished images.
- Image requests with no new bytes for an extended period are aborted and retried. The downloader first retries the current URL, then re-resolves the image page and switches sources if failures persist.
- After per-image retries are exhausted, or a site-level error occurs (quota/GP exhausted, IP ban, suspended account), the task is retained: retry unfinished pages, export completed images, or discard it. Partial ZIPs include a missing-page manifest.
- Storage quota or ZIP write failures stop and clean up the task immediately instead of continuing to download unsavable data.
- **Recovery works only within the current page**: reloading, closing the page or discarding the task loses its recovery state. Paused tasks and tasks awaiting recovery still trigger the native leave-page confirmation.
- Without OPFS the downloader uses in-memory mode with a 512 MB limit and stops with a clear message instead of crashing the tab.

Image ZIPs can include `metadata.json` and `info.json`. Standalone metadata-only ZIP export is no longer offered.

### 5. Translation highlighting and uncensored labels

- Favorites and search use the site's native controls; the script no longer overrides favorites or injects a global search bar.
- **Translation highlighting** follows the UI language.
- **Uncensored label** marks galleries carrying the real `uncensored` tag, next to the duplicate badge.

### 6. Floating panel

- One small **EL launcher** starts in the top-right corner; the panel never expands automatically. Drag it with a mouse or touch to reposition it. Userscript storage remembers the location across refreshes and reopening, without folder permissions.
- The panel follows the launcher, opens above it when space below is insufficient, and stays within the visible viewport after resizing. Settings includes an action to restore the default top-right position.
- **Download / Check / Settings** share one compact panel. Clicking the launcher or close button collapses it without interrupting downloads.
- Advanced and infrequent options use collapsible groups. The panel grows and shrinks naturally with content, without the previous 560px cap or a visible scrollbar. Scrolling is retained only when content exceeds the available viewport height, so bottom actions remain accessible on short screens.
- Local safe-preview screenshots show the actual userscript without any real gallery content.
- No userscript extension menu commands are registered. Downloads, duplicate checks, maintenance tools and log exports are available through the top-right **EL panel**.

#### Exporting diagnostics

Use **EL → Settings → Advanced → Export runtime logs**. This session's duplicate checks, index synchronization, downloads and errors are recorded automatically in memory. No extra switch is needed; Settings no longer exposes console logging or Debug toggles. Export after reproducing the issue, before refreshing or closing the page, and include your steps and expected/actual behavior.

Only this script's events are collected, not other page scripts, browser or router system logs. Tabs and page sessions are not merged; refreshing starts a new log. The newest **10,000 entries / 5 MiB** are retained, whichever limit is reached first; oversized entries are also truncated. Dropped and truncated entry counts are included in the export. API keys and authentication data are automatically redacted, but gallery links, titles and internal server addresses may remain useful diagnostics. Review the file before sharing it.

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
Defaults are primary concurrency 8, fallback search concurrency 2 and download parallelism 5 (existing saved settings are preserved), with most results served from cache. Lower them if your network or server is slow; identical queries are merged.

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

### 1.3.12

- The panel naturally resizes with task status, tabs and expanded options, without a fixed 560px cap or visible scrollbar.
- Overflow remains scrollable only when necessary to fit the screen, preserving draggable positioning and short-screen accessibility.

### 1.3.11

- Default automatic archive naming keeps correctly ordered originals or uniformly prefixes page numbers using total-page digit width; partial exports preserve page gaps.
- Original/numbered modes and saved preferences remain available. All files stay at ZIP root with unchanged extensions and image bytes.
- In-place ZIP filename finalization avoids buffering the full gallery. Added naming, header-patch and real-browser ZIP checks.

### 1.3.10

- Added persisted original/numbered image naming beside the original-image checkbox, defaulting to original names.
- Numbered mode follows page order while preserving extension case without transcoding. Both modes keep files at ZIP root and record original-to-output metadata mappings.

### 1.3.9

- Images and metadata now live directly at ZIP root without page subdirectories; original names and extensions remain unchanged.
- Duplicate names fail explicitly without overwriting or renaming, with retry and partial export available.

### 1.3.8

- Image ZIPs retain original filenames and extensions without page-number renaming or `.jpeg` to `.jpg` normalization.
- Separate page directories prevent duplicate-name collisions; metadata maps pages to original names and ZIP paths. Unknown or unsafe filenames fail explicitly without silent renaming.

### 1.3.7

- Simplified: removed quick favorites, the injected global search bar, standalone metadata ZIP export and the separate source-check button. Downloads automatically validate/resolve image sources; image ZIP metadata remains available.
- Retained: Chinese/English translation highlighting, uncensored labels, download pause/recovery/partial export, the persistent library index, draggable launcher and runtime log export.
- Settings: separated LRR connection settings from collapsed low-frequency performance options; removed console logging/Debug toggles while keeping automatic diagnostics.

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
