export const config = {
  runtime: "edge",
};

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  // --- Step 1: Parse broken query ---
  const baseUrl = searchParams.get("url");
  const trid = searchParams.get("trid");
  const trtype = searchParams.get("trtype");

  if (!baseUrl) {
    return new Response(
      JSON.stringify({ error: "url parameter required" }),
      { status: 400 }
    );
  }

  // --- Step 2: Rebuild full URL safely ---
  const urlObj = new URL(baseUrl);
  if (trid) urlObj.searchParams.set("trid", trid);
  if (trtype) urlObj.searchParams.set("trtype", trtype);

  const fullUrl = urlObj.toString();

  // --- Step 3: Fetch HTML ---
  const res = await fetch(fullUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; EdgeScraper/1.0; +https://vercel.com)",
    },
  });

  if (!res.ok) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch target page" }),
      { status: 500 }
    );
  }

  const html = await res.text();

  // --- Step 4: Parse HTML (NO JS execution) ---
  const doc = new DOMParser().parseFromString(html, "text/html");

  const iframe = doc.querySelector("iframe");
  const embedUrl = iframe?.getAttribute("src") || null;

  // --- Step 5: Response ---
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
          iframe_src: embedUrl,
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
