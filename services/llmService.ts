import Constants from "expo-constants";

type LLMOptions = {
  model?: string;
  timeoutMs?: number;
};

export async function queryLLM(
  prompt: string,
  opts?: LLMOptions
): Promise<string> {
  const extra =
    (Constants.manifest && (Constants.manifest as any).extra) ||
    (Constants.expoConfig && (Constants.expoConfig as any).extra) ||
    {};
  const proxy = extra?.LLM_PROXY_URL || process.env.LLM_PROXY_URL;
  const openrouterKey =
    extra?.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
  const hfKey = extra?.HUGGINGFACE_API_KEY || process.env.HUGGINGFACE_API_KEY;
  const hfModel = extra?.HUGGINGFACE_MODEL || process.env.HUGGINGFACE_MODEL;
  const timeoutMs = opts?.timeoutMs ?? 20000;
  // Default model: exact OpenRouter model ID provided by user
  const model = opts?.model ?? "tngtech/deepseek-r1t2-chimera:free";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1) Try proxy if configured
    if (proxy) {
      console.debug("LLM: using proxy", proxy);
      try {
        const resp = await fetch(proxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(`Proxy error ${resp.status}: ${txt}`);
        }
        const json = await resp.json();
        return (
          json?.text ??
          json?.result ??
          json?.output ??
          JSON.stringify(json)
        ).toString();
      } catch (err: any) {
        clearTimeout(timeout);
        console.warn("LLM proxy request failed:", err?.message || err);
        // continue to try other providers
      }
    }

    // 2) Try direct OpenRouter if key exists
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

    if (openrouterKey) {
      try {
        console.debug("LLM: calling OpenRouter");
        console.debug("LLM: calling OpenRouter (SDK preferred)");

        // Try to use the official OpenRouter SDK if available (preferred).
        try {
          // dynamic import so the code still works if the SDK isn't installed
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const OpenRouterModule: any = await import("@openrouter/sdk");

          // The SDK exports a named `OpenRouter` or a default. Try to find
          // a constructor we can call.
          const OpenRouterCtor =
            OpenRouterModule?.OpenRouter ??
            OpenRouterModule?.default ??
            OpenRouterModule;

          if (typeof OpenRouterCtor === "function") {
            const client = new OpenRouterCtor({ apiKey: openrouterKey });

            // Preferred SDK call shape per OpenRouter docs: `client.chat.send`.
            if (client.chat && typeof client.chat.send === "function") {
              const res = await client.chat.send({
                model,
                messages: [{ role: "user", content: prompt }],
                stream: false,
              });
              const txt =
                res?.choices?.[0]?.message?.content ??
                res?.output ??
                res?.result;
              if (txt) return String(txt).trim();
            }

            // Older or alternate shapes: responses.create
            if (
              client.responses &&
              typeof client.responses.create === "function"
            ) {
              const res = await client.responses.create({
                model,
                input: prompt,
              });
              const out = res?.output ?? res?.result ?? res;
              const txt = (out?.[0]?.content?.[0]?.text ??
                out?.[0]?.content ??
                out?.text) as any;
              if (txt) return String(txt).trim();
            }

            // Another common shape: chat.completions.create
            if (
              client.chat &&
              client.chat.completions &&
              typeof client.chat.completions.create === "function"
            ) {
              const res = await client.chat.completions.create({
                model,
                messages: [{ role: "user", content: prompt }],
              });
              const txt =
                res?.choices?.[0]?.message?.content ??
                res?.output ??
                res?.result;
              if (txt) return String(txt).trim();
            }

            // Generic create
            if (typeof client.create === "function") {
              const res = await client.create({ model, input: prompt });
              const txt = res?.output ?? res?.result ?? res;
              if (txt) return String(txt).trim();
            }

            console.debug(
              "OpenRouter SDK present but no known response shape produced"
            );
          }
        } catch (sdkErr: any) {
          console.debug(
            "OpenRouter SDK import/usage failed, falling back to HTTP fetch:",
            sdkErr?.message || sdkErr
          );
        }

        // SDK not available or failed: fall back to HTTP POST (existing behavior)
        console.debug("LLM: calling OpenRouter HTTP endpoint as fallback");
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

        clearTimeout(timeout);
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(`OpenRouter error ${resp.status}: ${txt}`);
        }
        const j = await resp.json();
        const reply =
          j?.choices?.[0]?.message?.content ??
          j?.output ??
          j?.result ??
          JSON.stringify(j);
        return String(reply).trim();
      } catch (err: any) {
        clearTimeout(timeout);
        const code = err?.cause?.code || err?.code || "";
        console.warn("OpenRouter request failed:", err?.message || err);
        if (String(code).toUpperCase().includes("ENOTFOUND")) {
          throw new Error(
            "Network/DNS error: could not resolve api.openrouter.ai. Check your network, DNS, or VPN and try again."
          );
        }
        // continue to HF fallback
      }
    } else {
      console.debug("LLM: no OpenRouter key configured");
    }

    // 3) Try Hugging Face if configured (fallback)
    if (hfKey && hfModel) {
      try {
        console.debug("LLM: calling Hugging Face model", hfModel);
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

        clearTimeout(timeout);
        if (!hfResp.ok) {
          const txt = await hfResp.text().catch(() => "");
          throw new Error(`HuggingFace error ${hfResp.status}: ${txt}`);
        }
        const data = await hfResp.json();
        if (Array.isArray(data) && data[0]?.generated_text)
          return data[0].generated_text;
        if (data.generated_text) return data.generated_text;
        return JSON.stringify(data);
      } catch (err: any) {
        clearTimeout(timeout);
        console.warn("Hugging Face request failed:", err?.message || err);
      }
    }

    throw new Error(
      "No LLM provider succeeded (proxy, OpenRouter, or Hugging Face)"
    );
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default { queryLLM };
