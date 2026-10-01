// Utilitários das funções de IA na Vercel (OpenAI via HTTP, sem dependências).
// Variáveis de ambiente: SUPABASE_URL, SUPABASE_ANON_KEY, OPENAI_API_KEY, OPENAI_MODEL (opcional), OPENAI_BASE_URL (opcional)
const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4.1';
// Modelo barato para as falas da sociedade de agentes (muitas chamadas curtas)
const MODEL_LEVE = process.env.OPENAI_MODEL_LEVE || 'gpt-4.1-mini';
const OPENAI_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MAX_CONHECIMENTO = 150000;

function status() {
  return { provider: 'openai', model: MODEL, model_leve: MODEL_LEVE, via: 'vercel', configured: !!OPENAI_KEY && !!SB && !!ANON, erro: !OPENAI_KEY ? 'OPENAI_API_KEY não configurada na Vercel' : !SB || !ANON ? 'SUPABASE_URL/SUPABASE_ANON_KEY ausentes na Vercel' : null };
}

const sbHeaders = (token) => ({ apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

/** Valida o login do usuário no Supabase e verifica se o plano inclui IA. */
async function autenticar(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { erro: 'não autenticado', code: 401 };
  const u = await fetch(`${SB}/auth/v1/user`, { headers: sbHeaders(token) });
  if (!u.ok) return { erro: 'sessão inválida, entre novamente', code: 401 };
  const user = await u.json();
  const r = await fetch(`${SB}/rest/v1/rpc/fn_ia_permitida`, { method: 'POST', headers: sbHeaders(token), body: '{}' });
  if (!r.ok) return { erro: 'Rode o supabase/schema.sql atualizado no SQL Editor (função fn_ia_permitida não encontrada).', code: 500 };
  const ia = await r.json();
  if (!ia?.permitida) return { erro: 'O plano desta imobiliária não inclui IA.', code: 403 };
  return { token, userId: user.id, orgId: ia.org_id || null };
}

async function carregarConhecimento(token, agentes, max = MAX_CONHECIMENTO) {
  if (!agentes?.length) return '';
  const lista = agentes.map((a) => `"${String(a).replace(/[^a-z]/g, '')}"`).join(',');
  const url = `${SB}/rest/v1/ai_conhecimento?select=agente,titulo,conteudo,tipo&ativo=eq.true&or=(agente.is.null,agente.in.(${lista}))&order=created_at.desc&limit=200`;
  const r = await fetch(url, { headers: sbHeaders(token) });
  if (!r.ok) return '';
  let total = 0; const partes = [];
  for (const k of await r.json()) {
    const bloco = `### ${k.titulo}${k.agente ? ` (para ${k.agente})` : ' (para todo o time)'}${k.tipo === 'regra' ? ' [REGRA OBRIGATÓRIA]' : ''}\n${k.conteudo}`;
    if (total + bloco.length > Math.min(max, MAX_CONHECIMENTO)) break;
    partes.push(bloco); total += bloco.length;
  }
  return partes.length ? `<base_de_conhecimento>\nO gestor ensinou o seguinte ao time. Use como verdade da empresa e siga as regras marcadas como obrigatórias:\n\n${partes.join('\n\n')}\n</base_de_conhecimento>` : '';
}

async function logUso(auth, modo, usage, modelo = MODEL) {
  if (!auth.orgId) return;
  try {
    await fetch(`${SB}/rest/v1/ai_uso`, { method: 'POST', headers: { ...sbHeaders(auth.token), Prefer: 'return=minimal' }, body: JSON.stringify({ org_id: auth.orgId, user_id: auth.userId, modo, provedor: 'openai', modelo, tokens_in: usage?.in || 0, tokens_out: usage?.out || 0 }) });
  } catch { /* registro de uso não pode derrubar a resposta */ }
}

async function openai(body) {
  const r = await fetch(`${OPENAI_URL}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` }, body: JSON.stringify({ model: MODEL, ...body }) });
  const usado = body.model || MODEL;
  if (!r.ok) {
    let m = `HTTP ${r.status}`;
    try { m = (await r.json()).error?.message || m; } catch { /* */ }
    if (r.status === 401) m = 'Chave da OpenAI inválida (confira OPENAI_API_KEY na Vercel).';
    if (r.status === 429) m = 'Limite ou saldo da OpenAI esgotado. Verifique créditos em platform.openai.com.';
    if (r.status === 404) m = `Modelo "${usado}" não disponível na sua conta OpenAI (ajuste OPENAI_MODEL).`;
    throw new Error(m);
  }
  return r;
}

/** Texto em streaming → chama onDelta(texto). Retorna uso de tokens. */
async function streamText(system, messages, onDelta) {
  const r = await openai({ stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8000, messages: [{ role: 'system', content: system }, ...messages] });
  const reader = r.body.getReader(), dec = new TextDecoder();
  let buf = '', usage = { in: 0, out: 0 };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;
      const ev = JSON.parse(raw);
      const t = ev.choices?.[0]?.delta?.content;
      if (t) onDelta(t);
      if (ev.usage) usage = { in: ev.usage.prompt_tokens, out: ev.usage.completion_tokens };
    }
  }
  return usage;
}

async function complete(system, messages, tools = []) {
  const r = await openai({ max_completion_tokens: 8000, messages: [{ role: 'system', content: system }, ...messages], ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'auto' } : {}) });
  const j = await r.json();
  const m = j.choices[0].message;
  return {
    text: m.content || '',
    tool_calls: (m.tool_calls || []).filter((c) => c.type === 'function').map((c) => { let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* */ } return { name: c.function.name, args }; }),
    usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0 },
  };
}

async function jsonOut(system, prompt, schema, name = 'saida', { model, max = 16000 } = {}) {
  const r = await openai({ ...(model ? { model } : {}), max_completion_tokens: max, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }], response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } } });
  const j = await r.json();
  const c = j.choices[0];
  if (c.finish_reason === 'length') throw new Error('Resposta excedeu o limite de tamanho.');
  if (c.message.refusal) throw new Error('O modelo recusou: ' + c.message.refusal);
  return { data: JSON.parse(c.message.content || '{}'), usage: { in: j.usage?.prompt_tokens || 0, out: j.usage?.completion_tokens || 0 } };
}

function lerBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body || '{}'));
  return new Promise((res, rej) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { rej(e); } }); req.on('error', rej); });
}
const enviar = (res, code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

module.exports = { status, autenticar, carregarConhecimento, logUso, streamText, complete, jsonOut, lerBody, enviar, MODEL, MODEL_LEVE };
