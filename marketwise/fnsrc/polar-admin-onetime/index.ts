// Temp admin fn (task 24): create the one-time "Single Report" product in
// Polar using the org's default presentment currency (read from an existing
// product first). Deleted after use — never leave an admin fn live.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const token = Deno.env.get("POLAR_ACCESS_TOKEN") ?? "";
  const server = Deno.env.get("POLAR_SERVER") ?? "sandbox";
  const base = server === "production" ? "https://api.polar.sh/v1" : "https://api.sandbox.polar.sh/v1";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  try {
    // 1. Read currency from the existing Starter product (org default must
    //    be present in the prices array per the 422).
    const starterId = "7e27d794-9e05-463b-82e3-44016c3e1495";
    const r0 = await fetch(`${base}/products/${starterId}`, { headers });
    if (!r0.ok) return json({ step: "read-starter", error: r0.status, body: (await r0.text()).slice(0, 400) }, 500);
    const starter = await r0.json();
    const price = (starter.prices ?? [])[0] ?? {};
    const currency = price.price_currency ?? "usd";
    const amount = price.price_amount ?? 1900; // fall back to Starter's amount scale

    // 2. Create the one-time product in the same currency. $14-equivalent:
    //    keep the same numeric scale as the org's Starter price (1900 units
    //    for $19) → 1400 units.
    const body = {
      name: "Single Report",
      description:
        "One full Marketwise marketing analysis: live market and competitor research with citations, the five-part site audit, scored report and a 7/30/60/90-day roadmap. One website, one payment — the report credit is valid for 90 days. No subscription.",
      prices: [
        {
          amount_type: "fixed",
          price_amount: 1400,
          price_currency: currency,
        },
      ],
      metadata: { kind: "one_time", reports: "1" },
    };
    const r = await fetch(`${base}/products`, { method: "POST", headers, body: JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) return json({ step: "create", currency, error: r.status, body: text.slice(0, 800) }, 500);
    const p = JSON.parse(text);
    return json({
      ok: true,
      currency,
      starter_price: { amount, currency },
      id: p.id,
      name: p.name,
      prices: (p.prices ?? []).map((pr: Record<string, unknown>) => ({
        id: pr.id,
        amount: pr.price_amount,
        currency: pr.price_currency,
        type: pr.type,
        interval: pr.recurring_interval,
      })),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
