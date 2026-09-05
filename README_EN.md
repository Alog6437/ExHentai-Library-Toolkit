# ExHentai Library Toolkit

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

- Download original images directly through the browser.
- Save images using sequential numbering.
- Automatically package downloaded files into a ZIP archive.
- Include related metadata for easier archiving and library management.

### Quick Favorites

- Simplify favorite operations.
- Provide faster favorite controls on gallery and list pages.

### Search Enhancements

- Provide more convenient search access.
- Help locate corresponding items between web content and a local LANraragi library.

### Browsing & UI Enhancements

- Highlight Chinese-translated content.
- Display LANraragi matching status.
- Display download-related status.
- Provide a unified floating toolbox.
- Include multiple configurable browsing enhancements.

## Installation

Install a userscript manager first, such as:

- Tampermonkey
- Violentmonkey

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
