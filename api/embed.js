export const config = {
  runtime: "edge",
};

export default async function handler(request) {
  try {
    const { searchParams } = new URL(request.url);
    const target = searchParams.get("url");

    if (!target) {
      return new Response(
        JSON.stringify({ error: "Missing ?url= parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(target, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://toonstream.one/",
      },
    });

    const html = await res.text();

    const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/);
    const videoEmbed = iframeMatch ? iframeMatch[1] : null;

    const adMatch = html.match(/window\.open\("([^"]+)"/);
    const adRedirect = adMatch ? adMatch[1] : null;

    return new Response(
      JSON.stringify(
        {
          source: target,
          video_embed: videoEmbed,
          ad_redirect: adRedirect,
        },
        null,
        2
      ),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
}
