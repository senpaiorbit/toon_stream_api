export const config = {
  runtime: "edge",
};

const FALLBACK_BASE_URL = "https://toonstream.one";

export default async function handler(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path") || "/";
  const extract = searchParams.get("extract") || "search";

  let baseUrl = FALLBACK_BASE_URL;

  // --- Fetch base URL from GitHub (safe fallback) ---
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/main/src/baseurl.txt",
      { cache: "no-store" }
    );
    if (r.ok) {
      const t = (await r.text()).trim();
      if (t.startsWith("http")) baseUrl = t;
    }
  } catch (_) {}

  const targetUrl = baseUrl + path;

  const res = await fetch(targetUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html",
      Referer: baseUrl,
    },
  });

  if (!res.ok) {
    return json({ success: false, error: "Fetch failed" }, 500);
  }

  const html = await res.text();

  let data;
  if (extract === "search") data = extractSearch(html);
  else if (extract === "anime") data = extractAnimeDetail(html);
  else data = extractSearch(html); // default

  data.success = true;
  data.baseUrl = baseUrl;

  return json(data);
}

/* ---------------- UTIL ---------------- */

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

/* ---------------- SEARCH / SUGGESTIONS ---------------- */

function extractSearch(html) {
  const results = [];

  const cardRegex =
    /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([^<]+)<\/p>/gi;

  let m;
  while ((m = cardRegex.exec(html)) !== null) {
    results.push({
      title: clean(m[3]),
      description: clean(m[4]),
      image: m[2],
      url: m[1],
    });
  }

  return {
    count: results.length,
    results,
  };
}

/* ---------------- ANIME DETAIL ---------------- */

function extractAnimeDetail(html) {
  const title =
    match(html, /<h1[^>]*>([^<]+)<\/h1>/i) ||
    match(html, /<title>([^<]+)<\/title>/i);

  const description =
    match(html, /<meta name="description" content="([^"]+)"/i) ||
    match(html, /<p class="description">([^<]+)<\/p>/i);

  const poster = match(html, /<img[^>]*class="poster"[^>]*src="([^"]+)"/i);

  const episodes = [];
  const epRegex = /<a[^>]*href="([^"]+)"[^>]*>Episode\s*(\d+)/gi;

  let m;
  while ((m = epRegex.exec(html)) !== null) {
    episodes.push({
      number: Number(m[2]),
      url: m[1],
    });
  }

  return {
    title: clean(title),
    description: clean(description),
    poster,
    episodeCount: episodes.length,
    episodes,
  };
}

/* ---------------- HELPERS ---------------- */

function match(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}

function clean(str) {
  return str ? str.replace(/\s+/g, " ").trim() : null;
}
