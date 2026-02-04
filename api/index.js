export const config = {
  runtime: "edge",
};

const FALLBACK_BASE_URL = "http://toonstream.dad";

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "/";

  let baseUrl = FALLBACK_BASE_URL;

  // fetch base url safely
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/main/src/baseurl.txt"
    );
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.startsWith("http")) baseUrl = t;
    }
  } catch {}

  const res = await fetch(baseUrl + path, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    return json({ success: false, error: "Failed to fetch page" }, 500);
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
  const hRegex = /<h2[^>]*>([^<]+)<\/h2>\s*<p[^>]*>(.*?)<\/p>/gi;
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
