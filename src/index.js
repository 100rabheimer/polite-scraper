const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");


// ==================================================
// CONFIG
// ==================================================

const START_URL =
  "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR = path.join(__dirname, "..", "cache");

const USER_AGENT =
  "PoliteScraper/1.0 (educational FlyRank backend project)";

const REQUEST_TIMEOUT_MS = 10000;
const REQUEST_DELAY_MS = 500;

const MAX_CATALOGUE_PAGES = 3;


// ==================================================
// HELPERS
// ==================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


function getCachePath(url) {
  const parsedUrl = new URL(url);

  let safeName = parsedUrl.pathname
    .replace(/^\/+/, "")
    .replace(/[\/\\]/g, "_");

  if (!safeName) {
    safeName = "index";
  }

  return path.join(CACHE_DIR, `${safeName}.html`);
}


// ==================================================
// FETCH + CACHE
// ==================================================

async function fetchPage(url) {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const cachePath = getCachePath(url);

  // ---------------- CACHE ----------------

  try {
    const html = await fs.readFile(cachePath, "utf8");

    console.log(`[CACHE HIT] ${url}`);

    return {
      html,
      fetchedAt: new Date().toISOString(),
      fromCache: true,
    };
  } catch {
    // Cache miss → continue to network request
  }


  // ---------------- NETWORK ----------------

  console.log(`[FETCH] ${url}`);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

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

    console.log(`[CACHED] ${url}`);

    return {
      html,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}


// ==================================================
// CATALOGUE PARSER
// ==================================================

function parseCatalogue(html, pageUrl) {
  const $ = cheerio.load(html);

  const books = [];

  $("article.product_pod h3 a").each((_, element) => {
    const href = $(element).attr("href");

    if (!href) {
      return;
    }

    books.push({
      product_url: new URL(href, pageUrl).href,
      source_page: pageUrl,
    });
  });


  const nextHref = $("li.next a").attr("href");

  const nextUrl = nextHref
    ? new URL(nextHref, pageUrl).href
    : null;


  return {
    books,
    nextUrl,
  };
}


// ==================================================
// DISCOVER BOOKS
// ==================================================

async function discoverBooks() {
  let currentPageUrl = START_URL;

  let cataloguePages = 0;

  const discoveredBooks = [];


  while (
    currentPageUrl &&
    cataloguePages < MAX_CATALOGUE_PAGES
  ) {
    console.log(
      `\nCatalogue page ${cataloguePages + 1}`
    );

    const result = await fetchPage(currentPageUrl);

    const { books, nextUrl } = parseCatalogue(
      result.html,
      currentPageUrl
    );

    discoveredBooks.push(...books);

    cataloguePages++;

    console.log(`books_found=${books.length}`);

    currentPageUrl = nextUrl;


    // Delay only if another catalogue page may require
    // a real request.
    if (
      currentPageUrl &&
      cataloguePages < MAX_CATALOGUE_PAGES
    ) {
      await sleep(REQUEST_DELAY_MS);
    }
  }


  // Remove duplicate canonical product URLs

  const uniqueMap = new Map();

  for (const book of discoveredBooks) {
    if (!uniqueMap.has(book.product_url)) {
      uniqueMap.set(book.product_url, book);
    }
  }


  return {
    cataloguePages,
    discovered: discoveredBooks.length,
    books: [...uniqueMap.values()],
  };
}


// ==================================================
// BOOK DETAIL PARSER
// ==================================================

function parseBookPage(
  html,
  productUrl,
  sourcePage,
  fetchedAt
) {
  const $ = cheerio.load(html);


  // Product area only

  const productMain = $(".product_main");


  // ---------------- TITLE ----------------

  const title =
    productMain.find("h1").first().text().trim();


  // ---------------- PRICE ----------------

  const priceText =
    productMain
      .find(".price_color")
      .first()
      .text()
      .trim();


  // ---------------- AVAILABILITY ----------------

  const availabilityText =
    productMain
      .find(".availability")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();


  // ---------------- RATING ----------------

  const ratingElement =
    productMain.find(".star-rating").first();

  const ratingClasses =
    ratingElement.attr("class") || "";

  const ratingText =
    ratingClasses
      .split(/\s+/)
      .find(
        (className) =>
          className !== "star-rating"
      ) || null;


  // ---------------- DESCRIPTION ----------------

  const descriptionHeading =
    $("#product_description");

  let description = null;

  if (descriptionHeading.length > 0) {
    const descriptionParagraph =
      descriptionHeading.next("p");

    if (descriptionParagraph.length > 0) {
      const text = descriptionParagraph
        .text()
        .replace(/\s+/g, " ")
        .trim();

      description =
        text.length > 0 ? text : null;
    }
  }


  // ==================================================
  // RAW RECORD
  // ==================================================

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text: availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: fetchedAt,
  };
}


// ==================================================
// EXTRACT ALL DETAILS
// ==================================================

async function extractBookDetails(books) {
  const rawRecords = [];

  let detailPages = 0;


  for (let i = 0; i < books.length; i++) {
    const book = books[i];

    console.log(
      `\nBook ${i + 1}/${books.length}`
    );

    const result = await fetchPage(
      book.product_url
    );


    const record = parseBookPage(
      result.html,
      book.product_url,
      book.source_page,
      result.fetchedAt
    );


    rawRecords.push(record);

    detailPages++;


    // Only wait after a real HTTP request.
    // Cache hits never leave the computer.

    if (
      !result.fromCache &&
      i < books.length - 1
    ) {
      await sleep(REQUEST_DELAY_MS);
    }
  }


  return {
    rawRecords,
    detailPages,
  };
}


// ==================================================
// MAIN
// ==================================================

async function main() {
  console.log("\n📚 The Polite Scraper");
  console.log("================================");

  console.log(
    "Stage 3: Extract raw book records"
  );


  // ==================================================
  // DISCOVERY
  // ==================================================

  const discovery = await discoverBooks();


  console.log("\n================================");
  console.log("DISCOVERY");
  console.log("================================");

  console.log(
    `catalogue_pages=${discovery.cataloguePages}`
  );

  console.log(
    `discovered=${discovery.discovered}`
  );

  console.log(
    `unique_urls=${discovery.books.length}`
  );


  // ==================================================
  // DETAIL EXTRACTION
  // ==================================================

  const {
    rawRecords,
    detailPages,
  } = await extractBookDetails(
    discovery.books
  );


  // ==================================================
  // STAGE 3 CHECKPOINT
  // ==================================================

  console.log("\n================================");
  console.log("STAGE 3 CHECKPOINT");
  console.log("================================");

  console.log(`detail_pages=${detailPages}`);

  console.log("\nComplete raw record:\n");

  console.log(
    JSON.stringify(
      rawRecords[0],
      null,
      2
    )
  );
}


// ==================================================
// START
// ==================================================

main().catch((error) => {
  console.error(
    "\nScraper failed:",
    error.message
  );

  process.exitCode = 1;
});