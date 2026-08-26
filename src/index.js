const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");
const { z } = require("zod");

// ======================================================
// CONFIGURATION
// ======================================================

const START_URL =
    "https://books.toscrape.com/catalogue/page-1.html";

const MAX_CATALOGUE_PAGES = 3;

const REQUEST_DELAY_MS = 500;
const REQUEST_TIMEOUT_MS = 10000;

const USER_AGENT =
    "PoliteScraper/1.0 (educational project; respectful caching enabled)";

const CACHE_DIR = path.join(__dirname, "..", "cache");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

const BOOKS_FILE = path.join(OUTPUT_DIR, "books.json");
const ERRORS_FILE = path.join(OUTPUT_DIR, "errors.json");
const REPORT_FILE = path.join(OUTPUT_DIR, "run-report.json");

// Stage 5 failure test.
// Keep true while proving failure handling.
// Change to false after the checkpoint is verified.
const TEST_FAILURE = false;

const FAKE_BOOK_URL =
    "https://books.toscrape.com/catalogue/this-book-does-not-exist-stage5-test/index.html";


// ======================================================
// RUN STATISTICS
// ======================================================

const stats = {
    start_time: new Date().toISOString(),
    pages_fetched: 0,
    cache_hits: 0,
    valid_records: 0,
    invalid_records: 0,
    failed_pages: 0
};


// ======================================================
// CREATE DIRECTORIES
// ======================================================

fs.mkdirSync(CACHE_DIR, {
    recursive: true
});

fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
});


// ======================================================
// ZOD SCHEMA
// ======================================================

const BookSchema = z.object({

    title: z.string().min(1),

    product_url: z
        .string()
        .url()
        .startsWith("https://"),

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
        .startsWith("https://"),

    fetched_at: z
        .string()
        .datetime()

});


// ======================================================
// HELPERS
// ======================================================

function sleep(ms) {

    return new Promise(resolve => {

        setTimeout(resolve, ms);

    });

}


function getCacheFilePath(url) {

    const parsed = new URL(url);

    let filename =
        parsed.pathname
            .replace(/^\/+/, "")
            .replace(/[\/\\:*?"<>|]/g, "_");

    if (!filename) {

        filename = "index";

    }

    return path.join(
        CACHE_DIR,
        `${filename}.html`
    );

}


// ======================================================
// HTTP REQUEST
// ======================================================

async function requestPage(url) {

    const controller =
        new AbortController();

    const timeout = setTimeout(() => {

        controller.abort();

    }, REQUEST_TIMEOUT_MS);


    try {

        const response = await fetch(url, {

            headers: {

                "User-Agent": USER_AGENT

            },

            signal: controller.signal

        });


        return response;

    }

    finally {

        clearTimeout(timeout);

    }

}


// ======================================================
// FETCH WITH ONE RETRY
// ======================================================

async function fetchWithRetry(url) {

    const MAX_ATTEMPTS = 2;

    for (
        let attempt = 1;
        attempt <= MAX_ATTEMPTS;
        attempt++
    ) {

        try {

            console.log(
                `[FETCH] ${url} (attempt ${attempt})`
            );


            const response =
                await requestPage(url);


            // ------------------------------------------
            // DO NOT RETRY 403 OR 404
            // ------------------------------------------

            if (
                response.status === 403 ||
                response.status === 404
            ) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            // ------------------------------------------
            // RETRY SERVER ERRORS
            // ------------------------------------------

            if (response.status >= 500) {

                if (attempt < MAX_ATTEMPTS) {

                    console.log(
                        `[RETRY] Server returned ${response.status}`
                    );

                    await sleep(1000);

                    continue;

                }

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            // ------------------------------------------
            // OTHER BAD STATUS CODES
            // ------------------------------------------

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }


            const html =
                await response.text();


            stats.pages_fetched++;


            return html;

        }

        catch (error) {

            const isTimeout =
                error.name === "AbortError";


            // 403 / 404 should immediately escape.
            if (
                error.message === "HTTP 403" ||
                error.message === "HTTP 404"
            ) {

                throw error;

            }


            // Timeout/network failure:
            // retry only once.
            if (
                attempt < MAX_ATTEMPTS
            ) {

                console.log(
                    `[RETRY] ${
                        isTimeout
                            ? "Request timed out"
                            : error.message
                    }`
                );

                await sleep(1000);

                continue;

            }


            throw error;

        }

    }

}


// ======================================================
// CACHE-AWARE FETCH
// ======================================================

async function fetchPage(url) {

    const cacheFile =
        getCacheFilePath(url);


    if (fs.existsSync(cacheFile)) {

        stats.cache_hits++;

        console.log(
            `[CACHE HIT] ${url}`
        );

        return fs.readFileSync(
            cacheFile,
            "utf8"
        );

    }


    // At least 500ms before a real request.
    await sleep(REQUEST_DELAY_MS);


    const html =
        await fetchWithRetry(url);


    fs.writeFileSync(
        cacheFile,
        html,
        "utf8"
    );


    console.log(
        `[CACHED] ${url}`
    );


    return html;

}


// ======================================================
// DISCOVER BOOK LINKS
// ======================================================

function extractBookLinks(
    html,
    cataloguePageUrl
) {

    const $ = cheerio.load(html);

    const books = [];


    $("article.product_pod h3 a")
        .each((_, element) => {

            const href =
                $(element).attr("href");


            if (!href) {

                return;

            }


            const absoluteUrl =
                new URL(
                    href,
                    cataloguePageUrl
                ).href;


            books.push({

                product_url:
                    absoluteUrl,

                source_page:
                    cataloguePageUrl

            });

        });


    return books;

}


// ======================================================
// FIND NEXT CATALOGUE PAGE
// ======================================================

function getNextPageUrl(
    html,
    currentPageUrl
) {

    const $ = cheerio.load(html);

    const href =
        $("li.next a")
            .attr("href");


    if (!href) {

        return null;

    }


    return new URL(
        href,
        currentPageUrl
    ).href;

}


// ======================================================
// DISCOVER FIRST THREE CATALOGUE PAGES
// ======================================================

async function discoverBooks() {

    const discoveredBooks = [];

    let currentPageUrl =
        START_URL;

    let cataloguePages = 0;


    while (
        currentPageUrl &&
        cataloguePages < MAX_CATALOGUE_PAGES
    ) {

        cataloguePages++;


        console.log(
            `\nCatalogue page ${cataloguePages}`
        );


        const html =
            await fetchPage(
                currentPageUrl
            );


        const books =
            extractBookLinks(
                html,
                currentPageUrl
            );


        console.log(
            `books_found=${books.length}`
        );


        discoveredBooks.push(
            ...books
        );


        currentPageUrl =
            getNextPageUrl(
                html,
                currentPageUrl
            );

    }


    // ------------------------------------------
    // REMOVE DUPLICATES BY CANONICAL URL
    // ------------------------------------------

    const uniqueMap =
        new Map();


    for (const book of discoveredBooks) {

        if (
            !uniqueMap.has(
                book.product_url
            )
        ) {

            uniqueMap.set(
                book.product_url,
                book
            );

        }

    }


    return {

        cataloguePages,

        discoveredCount:
            discoveredBooks.length,

        books:
            [...uniqueMap.values()]

    };

}


// ======================================================
// EXTRACT RAW BOOK RECORD
// ======================================================

function extractBookRecord(
    html,
    productUrl,
    sourcePage
) {

    const $ =
        cheerio.load(html);


    // Focus specifically on product area.
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


    const ratingElement =
        productMain
            .find(".star-rating")
            .first();


    const ratingClasses =
        ratingElement
            .attr("class")
            ?.split(/\s+/)
            ?? [];


    const ratingText =
        ratingClasses.find(
            value =>
                value !== "star-rating"
        ) || "";


    // ------------------------------------------
    // DESCRIPTION
    // ------------------------------------------

    const descriptionHeading =
        $("#product_description");


    let description = null;


    if (
        descriptionHeading.length > 0
    ) {

        const descriptionElement =
            descriptionHeading.next("p");


        if (
            descriptionElement.length > 0
        ) {

            const text =
                descriptionElement
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();


            description =
                text || null;

        }

    }


    return {

        title,

        product_url:
            productUrl,

        price_text:
            priceText,

        availability_text:
            availabilityText,

        rating_text:
            ratingText,

        description,

        source_page:
            sourcePage,

        fetched_at:
            new Date().toISOString()

    };

}


// ======================================================
// NORMALIZE PRICE
// ======================================================

function normalizePrice(
    priceText
) {

    const cleaned =
        priceText
            .replace("£", "")
            .trim();


    const price =
        Number(cleaned);


    return price;

}


// ======================================================
// NORMALIZE RECORD
// ======================================================

function normalizeRecord(
    rawRecord
) {

    return {

        ...rawRecord,

        price_gbp:
            normalizePrice(
                rawRecord.price_text
            )

    };

}


// ======================================================
// FORMAT ZOD ERROR
// ======================================================

function formatValidationError(
    error
) {

    if (
        error &&
        Array.isArray(error.issues)
    ) {

        return error.issues.map(issue => ({

            path:
                issue.path.join("."),

            message:
                issue.message

        }));

    }


    return [
        {
            message:
                error?.message ||
                "Unknown validation error"
        }
    ];

}


// ======================================================
// WRITE JSON
// ======================================================

function writeJson(
    file,
    data
) {

    fs.writeFileSync(

        file,

        JSON.stringify(
            data,
            null,
            2
        ),

        "utf8"

    );

}


// ======================================================
// MAIN
// ======================================================

async function main() {

    const runStart =
        Date.now();


    console.log(
        "\n📚 The Polite Scraper"
    );

    console.log(
        "================================"
    );

    console.log(
        "Stage 5: Survive failures and report the run"
    );


    const discovery =
        await discoverBooks();


    console.log(
        "\n================================"
    );

    console.log(
        "DISCOVERY"
    );

    console.log(
        "================================"
    );

    console.log(
        `catalogue_pages=${discovery.cataloguePages}`
    );

    console.log(
        `discovered=${discovery.discoveredCount}`
    );

    console.log(
        `unique_urls=${discovery.books.length}`
    );


    // ------------------------------------------
    // COPY DISCOVERED BOOKS
    // ------------------------------------------

    const booksToProcess = [
        ...discovery.books
    ];


    // ------------------------------------------
    // INTENTIONAL FAILURE TEST
    // ------------------------------------------

    if (TEST_FAILURE) {

        booksToProcess.push({

            product_url:
                FAKE_BOOK_URL,

            source_page:
                START_URL,

            failure_test:
                true

        });


        console.log(
            "\n[TEST] Added one fake book URL."
        );

    }


    const validRecords = [];

    const errors = [];


    console.log(
        "\nProcessing book details..."
    );


    // ==================================================
    // PROCESS EACH PAGE INDEPENDENTLY
    // ==================================================

    for (
        let i = 0;
        i < booksToProcess.length;
        i++
    ) {

        const book =
            booksToProcess[i];


        console.log(
            `\nBook ${i + 1}/${booksToProcess.length}`
        );


        try {

            const html =
                await fetchPage(
                    book.product_url
                );


            const rawRecord =
                extractBookRecord(
                    html,
                    book.product_url,
                    book.source_page
                );


            const normalized =
                normalizeRecord(
                    rawRecord
                );


            const result =
                BookSchema.safeParse(
                    normalized
                );


            // ------------------------------------------
            // INVALID RECORD
            // ------------------------------------------

            if (!result.success) {

                stats.invalid_records++;


                errors.push({

                    type:
                        "validation_error",

                    product_url:
                        book.product_url,

                    reason:
                        formatValidationError(
                            result.error
                        )

                });


                console.log(
                    `[INVALID] ${book.product_url}`
                );


                continue;

            }


            validRecords.push(
                result.data
            );


            stats.valid_records++;


        }

        catch (error) {

            stats.failed_pages++;


            errors.push({

                type:
                    "page_failure",

                product_url:
                    book.product_url,

                reason:
                    error.message

            });


            console.log(
                `[FAILED] ${book.product_url}`
            );

            console.log(
                `Reason: ${error.message}`
            );


            // IMPORTANT:
            // Do NOT throw here.
            // Continue processing remaining pages.

        }

    }


    // ==================================================
    // FINAL DEDUPLICATION
    // ==================================================

    const uniqueRecordsMap =
        new Map();


    for (
        const record
        of validRecords
    ) {

        uniqueRecordsMap.set(
            record.product_url,
            record
        );

    }


    const finalRecords =
        [...uniqueRecordsMap.values()];


    // ==================================================
    // WRITE OUTPUT FILES
    // ==================================================

    writeJson(
        BOOKS_FILE,
        finalRecords
    );


    writeJson(
        ERRORS_FILE,
        errors
    );


    // ==================================================
    // RUN REPORT
    // ==================================================

    const durationMs =
        Date.now() - runStart;


    const report = {

        start_time:
            stats.start_time,

        duration_ms:
            durationMs,

        duration_seconds:
            Number(
                (
                    durationMs /
                    1000
                ).toFixed(3)
            ),

        catalogue_pages:
            discovery.cataloguePages,

        discovered_urls:
            discovery.discoveredCount,

        unique_urls:
            discovery.books.length,

        pages_fetched:
            stats.pages_fetched,

        cache_hits:
            stats.cache_hits,

        valid_records:
            finalRecords.length,

        invalid_records:
            stats.invalid_records,

        failed_pages:
            stats.failed_pages,

        finished_at:
            new Date().toISOString()

    };


    writeJson(
        REPORT_FILE,
        report
    );


    // ==================================================
    // CHECKPOINT
    // ==================================================

    console.log(
        "\n================================"
    );

    console.log(
        "STAGE 5 CHECKPOINT"
    );

    console.log(
        "================================"
    );


    console.log(
        `catalogue_pages=${report.catalogue_pages}`
    );

    console.log(
        `unique_urls=${report.unique_urls}`
    );

    console.log(
        `valid_records=${report.valid_records}`
    );

    console.log(
        `invalid_records=${report.invalid_records}`
    );

    console.log(
        `failed_pages=${report.failed_pages}`
    );

    console.log(
        `pages_fetched=${report.pages_fetched}`
    );

    console.log(
        `cache_hits=${report.cache_hits}`
    );

    console.log(
        `duration_seconds=${report.duration_seconds}`
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

    console.log(
        "output/run-report.json"
    );

}


// ======================================================
// FATAL ERROR HANDLER
// ======================================================

main().catch(error => {

    console.error(
        "\n[FATAL ERROR]",
        error.message
    );

    process.exit(1);

});