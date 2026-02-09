export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    // ---- Params
    const baseUrl = searchParams.get("url");
    const trid = searchParams.get("trid");
    const trtype = searchParams.get("trtype");
    const wantJson = searchParams.get("json") === "1";

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "url parameter is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // ---- Rebuild full URL
    const urlObj = new URL(baseUrl);
    if (trid) urlObj.searchParams.set("trid", trid);
    if (trtype) urlObj.searchParams.set("trtype", trtype);

    const fullUrl = urlObj.toString();

    // ---- Fetch target page
    const res = await fetch(fullUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; EdgeScraper/1.0)",
      },
    });

    if (!res.ok) {
      // Hard fallback → original URL
      return Response.redirect(fullUrl, 302);
    }

    const html = await res.text();

    // ---- Extract iframe src (EDGE SAFE)
    let iframeSrc = null;
    const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (match) iframeSrc = match[1];

    // ---- JSON MODE (instant data)
    if (wantJson) {
      return new Response(
        JSON.stringify(
          {
            parsed: {
              base_url: baseUrl,
              trid,
              trtype,
            },
            full_url: fullUrl,
            resolved: {
              iframe_src: iframeSrc,
              redirect_target: iframeSrc || fullUrl,
            },
          },
          null,
          2
        ),
        {
          headers: { "content-type": "application/json" },
        }
      );
    }

    // ---- REDIRECT MODE (default)
    if (iframeSrc) {
      return Response.redirect(iframeSrc, 302);
    }

    // ---- Final fallback → original URL
    return Response.redirect(fullUrl, 302);

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Edge function crashed",
        message: err.message,
      }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
}
