export const config = {
  runtime: "edge",
};

const FALLBACK_BASE_URL = "https://toonstream.dad";

/* ---------------- MAIN HANDLER ---------------- */

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "/";

  const baseUrl = await getBaseUrl();
  const proxyUrl = await getCfProxy();

  // ---- Build URLs
  const targetPath =
    path.startsWith("/") ? path : "/" + path;

  const proxyTarget =
    proxyUrl
      ? proxyUrl + "?url=" + encodeURIComponent(baseUrl + targetPath)
      : null;

  let res;

  // ---- 1️⃣ Try CF proxy first
  if (proxyTarget) {
    try {
      res = await fetch(proxyTarget, browserHeaders());
    } catch {}
  }

  // ---- 2️⃣ Fallback to direct origin
  if (!res || !res.ok) {
    try {
      res = await fetch(baseUrl + targetPath, browserHeaders());
    } catch {}
  }

  if (!res || !res.ok) {
    return json(
      { success: false, error: "Failed to fetch page" },
      500
    );
  }

  const html = await res.text();

  const data = {
    success: true,
    site: extractMeta(html),
    homepage: extractHomepageArticle(html),
    suggestions: extractSuggestions(html),
  };

  return json(data);
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

function browserHeaders() {
  return {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
  };
}

/* ---------------- RESPONSE ---------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
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
    title: match(html, /<title>([^<]+)<\/title>/i),
    description: match(
      html,
      /<meta name="description" content="([^"]+)"/i
    ),
  };
}

/* ---------------- HOMEPAGE ARTICLE ---------------- */

function extractHomepageArticle(html) {
  const articleMatch = html.match(
    /<div id="home-article">([\s\S]*?)<\/div>\s*<\/div>/i
  );

  if (!articleMatch) return null;

  const article = articleMatch[1];

  const paragraphs = [];
  const pRegex = /<p[^>]*>(.*?)<\/p>/gi;
  let p;

  while ((p = pRegex.exec(article)) !== null) {
    const text = clean(p[1]);
    if (text) paragraphs.push(text);
  }

  const sections = [];
  const hRegex =
    /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>(.*?)<\/p>/gi;
  let h;

  while ((h = hRegex.exec(article)) !== null) {
    sections.push({
      heading: clean(h[1]),
      content: clean(h[2]),
    });
  }

  return {
    intro: paragraphs.slice(0, 3),
    sections,
  };
}

/* ---------------- SEARCH SUGGESTIONS ---------------- */

function extractSuggestions(html) {
  const results = [];
  const regex =
    /<a class="item" href="([^"]+)">([^<]+)<\/a>/gi;

  let m;
  while ((m = regex.exec(html)) !== null) {
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
