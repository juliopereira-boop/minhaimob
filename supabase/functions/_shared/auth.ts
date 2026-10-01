import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Cliente Supabase agindo como o usuário (RLS aplicada) + usuário autenticado. */
export async function userClient(req: Request): Promise<{ sb: SupabaseClient; userId: string } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return { sb, userId: data.user.id };
}
