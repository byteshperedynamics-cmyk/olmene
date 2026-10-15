/**
 * One email per notification kind. Pure: payload in, subject/text/html out.
 * Copy follows Olmene's voice: say what happened and the one next step; no
 * hype, no invented numbers (everything shown comes from the payload).
 */
import { escapeHtml, layout } from "../_shared/email.ts";

export interface Rendered {
  subject: string;
  text: string;
  html: string;
  /** Optional mail (digests) carries a one-click unsubscribe. */
  optional: boolean;
}

// deno-lint-ignore no-explicit-any
type Payload = Record<string, any>;

const e = (v: unknown) => escapeHtml(String(v ?? ""));

export function render(kind: string, p: Payload, appUrl: string, footer: string): Rendered | null {
  const app = appUrl.replace(/\/$/, "");
  const html = (heading: string, paragraphs: string[], cta?: { label: string; url: string }, tone: "default" | "attention" = "default") => layout({ heading, paragraphs, cta, footer, tone });
  switch (kind) {
    case "report_ready": {
      const url = `${app}/app/report/?id=${encodeURIComponent(p.jobId ?? "")}`;
      const score = typeof p.score === "number" ? ` It scores ${p.score}/100.` : "";
      return {
        subject: `Your Olmene report for ${p.site} is ready`,
        text: `Your report for ${p.site} is ready.${score}${p.headline ? `\n\n${p.headline}` : ""}\n\nRead it: ${url}`,
        html: html(`Your report for ${p.site} is ready`, [`${e(p.headline ?? "Your market research, competitor analysis, audit and 90-day plan are ready.")}${e(score)}`], { label: "Read the report", url }),
        optional: false,
      };
    }
    case "pr_opened": {
      const receipt = `${app}/app/agent/job/${encodeURIComponent(p.jobId ?? "")}`;
      const fixes = `${p.fixes} fix${p.fixes === 1 ? "" : "es"}`;
      return {
        subject: `Pull request #${p.prNumber} is ready for review (${p.repo})`,
        text: `Olmene opened pull request #${p.prNumber} on ${p.repo} with ${fixes}. Nothing merges without you.\n\nReview it on GitHub: ${p.prUrl}\nWhat changed and how to undo it: ${receipt}`,
        html: html(`Pull request #${p.prNumber} is ready for review`, [
          `Olmene opened a pull request on <strong>${e(p.repo)}</strong> with ${e(fixes)}. Nothing merges without you.`,
          `After you merge, Olmene checks your live site to confirm each fix is live. <a href="${e(receipt)}">See what changed and how to undo it</a>.`,
        ], { label: "Review on GitHub", url: String(p.prUrl ?? receipt) }),
        optional: false,
      };
    }
    case "fixes_live": {
      const url = `${app}/app/agent/job/${encodeURIComponent(p.jobId ?? "")}`;
      return {
        subject: `${p.passed} of ${p.total} merged fixes are live on ${p.site}`,
        text: `Olmene checked ${p.site} after your merge: ${p.passed} of ${p.total} fixes are live. It re-checks them every week and tells you if one stops working.\n\n${url}`,
        html: html(`Your fixes are live on ${p.site}`, [`Olmene checked your live site after the merge: <strong>${e(p.passed)} of ${e(p.total)}</strong> fixes are live. It re-checks them every week and tells you if one stops working.`], { label: "See the check", url }),
        optional: false,
      };
    }
    case "guided_live": {
      const url = `${app}/app/agent/guided/${encodeURIComponent(p.runId ?? "")}`;
      return {
        subject: `All ${p.total} of your changes are live on ${p.site}`,
        text: `Olmene checked ${p.site}: all ${p.total} changes from your guided fix list are live. Nice work.\n\n${url}`,
        html: html(`Your changes are live on ${p.site}`, [`Olmene checked your live site: <strong>all ${e(p.total)}</strong> changes from your guided fix list are live${p.platform ? ` on ${e(p.platform)}` : ""}.`], { label: "See the check", url }),
        optional: false,
      };
    }
    case "ai_visibility_change": {
      const url = `${app}/app/sites/?site=${encodeURIComponent(p.siteId ?? "")}&tab=ai`;
      const lines = ((p.summary as string[] | undefined) ?? []).slice(0, 4);
      return {
        subject: `AI search: what changed for ${p.site} this week`,
        text: `Olmene asked an AI assistant with web search ${p.questions} questions your buyers ask.\n\n${lines.join("\n")}\n\n${url}`,
        html: html(`AI search: what changed for ${p.site}`, [`Olmene asked an AI assistant with web search ${e(p.questions)} questions your buyers ask.`, lines.map((l) => e(l)).join("<br>")], { label: "See the answers", url }),
        optional: true,
      };
    }
    case "fix_regression": {
      const url = `${app}/app/agent/job/${encodeURIComponent(p.jobId ?? "")}`;
      const items = (p.regressed as string[] | undefined) ?? [];
      return {
        subject: `A merged fix stopped working on ${p.site}`,
        text: `This week's re-check of ${p.site} found that these merged fixes are no longer live: ${items.join(", ")}. A later change probably removed them.\n\n${url}`,
        html: html(`A merged fix stopped working on ${p.site}`, [`This week's re-check found that these fixes are no longer on your live site: <strong>${items.map(e).join(", ")}</strong>.`, "A later change to the site probably removed them. You can start a new fix run to put them back."], { label: "See what changed", url }, "attention"),
        optional: false,
      };
    }
    case "site_regression": {
      const url = `${app}/app/`;
      const items = (p.regressed as Array<{ check: string; after: string }> | undefined) ?? [];
      const list = items.map((r) => `${r.check} (now ${r.after})`);
      return {
        subject: `${items.length} check${items.length === 1 ? "" : "s"} got worse on ${p.site}`,
        text: `Olmene's weekly scan of ${p.site} found ${items.length} check${items.length === 1 ? "" : "s"} that passed last week and don't now: ${list.join(", ")}.${typeof p.score === "number" ? ` Readiness: ${p.score}/100${typeof p.previousScore === "number" ? ` (was ${p.previousScore})` : ""}.` : ""}\n\n${url}`,
        html: html(`Something changed on ${p.site}`, [`This week's scan found ${items.length === 1 ? "a check" : `${items.length} checks`} that passed last week and doesn't now:`, `<strong>${list.map(e).join("<br>")}</strong>`, typeof p.score === "number" ? `Readiness: ${e(p.score)}/100${typeof p.previousScore === "number" ? ` (was ${e(p.previousScore)})` : ""}.` : ""].filter(Boolean), { label: "Open Olmene", url }, "attention"),
        optional: false,
      };
    }
    case "competitor_change": {
      const changes = (p.changes as string[] | undefined) ?? [];
      return {
        subject: `${p.competitor} changed their homepage`,
        text: `While watching ${p.site}, Olmene noticed changes on ${p.competitor} (${p.url}):\n- ${changes.join("\n- ")}\n\nWorth a look before your next update.`,
        html: html(`${p.competitor} changed their homepage`, [`While watching ${e(p.site)}, Olmene noticed changes on <a href="${e(p.url)}">${e(p.competitor)}</a>:`, changes.map((c) => `• ${e(c)}`).join("<br>")], undefined),
        optional: true,
      };
    }
    case "weekly_digest": {
      const sites = (p.sites as Array<{ host: string; score: number | null; delta: number | null; regressions: number; failing: number }> | undefined) ?? [];
      const lines = sites.map((s) => `${s.host}: ${s.score ?? "–"}/100${s.delta ? ` (${s.delta > 0 ? "+" : ""}${s.delta})` : ""}, ${s.failing} open finding${s.failing === 1 ? "" : "s"}${s.regressions ? `, ${s.regressions} got worse` : ""}`);
      const extra = [
        p.awaitingApproval ? `${p.awaitingApproval} fix run${p.awaitingApproval === 1 ? " is" : "s are"} waiting for your review.` : "",
        p.openPrs ? `${p.openPrs} pull request${p.openPrs === 1 ? " is" : "s are"} open on GitHub.` : "",
      ].filter(Boolean);
      return {
        subject: `Your weekly Olmene summary`,
        text: `This week on your sites:\n- ${lines.join("\n- ")}\n${extra.join("\n")}\n\n${app}/app/`,
        html: html("Your week on Olmene", [lines.map(e).join("<br>"), ...extra.map(e)], { label: "Open Olmene", url: `${app}/app/` }),
        optional: true,
      };
    }
    case "workspace_invite": {
      // Sent to the invited address (notify/index.ts); the link is the only way in.
      const link = typeof p.link === "string" && /^https:\/\/[^\s"<>]+$/.test(p.link) ? p.link : null;
      if (!link) return null;
      const roles: Record<string, string> = {
        admin: "an admin. You'll manage the team and connections, and do every kind of work",
        member: "a member. You'll run scans, reports and fixes",
        viewer: "a viewer. You'll see the reports, sites and fixes",
      };
      const role = roles[String(p.role)] ?? roles.member;
      const who = String(p.inviter ?? "").trim() || "Someone";
      const workspace = String(p.workspace ?? "").trim() || "a workspace";
      const until = typeof p.expiresAt === "string" && !Number.isNaN(Date.parse(p.expiresAt))
        ? new Date(p.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })
        : null;
      return {
        subject: `${who} invited you to ${workspace} on Olmene`,
        text: `${who} invited you to join ${workspace} on Olmene as ${role}.\n\nOlmene finds what's costing a website customers and ships the fixes as pull requests the team reviews.\n\nJoin ${workspace}: ${link}${until ? `\n\nThe link works until ${until}.` : ""}`,
        html: html(`Join ${workspace} on Olmene`, [
          `<strong>${e(who)}</strong> invited you to join <strong>${e(workspace)}</strong> as ${e(role)}.`,
          `Olmene finds what's costing a website customers and ships the fixes as pull requests the team reviews.${until ? ` The link works until ${e(until)}.` : ""}`,
        ], { label: `Join ${workspace}`, url: link }),
        optional: false,
      };
    }
    default:
      return null;
  }
}
