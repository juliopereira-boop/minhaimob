// Ciclo da sociedade de agentes no servidor: mantém os corretores virtuais vivos mesmo
// sem ninguém com a plataforma aberta. Chamado por cron (Vercel Cron, Supabase pg_cron ou
// qualquer agendador) com o cabeçalho  Authorization: Bearer <CRON_SECRET>.
//
// Variáveis de ambiente (somente no servidor, nunca no navegador):
//   CRON_SECRET                — segredo do agendador
//   SUPABASE_SERVICE_ROLE_KEY  — chave de serviço do Supabase (ignora RLS; este arquivo filtra por org_id)
//   SUPABASE_URL, OPENAI_API_KEY, OPENAI_MODEL_LEVE (opcional)
const L = require('./_lib');
const crypto = require('node:crypto');

const SB = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SECRET = process.env.CRON_SECRET || '';
const ORCAMENTO_MS = 50000;      // sai antes do limite de 60 s da função
const MAX_ORGS = 25;

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const enc = (v) => encodeURIComponent(v);

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}
const rpc = (fn, args) => rest(`rpc/${fn}`, { method: 'POST', body: args });

/** API do motor restrita a UMA imobiliária (todo acesso leva org_id). */
function apiDaOrg(org, iaLiberada, emit) {
  const filtro = (o = {}) => {
    const q = [`org_id=eq.${org.id}`, 'select=*'];
    for (const [k, v] of Object.entries(o.eq || {})) q.push(`${enc(k)}=eq.${enc(v)}`);
    for (const [k, v] of Object.entries(o.in || {})) q.push(`${enc(k)}=in.(${v.map((x) => `"${String(x).replace(/"/g, '')}"`).join(',')})`);
    if (o.order) { const [c, d] = o.order.split('.'); q.push(`order=${enc(c)}.${d === 'desc' ? 'desc' : 'asc'}.nullslast`); }
    q.push(`limit=${Math.min(o.limit || 2000, 2000)}`);
    return q.join('&');
  };
  return {
    orgNome: org.nome,
    list: (t, o) => rest(`${t}?${filtro(o)}`),
    async insert(t, row) {
      const many = Array.isArray(row);
      const rows = (many ? row : [row]).map((r) => ({ ...r, org_id: org.id }));
      const out = await rest(t, { method: 'POST', body: rows, prefer: 'return=representation' });
      return many ? out : out[0];
    },
    async update(t, id, patch) {
      const { org_id, ...p } = patch;   // nunca troca de imobiliária
      const out = await rest(`${t}?id=eq.${enc(id)}&org_id=eq.${org.id}`, { method: 'PATCH', body: p, prefer: 'return=representation' });
      return out?.[0] || null;
    },
    lock: () => rpc('fn_sociedade_lock', { p_org: org.id, p_segundos: 55 }),
    liberar: () => rest(`agent_mundo?org_id=eq.${org.id}`, { method: 'PATCH', body: { tick_lock_ate: null } }),
    gastar: (tokens) => rpc('fn_sociedade_gastar', { p_org: org.id, p_tokens: tokens }).catch(() => false),
    manutencao: () => rpc('fn_sociedade_manutencao', { p_org: org.id }),
    async dadosCRM() {
      const tabs = ['leads', 'deals', 'empreendimentos', 'tipologias', 'unidades', 'comparaveis', 'deal_stage_history'];
      const out = {};
      await Promise.all(tabs.map(async (t) => { out[t] = await rest(`${t}?${filtro()}`).catch(() => []); }));
      out.activities = await rest(`activities?${filtro({ order: 'created_at.desc', limit: 1500 })}`).catch(() => []);
      return out;
    },
    ia: iaLiberada && L.status().configured ? async ({ system, prompt, schema, schemaName }) => {
      const r = await L.jsonOut(system, prompt, schema, schemaName || 'saida', { model: L.MODEL_LEVE, max: 900 });
      rest('ai_uso', { method: 'POST', body: { org_id: org.id, user_id: null, modo: 'sociedade', provedor: 'openai', modelo: L.MODEL_LEVE, tokens_in: r.usage.in, tokens_out: r.usage.out }, prefer: 'return=minimal' }).catch(() => null);
      return r.data;
    } : null,
    emit,
  };
}

function horarioComercialBR(d = new Date()) {
  const br = new Date(d.getTime() - 3 * 36e5);   // America/Sao_Paulo (sem horário de verão)
  const h = br.getUTCHours(), dia = br.getUTCDay();
  return dia >= 1 && dia <= 6 && h >= 8 && h < 19;
}

module.exports = async (req, res) => {
  const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const ok = SECRET && tok.length === SECRET.length && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(SECRET));
  if (!ok) return L.enviar(res, 401, { error: 'não autorizado' });
  if (!SB || !SERVICE) return L.enviar(res, 503, { error: 'Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel para o ciclo no servidor.' });
  const inicio = Date.now();
  const { Sociedade } = await import('../assets/js/sociedade/motor.js');
  let mundos;
  try { mundos = await rest(`agent_mundo?select=org_id,pausado,sempre_ativo,ultimo_tick&pausado=eq.false&order=ultimo_tick.asc.nullsfirst&limit=${MAX_ORGS}`); }
  catch (e) { return L.enviar(res, 500, { error: e.message }); }
  const comercial = horarioComercialBR();
  const ids = mundos.filter((m) => m.sempre_ativo || comercial).map((m) => m.org_id);
  const orgs = ids.length ? await rest(`orgs?select=id,nome,status,trial_ate,plano&id=in.(${ids.join(',')})`) : [];
  const planos = await rest('planos?select=id,ia_habilitada').catch(() => []);
  const resultado = [];
  for (const org of orgs) {
    if (Date.now() - inicio > ORCAMENTO_MS) break;
    const liberada = ['ativo', 'inadimplente'].includes(org.status) || (org.status === 'trial' && (!org.trial_ate || new Date(org.trial_ate + 'T23:59:59') >= new Date()));
    if (!liberada) continue;
    const ia = planos.find((p) => p.id === org.plano)?.ia_habilitada ?? true;
    let falas = 0;
    const soc = new Sociedade(apiDaOrg(org, ia, (t) => { if (t === 'soc:mensagem') falas++; }), { maxTurnosPorTick: 3 });
    try {
      const r = await soc.tick();
      resultado.push({ org: org.id, ...r, falas });
    } catch (e) { resultado.push({ org: org.id, erro: e.message }); }
  }
  return L.enviar(res, 200, { ok: true, orgs: resultado.length, ms: Date.now() - inicio, resultado });
};
