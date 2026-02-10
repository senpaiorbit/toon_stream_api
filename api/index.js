export const config = {
  runtime: "edge",
};

const FALLBACK_BASE_URL = "https://toonstream.dad";

/* ---------------- CONSTANTS ---------------- */

const BROWSER_HEADERS = {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    Accept: "text/plain,text/html,*/*",
    "Accept-Language": "en-US,en;q=0.9",
  },
};

// Pre-compiled regex (important for speed)
const RE_TITLE = /<title>([^<]+)<\/title>/i;
const RE_DESC = /<meta name="description" content="([^"]+)"/i;
const RE_HOME_ARTICLE =
  /<div id="home-article">([\s\S]*?)<\/div>\s*<\/div>/i;
const RE_P = /<p[^>]*>(.*?)<\/p>/gi;
const RE_H2_P =
  /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>(.*?)<\/p>/gi;
const RE_SUGGEST =
  /<a class="item" href="([^"]+)">([^<]+)<\/a>/gi;

/* ---------------- MAIN HANDLER ---------------- */

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "/";
  const targetPath = path.startsWith("/") ? path : "/" + path;

  // 🔥 Parallel fetch (biggest speed win)
  const [baseUrl, proxyUrl] = await Promise.all([
    getBaseUrl(),
    getCfProxy(),
  ]);

  const proxyTarget = proxyUrl
    ? proxyUrl + "?url=" + encodeURIComponent(baseUrl + targetPath)
    : null;

  let res = null;

  // 1️⃣ CF proxy first
  if (proxyTarget) {
    try {
      res = await fetch(proxyTarget, BROWSER_HEADERS);
    } catch {}
  }

  // 2️⃣ Fallback to origin
  if (!res || !res.ok) {
    try {
      res = await fetch(baseUrl + targetPath, BROWSER_HEADERS);
    } catch {}
  }

  if (!res || !res.ok) {
    return json({ success: false, error: "Failed to fetch page" }, 500);
  }

  const html = await res.text();
  if (!html) {
    return json({ success: false, error: "Empty response" }, 500);
  }

  return json({
    success: true,
    site: extractMeta(html),
    homepage: extractHomepageArticle(html),
    suggestions: extractSuggestions(html),
  });
}

/* ---------------- FETCH HELPERS ---------------- */

async function getBaseUrl() {
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt",
      { cf: { cacheTtl: 600 } }
    );
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.startsWith("http")) return t.replace(/\/$/, "");
    }
  } catch {}
  return FALLBACK_BASE_URL;
}

async function getCfProxy() {
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt",
      { cf: { cacheTtl: 600 } }
    );
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.startsWith("http")) return t.replace(/\/$/, "");
    }
  } catch {}
  return null;
}

/* ---------------- RESPONSE ---------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

/* ---------------- META ---------------- */

function extractMeta(html) {
  return {
    title: match(html, RE_TITLE),
    description: match(html, RE_DESC),
  };
}

/* ---------------- HOMEPAGE ARTICLE ---------------- */

function extractHomepageArticle(html) {
  const m = html.match(RE_HOME_ARTICLE);
  if (!m) return null;

  const article = m[1];

  const intro = [];
  let p;
  while ((p = RE_P.exec(article)) && intro.length < 3) {
    const t = clean(p[1]);
    if (t) intro.push(t);
  }

  const sections = [];
  let h;
  while ((h = RE_H2_P.exec(article)) !== null) {
    sections.push({
      heading: clean(h[1]),
      content: clean(h[2]),
    });
  }

  return { intro, sections };
}

/* ---------------- SEARCH SUGGESTIONS ---------------- */

function extractSuggestions(html) {
  const results = [];
  let m;
  while ((m = RE_SUGGEST.exec(html)) !== null) {
    results.push({
      title: clean(m[2]),
      url: m[1],
    });
  }
  return results;
}

/* ---------------- HELPERS ---------------- */

function match(html, regex) {
  const m = html.match(regex);
  return m ? clean(m[1]) : null;
}

function clean(str) {
  return str
    ? str
        .replace(/&nbsp;|&#x27;|â€™|â€“|PokÃ©/g, "'")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;
}
