// MinhaImob — Chat dos corretores virtuais (streaming SSE)
// Secrets: ANTHROPIC_API_KEY (obrigatório), ANTHROPIC_MODEL (opcional), AI_EFFORT_CHAT (opcional)
import Anthropic from "npm:@anthropic-ai/sdk";
import { corsHeaders, json } from "../_shared/cors.ts";
import { userClient } from "../_shared/auth.ts";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const EFFORT = Deno.env.get("AI_EFFORT_CHAT") ?? "low";
const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const REGRAS = `
Você trabalha no escritório virtual da MinhaImob, uma plataforma de vendas de imóveis no Brasil.
Regras de operação:
- Responda sempre em português do Brasil, direto ao ponto, em tom de colega experiente de vendas.
- Use os dados do CRM que vierem em <contexto_crm>. Cite nomes, valores e unidades reais quando existirem.
- Nunca invente dados de imóveis, taxas oficiais ou aprovações de crédito. Se faltar dado, diga o que falta.
- Valores de crédito são estimativas; a aprovação final é do banco (Caixa/SBPE).
- Quando entregar mensagens para o cliente (WhatsApp, e-mail), entregue o texto pronto para copiar.
- Prefira listas curtas e próximos passos acionáveis. Sem enrolação.
- Respeite a LGPD: não peça nem exponha dados sensíveis além do necessário para a venda.`.trim();

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const ctx = await userClient(req);
  if (!ctx) return json({ error: "não autenticado" }, 401);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

  let body: {
    agent_id?: string;
    persona?: { nome: string; papel: string; system_prompt: string };
    messages: Msg[];
    contexto?: unknown;
    conversation_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!Array.isArray(body.messages) || body.messages.length === 0) return json({ error: "messages vazio" }, 400);

  // Persona: do banco (personalizável por imobiliária) ou enviada pelo cliente
  let persona = body.persona;
  let orgId: string | null = null;
  if (body.agent_id) {
    const { data } = await ctx.sb.from("ai_agents").select("nome,papel,system_prompt,org_id").eq("id", body.agent_id).single();
    if (data) { persona = data; orgId = data.org_id; }
  }
  if (!persona) return json({ error: "agente não encontrado" }, 404);

  // Histórico limpo e alternado; contexto do CRM vai na última mensagem do usuário
  const history: Msg[] = body.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-30);
  if (history.length === 0 || history[history.length - 1].role !== "user") return json({ error: "última mensagem deve ser do usuário" }, 400);
  const last = history[history.length - 1];
  const contexto = body.contexto ? `<contexto_crm>\n${JSON.stringify(body.contexto)}\n</contexto_crm>\n\n` : "";
  const messages = [...history.slice(0, -1), { role: "user" as const, content: contexto + last.content }];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let full = "";
      try {
        // deno-lint-ignore no-explicit-any
        const params: any = {
          model: MODEL,
          max_tokens: 64000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: EFFORT },
          system: [
            { type: "text", text: `${persona!.system_prompt}\n\n${REGRAS}`, cache_control: { type: "ephemeral" } },
          ],
          messages,
        };
        const s = client.beta.messages.stream(params);
        for await (const event of s) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            send({ t: "delta", text: event.delta.text });
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") {
          send({ t: "error", error: "O modelo recusou esta solicitação. Reformule o pedido." });
        }
        send({ t: "done", usage: final.usage, model: final.model });

        if (body.conversation_id && full) {
          if (!orgId) {
            const { data } = await ctx.sb.from("ai_conversations").select("org_id").eq("id", body.conversation_id).single();
            orgId = data?.org_id ?? null;
          }
          if (orgId) {
            await ctx.sb.from("ai_messages").insert([
              { org_id: orgId, conversation_id: body.conversation_id, role: "user", content: last.content },
              { org_id: orgId, conversation_id: body.conversation_id, role: "assistant", content: full,
                tokens: final.usage.output_tokens },
            ]);
            await ctx.sb.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", body.conversation_id);
          }
        }
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError) send({ t: "error", error: "Limite de uso da IA atingido. Tente em instantes." });
        else if (err instanceof Anthropic.APIError) send({ t: "error", error: `Erro da IA (${err.status}): ${err.message}` });
        else send({ t: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
});
