const fs = require("fs/promises");
const path = require("path");
const cheerio = require("cheerio");
const { z } = require("zod");


// ==================================================
// CONFIG
// ==================================================

const START_URL =
  "https://books.toscrape.com/catalogue/page-1.html";

const CACHE_DIR =
  path.join(__dirname, "..", "cache");

const OUTPUT_DIR =
  path.join(__dirname, "..", "output");

const BOOKS_FILE =
  path.join(OUTPUT_DIR, "books.json");

const ERRORS_FILE =
  path.join(OUTPUT_DIR, "errors.json");

const USER_AGENT =
  "PoliteScraper/1.0 (educational FlyRank backend project)";

const REQUEST_TIMEOUT_MS = 10000;
const REQUEST_DELAY_MS = 500;
const MAX_CATALOGUE_PAGES = 3;


// ==================================================
// ZOD SCHEMA
// ==================================================

const BookSchema = z.object({
  title: z.string().min(1),

  product_url: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("https://"),
      "product_url must use HTTPS"
    ),

  price_text: z.string().min(1),

  price_gbp: z
    .number()
    .finite()
    .nonnegative(),

  availability_text: z.string().min(1),

  rating_text: z.string().min(1),

  description: z.string().nullable(),

  source_page: z
    .string()
    .url()
    .refine(
      (url) => url.startsWith("https://"),
      "source_page must use HTTPS"
    ),

  fetched_at: z.string().min(1),
});


// ==================================================
// HELPERS
// ==================================================

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}


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
// FETCH + CACHE
// ==================================================

async function fetchPage(url) {
  await fs.mkdir(
    CACHE_DIR,
    { recursive: true }
  );

  const cachePath = getCachePath(url);

  // ---------------- CACHE ----------------

  try {
    const html = await fs.readFile(
      cachePath,
      "utf8"
    );

    console.log(`[CACHE HIT] ${url}`);

    return {
      html,
      fetchedAt: new Date().toISOString(),
      fromCache: true,
    };
  } catch {
    // Cache miss
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

    await fs.writeFile(
      cachePath,
      html,
      "utf8"
    );

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
// PARSE CATALOGUE
// ==================================================

function parseCatalogue(html, pageUrl) {
  const $ = cheerio.load(html);

  const books = [];

  $("article.product_pod h3 a").each(
    (_, element) => {
      const href =
        $(element).attr("href");

      if (!href) return;

      books.push({
        product_url:
          new URL(href, pageUrl).href,

        source_page: pageUrl,
      });
    }
  );


  const nextHref =
    $("li.next a").attr("href");

  const nextUrl = nextHref
    ? new URL(nextHref, pageUrl).href
    : null;


  return {
    books,
    nextUrl,
  };
}


// ==================================================
// DISCOVER FIRST THREE PAGES
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

    const result =
      await fetchPage(currentPageUrl);

    const { books, nextUrl } =
      parseCatalogue(
        result.html,
        currentPageUrl
      );

    discoveredBooks.push(...books);

    cataloguePages++;

    console.log(
      `books_found=${books.length}`
    );

    currentPageUrl = nextUrl;

    if (
      !result.fromCache &&
      currentPageUrl &&
      cataloguePages < MAX_CATALOGUE_PAGES
    ) {
      await sleep(REQUEST_DELAY_MS);
    }
  }


  // Canonical product URL = identity

  const uniqueBooks = [
    ...new Map(
      discoveredBooks.map((book) => [
        book.product_url,
        book,
      ])
    ).values(),
  ];


  return {
    cataloguePages,
    discovered:
      discoveredBooks.length,

    books: uniqueBooks,
  };
}


// ==================================================
// PARSE DETAIL PAGE
// ==================================================

function parseBookPage(
  html,
  productUrl,
  sourcePage,
  fetchedAt
) {
  const $ = cheerio.load(html);

  const productMain =
    $(".product_main");


  const title =
    productMain
      .find("h1")
      .first()
      .text()
      .trim();


  const priceText =
    productMain
      .find(".price_color")
      .first()
      .text()
      .trim();


  const availabilityText =
    productMain
      .find(".availability")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();


  const ratingClasses =
    productMain
      .find(".star-rating")
      .first()
      .attr("class") || "";


  const ratingText =
    ratingClasses
      .split(/\s+/)
      .find(
        (className) =>
          className !== "star-rating"
      ) || "";


  // ---------------- DESCRIPTION ----------------

  let description = null;

  const descriptionHeading =
    $("#product_description");

  if (descriptionHeading.length) {
    const paragraph =
      descriptionHeading.next("p");

    if (paragraph.length) {
      const text = paragraph
        .text()
        .replace(/\s+/g, " ")
        .trim();

      if (text) {
        description = text;
      }
    }
  }


  // RAW RECORD

  return {
    title,
    product_url: productUrl,
    price_text: priceText,
    availability_text:
      availabilityText,
    rating_text: ratingText,
    description,
    source_page: sourcePage,
    fetched_at: fetchedAt,
  };
}


// ==================================================
// NORMALIZE PRICE
// ==================================================

function normalizePrice(priceText) {
  if (typeof priceText !== "string") {
    return NaN;
  }

  const cleaned = priceText
    .replace("£", "")
    .trim();

  return Number(cleaned);
}


// ==================================================
// NORMALIZE RECORD
// ==================================================

function normalizeRecord(rawRecord) {
  return {
    ...rawRecord,

    price_gbp:
      normalizePrice(
        rawRecord.price_text
      ),
  };
}


// ==================================================
// VALIDATE RECORD
// ==================================================

function validateRecord(record) {
  const result =
    BookSchema.safeParse(record);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }


  return {
    success: false,

    error:
      result.error.issues
        .map((issue) => {
          const field =
            issue.path.join(".");

          return `${field}: ${issue.message}`;
        })
        .join("; "),
  };
}


// ==================================================
// EXTRACT + VALIDATE ALL BOOKS
// ==================================================

async function processBooks(books) {
  const validRecords = [];
  const errors = [];


  for (
    let i = 0;
    i < books.length;
    i++
  ) {
    const book = books[i];

    console.log(
      `Book ${i + 1}/${books.length}`
    );


    try {
      const result =
        await fetchPage(
          book.product_url
        );


      const rawRecord =
        parseBookPage(
          result.html,
          book.product_url,
          book.source_page,
          result.fetchedAt
        );


      const normalizedRecord =
        normalizeRecord(rawRecord);


      const validation =
        validateRecord(
          normalizedRecord
        );


      if (validation.success) {
        validRecords.push(
          validation.data
        );
      } else {
        errors.push({
          product_url:
            book.product_url,

          reason:
            validation.error,
        });
      }


      if (
        !result.fromCache &&
        i < books.length - 1
      ) {
        await sleep(
          REQUEST_DELAY_MS
        );
      }

    } catch (error) {
      errors.push({
        product_url:
          book.product_url,

        reason:
          error.message,
      });
    }
  }


  return {
    validRecords,
    errors,
  };
}


// ==================================================
// DEDUPLICATE FINAL RECORDS
// ==================================================

function deduplicateRecords(records) {
  const recordMap = new Map();

  for (const record of records) {
    recordMap.set(
      record.product_url,
      record
    );
  }

  return [...recordMap.values()];
}


// ==================================================
// WRITE OUTPUT
// ==================================================

async function writeOutput(
  validRecords,
  errors
) {
  await fs.mkdir(
    OUTPUT_DIR,
    { recursive: true }
  );


  const uniqueRecords =
    deduplicateRecords(
      validRecords
    );


  // IMPORTANT:
  // overwrite instead of append
  // makes the run idempotent.

  await fs.writeFile(
    BOOKS_FILE,
    JSON.stringify(
      uniqueRecords,
      null,
      2
    ),
    "utf8"
  );


  await fs.writeFile(
    ERRORS_FILE,
    JSON.stringify(
      errors,
      null,
      2
    ),
    "utf8"
  );


  return uniqueRecords;
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
    "Stage 4: Normalize, validate and store"
  );


  // ---------------- DISCOVERY ----------------

  const discovery =
    await discoverBooks();


  console.log(
    "\n================================"
  );

  console.log("DISCOVERY");

  console.log(
    "================================"
  );

  console.log(
    `catalogue_pages=${discovery.cataloguePages}`
  );

  console.log(
    `discovered=${discovery.discovered}`
  );

  console.log(
    `unique_urls=${discovery.books.length}`
  );


  // ---------------- PROCESS ----------------

  console.log(
    "\nProcessing book details...\n"
  );


  const {
    validRecords,
    errors,
  } = await processBooks(
    discovery.books
  );


  const storedRecords =
    await writeOutput(
      validRecords,
      errors
    );


  // ==================================================
  // STAGE 4 CHECKPOINT
  // ==================================================

  console.log(
    "\n================================"
  );

  console.log(
    "STAGE 4 CHECKPOINT"
  );

  console.log(
    "================================"
  );

  console.log(
    `valid_records=${storedRecords.length}`
  );

  console.log(
    `invalid_records=${errors.length}`
  );

  console.log(
    `books_json_records=${storedRecords.length}`
  );


  const allPricesNumbers =
    storedRecords.every(
      (book) =>
        typeof book.price_gbp ===
          "number" &&
        Number.isFinite(
          book.price_gbp
        )
    );


  const allHttps =
    storedRecords.every(
      (book) =>
        book.product_url.startsWith(
          "https://"
        )
    );


  console.log(
    `all_prices_numeric=${allPricesNumbers}`
  );

  console.log(
    `all_urls_https=${allHttps}`
  );


  console.log(
    "\nSample normalized record:\n"
  );

  console.log(
    JSON.stringify(
      storedRecords[0],
      null,
      2
    )
  );


  console.log(
    "\nOutput:"
  );

  console.log(
    "output/books.json"
  );

  console.log(
    "output/errors.json"
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