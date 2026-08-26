const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");


// ==================================================
// CONFIG
// ==================================================

const START_URL =
  "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(
  __dirname,
  "..",
  "cache"
);

const USER_AGENT =
  "PoliteScraper/1.0 (educational project)";

const REQUEST_TIMEOUT_MS = 10000;
const REQUEST_DELAY_MS = 500;

const MAX_CATALOGUE_PAGES = 3;


// ==================================================
// SLEEP
// ==================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}


// ==================================================
// CACHE FILE PATH
// ==================================================

function getCachePath(url) {

  const parsedUrl = new URL(url);

  let safeName = parsedUrl.pathname
    .replace(/^\/+/, "")
    .replace(/[\/\\]/g, "_");

  if (!safeName) {
    safeName = "index";
  }

  return path.join(
    CACHE_DIR,
    `${safeName}.html`
  );
}


// ==================================================
// FETCH PAGE
// ==================================================

async function fetchPage(url) {

  await fs.mkdir(
    CACHE_DIR,
    { recursive: true }
  );

  const cachePath = getCachePath(url);


  // ----------------------------------------------
  // CHECK CACHE FIRST
  // ----------------------------------------------

  try {

    const cachedHtml =
      await fs.readFile(
        cachePath,
        "utf8"
      );

    console.log(
      `[CACHE HIT] ${url}`
    );

    return cachedHtml;

  } catch {

    // Cache does not exist.
    // Continue with real HTTP request.

  }


  // ----------------------------------------------
  // REAL NETWORK REQUEST
  // ----------------------------------------------

  console.log(
    `[FETCH] ${url}`
  );

  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );


  try {

    const response = await fetch(
      url,
      {
        headers: {
          "User-Agent": USER_AGENT,
        },

        signal: controller.signal,
      }
    );


    // ------------------------------------------
    // STATUS CHECK
    // ------------------------------------------

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );

    }


    const html =
      await response.text();


    // ------------------------------------------
    // SAVE RESPONSE TO CACHE
    // ------------------------------------------

    await fs.writeFile(
      cachePath,
      html,
      "utf8"
    );


    console.log(
      `[CACHED] ${cachePath}`
    );


    return html;

  } finally {

    clearTimeout(timeout);

  }
}


// ==================================================
// PARSE CATALOGUE PAGE
// ==================================================

function parseCatalogue(
  html,
  pageUrl
) {

  const $ = cheerio.load(html);

  const bookUrls = [];


  // ----------------------------------------------
  // FIND BOOK LINKS
  // ----------------------------------------------

  $(
    "article.product_pod h3 a"
  ).each(
    (_, element) => {

      const href =
        $(element).attr("href");


      if (!href) {
        return;
      }


      // IMPORTANT:
      // Never concatenate URL strings manually.
      // Let the URL class resolve relative URLs.

      const absoluteUrl =
        new URL(
          href,
          pageUrl
        ).href;


      bookUrls.push(
        absoluteUrl
      );

    }
  );


  // ----------------------------------------------
  // FIND NEXT PAGE
  // ----------------------------------------------

  const nextHref =
    $("li.next a").attr("href");


  const nextUrl =
    nextHref
      ? new URL(
          nextHref,
          pageUrl
        ).href
      : null;


  return {
    bookUrls,
    nextUrl,
  };
}


// ==================================================
// MAIN
// ==================================================

async function main() {

  console.log(
    "\n📚 The Polite Scraper"
  );

  console.log(
    "================================"
  );

  console.log(
    "Stage 2: Discover catalogue pages"
  );


  let currentPageUrl =
    START_URL;

  let cataloguePages = 0;

  const discoveredUrls = [];


  // ----------------------------------------------
  // FOLLOW FIRST THREE CATALOGUE PAGES
  // ----------------------------------------------

  while (
    currentPageUrl &&
    cataloguePages <
      MAX_CATALOGUE_PAGES
  ) {

    console.log(
      `\nCatalogue page ${
        cataloguePages + 1
      }`
    );


    // ------------------------------------------
    // FETCH / READ CACHE
    // ------------------------------------------

    const html =
      await fetchPage(
        currentPageUrl
      );


    // ------------------------------------------
    // PARSE PAGE
    // ------------------------------------------

    const {
      bookUrls,
      nextUrl,
    } = parseCatalogue(
      html,
      currentPageUrl
    );


    cataloguePages++;


    // ------------------------------------------
    // COLLECT DISCOVERED BOOKS
    // ------------------------------------------

    discoveredUrls.push(
      ...bookUrls
    );


    console.log(
      `books_found=${bookUrls.length}`
    );


    // Follow site's own Next link.

    currentPageUrl =
      nextUrl;


    // ------------------------------------------
    // POLITE DELAY
    // ------------------------------------------

    if (
      currentPageUrl &&
      cataloguePages <
        MAX_CATALOGUE_PAGES
    ) {

      await sleep(
        REQUEST_DELAY_MS
      );

    }

  }


  // ==================================================
  // REMOVE DUPLICATES
  // ==================================================

  const uniqueUrls = [
    ...new Set(
      discoveredUrls
    ),
  ];


  // ==================================================
  // CHECKPOINT
  // ==================================================

  console.log(
    "\n================================"
  );

  console.log(
    "STAGE 2 CHECKPOINT"
  );

  console.log(
    "================================"
  );

  console.log(
    `catalogue_pages=${cataloguePages}`
  );

  console.log(
    `discovered=${discoveredUrls.length}`
  );

  console.log(
    `unique_urls=${uniqueUrls.length}`
  );


  // ----------------------------------------------
  // OPTIONAL SAMPLE
  // ----------------------------------------------

  console.log(
    "\nFirst discovered book:"
  );

  console.log(
    uniqueUrls[0]
  );

}


// ==================================================
// START SCRAPER
// ==================================================

main().catch(
  (error) => {

    console.error(
      "\nScraper failed:",
      error.message
    );

    process.exitCode = 1;

  }
);