import { NextResponse } from "next/server";
import { getServiceDb } from "@/lib/agent/db";
import { agentEnabled } from "@/lib/agent/env";
import { ERR, requireUser } from "@/lib/agent/http";

export const dynamic = "force-dynamic";

/** POST /api/agent/connections/site/[id]/disconnect — forget a Webflow token / WordPress password (the secret is erased). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentEnabled()) return ERR.disabled();
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const db = getServiceDb();
  const { data } = await db.from("connections").select("id, user_id, provider").eq("id", id).maybeSingle();
  if (!data || data.user_id !== auth.user.id || !["webflow", "wordpress"].includes(data.provider)) return ERR.notFound("connection");
  await db.from("connections").update({ status: "disconnected", secret_ciphertext: null, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({
    ok: true,
    manualSteps: data.provider === "webflow"
      ? ["In Webflow: Site settings → Apps & integrations → API access → delete the token you made for Olmene."]
      : ["In WordPress: Users → Profile → Application Passwords → Revoke the one named for Olmene."],
  });
}
