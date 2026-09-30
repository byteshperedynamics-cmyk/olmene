/** Isolate parseTolerant from the patched module and surface its real errors. */
const src = await Deno.readTextFile(new URL("./pipeline_mod_enhanced.ts", import.meta.url).pathname);
// Extract just the parseTolerant function (from its declaration to the next top-level function comment)
const start = src.indexOf("function parseTolerant");
const end = src.indexOf("/** Return the first {...} span");
if (start === -1 || end === -1) throw new Error("cannot locate parseTolerant");
const fn = src.slice(start, end);
const mod = fn + "\nglobalThis.__PT__ = parseTolerant;";
await Deno.writeTextFile("/tmp/pt_isolated.ts", mod);
await import("file:///tmp/pt_isolated.ts");
const pt = (globalThis as Record<string, unknown>).__PT__ as (t: string) => unknown;

const samples: Array<[string, string]> = [
  ["09 unescaped tab", '{"name":"Acme","notes":"col1\tcol2"}'],
  ["10 smart quotes", '{"name":\u201CAcme\u201D,"pricing":"\u20AC19/mo"}'],
  ["11 single quotes", "{'name':'Acme','pricing':'\u20AC19/mo'}"],
  ["12 Python literals", '{"name":"Acme","active":True,"parent":None}'],
  ["14 NaN", '{"name":"Acme","ratio":NaN}'],
  ["18 unquoted keys", '{name:"Acme",pricing:"\u20AC19/mo"}'],
  ["clean", '{"name":"Acme"}'],
];
for (const [label, raw] of samples) {
  try {
    const v = pt(raw);
    console.log(label, "OK ->", JSON.stringify(v).slice(0, 50));
  } catch (e) {
    console.log(label, "THROW ->", String((e as Error).message).slice(0, 70));
  }
}
