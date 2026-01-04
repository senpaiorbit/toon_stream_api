export const config = { runtime: "edge" };

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get("url");

    if (!target) {
      return json({ ok: false, error: "NO_URL" });
    }

    const res = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });

    const html = await res.text();

    // Fast iframe src extract (no DOM libs)
    const match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);

    return json({
      ok: !!match,
      url: match ? match[1] : null
    });

  } catch (e) {
    return json({ ok: false, error: "FETCH_FAILED" });
  }
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  });
}
