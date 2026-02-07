import cheerio from "cheerio";

export const config = {
  runtime: "edge",
};

// =====================
// CACHE
// =====================
let baseUrlCache = { url: null, timestamp: 0 };
let proxyUrlCache = { url: null, timestamp: 0 };
const CACHE_DURATION = 5 * 60 * 1000;

// =====================
// BASE URL
// =====================
async function getBaseUrl() {
  const now = Date.now();
  if (baseUrlCache.url && now - baseUrlCache.timestamp < CACHE_DURATION) {
    return baseUrlCache.url;
  }

  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt"
    );
    if (res.ok) {
      const url = (await res.text()).trim().replace(/\/+$/, "");
      baseUrlCache = { url, timestamp: now };
      return url;
    }
  } catch {}

  baseUrlCache = { url: "https://toonstream.dad", timestamp: now };
  return baseUrlCache.url;
}

// =====================
// PROXY URL
// =====================
async function getProxyUrl() {
  const now = Date.now();
  if (proxyUrlCache.url && now - proxyUrlCache.timestamp < CACHE_DURATION) {
    return proxyUrlCache.url;
  }

  try {
    const res = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt"
    );
    if (res.ok) {
      const url = (await res.text()).trim().replace(/\/+$/, "");
      proxyUrlCache = { url, timestamp: now };
      return url;
    }
  } catch {}

  proxyUrlCache = { url: null, timestamp: now };
  return null;
}

// =====================
// FETCH WITH PROXY
// =====================
async function fetchWithProxy(url, referer) {
  const proxy = await getProxyUrl();
  const headers = {
    "User-Agent": "Mozilla/5.0",
    Referer: referer,
  };

  if (proxy) {
    try {
      const r = await fetch(`${proxy}?url=${encodeURIComponent(url)}`, {
        headers,
      });
      if (r.ok) return await r.text();
    } catch {}
  }

  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

const fixImg = (s) => (!s ? null : s.startsWith("//") ? "https:" + s : s);

// =====================
// SCRAPERS
// =====================
function scrapeEpisodeMetadata($) {
  const a = $("article.post.single");
  return {
    title: a.find(".entry-title").text().trim(),
    image: fixImg(a.find(".post-thumbnail img").attr("src")),
    description: a.find(".description").text().trim(),
    duration: a.find(".duration").text().replace("min", "").trim(),
    year: a.find(".year").text().trim(),
    rating: $(".vote .num").text().trim(),
  };
}

function scrapeCategories($) {
  return $(".genres a")
    .map((_, e) => ({
      name: $(e).text().trim(),
      url: $(e).attr("href"),
    }))
    .get();
}

function scrapeCast($) {
  return $(".cast-lst a")
    .map((_, e) => ({
      name: $(e).text().trim(),
      url: $(e).attr("href"),
    }))
    .get();
}

function scrapeNavigation($) {
  const nav = { previousEpisode: null, nextEpisode: null, seriesPage: null };
  $(".epsdsnv a").each((_, e) => {
    const t = $(e).text().toLowerCase();
    const h = $(e).attr("href");
    if (t.includes("previous")) nav.previousEpisode = h;
    if (t.includes("next")) nav.nextEpisode = h;
    if (t.includes("season")) nav.seriesPage = h;
  });
  return nav;
}

function scrapeSeasons($) {
  return $(".choose-season li.sel-temp")
    .map((_, e) => {
      const a = $(e).find("a");
      return {
        name: a.text().trim(),
        seasonNumber: parseInt(a.attr("data-season")) || 0,
        dataPost: a.attr("data-post") || null,
        dataSeason: a.attr("data-season") || null,
      };
    })
    .get();
}

// =====================
// EPISODES (FIXED)
// =====================
function scrapeEpisodesList($) {
  return $("#episode_by_temp li")
    .map((_, el) => {
      const a = $(el).find("article.episodes");
      const url = a.find("a.lnk-blk").attr("href");
      if (!url) return null;

      return {
        episodeNumber: a.find(".num-epi").text().trim(),
        title: a.find(".entry-title").text().trim(),
        image: fixImg(a.find(".post-thumbnail img").attr("src")),
        time: a.find(".time").text().trim(),
        url,
      };
    })
    .get()
    .filter(Boolean);
}

// =====================
// MAIN LOGIC
// =====================
async function scrapeEpisodePage(baseUrl, slug) {
  const episodeUrl = `${baseUrl}/episode/${slug}/`;
  const html = await fetchWithProxy(episodeUrl, baseUrl);
  const $ = cheerio.load(html);

  const navigation = scrapeNavigation($);
  let episodes = [];

  if (navigation.seriesPage) {
    const sHtml = await fetchWithProxy(navigation.seriesPage, baseUrl);
    const $$ = cheerio.load(sHtml);
    episodes = scrapeEpisodesList($$);
  }

  return {
    success: true,
    data: {
      baseUrl,
      episodeUrl,
      episodeSlug: slug,
      pageType: "episode",
      scrapedAt: new Date().toISOString(),
      ...scrapeEpisodeMetadata($),
      categories: scrapeCategories($),
      cast: scrapeCast($),
      navigation,
      seasons: scrapeSeasons($),
      episodes,
      servers: [],
    },
    stats: {
      episodesCount: episodes.length,
    },
  };
}

// =====================
// EDGE HANDLER
// =====================
export default async function handler(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || searchParams.get("episode");

  if (!slug) {
    return new Response(
      JSON.stringify({ success: false, error: "Episode slug required" }),
      { status: 400 }
    );
  }

  const baseUrl = await getBaseUrl();
  const result = await scrapeEpisodePage(baseUrl, slug);

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}
