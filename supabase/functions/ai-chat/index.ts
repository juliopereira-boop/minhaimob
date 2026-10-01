// MinhaImob — IA dos corretores virtuais (OpenAI ou Claude)
// mode: "chat" (streaming SSE) | "agent" (resposta + ferramentas) | "json" (saída estruturada)
import { corsHeaders, json } from "../_shared/cors.ts";
import { userClient, logUso, carregarConhecimento } from "../_shared/auth.ts";
import { PROVIDER, MODEL, configured, streamText, complete, jsonOut, type Msg, type Tool } from "../_shared/llm.ts";

const REGRAS = `
Você trabalha no escritório virtual da MinhaImob, uma plataforma de vendas de imóveis no Brasil.
- Responda sempre em português do Brasil, direto ao ponto, como um colega experiente de vendas.
- Quem fala com você é o gestor da imobiliária: obedeça às ordens dele. Quando a ordem exigir uma ação
  (treinar outro corretor, conversar com um colega, fazer reunião, guardar uma regra ou executar uma tarefa),
  use as ferramentas disponíveis e diga em uma frase o que vai fazer.
- Use os dados de <contexto_crm> e da <base_de_conhecimento>. Cite nomes, valores e unidades reais.
- Nunca invente dados de imóveis, taxas oficiais ou aprovação de crédito. Se faltar dado, diga o que falta.
- Mensagens para clientes: entregue o texto pronto para copiar.
- Respeite a LGPD e a ética comercial: recuse apenas ordens ilegais ou enganosas, explicando o porquê.`.trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const ctx = await userClient(req);
  if (!ctx) return json({ error: "não autenticado" }, 401);
  let body: {
    mode?: "chat" | "agent" | "json" | "status"; agent_key?: string; persona?: { system_prompt: string };
    messages?: Msg[]; contexto?: unknown; tools?: Tool[]; system?: string; prompt?: string;
    schema?: Record<string, unknown>; schema_name?: string; knowledge_for?: string[]; conversation_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const mode = body.mode ?? "chat";
  if (mode === "status") return json({ provider: PROVIDER, model: MODEL, erro: configured(), ia_permitida: ctx.iaPermitida });
  const cfgErr = configured();
  if (cfgErr) return json({ error: cfgErr }, 500);
  if (!ctx.iaPermitida) return json({ error: "O plano desta imobiliária não inclui IA." }, 403);

  const agentes = [...new Set([...(body.knowledge_for ?? []), ...(body.agent_key ? [body.agent_key] : [])])];
  const conhecimento = await carregarConhecimento(ctx.sb, agentes);

  try {
    if (mode === "json") {
      if (!body.schema || !body.prompt) return json({ error: "schema e prompt obrigatórios" }, 400);
      const system = [body.system ?? "Responda em português do Brasil.", conhecimento].filter(Boolean).join("\n\n");
      const r = await jsonOut(system, body.prompt, body.schema, body.schema_name ?? "saida", "low");
      await logUso(ctx.sb, ctx.orgId, ctx.userId, "json", PROVIDER, MODEL, r.usage);
      return json({ ok: true, data: r.data });
    }

    const hist = (body.messages ?? []).filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).slice(-30);
    if (!hist.length || hist[hist.length - 1].role !== "user") return json({ error: "última mensagem deve ser do usuário" }, 400);
    const ctxTxt = body.contexto ? `<contexto_crm>\n${JSON.stringify(body.contexto)}\n</contexto_crm>\n\n` : "";
    const last = hist[hist.length - 1];
    const messages: Msg[] = [...hist.slice(0, -1), { role: "user", content: ctxTxt + last.content }];
    const system = [body.persona?.system_prompt ?? "Você é um assistente de vendas imobiliárias.", REGRAS, conhecimento].filter(Boolean).join("\n\n");

    if (mode === "agent") {
      const r = await complete(system, messages, body.tools ?? [], "low");
      await logUso(ctx.sb, ctx.orgId, ctx.userId, "agent", PROVIDER, MODEL, r.usage);
      return json({ ok: true, text: r.text, tool_calls: r.tool_calls, provider: PROVIDER });
    }

    // chat em streaming
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        try {
          const gen = streamText(system, messages, "low");
          let r = await gen.next();
          while (!r.done) { send({ t: "delta", text: r.value }); r = await gen.next(); }
          await logUso(ctx.sb, ctx.orgId, ctx.userId, "chat", PROVIDER, MODEL, r.value);
          send({ t: "done", provider: PROVIDER, model: MODEL });
        } catch (e) { send({ t: "error", error: e instanceof Error ? e.message : String(e) }); }
        finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
  } catch (e) {
    return json({ error: `Erro da IA (${PROVIDER}): ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
});
