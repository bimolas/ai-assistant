/* Simple local proxy for LLM requests (OpenRouter). Useful for testing from device.
   Usage:
     OPENROUTER_API_KEY=your_key node server/proxy.js

   Notes:
   - This is for local testing only. Don't deploy this without securing it.
   - For a production-ready proxy, deploy to Vercel/Lambda and secure with authentication.
*/
const http = require("http");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_KEY) {
  console.error("Missing OPENROUTER_API_KEY environment variable");
  process.exit(1);
}

async function callOpenRouter(prompt) {
  const body = JSON.stringify({
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
    body,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`OpenRouter ${resp.status}: ${txt}`);
  }

  const j = await resp.json();
  const reply =
    j?.choices?.[0]?.message?.content ??
    j?.output ??
    j?.result ??
    JSON.stringify(j);
  return String(reply);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "POST" && url.pathname === "/proxy") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const json = JSON.parse(body || "{}");
        const prompt = json.prompt || json.text || "";
        if (!prompt) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing prompt" }));
          return;
        }

        const reply = await callOpenRouter(prompt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ text: reply }));
      } catch (err) {
        console.error("Proxy error:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  console.log(`LLM proxy listening on http://0.0.0.0:${PORT}/proxy`);
});
