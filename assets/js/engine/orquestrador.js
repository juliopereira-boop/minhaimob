// Orquestrador dos corretores virtuais: ordens do gestor → ações (ferramentas) →
// conversas entre agentes (treinamento, alinhamento, reunião) → conhecimento salvo.
import { AGENTS, agentById, buildContexto, runTarefa, responderOffline, formatTarefa } from './agents.js';
import { norm } from './match.js';
import { daysSince } from '../ui.js';

export const KEYS = AGENTS.map((a) => a.id);
export const bus = new EventTarget();
/** Interações acontecendo agora (para painéis abertos no meio da conversa). */
export const aoVivo = new Map();
const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
const nomeDe = (k) => agentById(k)?.nome || k;

const TAREFAS = AGENTS.flatMap((a) => a.tarefas.map((t) => t.id));
export const TOOLS = [
  { name: 'treinar_agente', description: 'Você treina outro corretor virtual sobre um tema. Use quando o gestor pedir para ensinar, treinar, capacitar, preparar ou orientar um colega. Vocês vão para a Sala de Treinamento e a lição vira conhecimento permanente do aluno.',
    parameters: { type: 'object', properties: { aluno: { type: 'string', enum: KEYS }, tema: { type: 'string', description: 'assunto do treinamento' }, objetivo: { type: 'string', description: 'resultado esperado' } }, required: ['aluno', 'tema'] } },
  { name: 'conversar_com_agente', description: 'Você vai até a mesa de um colega para alinhar, pedir informação ou repassar algo. Use quando o gestor pedir para falar, perguntar, alinhar ou combinar algo com outro corretor.',
    parameters: { type: 'object', properties: { agente: { type: 'string', enum: KEYS }, assunto: { type: 'string' } }, required: ['agente', 'assunto'] } },
  { name: 'reuniao', description: 'Reúne corretores na Sala de Fechamento para discutir uma pauta e sair com um plano de ação.',
    parameters: { type: 'object', properties: { participantes: { type: 'array', items: { type: 'string', enum: KEYS } }, pauta: { type: 'string' } }, required: ['participantes', 'pauta'] } },
  { name: 'salvar_conhecimento', description: 'Guarda uma regra, instrução ou informação permanente. Use quando o gestor disser "a partir de agora", "sempre", "nunca", "lembre", "anote" ou ensinar algo. agente = corretor que deve seguir, ou "todos".',
    parameters: { type: 'object', properties: { agente: { type: 'string', enum: [...KEYS, 'todos'] }, titulo: { type: 'string' }, conteudo: { type: 'string' }, regra: { type: 'boolean', description: 'true se for uma ordem que deve ser sempre seguida' } }, required: ['agente', 'titulo', 'conteudo'] } },
  { name: 'executar_tarefa', description: 'Executa uma rotina da plataforma sobre os dados do CRM.',
    parameters: { type: 'object', properties: { tarefa: { type: 'string', enum: TAREFAS } }, required: ['tarefa'] } },
];

// ---------------------------------------------------------------------------
// Conhecimento (cache leve)
// ---------------------------------------------------------------------------
let _kCache = null;
export async function listarConhecimento(ctx, force = false) {
  if (!_kCache || force) { try { _kCache = await ctx.db.list('ai_conhecimento', { order: 'created_at.desc' }); } catch { _kCache = []; } }
  return _kCache;
}
export async function salvarConhecimento(ctx, { agente, titulo, conteudo, tipo = 'texto', fonte = 'manual', arquivo_nome = null }) {
  const row = await ctx.db.insert('ai_conhecimento', { agente: agente && agente !== 'todos' ? agente : null, titulo, conteudo, tipo, fonte, arquivo_nome, ativo: true, created_by: ctx.db.user?.id });
  _kCache = null; emit('conhecimento', row);
  return row;
}
/** Busca o trecho mais relevante da base para o modo offline. */
export async function buscarConhecimento(ctx, agente, texto) {
  const itens = (await listarConhecimento(ctx)).filter((k) => k.ativo !== false && (!k.agente || k.agente === agente));
  const ws = norm(texto).split(/\W+/).filter((w) => w.length > 3);
  let best = null, bs = 0;
  for (const k of itens) {
    for (const par of String(k.conteudo).split(/\n{2,}|(?<=\.)\s+(?=[A-ZÀ-Ý])/)) {
      const p = norm(par);
      const s = ws.filter((w) => p.includes(w.slice(0, 6))).length + (k.tipo === 'regra' ? 0.5 : 0);
      if (s > bs) { bs = s; best = { k, trecho: par.trim().slice(0, 600) }; }
    }
  }
  const regras = itens.filter((k) => k.tipo === 'regra' && (k.agente === agente || !k.agente));
  return { best: bs >= 2 ? best : null, regras };
}

// ---------------------------------------------------------------------------
// Insights do CRM usados nos treinamentos
// ---------------------------------------------------------------------------
export function insightsLeads(d) {
  const leads = d.leads.filter((l) => !l.arquivado);
  if (!leads.length) return ['Ainda não temos leads suficientes no CRM para tirar padrões — o foco é volume e qualificação.'];
  const by = {};
  for (const l of leads) {
    const o = l.origem || 'sem origem';
    const g = (by[o] ||= { n: 0, s: 0, q: 0, sem: 0 });
    g.n++; g.s += l.score || 0; if (['quente', 'fervendo'].includes(l.temperatura)) g.q++; if (!l.renda_bruta) g.sem++;
  }
  const rank = Object.entries(by).map(([o, g]) => ({ o, n: g.n, m: g.s / g.n, q: g.q, sem: g.sem })).sort((a, b) => b.m - a.m);
  const out = [];
  out.push(`Origem com leads mais quentes: ${rank[0].o} (score médio ${Math.round(rank[0].m)}, ${rank[0].q} de ${rank[0].n} quentes).`);
  if (rank.length > 1) out.push(`Origem mais fria: ${rank[rank.length - 1].o} (score médio ${Math.round(rank[rank.length - 1].m)}) — qualificar antes de investir tempo.`);
  const semRenda = leads.filter((l) => !l.renda_bruta).length;
  if (semRenda) out.push(`${semRenda} de ${leads.length} leads estão sem renda informada: sem renda o score de fit fica zerado e o lead parece frio.`);
  const esfriando = leads.filter((l) => (l.score || 0) >= 45 && daysSince(l.ultimo_contato || l.created_at) > 5).length;
  if (esfriando) out.push(`${esfriando} lead(s) bons estão esfriando por falta de contato há mais de 5 dias.`);
  const urg = leads.filter((l) => ['imediato', '30d'].includes(l.prazo_decisao)).length;
  out.push(`${urg} lead(s) com prazo de decisão em até 30 dias — esses vêm primeiro na fila.`);
  return out;
}

// ---------------------------------------------------------------------------
// Interpretação offline de ordens (sem IA)
// ---------------------------------------------------------------------------
const NOME_RE = '(ana|bruno|carla|diego|elisa|f[aá]bio)';
const keyOf = (n) => ({ ana: 'ana', bruno: 'bruno', carla: 'carla', diego: 'diego', elisa: 'elisa', fabio: 'fabio', 'fábio': 'fabio' })[norm(n)] || norm(n);
function parseOffline(agentId, texto) {
  const t = norm(texto);
  const tl = texto.toLowerCase();
  const calls = [];
  let m;
  if ((m = tl.match(new RegExp(`(trein|ensin|capacit|prepar|orient|qualifiqu)\\S*\\s+(?:a |o )?${NOME_RE}(?![a-zà-ú])(.*)`)) || t.match(new RegExp(`(trein|ensin|capacit|prepar|orient|qualifiqu)\\w*\\s+(?:a |o )?${NOME_RE}\\b(.*)`)))) {
    const tema = m[3].replace(/^\s*(para|pra|a|em|sobre|como)\s+/, '').replace(/^(que\s+)?(ela|ele)\s+/, '').trim() || 'técnicas de venda';
    calls.push({ name: 'treinar_agente', args: { aluno: keyOf(m[2]), tema, objetivo: tema } });
  } else if ((m = tl.match(new RegExp(`(fal[ae]|convers[ae]|pergunt[ae]|alinh[ae]|combin[ae]|cobr[ae])\\S*\\s+com\\s+(?:a |o )?${NOME_RE}(?![a-zà-ú])(.*)`)) || t.match(new RegExp(`(fal[ae]|convers[ae]|pergunt[ae]|alinh[ae]|combin[ae]|cobr[ae])\\w*\\s+com\\s+(?:a |o )?${NOME_RE}\\b(.*)`)))) {
    calls.push({ name: 'conversar_com_agente', args: { agente: keyOf(m[2]), assunto: m[3].replace(/^\s*(sobre|para|pra|que)\s+/, '').trim() || 'alinhamento do dia' } });
  } else if (/reuni|daily|reunir/.test(t)) {
    const nomes = [...t.matchAll(new RegExp(NOME_RE, 'g'))].map((x) => keyOf(x[1]));
    const parts = nomes.length ? [...new Set([agentId, ...nomes])] : KEYS;
    calls.push({ name: 'reuniao', args: { participantes: parts, pauta: texto.replace(/.*?(reuni[aã]o|daily)\s*(sobre|para|de)?\s*/i, '').trim() || 'resultados e prioridades' } });
  } else if (/(a partir de agora|sempre que|sempre |nunca |lembre|anote|regra:|guarde)/.test(t)) {
    const alvo = (t.match(new RegExp(`(?:para|pra)\\s+(?:a |o )?${NOME_RE}\\b`)) || [])[1];
    calls.push({ name: 'salvar_conhecimento', args: { agente: alvo ? keyOf(alvo) : /todos|time|equipe|voces/.test(t) ? 'todos' : agentId, titulo: texto.slice(0, 60), conteudo: texto, regra: true } });
  }
  return calls;
}

// ---------------------------------------------------------------------------
// Interações entre agentes (turnos reais via sociedade)
// ---------------------------------------------------------------------------
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Executa uma interação completa (encenação no 3D se houver `stage`).
 *  Cada fala é um turno real: o agente da vez raciocina do próprio ponto de vista (sociedade/motor.js). */
async function interacao(ctx, { tipo, participantes, iniciador, tema, objetivo, stage }) {
  const temp = { id: 'live-' + Date.now(), tipo, participantes, iniciador, tema, transcricao: [], ao_vivo: true, created_at: new Date().toISOString() };
  aoVivo.set(temp.id, temp);
  emit('interacao:inicio', temp);
  if (stage) await stage.encenar(tipo, participantes, tema);
  const { obterSociedade } = await import('../sociedade/navegador.js');
  const { tagDoTexto } = await import('../sociedade/perfis.js');
  const soc = obterSociedade(ctx);
  const tag = tagDoTexto(tema + ' ' + (objetivo || ''));
  const kind = tipo === 'treinamento' ? 'treinamento' : tipo === 'reuniao' ? 'reuniao' : 'ordem';
  let c;
  try {
    c = await soc.conduzir({
      tipo, iniciador, participantes: participantes.filter((p) => p !== iniciador), tema, motivo: `ordem do gestor: ${objetivo || tema}`,
      maxTurnos: tipo === 'treinamento' ? 10 : tipo === 'reuniao' ? Math.min(10, participantes.length * 2 + 1) : 6,
      contexto: { kind, tag, texto: tema, insights: tag === 'leads' && ctx.data ? insightsLeads(ctx.data) : [] },
      onFala: async (m) => {
        const l = { agente: m.de, fala: m.texto, intencao: m.intencao };
        temp.transcricao.push(l);
        emit('interacao:fala', { id: temp.id, ...l });
        if (stage) { stage.falar(l.agente, l.fala); await espera(Math.max(2400, Math.min(6500, l.fala.length * 48))); }
      },
    });
  } finally { aoVivo.delete(temp.id); }
  const reg = c?._registro || {};
  if (reg.conhecimento) { _kCache = null; emit('conhecimento', reg.conhecimento); }
  const row = reg.row || { ...temp, ao_vivo: false, resultado: c?.resumo };
  emit('interacao:fim', { ...row, temp_id: temp.id });
  if (stage) stage.encerrar(participantes);
  return { row, conhecimento: reg.conhecimento || null, resumo: c?.resumo || '' };
}

async function executarTool(ctx, agentId, call, stage) {
  const a = call.args || {};
  const valido = (k) => KEYS.includes(k) && k !== agentId;
  switch (call.name) {
    case 'treinar_agente':
      if (!valido(a.aluno)) return { texto: 'Não identifiquei qual corretor treinar.' };
      return { async: interacao(ctx, { tipo: 'treinamento', participantes: [agentId, a.aluno], iniciador: agentId, tema: a.tema, objetivo: a.objetivo, stage }), texto: `Indo treinar ${nomeDe(a.aluno)} em "${a.tema}" na Sala de Treinamento.` };
    case 'conversar_com_agente':
      if (!valido(a.agente)) return { texto: 'Não identifiquei com qual corretor conversar.' };
      return { async: interacao(ctx, { tipo: 'conversa', participantes: [agentId, a.agente], iniciador: agentId, tema: a.assunto, stage }), texto: `Indo até a mesa de ${nomeDe(a.agente)}.` };
    case 'reuniao': {
      const parts = [...new Set([agentId, ...(a.participantes || []).filter((k) => KEYS.includes(k))])];
      if (parts.length < 2) return { texto: 'Preciso de ao menos mais um participante.' };
      return { async: interacao(ctx, { tipo: 'reuniao', participantes: parts, iniciador: agentId, tema: a.pauta, stage }), texto: `Convocando ${parts.filter((k) => k !== agentId).map(nomeDe).join(', ')} para a Sala de Fechamento.` };
    }
    case 'salvar_conhecimento': {
      if (!a.conteudo) return { texto: 'Nada para anotar.' };
      await salvarConhecimento(ctx, { agente: a.agente, titulo: a.titulo || a.conteudo.slice(0, 60), conteudo: a.conteudo, tipo: a.regra ? 'regra' : 'texto', fonte: `chat com ${nomeDe(agentId)}` });
      return { texto: `📚 Anotado na base ${a.agente === 'todos' ? 'do time inteiro' : `de ${nomeDe(a.agente || agentId)}`}: "${a.titulo || a.conteudo.slice(0, 60)}".` };
    }
    case 'executar_tarefa':
      if (!TAREFAS.includes(a.tarefa)) return { texto: 'Tarefa desconhecida.' };
      return { texto: formatTarefa(runTarefa(agentId, a.tarefa, ctx.data)) };
    default: return { texto: '' };
  }
}

/**
 * Processa uma mensagem do gestor para um agente.
 * Retorna { texto, pendentes: Promise[] } — pendentes resolvem com o resumo das interações.
 */
export async function comando(ctx, agentId, historico, { stage, estado = {} } = {}) {
  const ag = agentById(agentId);
  const texto = historico[historico.length - 1].content;
  let res = null, aviso = '';
  if (ctx.db.aiMode()) {
    try {
      res = await ctx.db.ai({ mode: 'agent', agentKey: agentId, persona: { nome: ag.nome, papel: ag.papel, system_prompt: ag.system_prompt }, messages: historico, contexto: buildContexto(ctx.data, agentId), tools: TOOLS });
    } catch (e) { aviso = `\n\n_(IA indisponível: ${e.message}. Respondi com o motor offline.)_`; }
  }
  if (!res) {
    const calls = agentId === 'elisa' && estado.persona ? [] : parseOffline(agentId, texto);
    let base = '';
    if (!calls.length) {
      base = responderOffline(agentId, texto, ctx.data, estado);
      const k = await buscarConhecimento(ctx, agentId, texto);
      if (k.best) base = `📚 Da base de conhecimento ("${k.best.k.titulo}"):\n${k.best.trecho}\n\n${base}`;
      if (k.regras.length && !estado.persona) base += `\n\n_Sigo ${k.regras.length} regra(s) que você me passou._`;
    }
    res = { text: base, tool_calls: calls };
  }
  const textos = [], pendentes = [];
  for (const c of res.tool_calls || []) {
    const r = await executarTool(ctx, agentId, c, stage);
    if (r.texto) textos.push(r.texto);
    if (r.async) pendentes.push(r.async);
  }
  const final = [res.text?.trim(), ...textos].filter(Boolean).join('\n\n') || 'Feito.';
  return { texto: final + aviso, pendentes };
}

export async function listarInteracoes(ctx, limit = 40) {
  try { return await ctx.db.list('ai_interacoes', { order: 'created_at.desc', limit }); } catch { return []; }
}
