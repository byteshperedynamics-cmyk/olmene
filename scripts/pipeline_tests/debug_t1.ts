/** Debug T1: run the failing corpus samples against the enhanced parseLlmJson. */
const P = (globalThis as Record<string, unknown>).__PIPE__ as Record<string, unknown>;
if (!P) throw new Error("__PIPE__ not set — import pipeline_mod_enhanced.ts first");
const parseLlmJson = P.parseLlmJson as (raw: string) => unknown;

const samples: Array<[string, string]> = [
  ["09 unescaped tab", '{"name":"Acme","notes":"col1\tcol2"}'],
  ["10 smart quotes", '{"name":\u201CAcme\u201D,"pricing":"\u20AC19/mo"}'],
  ["11 single quotes", "{'name':'Acme','pricing':'\u20AC19/mo'}"],
  ["12 Python literals", '{"name":"Acme","active":True,"parent":None}'],
  ["14 NaN", '{"name":"Acme","ratio":NaN}'],
  ["18 unquoted keys", '{name:"Acme",pricing:"\u20AC19/mo"}'],
  ["19 two objects", '{"name":"Acme"}\n\n{"other":true}'],
];
for (const [label, raw] of samples) {
  try {
    const v = parseLlmJson(raw);
    console.log(label, "OK ->", JSON.stringify(v).slice(0, 60));
  } catch (e) {
    console.log(label, "FAIL ->", String(e).slice(0, 90));
  }
}
