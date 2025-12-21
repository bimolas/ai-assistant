// Simple test harness to call the LLM providers without running the app.
// Usage:
//   OPENROUTER_API_KEY=sk_xxx node server/test-llm.js
//   LLM_PROXY_URL=http://localhost:3000/proxy node server/test-llm.js
// Optional env: HUGGINGFACE_API_KEY and HUGGINGFACE_MODEL
// Try to load .env for local development (optional). If `dotenv` is not
// installed this will be silently ignored so the script still works when
// vars are provided externally (e.g. `OPENROUTER_API_KEY=... node ...`).
try {
  require("dotenv").config();
} catch (e) {
  // dotenv isn't installed — that's fine, continue without it.
}

// Default model used for quick local testing. Override with LLM_MODEL env var.
const DEFAULT_MODEL = process.env.LLM_MODEL || "deepseek/deepseek-r1";

async function main() {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  const hfModel = process.env.HUGGINGFACE_MODEL;

  const prompt = process.argv.slice(2).join(" ") || "Hello from test harness";

  console.log("Using prompt:", prompt);
  console.log("OpenRouter key present:", !!openrouterKey);
  console.log("HuggingFace key+model present:", !!hfKey, !!hfModel);

  try {
    if (openrouterKey) {
      console.log("Calling OpenRouter HTTP endpoint...");
      const body = JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
      });
      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterKey}`,
          },
          body,
        }
      );
      console.log("OpenRouter status:", resp.status);
      const txt = await resp.text();
      console.log("OpenRouter body:", txt);
      return;
    }

    if (hfKey && hfModel) {
      console.log("Calling Hugging Face inference...");
      const resp = await fetch(
        `https://api-inference.huggingface.co/models/${encodeURIComponent(
          hfModel
        )}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: prompt,
            options: { wait_for_model: true },
          }),
        }
      );
      console.log("HF status:", resp.status);
      const txt = await resp.text();
      console.log("HF body:", txt);
      return;
    }

    console.error(
      "No provider configured. Set LLM_PROXY_URL or OPENROUTER_API_KEY or HUGGINGFACE_API_KEY+HUGGINGFACE_MODEL"
    );
  } catch (err) {
    console.error("LLM test failed:", err);
  }
}

main();
