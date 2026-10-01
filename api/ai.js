// IA dos corretores virtuais na Vercel (OpenAI). Mesmo contrato da Edge Function ai-chat.
// GET  → status (sem dados sensíveis)
// POST → { mode: 'chat'|'agent'|'json', persona, agent_key, messages, contexto, tools, system, prompt, schema, schema_name, knowledge_for }
const L = require('./_lib');

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

module.exports = async (req, res) => {
  if (req.method === 'GET') return L.enviar(res, 200, L.status());
  if (req.method !== 'POST') return L.enviar(res, 405, { error: 'method not allowed' });
  const st = L.status();
  if (!st.configured) return L.enviar(res, 503, { error: st.erro });
  let body;
  try { body = await L.lerBody(req); } catch { return L.enviar(res, 400, { error: 'JSON inválido' }); }
  const mode = body.mode || 'chat';
  if (mode === 'status') return L.enviar(res, 200, st);
  let auth;
  try { auth = await L.autenticar(req); } catch (e) { return L.enviar(res, 502, { error: 'Falha ao validar login: ' + e.message }); }
  if (auth.erro) return L.enviar(res, auth.code, { error: auth.erro });

  const agentes = [...new Set([...(body.knowledge_for || []), ...(body.agent_key ? [body.agent_key] : [])])];
  const conhecimento = await L.carregarConhecimento(auth.token, agentes);
  try {
    if (mode === 'json') {
      if (!body.schema || !body.prompt) return L.enviar(res, 400, { error: 'schema e prompt obrigatórios' });
      const r = await L.jsonOut([body.system || 'Responda em português do Brasil.', conhecimento].filter(Boolean).join('\n\n'), body.prompt, body.schema, body.schema_name || 'saida');
      await L.logUso(auth, 'json', r.usage);
      return L.enviar(res, 200, { ok: true, data: r.data });
    }
    const hist = (body.messages || []).filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim()).slice(-30);
    if (!hist.length || hist[hist.length - 1].role !== 'user') return L.enviar(res, 400, { error: 'última mensagem deve ser do usuário' });
    const ctxTxt = body.contexto ? `<contexto_crm>\n${JSON.stringify(body.contexto)}\n</contexto_crm>\n\n` : '';
    const messages = [...hist.slice(0, -1), { role: 'user', content: ctxTxt + hist[hist.length - 1].content }];
    const system = [body.persona?.system_prompt || 'Você é um assistente de vendas imobiliárias.', REGRAS, conhecimento].filter(Boolean).join('\n\n');

    if (mode === 'agent') {
      const r = await L.complete(system, messages, body.tools || []);
      await L.logUso(auth, 'agent', r.usage);
      return L.enviar(res, 200, { ok: true, text: r.text, tool_calls: r.tool_calls, provider: 'openai' });
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    try {
      const usage = await L.streamText(system, messages, (t) => send({ t: 'delta', text: t }));
      await L.logUso(auth, 'chat', usage);
      send({ t: 'done', provider: 'openai', model: L.MODEL });
    } catch (e) { send({ t: 'error', error: e.message }); }
    return res.end();
  } catch (e) {
    return L.enviar(res, 502, { error: e.message });
  }
};
