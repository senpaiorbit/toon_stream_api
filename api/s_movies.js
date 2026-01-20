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

  return {
    currentPage,
    totalPages,
    hasNextPage,
    hasPrevPage
  };
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  return res.text();
}

async function scrapeMoviesPage(page = 1) {
  const moviesUrl =
    page === 1
      ? `${BASE_URL}/movies/`
      : `${BASE_URL}/movies/page/${page}/`;

  let html;

  try {
    html = await fetchHTML(moviesUrl);
  } catch (e) {
    // fallback to page 1 if 404
    html = await fetchHTML(`${BASE_URL}/movies/`);
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

// -------- EDGE HANDLER --------
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
    return new Response(
      JSON.stringify({
        success: false,
        error: "Server error",
        message: err.message
      }),
      { status: 500 }
    );
  }
}
