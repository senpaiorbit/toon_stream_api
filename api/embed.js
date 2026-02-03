export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    // ---- Step 1: Read broken query params
    const baseUrl = searchParams.get("url");
    const trid = searchParams.get("trid");
    const trtype = searchParams.get("trtype");

    if (!baseUrl) {
      return new Response(
        JSON.stringify({ error: "url parameter is required" }),
        { status: 400 }
      );
    }

    // ---- Step 2: Rebuild full URL safely
    const urlObj = new URL(baseUrl);
    if (trid) urlObj.searchParams.set("trid", trid);
    if (trtype) urlObj.searchParams.set("trtype", trtype);

    const fullUrl = urlObj.toString();

    // ---- Step 3: Fetch target page
    const res = await fetch(fullUrl, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; EdgeScraper/1.0)",
      },
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch page" }),
        { status: 502 }
      );
    }

    const html = await res.text();

    // ---- Step 4: Extract iframe src (EDGE SAFE)
    let iframeSrc = null;
    const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (match) iframeSrc = match[1];

    // ---- Step 5: Response
    return new Response(
      JSON.stringify(
        {
          parsed: {
            base_url: baseUrl,
            trid,
            trtype,
          },
          full_url: fullUrl,
          scraped: {
            iframe_src: iframeSrc,
          },
        },
        null,
        2
      ),
      {
        headers: { "content-type": "application/json" },
      }
    );
  } catch (err) {
    // ---- Edge crash guard
    return new Response(
      JSON.stringify({
        error: "Edge function crashed",
        message: err.message,
      }),
      { status: 500 }
    );
  }
}
