export const config = {
  runtime: "edge",
};

export default function handler(req) {
  const { searchParams } = new URL(req.url);

  const url = searchParams.get("url");
  const trid = searchParams.get("trid");
  const trtype = searchParams.get("trtype");

  return new Response(
    JSON.stringify({
      parsed: {
        url,
        trid,
        trtype,
      },
    }, null, 2),
    { headers: { "content-type": "application/json" } }
  );
}
