export const config = {
  runtime: "edge",
};

const CF_PROXY_URL =
  "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt";

let CF_BASE = null;
let LAST_FETCH = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function getCFBase() {
  if (CF_BASE && Date.now() - LAST_FETCH < CACHE_TTL) return CF_BASE;

  const res = await fetch(CF_PROXY_URL);
  const txt = await res.text();
  CF_BASE = txt.split("\n").find(l => l.startsWith("https://")).trim();
  LAST_FETCH = Date.now();
  return CF_BASE;
}

const clean = (v) => v?.replace(/\s+/g, " ").trim() || null;

function extractAll(html, regex) {
  return [...html.matchAll(regex)].map(m => m[1]);
}

function parseSeries(html, slug) {
  const title = clean(html.match(/<h1 class="entry-title">(.*?)<\/h1>/)?.[1]);
  const image = html.match(/<figure><img[^>]+src="([^"]+)"/)?.[1];
  const rating = html.match(/TMDB<\/span>\s*([\d.]+)/)?.[1];
  const year = html.match(/class="year[^"]*">(\d{4})<\/span>/)?.[1];
  const totalSeasons = html.match(/<span>(\d+)<\/span>\s*Seasons/)?.[1];
  const totalEpisodes = html.match(/<span>(\d+)<\/span>\s*Episodes/)?.[1];

  const categories = extractAll(
    html,
    /class="genres">([\s\S]*?)<\/span>/
  )[0]?.match(/>([^<]+)</g)?.map(x => x.replace(/[><]/g, ""));

  const tags = extractAll(
    html,
    /class="tag fa-tag">([\s\S]*?)<\/span>/
  )[0]?.match(/>([^<]+)</g)?.map(x => x.replace(/[><]/g, ""));

  const cast = extractAll(
    html,
    /class="loadactor">([\s\S]*?)<\/p>/
  )[0]?.match(/>([^<]+)</g)?.map(x => x.replace(/[><]/g, ""));

  const seasonMenu = [...html.matchAll(/data-season="(\d+)"/g)]
    .map(s => Number(s[1]))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a - b)
    .map(n => ({
      seasonNumber: n,
      name: `Season ${n}`
    }));

  return {
    seriesSlug: slug,
    title,
    image: image?.startsWith("//") ? "https:" + image : image,
    rating,
    year,
    totalSeasons: Number(totalSeasons),
    totalEpisodes: Number(totalEpisodes),
    requestedSeasons: seasonMenu.map(s => s.seasonNumber),
    includeServerSources: true,
    availableSeasons: seasonMenu,
    categories,
    tags,
    cast
  };
}

function parseEpisodes(html) {
  const episodes = [];

  const blocks = html.split('<article class="post dfx fcl episodes').slice(1);
  for (const b of blocks) {
    const episodeNumber = b.match(/<span class="num-epi">(.*?)<\/span>/)?.[1];
    const title = clean(b.match(/<h2 class="entry-title">(.*?)<\/h2>/)?.[1]);
    const image = b.match(/<img[^>]+src="([^"]+)"/)?.[1];
    const time = clean(b.match(/class="time">(.*?)<\/span>/)?.[1]);
    const url = b.match(/<a href="([^"]+\/episode\/[^"]+)"/)?.[1];

    if (!episodeNumber || !url) continue;

    const seasonNumber = Number(episodeNumber.split("x")[0]);

    episodes.push({
      seasonNumber,
      episodeNumber,
      title,
      image: image?.startsWith("//") ? "https:" + image : image,
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
      return new Response(JSON.stringify({ error: "slug required" }), { status: 400 });
    }

    const cf = await getCFBase();
    const target = `${cf}?path=/series/${slug}/`;

    const res = await fetch(target, {
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
