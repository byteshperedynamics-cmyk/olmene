// diag-llm v4: test GLM from Supabase edge runtime
Deno.serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
  const presented = req.headers.get("x-cron-secret") ?? "";
  if (CRON_SECRET.length === 0 || presented.length !== CRON_SECRET.length) {
    return new Response("unauthorized", { status: 401 });
  }
  let diff = 0;
  for (let i = 0; i < CRON_SECRET.length; i++) {
    diff |= presented.charCodeAt(i) ^ CRON_SECRET.charCodeAt(i);
  }
  if (diff !== 0) return new Response("unauthorized", { status: 401 });

  const GLM_API_KEY = Deno.env.get("GLM_API_KEY") ?? "";
  const out: Record<string, unknown> = { glm_key_present: GLM_API_KEY.length > 0 };

  for (const model of ["glm-4.7-flash", "glm-4.5-flash"]) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GLM_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You output only valid JSON." },
            {
              role: "user",
              content:
                "Generate a competitor profile for a CRM SaaS with keys name, strength, weakness.",
            },
          ],
          response_format: { type: "json_object" },
          thinking: { type: "disabled" },
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      const j = await r.json().catch(() => null);
      (out as Record<string, unknown>)[model] = {
        status: r.status,
        ms: Date.now() - t0,
        content: (j?.choices?.[0]?.message?.content ?? "").slice(0, 150),
        finish: j?.choices?.[0]?.finish_reason ?? null,
        err: j?.error?.message ?? null,
      };
    } catch (e) {
      (out as Record<string, unknown>)[model] = {
        error: String(e),
        ms: Date.now() - t0,
      };
    }
  }

  return new Response(JSON.stringify(out), {
    headers: { "Content-Type": "application/json" },
  });
});
