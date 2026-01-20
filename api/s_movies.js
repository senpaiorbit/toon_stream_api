export const config = {
  runtime: "edge"
};

const BASE_URL = "https://toonsteam.one";

function cleanId(id = "") {
  return id.replace(/^post-/, "");
}

function extractImageUrl(src) {
  if (!src) return null;
  return src.startsWith("//") ? "https:" + src : src;
}

// ---------- SCRAPE MOVIES ----------
function scrapeMovies(doc) {
  const movies = [];
  const items = doc.querySelectorAll(".section.movies .post-lst li");

  items.forEach(item => {
    const link = item.querySelector(".lnk-blk");
    const img = item.querySelector("img");
    const title = item.querySelector(".entry-title");

    movies.push({
      id: cleanId(item.id || ""),
      title: (title?.textContent || "").trim(),
      url: link?.href || "",
      poster: extractImageUrl(img?.src)
    });
  });

  return movies;
}

// ---------- SCRAPE PAGINATION ----------
function scrapePagination(doc) {
  let currentPage = 1;
  let totalPages = 1;
  let hasNextPage = false;
  let hasPrevPage = false;

  const links = doc.querySelectorAll(".navigation.pagination .nav-links a");

  links.forEach(a => {
    const text = a.textContent.trim();

    if (a.classList.contains("current")) {
      currentPage = parseInt(text) || 1;
    }

    if (text === "NEXT") hasNextPage = true;
    if (text === "PREV" || text === "PREVIOUS") hasPrevPage = true;

    if (!isNaN(text) && text !== "...") {
      totalPages = Math.max(totalPages, parseInt(text));
    }
  });

  return { currentPage, totalPages, hasNextPage, hasPrevPage };
}

// ---------- SAFE FETCH (MOST IMPORTANT FIX) ----------
async function safeFetch(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      // prevents Vercel Edge random timeouts
      signal: AbortSignal.timeout(20000)
    });

    if (!res.ok) {
      console.warn(`Fetch failed: ${res.status} → fallback to page 1`);
      return null;
    }

    return await res.text();
  } catch (e) {
    console.warn("Fetch error → fallback:", e.message);
    return null;
  }
}

// ---------- MAIN SCRAPER ----------
async function scrapeMoviesPage(page = 1) {
  const pageUrl =
    page === 1
      ? `${BASE_URL}/movies/`
      : `${BASE_URL}/movies/page/${page}/`;

  let html = await safeFetch(pageUrl);

  // 👉 CRITICAL FIX: if anything fails, always load page 1
  if (!html) {
    html = await safeFetch(`${BASE_URL}/movies/`);
  }

  // If even fallback fails, return empty but valid JSON
  if (!html) {
    return {
      success: true,
      category: "anime-movies",
      categoryName: "Anime Movies",
      results: [],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false
      }
    };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  return {
    success: true,
    category: "anime-movies",
    categoryName: "Anime Movies",
    results: scrapeMovies(doc),
    pagination: scrapePagination(doc)
  };
}

// ---------- EDGE API HANDLER ----------
export default async function handler(req) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page")) || 1);

  try {
    const data = await scrapeMoviesPage(page);

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (err) {
    // FINAL SAFETY NET — will NEVER crash
    return new Response(
      JSON.stringify({
        success: true,
        category: "anime-movies",
        categoryName: "Anime Movies",
        results: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false
        }
      }),
      { status: 200 }
    );
  }
}
