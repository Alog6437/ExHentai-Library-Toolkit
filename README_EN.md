# ExHentai Library Toolkit

**Current version: 1.1.2**

All-in-one userscript for ExHentai/E-Hentai: LANraragi duplicate checking, original image ZIP downloads with metadata, favorites, search, and UI enhancements.

**[简体中文](README.md) | English**

---

## Introduction

**ExHentai Library Toolkit** is an all-in-one userscript for ExHentai / E-Hentai, designed to improve gallery browsing, downloading, and local library management.

It combines LANraragi duplicate checking, browser-based original image downloads, ZIP packaging, metadata preservation, quick favorites, search tools, and UI enhancements in a single script.

## Features

### LANraragi Duplicate Checking

- Check whether a gallery already exists in LANraragi.
- Support exact matching and fallback searching.
- Display match status directly on gallery lists.
- Support rescanning and cache management.

### Original Image ZIP Downloads

- Download original images directly through the browser, or choose compressed/resized images.
- Save images using sequential numbering.
- Automatically package downloaded files into a ZIP archive.
- Optionally include metadata.json and LANraragi-compatible info.json.
- Use the ZIP Name setting to choose the default or original/Japanese title; archives go to the browser download directory.
- While downloading or packaging, refreshing, closing or leaving the page requests the browser's native confirmation. Cancel to keep the task running; leaving interrupts it. The browser controls the wording, and protection is removed when the task completes or fails.

### Metadata-Only ZIP Downloads

On a gallery detail page, open the download panel, choose the title type, and click “Download Metadata ZIP”. The archive contains only metadata.json and info.json, without downloading images or requiring a local directory picker.

Filenames use `[Metadata Only] Gallery title.zip` in English or `[仅元数据] 图库标题.zip` in Chinese. Full gallery downloads still use `Gallery title.zip`.

### Uncensored Labels

- An independent “Uncensored label” switch sits beside translation highlighting. It is enabled by default and applies after saving settings.
- Detection uses the gallery's actual uncensored tag, not its title, and works independently of LANraragi checking.
- Badges appear beside duplicate-check badges: at the top left of covers in thumbnail mode and before titles in other list modes.
- Dynamic list rescans, batch queries and short-lived caching reduce repeated requests.

### Quick Favorites

- Simplify favorite operations.
- Provide faster favorite controls on gallery and list pages.

### Search Enhancements

- Provide more convenient search access.
- Help locate corresponding items between web content and a local LANraragi library.

### Browsing & UI Enhancements

- Highlight translations according to the interface language: Chinese translations in Chinese mode and English translations in English mode.
- Display LANraragi matching status.
- Display download-related status.
- Provide a unified floating toolbox.
- Arrange quick favorites, global search, translation highlighting and uncensored labels in a compact two-column, two-row layout.
- Share list observation, skip scans caused by badge insertion, and render download progress at most 10 times per second; final states update immediately.

### Floating Panel Controls

- Click the tools floating button to open settings and hide the download panel; click it again to close settings.
- Click the download floating button to open downloads and hide settings; click it again to close downloads.
- Only one panel is visible at a time. Moving the pointer away or clicking outside does not close it. Panel contents stay expanded without automatic collapsing.
- Hold the header to drag a panel; clicking it does not collapse it. Switching or hiding panels does not stop a running download.

## Installation

Install a userscript manager first, such as:

- Tampermonkey
- Violentmonkey

### Install by Searching the Script Site

1. Sign in to your [Greasy Fork](https://greasyfork.org/en/) account and enable adult content in your account settings.
2. Search for **ExHentai Library Toolkit**, open its script page, click Install, and confirm in your userscript manager.
3. Refresh ExHentai / E-Hentai after installation.

These account settings belong to the Greasy Fork script site. You can also search for adult scripts on [Sleazy Fork](https://sleazyfork.org/en/).

### Install from the Repository

Then open and install the following script with your userscript manager:

```text
ExHentai_Library_Toolkit.user.js
```

Refresh the page after installation.

## LANraragi Configuration

LANraragi duplicate checking is optional.

To use it, enter your own LANraragi URL and API key in the script toolbox, for example:

```text
LANraragi URL:
http://192.168.1.100:3000

API Key:
YOUR_API_KEY
```

Use the URL that matches your own LANraragi deployment.

> Never expose your LANraragi API key, cookies, or other private credentials in public repositories, issues, screenshots, or other public content.

## LANraragi Match Status

```text
LRR ✔
```

Indicates that a relatively clear match was found in LANraragi.

```text
LRR ≈
```

Indicates that a possible match was found through fallback searching. Manual confirmation through the LANraragi search result is recommended.

## Version 1.1.2 Changes

- Retry cleanup of the current OPFS temporary ZIP after a failed or abnormally settled download.
- Remove stale `.eh-pure-*.zip` files older than the safety window whenever a download task runs.
- Keep successful temporary ZIPs only for the browser handoff grace period, avoiding premature deletion that could corrupt the final download.

## Version 1.1.0 Changes

- Metadata-only ZIP downloads with a distinctive filename prefix.
- Leave-page confirmation for unfinished downloads.
- Uncensored badges and compact browsing settings.
- Fewer repeated DOM scans, duplicate link lookups and unrelated UI checks, while retaining download concurrency settings and the existing retry policy.

## Development Checks

With Node.js installed, run:

```sh
node --check ExHentai_Library_Toolkit.user.js
node --test tests/performance-regression.cjs
```

Regression tests cover leave-page protection, DOM observation, caching and progress rendering. Native browser prompts and real-site interactions still require browser testing.

## Credits & Origin

Special thanks to the original script **ExHentai Lanraragi Checker**.

**ExHentai Library Toolkit** is a secondary development based on **ExHentai Lanraragi Checker**. It integrates, adjusts, and extends the original functionality, including LANraragi duplicate checking, downloading, metadata handling, UI enhancements, and other related features.

Many thanks to the original script and the development work behind it.

## Disclaimer

This project is an unofficial third-party userscript and is not officially affiliated with, endorsed by, authorized by, or partnered with ExHentai, E-Hentai, LANraragi, or their respective developers or operators.

The script is provided for browsing assistance, local library management, personal use, learning, and research. Users are responsible for ensuring that their use complies with applicable laws, website rules, and the authorization requirements of the content they access.

The script performs operations such as network requests, image downloads, and access to a user-configured LANraragi instance. Features may become unavailable, restricted, or behave unexpectedly due to website changes, network conditions, account permissions, LANraragi configuration, browser differences, or userscript-manager behavior.

Users assume responsibility for any account restrictions, data loss, failed downloads, access issues, server load, or other direct or indirect consequences resulting from use of this script.

Please use reasonable download rates and concurrency settings. Do not use this script for abusive automation, malicious requests, excessive bulk access, or any activity that may interfere with the normal operation of websites or services.
