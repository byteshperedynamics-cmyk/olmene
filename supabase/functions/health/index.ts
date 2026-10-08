/**
 * health — spec §7. GET, trivial DB query. Used by the keep-alive workflow.
 */ import { createClient } from "npm:@supabase/supabase-js@2.117.1";
// Inlined from the deployed bundle's _shared/auth.ts so this folder deploys on its own.
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
Deno.serve(async ()=>{
  try {
    const supabase = serviceClient();
    const { error } = await supabase.from("plans").select("polar_product_id").limit(1);
    if (error) throw error;
    return new Response(JSON.stringify({
      ok: true
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: e.message
    }), {
      status: 503,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
