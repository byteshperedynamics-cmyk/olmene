// Pins for the "your site, live" screenshot.
//   deno test --allow-all supabase/functions/free-audit/shot.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { pinsFrom } from "./shot.ts";

const el = (text: string, top: number, attrs: Record<string, string> = {}, w = 200, h = 40) => ({
  text, top, left: 100, width: w, height: h, attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
});

Deno.test("pins: headline, call to action, pricing link, images without alt", () => {
  const scraped = [
    { selector: "h1", results: [el("Ship faster", 120)] },
    { selector: "a, button, input[type=submit]", results: [el("Pricing", 20, { href: "/pricing" }), el("Start free", 300)] },
    { selector: "img", results: [el("", 400, {}, 300, 200), el("", 420, { alt: "" }, 300, 200), el("", 2000, {}, 300, 200)] },
    { selector: "form", results: [] },
  ];
  const checklist = [
    { check: "Single H1", status: "pass" as const, detail: "" },
    { check: "Call-to-action", status: "pass" as const, detail: "" },
    { check: "Image alt coverage", status: "fail" as const, detail: "" },
  ];
  const pins = pinsFrom(scraped, checklist, ["Start free"]);
  assertEquals(pins.map((p) => p.kind), ["h1", "cta", "pricing", "image-alt"]);
  assertEquals(pins[0].box, { x: 100, y: 120, w: 200, h: 40 });
  assertEquals(pins[3].status, "fail");
});

Deno.test("pins: elements below the first screen are left out", () => {
  const pins = pinsFrom([{ selector: "h1", results: [el("Below", 900)] }], [], []);
  assertEquals(pins.length, 0);
});
