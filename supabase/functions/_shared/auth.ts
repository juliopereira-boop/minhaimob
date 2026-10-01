import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Cliente Supabase agindo como o usuário (RLS aplicada) + verificação de plano com IA. */
export async function userClient(req: Request): Promise<{ sb: SupabaseClient; userId: string; orgId: string | null; iaPermitida: boolean } | null> {
  const auth = req.headers.get("Authorization");
  if (!auth) return null;
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  const { data: ia } = await sb.rpc("fn_ia_permitida");
  return { sb, userId: data.user.id, orgId: ia?.org_id ?? null, iaPermitida: !!ia?.permitida };
}

export async function logUso(sb: SupabaseClient, orgId: string | null, userId: string, modo: string, provedor: string, modelo: string, u: { in: number; out: number }) {
  if (!orgId) return;
  await sb.from("ai_uso").insert({ org_id: orgId, user_id: userId, modo, provedor, modelo, tokens_in: u.in, tokens_out: u.out });
}

const MAX_CONHECIMENTO = 150_000; // caracteres injetados por requisição

/** Base de conhecimento dos agentes (agente específico + itens gerais). Mais recentes primeiro. */
export async function carregarConhecimento(sb: SupabaseClient, agentes: string[]): Promise<string> {
  if (!agentes.length) return "";
  const { data } = await sb.from("ai_conhecimento").select("agente,titulo,conteudo,tipo")
    .eq("ativo", true).or(`agente.is.null,agente.in.(${agentes.map((a) => `"${a.replace(/"/g, "")}"`).join(",")})`)
    .order("created_at", { ascending: false }).limit(200);
  let total = 0;
  const partes: string[] = [];
  for (const k of data ?? []) {
    const bloco = `### ${k.titulo}${k.agente ? ` (para ${k.agente})` : " (para todo o time)"}${k.tipo === "regra" ? " [REGRA OBRIGATÓRIA]" : ""}\n${k.conteudo}`;
    if (total + bloco.length > MAX_CONHECIMENTO) break;
    partes.push(bloco); total += bloco.length;
  }
  return partes.length ? `<base_de_conhecimento>\nO gestor ensinou o seguinte ao time. Use como verdade da empresa e siga as regras marcadas como obrigatórias:\n\n${partes.join("\n\n")}\n</base_de_conhecimento>` : "";
}
