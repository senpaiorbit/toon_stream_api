export const config = {
  runtime: "edge",
};

const CF_PROXY_LIST_URL =
  "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/cf_proxy.txt";

let CF_BASE = null;
let CF_CACHE_TIME = 0;
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

async function getCFBase() {
  if (CF_BASE && Date.now() - CF_CACHE_TIME < CACHE_TTL) {
    return CF_BASE;
  }

  const res = await fetch(CF_PROXY_LIST_URL);
  if (!res.ok) throw new Error("Failed to load CF proxy list");

  const text = await res.text();
  const line = text
    .split("\n")
    .find((l) => l.includes("https://"));

  if (!line) throw new Error("No proxy found");

  CF_BASE = line.trim();
  CF_CACHE_TIME = Date.now();
  return CF_BASE;
}

// --- Ultra-light HTML extraction ---
function extractItems(html) {
  const items = [];
  const blocks = html.split('<li id="post-').slice(1);

  for (const block of blocks) {
    const id = block.split('"')[0];

    const title =
      block.match(/<h2 class="entry-title">(.*?)<\/h2>/)?.[1] || null;

    const image =
      block.match(/<img[^>]+src="([^"]+)"/)?.[1] || null;

    const link =
      block.match(/<a href="(https:\/\/toonstream\.dad\/[^"]+)"/)?.[1] ||
      null;

    const rating =
      block.match(/TMDB<\/span>\s*([\d.]+)/)?.[1] || null;

    if (!title || !link) continue;

    items.push({
      id,
      title,
      image: image?.startsWith("//") ? "https:" + image : image,
      rating: rating ? Number(rating) : null,
      url: link,
    });
  }

  return items;
}

function extractPagination(html) {
  const pages = [];
  const matches = html.matchAll(/href="([^"]+\/page\/\d+\/)"/g);
  for (const m of matches) pages.push(m[1]);
  return [...new Set(pages)];
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");
    const page = searchParams.get("page");

    if (!path) {
      return new Response(
        JSON.stringify({ error: "category path required" }),
        { status: 400 }
      );
    }

    const cfBase = await getCFBase();

    const finalPath = page
      ? `/category/${path}/page/${page}/`
      : `/category/${path}/`;

    const targetURL =
      `${cfBase}?path=${encodeURIComponent(finalPath)}`;

    const res = await fetch(targetURL, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; ToonStreamEdge/1.0)",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch HTML" }),
        { status: 502 }
      );
    }

    const html = await res.text();

    const items = extractItems(html);
    const pagination = extractPagination(html);

    return new Response(
      JSON.stringify(
        {
          success: true,
          category: path,
          page: page ? Number(page) : 1,
          total_items: items.length,
          items,
          pagination,
        },
        null,
        2
      ),
      {
        headers: {
          "content-type": "application/json",
          "cache-control": "public, max-age=300",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message,
      }),
      { status: 500 }
    );
  }
}
