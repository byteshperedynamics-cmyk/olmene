// Alert channels: URL rules, message shapes, signatures.
//   deno test --allow-all supabase/functions/notify/channels.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { allowedHookUrl, discordBody, signBody, slackBody, wants } from "./channels.ts";

Deno.test("only real Slack / Discord hooks; webhooks must be public https", () => {
  assert(allowedHookUrl("slack", "https://hooks.slack.com/services/T000/B000/XXXX"));
  assert(!allowedHookUrl("slack", "https://hooks.slack.com.evil.com/services/T/B/X"));
  assert(allowedHookUrl("discord", "https://discord.com/api/webhooks/123456/abc-DEF_9"));
  assert(!allowedHookUrl("discord", "http://discord.com/api/webhooks/1/a"));
  assert(allowedHookUrl("webhook", "https://hooks.example.org/olmene"));
  assert(!allowedHookUrl("webhook", "https://127.0.0.1/x"));
  assert(!allowedHookUrl("webhook", "https://printer.local/x"));
  assert(!allowedHookUrl("webhook", "https://user:pw@example.org/x"));
});

Deno.test("channel filters and message shapes", () => {
  assert(wants({ kinds: [] }, "pr_opened"));
  assert(!wants({ kinds: ["site_regression"] }, "pr_opened"));
  const s = slackBody("PR #4 is ready", "Olmene opened a pull request.\n\nhttps://olmene.com/app/agent/job/1\n\n—\nStop update emails: x");
  assert(String(s.text).startsWith("*PR #4 is ready*"));
  assert(!String(s.text).includes("Stop update emails"));
  assertEquals((s.blocks as Array<{ type: string }>)[1].type, "actions");
  const d = discordBody("Hello", "World");
  assertEquals(d.content, "**Hello**\nWorld");
});

Deno.test("webhook signatures are stable HMAC-SHA256", async () => {
  const a = await signBody("secret", '{"a":1}');
  assertEquals(a, await signBody("secret", '{"a":1}'));
  assert(a.startsWith("sha256=") && a.length === 71);
});
