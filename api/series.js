export const config = {
  runtime: "edge",
};

const CF_PROXY_LIST =
  "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt";

let CF_BASE = null;
let LAST_FETCH = 0;
const TTL = 10 * 60 * 1000;

async function getCFBase() {
  if (CF_BASE && Date.now() - LAST_FETCH < TTL) return CF_BASE;

  const res = await fetch(CF_PROXY_LIST);
  const txt = await res.text();
  CF_BASE = txt.split("\n").find(l => l.startsWith("https://")).trim();
  LAST_FETCH = Date.now();
  return CF_BASE;
}

const clean = (s) => s?.replace(/\s+/g, " ").trim() || null;

const fixPoster = (src) => {
  if (!src) return null;
  let url = src.startsWith("//") ? "https:" + src : src;
  return url.replace(/\/w\d+\//, "/w500/");
};

function extractFirst(html, regex) {
  return clean(html.match(regex)?.[1]);
}

function extractList(html, regex) {
  const m = html.match(regex);
  if (!m) return [];
  return [...m[1].matchAll(/>([^<]+)</g)].map(x => clean(x[1]));
}

function parseSeries(html, slug) {
  return {
    seriesSlug: slug,
    title: extractFirst(html, /<h1 class="entry-title">(.*?)<\/h1>/),
    image: fixPoster(
      html.match(/<figure><img[^>]+src="([^"]+)"/)?.[1]
    ),
    rating: extractFirst(html, /TMDB<\/span>\s*([\d.]+)/),
    year: extractFirst(html, /class="year[^"]*">(\d{4})<\/span>/),
    totalSeasons: Number(
      extractFirst(html, /<span>(\d+)<\/span>\s*Seasons/)
    ),
    totalEpisodes: Number(
      extractFirst(html, /<span>(\d+)<\/span>\s*Episodes/)
    ),
    includeServerSources: true,
    categories: extractList(html, /class="genres">([\s\S]*?)<\/span>/),
    tags: extractList(html, /class="tag fa-tag">([\s\S]*?)<\/span>/),
    cast: extractList(html, /class="loadactor">([\s\S]*?)<\/p>/),
    availableSeasons: [
      ...new Set(
        [...html.matchAll(/data-season="(\d+)"/g)].map(m => Number(m[1]))
      )
    ].sort((a, b) => a - b).map(n => ({
      seasonNumber: n,
      name: `Season ${n}`
    }))
  };
}

function parseEpisodes(html) {
  const episodes = [];
  const blocks = html.split('<article class="post dfx fcl episodes').slice(1);

  for (const b of blocks) {
    const ep = extractFirst(b, /<span class="num-epi">(.*?)<\/span>/);
    const title = extractFirst(b, /<h2 class="entry-title">(.*?)<\/h2>/);
    const img = fixPoster(b.match(/<img[^>]+src="([^"]+)"/)?.[1]);
    const time = extractFirst(b, /class="time">(.*?)<\/span>/);
    const url = b.match(/<a href="([^"]+\/episode\/[^"]+)"/)?.[1];

    if (!ep || !url) continue;

    episodes.push({
      seasonNumber: Number(ep.split("x")[0]),
      episodeNumber: ep,
      title,
      image: img,
      time,
      url,
      servers: [
        {
          serverNumber: 0,
          displayNumber: 1,
          name: "X",
          src: null
        }
      ]
    });
  }
  return episodes;
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get("slug");
    if (!slug) {
      return new Response(
        JSON.stringify({ success: false, error: "slug required" }),
        { status: 400 }
      );
    }

    const cf = await getCFBase();
    const res = await fetch(`${cf}?path=/series/${slug}/`, {
      headers: { "user-agent": "Mozilla/5.0 ToonStreamEdge" }
    });

    const html = await res.text();

    const series = parseSeries(html, slug);
    const episodesRaw = parseEpisodes(html);

    const seasonsMap = {};
    for (const ep of episodesRaw) {
      if (!seasonsMap[ep.seasonNumber]) {
        seasonsMap[ep.seasonNumber] = {
          seasonNumber: ep.seasonNumber,
          year: series.year,
          rating: series.rating,
          episodes: []
        };
      }
      seasonsMap[ep.seasonNumber].episodes.push(ep);
    }

    const seasons = Object.values(seasonsMap);

    return new Response(
      JSON.stringify(
        {
          success: true,
          data: {
            ...series,
            requestedSeasons: seasons.map(s => s.seasonNumber),
            seasons
          },
          stats: {
            totalSeasons: series.totalSeasons,
            requestedSeasons: seasons.length,
            fetchedEpisodes: episodesRaw.length,
            includesServerSources: true
          }
        },
        null,
        2
      ),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=300"
        }
      }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { status: 500 }
    );
  }
}
