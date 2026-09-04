# ExHentai Library Toolkit

All-in-one userscript for ExHentai/E-Hentai: LANraragi duplicate checking, original image ZIP downloads with metadata, favorites, search, and UI enhancements.

适用于 ExHentai / E-Hentai 的一体化油猴脚本：支持 LANraragi 漫画库查重、原图 ZIP 下载与元数据打包、快捷收藏、搜索以及界面增强。

**[简体中文](#简体中文) | [English](#english)**

---

# 简体中文

## 简介

**ExHentai Library Toolkit** 是一个面向 ExHentai / E-Hentai 的一体化油猴脚本，用于增强漫画浏览、下载和本地收藏库管理体验。

脚本将 LANraragi 漫画库查重、纯浏览器原图下载、ZIP 打包、元数据保存、快捷收藏、搜索与界面增强等功能整合到同一个工具中。

## 主要功能

### LANraragi 漫画库查重

- 检查当前画廊是否已经存在于 LANraragi。
- 支持精确匹配与备用搜索。
- 在列表页显示匹配状态，减少重复下载。
- 支持重新扫描与缓存管理。

### 原图 ZIP 下载

- 直接通过浏览器下载原始图片。
- 图片按顺序编号保存。
- 下载完成后自动打包为 ZIP。
- 可将相关元数据一起写入压缩包，方便归档与后续管理。

### 快捷收藏

- 简化收藏操作。
- 在详情页和列表页提供更快捷的收藏方式。

### 搜索增强

- 提供更方便的搜索入口。
- 辅助在网页内容与 LANraragi 本地漫画库之间查找对应项目。

### 浏览与界面增强

- 中文翻译内容高亮。
- LANraragi 匹配状态显示。
- 下载相关状态显示。
- 统一悬浮工具面板。
- 多项可配置的浏览辅助功能。

## 安装

请先安装油猴脚本管理器，例如：

- Tampermonkey
- Violentmonkey

然后使用油猴脚本管理器打开并安装：

```text
ExHentai_Library_Toolkit.user.js
```

安装完成后刷新页面即可使用。

## LANraragi 配置

LANraragi 查重功能为可选功能。

如需使用，请在脚本工具面板中填写自己的 LANraragi 地址和 API Key，例如：

```text
LANraragi 地址：
http://192.168.1.100:3000

API Key：
YOUR_API_KEY
```

LANraragi 地址请根据自己的实际部署环境填写。

> 请勿在公开仓库、Issue、截图或其他公开内容中泄露自己的 LANraragi API Key、Cookie 或其他私人凭据。

## LANraragi 匹配状态

```text
LRR ✔
```

表示已经找到较明确的 LANraragi 匹配结果。

```text
LRR ≈
```

表示通过备用搜索找到可能匹配的结果，建议进入 LANraragi 搜索结果进一步确认。

## 鸣谢与脚本来历

感谢原脚本 **ExHentai Lanraragi Checker**。

**ExHentai Library Toolkit** 是基于 **ExHentai Lanraragi Checker** 进行的二次开发，在原有功能基础上进行了功能整合、调整与扩展，包括 LANraragi 查重、下载、元数据处理、界面增强及其他相关功能。

在此向原脚本及其相关开发工作表示感谢。

## 免责声明

本项目为第三方非官方脚本，与 ExHentai、E-Hentai、LANraragi 及其开发者、运营方不存在官方隶属、授权或合作关系。

本脚本仅作为浏览辅助、本地收藏管理及个人学习研究用途提供。使用者应自行确保其使用方式符合所在地法律法规、相关网站规则以及所访问内容的授权要求。

脚本涉及网络请求、图片下载、本地漫画库访问等功能。由于网站规则变化、网络环境、账号权限、LANraragi 配置、浏览器或油猴脚本管理器差异，部分功能可能失效、受限或产生异常。

使用本脚本所产生的任何账号限制、数据丢失、下载失败、访问异常、服务器压力或其他直接、间接损失，应由使用者自行承担风险。

请合理控制下载频率和并发数量，不要利用本脚本进行恶意请求、批量滥用或其他可能影响网站及服务正常运行的行为。

---

# English

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
