export default {
  async fetch(req, env, ctx) {
    const cache = caches.default;
    const reqUrl = new URL(req.url);

    // ---------- Cache key (include full query) ----------
    const cacheKey = new Request(reqUrl.toString(), req);

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // ---------- Read params ----------
    let inputUrl = reqUrl.searchParams.get("url");
    let path = reqUrl.searchParams.get("path");

    // Extra params (page, trembed, trid, trtype, etc)
    const extraParams = new URLSearchParams(reqUrl.search);
    extraParams.delete("url");
    extraParams.delete("path");

    // ---------- Fetch base URL ----------
    const baseRes = await fetch(
      "https://raw.githubusercontent.com/senpaiorbit/toon_stream_api/refs/heads/main/src/baseurl.txt",
      { cf: { cacheTtl: 600 } }
    );

    if (!baseRes.ok) {
      return new Response("Base URL fetch failed", { status: 500 });
    }

    const BASE_URL = (await baseRes.text()).trim();

    // ---------- Resolve final target ----------
    let target;

    if (inputUrl) {
      target = inputUrl;
    } else if (path) {
      target = BASE_URL.replace(/\/$/, "") + "/" + path.replace(/^\//, "");
    } else {
      return new Response("Missing url or path", { status: 400 });
    }

    // Append extra params
    if ([...extraParams].length > 0) {
      target += (target.includes("?") ? "&" : "?") + extraParams.toString();
    }

    // ---------- Fetch target ----------
    const res = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": BASE_URL,
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 600,
      },
    });

    if (!res.ok) {
      return new Response("Upstream blocked", { status: res.status });
    }

    let html = await res.text();

    // ---------- Strip head, scripts, styles ----------
    html = html
      .replace(/<head[\s\S]*?<\/head>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

    const response = new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "public, max-age=600",
      },
    });

    // ---------- Store in cache ----------
    ctx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
  },
};
