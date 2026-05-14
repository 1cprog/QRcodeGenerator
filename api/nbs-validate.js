export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      s: { code: 405, desc: "Method Not Allowed" },
      e: ["Only POST is allowed"],
    });
  }

  try {
    const payload =
      typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body ?? "");

    const nbsResponse = await fetch(
      "https://nbs.rs/QRcode/api/qr/v1/validate?lang=en",
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain; charset=UTF-8",
        },
        body: payload,
      }
    );

    const text = await nbsResponse.text();

    res.status(nbsResponse.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.send(text);
  } catch (error) {
    return res.status(500).json({
      s: { code: 500, desc: "Proxy error" },
      e: [String(error?.message || error)],
    });
  }
}