export const config = {
  runtime: "edge"
};

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return new Response(
        JSON.stringify({ error: "Missing ?url= parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the target page
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    const html = await res.text();

    // Parse HTML in Edge
    const doc = new DOMParser().parseFromString(html, "text/html");

    // Extract iframe src
    const iframe = doc.querySelector("iframe");
    const videoEmbed = iframe ? iframe.getAttribute("src") : null;

    // Extract ad URL from script
    const scriptText = html.match(/window\.open\("([^"]+)"/);
    const adUrl = scriptText ? scriptText[1] : null;

    const result = {
      source_page: targetUrl,
      video_embed: videoEmbed,
      ad_redirect: adUrl
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
