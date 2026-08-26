const fs = require("fs/promises");
const path = require("path");

const START_URL = "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(__dirname, "..", "cache");

const USER_AGENT =
  "PoliteScraper/1.0 (learning project; contact: student developer)";

const REQUEST_TIMEOUT_MS = 10000;
const REQUEST_DELAY_MS = 500;


// --------------------------------------------------
// WAIT BETWEEN REAL NETWORK REQUESTS
// --------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// --------------------------------------------------
// CREATE CACHE FILE NAME
// --------------------------------------------------

function getCachePath(url) {
  const parsedUrl = new URL(url);

  const safeName = parsedUrl.pathname
    .replace(/^\/+/, "")
    .replace(/[\/\\]/g, "_");

  return path.join(CACHE_DIR, `${safeName}.html`);
}


// --------------------------------------------------
// FETCH PAGE WITH CACHE
// --------------------------------------------------

async function fetchPage(url) {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const cachePath = getCachePath(url);

  // Try cache first
  try {
    const cachedHtml = await fs.readFile(cachePath, "utf8");

    console.log(`[CACHE HIT] ${url}`);

    return cachedHtml;
  } catch {
    // File does not exist -> fetch from network
  }

  console.log(`[FETCH] ${url}`);

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const html = await response.text();

    await fs.writeFile(cachePath, html, "utf8");

    console.log(`[CACHED] ${cachePath}`);

    return html;

  } finally {
    clearTimeout(timeout);
  }
}


// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {
  console.log("\n📚 Polite Scraper");
  console.log("------------------------------");

  const html = await fetchPage(START_URL);

  console.log(`HTML characters: ${html.length}`);

  // Delay only represents politeness around real requests.
  // Stage 2 will manage delays between multiple network requests.
  await sleep(REQUEST_DELAY_MS);

  console.log("Stage 1 complete.");
}


main().catch((error) => {
  console.error("Scraper failed:", error.message);
  process.exitCode = 1;
});