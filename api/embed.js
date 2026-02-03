export const config = {
  runtime: "edge",
};

export default function handler(req) {
  const { searchParams } = new URL(req.url);

  const baseUrl = searchParams.get("url");
  const trid = searchParams.get("trid");
  const trtype = searchParams.get("trtype");

  let fullUrl = baseUrl;

  // Only rebuild if baseUrl exists
  if (baseUrl) {
    const urlObj = new URL(baseUrl);

    // Re-attach params ONLY if they exist
    if (trid !== null) urlObj.searchParams.set("trid", trid);
    if (trtype !== null) urlObj.searchParams.set("trtype", trtype);

    fullUrl = urlObj.toString();
  }

  return new Response(
    JSON.stringify(
      {
        parsed: {
          url: baseUrl,
          trid,
          trtype,
        },
        full_url: fullUrl,
      },
      null,
      2
    ),
    {
      headers: { "content-type": "application/json" },
    }
  );
}
