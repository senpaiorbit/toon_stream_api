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

  const targetPath = path.startsWith("/") ? path : "/" + path;

  const proxyTarget = proxyUrl
    ? proxyUrl + "?url=" + encodeURIComponent(baseUrl + targetPath)
    : null;

  let res;

  // 1️⃣ Cloudflare proxy first
  if (proxyTarget) {
    try {
      res = await fetch(proxyTarget, browserHeaders());
    } catch {}
  }

  // 2️⃣ Fallback origin
  if (!res || !res.ok) {
    try {
      res = await fetch(baseUrl + targetPath, browserHeaders());
    } catch {}
  }

  if (!res || !res.ok) {
    return json({ success: false, error: "Failed to fetch page" }, 500);
  }

  const html = await res.text();

  // 🔥 FAST PARSE ONCE
  const doc = tokenizeHTML(html);

  const data = {
    success: true,
    site: extractMeta(doc),
    homepage: extractHomepageArticle(doc),
    suggestions: extractSuggestions(doc),
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
      Accept: "text/plain,text/html,*/*",
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

/* ---------------- HTML TOKENIZER ---------------- */
/* One-pass, Edge-safe, no DOM */

function tokenizeHTML(html) {
  return {
    html,
    textBetween(start, end) {
      const s = html.indexOf(start);
      if (s === -1) return null;
      const e = html.indexOf(end, s + start.length);
      if (e === -1) return null;
      return html.slice(s + start.length, e);
    },
    all(regex) {
      const out = [];
      let m;
      while ((m = regex.exec(html)) !== null) out.push(m);
      return out;
    },
  };
}

/* ---------------- META ---------------- */

function extractMeta(doc) {
  return {
    title: clean(
      doc.textBetween("<title>", "</title>")
    ),
    description: clean(
      match(doc.html, /<meta name="description" content="([^"]+)"/i)
    ),
  };
}

/* ---------------- HOMEPAGE ARTICLE ---------------- */

function extractHomepageArticle(doc) {
  const articleHTML = doc.textBetween(
    '<div id="home-article">',
    "</div></div>"
  );

  if (!articleHTML) return null;

  const intro = [];
  const sections = [];

  for (const p of articleHTML.matchAll(/<p[^>]*>(.*?)<\/p>/gi)) {
    const text = clean(p[1]);
    if (text && intro.length < 3) intro.push(text);
  }

  for (const h of articleHTML.matchAll(
    /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>(.*?)<\/p>/gi
  )) {
    sections.push({
      heading: clean(h[1]),
      content: clean(h[2]),
    });
  }

  return { intro, sections };
}

/* ---------------- SEARCH SUGGESTIONS ---------------- */

function extractSuggestions(doc) {
  const results = [];

  for (const m of doc.all(
    /<a class="item" href="([^"]+)">([^<]+)<\/a>/gi
  )) {
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
  return m ? m[1] : null;
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
