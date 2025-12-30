export type LLMOptions = {
  model?: string;
  timeoutMs?: number;
};

export async function queryLLM(
  prompt: string,
  opts?: LLMOptions
): Promise<string> {
  // Using direct values (no expo config). Replace the placeholder with your key.
  const proxy = process.env.LLM_PROXY_URL;
  const openrouterKey =
    "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"; // <-- put your OpenRouter API key here
  const hfKey =
    "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";
  const hfModel = process.env.HUGGINGFACE_MODEL;
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const model = opts?.model ?? process.env.LLM_MODEL ?? "deepseek/deepseek-r1";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1) Proxy
    if (proxy) {
      const resp = await fetch(proxy, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Proxy error ${resp.status}: ${txt}`);
      }
      const json = await resp.json().catch(() => null);
      if (json)
        return (
          json?.text ??
          json?.result ??
          json?.output ??
          JSON.stringify(json)
        ).toString();
      // fallback to text if json parse failed but body has text
      const txtFallback = await resp.text().catch(() => null);
      if (txtFallback) return txtFallback.toString();
    }

    // 2) OpenRouter HTTP
    if (openrouterKey) {
      const body = {
        model,
        messages: [
          {
            role: "system",
            content:
              "You are Unit 2B, a concise useful voice assistant; answer briefly and clearly.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 250,
        temperature: 0.2,
      };

      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openrouterKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }
      );

      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`OpenRouter error ${resp.status}: ${txt}`);
      }
      const j = await resp.json().catch(() => null);
      if (j)
        return String(
          j?.choices?.[0]?.message?.content ??
            j?.choices?.[0]?.text ??
            j?.output ??
            j?.result ??
            JSON.stringify(j)
        );
      // fallback to raw text body
      const orText = await resp.text().catch(() => null);
      if (orText) return orText.toString();
    }

    // 3) Hugging Face
    if (hfKey && hfModel) {
      const hfResp = await fetch(
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
          signal: controller.signal,
        }
      );
      if (!hfResp.ok) {
        const txt = await hfResp.text().catch(() => "");
        throw new Error(`HuggingFace error ${hfResp.status}: ${txt}`);
      }
      const data = await hfResp.json().catch(() => null);
      if (data) {
        if (Array.isArray(data) && data[0]?.generated_text)
          return data[0].generated_text;
        if (data.generated_text) return data.generated_text;
        return JSON.stringify(data);
      }
      const hfText = await hfResp.text().catch(() => null);
      if (hfText) return hfText.toString();
    }

    throw new Error(
      "No LLM provider succeeded (proxy, OpenRouter, or Hugging Face)"
    );
  } finally {
    clearTimeout(timeout);
  }
}

export default { queryLLM };
