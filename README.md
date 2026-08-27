# 📚 The Polite Scraper

<div align="center">

### A Polite, Cache-First Web Scraping Pipeline

Built using **Node.js • JavaScript • Cheerio • Zod**

<br>

<img src="https://skillicons.dev/icons?i=nodejs,js" alt="Node.js and JavaScript" />

<br><br>

![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Cheerio](https://img.shields.io/badge/Cheerio-HTML%20Parsing-E88C1F?style=for-the-badge)
![Zod](https://img.shields.io/badge/Zod-Validation-3E67B1?style=for-the-badge)
![JSON](https://img.shields.io/badge/Output-JSON-000000?style=for-the-badge&logo=json&logoColor=white)

</div>

---

## 📌 About the Project

**The Polite Scraper** is a Node.js web-scraping pipeline created to collect structured book information from **Books to Scrape**, a website designed for web-scraping practice.

The goal of the project is not simply to extract data, but to build a scraper that behaves responsibly and reliably.

The scraper:

- processes the first **3 catalogue pages**
- discovers book URLs dynamically
- extracts detailed information from each book page
- caches downloaded HTML
- avoids duplicate URLs
- normalizes raw values
- validates records using Zod
- handles individual page failures without crashing
- stores valid and invalid records separately
- generates a report for every run

The first three catalogue pages contain:

```text
3 catalogue pages
20 books per page
60 discovered books
60 unique book URLs
```

---

## 🎯 Project Objectives

The main objectives of this assignment were to understand and implement:

- responsible web scraping
- HTTP request handling
- HTML parsing
- pagination
- URL discovery
- caching
- data extraction
- normalization
- schema validation
- deduplication
- idempotent output
- retry logic
- failure isolation
- run reporting

---

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| JavaScript | Main programming language |
| Cheerio | HTML parsing and DOM traversal |
| Zod | Runtime schema validation |
| Fetch API | HTTP requests |
| File System API | Cache and output storage |
| JSON | Structured output format |
| Git | Version control |
| GitHub | Source-code hosting |

---

## 🌐 Target Website

The scraper uses the public scraping practice website:

**Books to Scrape**

The target is intentionally limited to the first three catalogue pages.

```text
Catalogue pages: 3
Books per page: 20
Expected unique books: 60
Authentication required: No
JavaScript rendering required: No
```

The information required by the scraper is already available in the HTML response, so browser automation is unnecessary.

---

## 🤖 Robots Check

Before implementing the scraper, the standard robots file location was checked.

```text
GET /robots.txt

Result:
404 Not Found
```

No `robots.txt` file was available at the standard location during the check.

A missing robots file was not treated as unlimited permission to crawl the website. The scraper therefore still uses conservative scraping practices such as:

- limited scope
- request delays
- local caching
- request timeouts
- an identifying User-Agent
- controlled retry behavior

---

## 🤝 Polite Scraping Strategy

The scraper is intentionally designed to reduce unnecessary traffic.

### Request Rules

```text
User-Agent      → Identifies the scraper
Delay           → At least 500 ms between real requests
Timeout         → 10 seconds
HTTP status     → Checked before parsing
Caching         → Enabled
5xx / timeout   → Retry once
404 / 403       → Do not retry
Scope           → First 3 catalogue pages only
```

When a page already exists in the local cache, the scraper reads the cached HTML instead of requesting the page again.

This makes repeated runs significantly faster while avoiding unnecessary network traffic.

---

## 🏗️ Scraping Pipeline

```text
Target Classification
        │
        ▼
Fetch Catalogue Page
        │
        ▼
Check / Store Cache
        │
        ▼
Parse HTML with Cheerio
        │
        ▼
Discover Book URLs
        │
        ▼
Follow Pagination
        │
        ▼
Deduplicate URLs
        │
        ▼
Fetch Book Detail Pages
        │
        ▼
Extract Raw Records
        │
        ▼
Normalize Data
        │
        ▼
Validate with Zod
        │
        ├───────────────┐
        ▼               ▼
   Valid Record    Invalid Record
        │               │
        ▼               ▼
   books.json       errors.json
        │
        └───────┬───────┘
                ▼
        run-report.json
```

---

## 📁 Project Structure

```text
polite-scraper/
│
├── src/
│   └── index.js
│
├── cache/
│   └── cached HTML pages
│
├── output/
│   ├── books.json
│   ├── errors.json
│   └── run-report.json
│
├── .gitignore
├── package.json
├── package-lock.json
└── README.md
```

The `cache/` directory is generated locally and can be excluded from version control.

The `node_modules/` directory is also excluded from Git.

---

# 🚀 Assignment Stages

## Stage 0 — Target Classification

The target website was inspected before writing the scraper.

The following questions were considered:

- Is authentication required?
- Is JavaScript rendering required?
- Is the required data available directly in HTML?
- Is pagination available through normal links?
- Is a browser automation framework necessary?
- Is a robots file available?

The website provides the required data directly through HTML responses.

Therefore, the scraper can use standard HTTP requests and Cheerio rather than browser automation.

---

## Stage 1 — Fetch and Cache

The first stage implemented a reusable page-fetching mechanism.

The fetcher:

1. converts the URL into a cache filename
2. checks whether the page already exists locally
3. returns cached HTML when available
4. waits before a real network request
5. sends an identifying User-Agent
6. applies a request timeout
7. checks the HTTP response
8. saves successful HTML locally

Example first run:

```text
📚 Polite Scraper
------------------------------

[FETCH] catalogue/page-1.html
[CACHED] cache/catalogue_page-1.html.html

HTML characters: 50449

Stage 1 complete.
```

Example second run:

```text
📚 Polite Scraper
------------------------------

[CACHE HIT] catalogue/page-1.html

HTML characters: 50449

Stage 1 complete.
```

The second run avoids another network request.

---

## Stage 2 — Discover Catalogue Pages

The scraper was then extended to process the first three catalogue pages.

Instead of manually constructing every book URL, the scraper reads the links present in each catalogue page.

Relative URLs are converted into absolute URLs using JavaScript's URL API.

```js
new URL(href, pageUrl).href
```

The scraper also follows the catalogue pagination links.

### Stage 2 Checkpoint

```text
catalogue_pages=3
discovered=60
unique_urls=60
```

This confirms that:

- exactly three catalogue pages were processed
- 60 book links were discovered
- all 60 URLs were unique

---

## Stage 3 — Extract Raw Book Records

After discovering the book URLs, the scraper visits each individual book page.

Each raw record contains:

```text
title
product_url
price_text
availability_text
rating_text
description
source_page
fetched_at
```

Example raw record:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_text": "£51.77",
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": "Book description...",
  "source_page": "https://books.toscrape.com/catalogue/page-1.html",
  "fetched_at": "2026-08-26T09:13:20.230Z"
}
```

### Provenance

Two additional fields help identify where and when the data came from:

```text
source_page
fetched_at
```

This makes the extracted data easier to trace.

### Stage 3 Checkpoint

```text
detail_pages=60
```

All 60 discovered book pages were successfully processed during the normal run.

---

## Stage 4 — Normalize, Validate and Store

Raw scraped data is not immediately written to the final dataset.

It is first normalized and validated.

### Price Normalization

The original value is preserved:

```text
price_text = "£51.77"
```

A numeric representation is also created:

```text
price_gbp = 51.77
```

This gives the dataset both:

- original source representation
- machine-friendly numeric representation

Example normalized record:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_text": "£51.77",
  "price_gbp": 51.77,
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": "Book description...",
  "source_page": "https://books.toscrape.com/catalogue/page-1.html",
  "fetched_at": "2026-08-26T09:19:59.452Z"
}
```

---

## ✅ Schema Validation

Each normalized record is validated using **Zod**.

The validation rules verify fields such as:

```text
title               → required string
product_url         → valid HTTPS URL
price_text          → required string
price_gbp           → finite numeric value
availability_text   → required string
rating_text         → required string
description         → string or null
source_page         → valid HTTPS URL
fetched_at          → valid datetime
```

Valid records are stored in:

```text
output/books.json
```

Invalid records are stored in:

```text
output/errors.json
```

### Stage 4 Checkpoint

```text
valid_records=60
invalid_records=0
books_json_records=60
all_prices_numeric=true
all_urls_https=true
```

All 60 records passed validation.

---

## 🔁 Deduplication and Idempotency

The canonical `product_url` is used as the identity of each book.

Before writing output, duplicate records are removed.

The scraper also overwrites the generated dataset rather than blindly appending records.

Therefore, running the scraper multiple times does not continuously duplicate data.

Expected behavior:

```text
Run 1 → 60 records
Run 2 → 60 records
Run 3 → 60 records
```

Instead of:

```text
Run 1 → 60
Run 2 → 120
Run 3 → 180
```

This makes the scraping process idempotent.

---

## Stage 5 — Failure Handling and Reporting

A reliable scraper should not terminate the complete run because one page fails.

Each book page is therefore processed independently.

If one page cannot be downloaded, the failure is recorded and the scraper continues processing the remaining pages.

### Retry Policy

```text
Timeout → Retry once
5xx     → Retry once
404     → No retry
403     → No retry
```

A fake book URL was deliberately added during Stage 5 to verify the failure behavior.

The fake page returned:

```text
HTTP 404
```

The scraper correctly:

- detected the failure
- did not retry the 404
- recorded the failure
- continued execution
- preserved all 60 valid books
- generated the final report

### Stage 5 Checkpoint

```text
catalogue_pages=3
unique_urls=60
valid_records=60
invalid_records=0
failed_pages=1
pages_fetched=0
cache_hits=63
duration_seconds=2.33
```

The important result is:

```text
60 valid records survived
1 page failed
the scraper did not crash
```

---

## 📊 Run Reporting

Every completed run generates:

```text
output/run-report.json
```

The report contains information such as:

```text
start_time
duration_ms
duration_seconds
catalogue_pages
discovered_urls
unique_urls
pages_fetched
cache_hits
valid_records
invalid_records
failed_pages
finished_at
```

Example Stage 5 report:

```json
{
  "start_time": "2026-08-26T10:04:36.278Z",
  "duration_ms": 2330,
  "duration_seconds": 2.33,
  "catalogue_pages": 3,
  "discovered_urls": 60,
  "unique_urls": 60,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 1,
  "finished_at": "2026-08-26T10:04:38.666Z"
}
```

The example run had:

```text
pages_fetched=0
cache_hits=63
```

because the previously downloaded catalogue and book pages were already available in the local cache.

---

# 📤 Output Files

The scraper generates three main files.

## `output/books.json`

Contains successfully normalized and validated book records.

```text
Expected records: 60
```

---

## `output/errors.json`

Contains records or pages that could not be successfully processed or validated.

During a normal successful run this file may contain no validation errors.

---

## `output/run-report.json`

Contains metrics describing the complete scraping run.

This makes it easier to understand:

- how many pages were processed
- how much caching was used
- how many records succeeded
- how many pages failed
- how long the scraper took

---

# ⚡ Cache-First Design

Caching is one of the most important features of this scraper.

Without caching:

```text
Run scraper
      ↓
Request all catalogue pages
      ↓
Request all book pages
      ↓
Repeat network traffic every run
```

With caching:

```text
Request URL
     │
     ▼
Cache exists?
   /       \
 YES       NO
  │         │
  ▼         ▼
Read      Wait
local       │
HTML        ▼
          Fetch
            │
            ▼
          Cache
            │
            ▼
           HTML
```

Benefits include:

- fewer network requests
- faster development
- faster repeated runs
- reduced server load
- easier debugging
- more responsible scraping

---

# 🛡️ Reliability Features

The project includes several defensive mechanisms.

### Timeout

Requests cannot wait indefinitely.

```text
Timeout = 10 seconds
```

### HTTP Status Checking

Responses are checked before HTML is parsed.

### Controlled Retry

Only temporary failures such as timeout or server-side errors are retried.

### Failure Isolation

One failed book page does not terminate the complete scraper.

### Validation

Malformed records do not silently enter the final dataset.

### Deduplication

The same canonical product URL cannot produce duplicate final records.

### Caching

Repeated runs avoid unnecessary requests.

---

# 🚀 Running the Project

## 1. Clone the Repository

```bash
git clone https://github.com/100rabheimer/polite-scraper.git
```

Enter the project:

```bash
cd polite-scraper
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Run the Scraper

```bash
node src/index.js
```

The scraper will process the first three catalogue pages and generate the output files.

---

## 4. View Generated Data

The generated files can be found inside:

```text
output/
```

including:

```text
output/books.json
output/errors.json
output/run-report.json
```

---

# 🧪 Expected Normal Run

A normal production run should discover:

```text
catalogue_pages=3
discovered=60
unique_urls=60
valid_records=60
```

When all target pages succeed:

```text
invalid_records=0
failed_pages=0
```

The Stage 5 assignment test intentionally introduced one fake URL, so its evidence report contains:

```text
failed_pages=1
```

That failure was deliberate and demonstrates that the scraper can survive an individual page failure.

---

# 📋 Assignment Checkpoints

| Stage | Goal | Result |
|---|---|---|
| Stage 0 | Classify target | ✅ Complete |
| Stage 1 | Fetch and cache HTML | ✅ Complete |
| Stage 2 | Discover first 3 catalogue pages | ✅ Complete |
| Stage 3 | Extract raw book records | ✅ Complete |
| Stage 4 | Normalize and validate | ✅ Complete |
| Stage 5 | Survive failures and report | ✅ Complete |

Final verified dataset:

```text
Catalogue Pages: 3
Unique Books: 60
Valid Records: 60
Invalid Records: 0
Numeric Prices: Yes
HTTPS Product URLs: Yes
Caching: Enabled
Validation: Enabled
Failure Isolation: Enabled
Run Reporting: Enabled
```

---

# 🧭 Why Cheerio Instead of a Browser?

Browser automation tools are useful when a website requires JavaScript execution to produce the required content.

That is not necessary for this target.

The required book data is already available in the HTML returned by the server.

Therefore:

```text
HTTP Fetch
    +
Cheerio
```

is simpler and more efficient than launching a browser.

Using browser automation here would add:

- additional dependencies
- browser startup time
- increased memory usage
- additional complexity

without providing useful additional data for this assignment.

---

# ⚠️ Limitations

This scraper is intentionally small and assignment-focused.

Current limitations include:

- only the first three catalogue pages are processed
- selectors depend on the current target HTML structure
- output is stored locally as JSON
- scraping is sequential rather than distributed
- there is no database
- there is no scheduling system
- there is no production crawler infrastructure

If the target website changes its HTML structure, some selectors may need to be updated.

---

# ⚖️ Responsible Scraping

Web scraping should be performed responsibly.

General principles followed by this project include:

- prefer an official API when one is available
- check published crawling guidance
- avoid unnecessary repeated requests
- limit collection to required data
- identify automated clients where appropriate
- use caching
- use reasonable request delays
- never bypass authentication or access restrictions
- never attempt to defeat anti-bot protections

The purpose of this project is to learn reliable data extraction, not to bypass website protections.

---

# 💡 Key Learnings

This assignment provided hands-on experience with several backend and data-engineering concepts.

### Web Fundamentals

- HTTP requests
- HTTP status codes
- URLs
- relative vs absolute URLs
- request headers
- timeouts

### Web Scraping

- HTML parsing
- CSS selectors
- pagination
- link discovery
- detail-page extraction

### Data Engineering

- raw data
- normalization
- schema validation
- canonical identities
- deduplication
- provenance
- idempotency

### Reliability

- local caching
- retry strategies
- failure isolation
- timeout handling
- error reporting
- run metrics

### Software Engineering

- incremental development
- Git commits
- reproducible execution
- structured output
- documentation

---

# 🔮 Possible Improvements

The project could later be extended with:

- configurable number of catalogue pages
- CLI arguments
- concurrency with rate limiting
- persistent database storage
- automated tests
- structured logging
- Docker support
- scheduled scraping
- incremental crawling
- metrics dashboard

These are intentionally outside the scope of the current assignment.

---

# 👨‍💻 Author

**Saurabh Pandey**

Backend Development • Node.js • APIs • Data Engineering

---

<div align="center">

## 📚 The Polite Scraper

**Discover → Fetch → Cache → Extract → Normalize → Validate → Report**

**60 Unique Books • Cache-First • Validated JSON • Failure-Safe Scraping**

</div>
