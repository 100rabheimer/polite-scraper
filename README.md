# 📚 The Polite Scraper

<div align="center">

### A polite, cache-first web scraping pipeline

Built for **FlyRank Backend Track — Assignment 5**

<br>

<img src="https://skillicons.dev/icons?i=nodejs,js" alt="Node.js JavaScript" />

<br><br>

<img src="https://img.shields.io/badge/Node.js-22+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js">
<img src="https://img.shields.io/badge/Cheerio-HTML_Parsing-E88C1F?style=flat-square" alt="Cheerio">
<img src="https://img.shields.io/badge/Zod-Validation-3E67B1?style=flat-square" alt="Zod">
<img src="https://img.shields.io/badge/Status-Stage_0-blue?style=flat-square" alt="Stage 0">

</div>

---

## 🎯 About

**The Polite Scraper** is a small web-scraping pipeline built with Node.js.

The project uses the **Books to Scrape** practice website to learn how to collect public web data responsibly while focusing on:

- target classification
- robots rules
- polite HTTP requests
- request delays
- caching
- HTML parsing
- URL discovery
- structured data extraction
- schema validation
- failure handling
- provenance
- idempotent output

The scraper is intentionally limited to the **first three catalogue pages**.

---

## 🛠️ Tech Stack

<div align="center">

| Technology | Purpose |
| :---: | --- |
| <img src="https://skillicons.dev/icons?i=nodejs" width="45"><br>**Node.js** | JavaScript runtime |
| <img src="https://skillicons.dev/icons?i=js" width="45"><br>**JavaScript** | Core language |
| **Cheerio** | HTML parsing and element selection |
| **Zod** | Record schema validation |
| **Fetch API** | HTTP requests |
| **JSON** | Structured output |

</div>

---

## 🗺️ Assignment Pipeline

```text
Target Classification
        ↓
Fetch + Cache
        ↓
Discover 3 Catalogue Pages
        ↓
Discover 60 Book URLs
        ↓
Extract Raw Book Records
        ↓
Normalize Data
        ↓
Validate with Zod
        ↓
Store Valid Records
        ↓
Handle Failed Pages
        ↓
Generate Run Report