// Temp admin fn: inspect (and optionally update) Polar products using stored secrets.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const token = Deno.env.get("POLAR_ACCESS_TOKEN") ?? "";
  const server = Deno.env.get("POLAR_SERVER") ?? "sandbox";
  const base = server === "production" ? "https://api.polar.sh/v1" : "https://api.sandbox.polar.sh/v1";
  const url = new URL(req.url);

  // Action: list | patch
  let action = "list";
  let body: Record<string, unknown> = {};
  try {
    if (req.method === "POST") {
      body = await req.json();
      action = String(body.action ?? "list");
    } else {
      action = url.searchParams.get("action") ?? "list";
    }
  } catch { /* ignore */ }

  const ids = ["7e27d794-9e05-463b-82e3-44016c3e1495", "9f1761be-8e0c-4eb0-8992-45aad45d9758"];
  const out: Record<string, unknown> = { server, action };

  try {
    if (action === "list") {
      const results = [];
      for (const id of ids) {
        const r = await fetch(`${base}/products/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) {
          results.push({ id, error: r.status, body: (await r.text()).slice(0, 500) });
          continue;
        }
        const p = await r.json();
        results.push({
          id,
          name: p.name,
          description: p.description,
          metadata: p.metadata,
          prices: (p.prices ?? []).map((pr: Record<string, unknown>) => ({ id: pr.id, amount: pr.price_amount, interval: pr.recurring_interval })),
          benefits: p.benefits,
        });
      }
      out.products = results;
    } else if (action === "patch") {
      const results = [];
      for (const id of ids) {
        const payload = (body.products as Record<string, string>[])?.find((x) => x.id === id);
        if (!payload) continue;
        const r = await fetch(`${base}/products/${id}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ name: payload.name, description: payload.description, metadata: payload.metadata }),
        });
        results.push({ id, status: r.status, body: r.ok ? ((await r.json()) as Record<string, unknown>).name : (await r.text()).slice(0, 300) });
      }
      out.patched = results;
    }
    return json(out);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
