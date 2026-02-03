export const config = {
  runtime: "edge",
};

const FALLBACK_BASE_URL = "https://toonstream.one";

export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "/";
  const extract = searchParams.get("extract") || "search";

  let baseUrl = FALLBACK_BASE_URL;

  // fetch base url from github (safe)
  try {
    const r = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/main/src/baseurl.txt",
      { cache: "no-store" }
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
    return json({ success: false, error: "Fetch failed" }, 500);
  }

  const html = await res.text();

  let data;
  if (extract === "site") data = extractSiteDescription(html);
  else if (extract === "anime") data = extractAnime(html);
  else data = extractSearch(html);

  data.success = true;
  data.baseUrl = baseUrl;

  return json(data);
}

/* ---------------- HELPERS ---------------- */

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

function clean(t) {
  return t ? t.replace(/\s+/g, " ").trim() : null;
}

/* ---------------- SITE DESCRIPTION ---------------- */

function extractSiteDescription(html) {
  // Extract visible text inside main container
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    return { description: null };
  }

  let text = bodyMatch[1];

  // remove scripts, styles, tags
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");

  text = clean(text);

  // trim to meaningful SEO content size
  return {
    description: text.slice(0, 6000),
  };
}

/* ---------------- SEARCH ---------------- */

function extractSearch(html) {
  const results = [];
  const regex =
    /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<p[^>]*>([^<]+)<\/p>/gi;

  let m;
  while ((m = regex.exec(html)) !== null) {
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

function extractAnime(html) {
  const title =
    match(html, /<h1[^>]*>([^<]+)<\/h1>/i) ||
    match(html, /<title>([^<]+)<\/title>/i);

  const description =
    match(html, /<meta name="description" content="([^"]+)"/i) ||
    match(html, /<p[^>]*class="description"[^>]*>([^<]+)<\/p>/i);

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

function match(text, regex) {
  const m = text.match(regex);
  return m ? m[1] : null;
}
