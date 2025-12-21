// Vercel serverless proxy for OpenRouter.
// Deploy this file as an API route on Vercel (e.g. /api/proxy) and set
// the environment variable OPENROUTER_API_KEY in the Vercel project settings.
// Usage (after deploy): POST { prompt: "..." } -> { text: "..." }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const prompt = body.prompt || body.text || "";
    if (!prompt) return res.status(400).json({ error: "Missing prompt" });

    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_KEY) {
      return res
        .status(500)
        .json({ error: "Server missing OPENROUTER_API_KEY" });
    }

    const payload = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Unit 2B, a concise helpful voice assistant.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 250,
      temperature: 0.2,
    });

    const resp = await fetch("https://api.openrouter.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
      },
      body: payload,
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      return res
        .status(502)
        .json({ error: `OpenRouter ${resp.status}: ${txt}` });
    }

    const j = await resp.json();
    const reply =
      j?.choices?.[0]?.message?.content ??
      j?.output ??
      j?.result ??
      JSON.stringify(j);
    return res.status(200).json({ text: String(reply) });
  } catch (err) {
    console.error("Vercel proxy error:", err);
    return res.status(500).json({ error: String(err) });
  }
}
