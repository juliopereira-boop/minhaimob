// Sociedade de agentes no navegador: adapta o motor ao db.js (Supabase ou modo local),
// roda o ciclo em intervalo enquanto a aba está visível e publica eventos para a UI e o 3D.
import { Sociedade } from './motor.js';

export const socBus = new EventTarget();
const emitir = (type, detail) => socBus.dispatchEvent(new CustomEvent(type, { detail }));
const LOCK_KEY = 'mi_soc_lock';
let _inst = null, _timer = null, _rt = null;
const falhasIA = { n: 0, ate: 0 };

function api(ctx) {
  const db = ctx.db;
  const local = db.mode === 'local';
  const iaFn = async ({ system, prompt, schema, schemaName, agente }) => {
    try {
      const r = await db.ai({ mode: 'json', tier: 'leve', system, prompt, schema, schemaName, knowledgeFor: agente ? [agente] : [], knowledgeMax: 6000 });
      falhasIA.n = 0;
      return r;
    } catch (e) {
      // disjuntor: depois de 2 falhas seguidas, fica 10 min no modo offline
      if (++falhasIA.n >= 2) { falhasIA.ate = Date.now() + 10 * 60e3; falhasIA.n = 0; emitir('soc:ia', { ok: false, erro: e.message }); }
      throw e;
    }
  };
  return {
    get orgNome() { return db.org?.nome || 'MinhaImob'; },
    get ia() {
      if (!db.aiMode() || Date.now() < falhasIA.ate) return null;
      try { if (localStorage.getItem('mi_soc_ia') === '0') return null; } catch { /* */ }
      return iaFn;
    },
    list: (t, o) => db.list(t, o),
    insert: (t, r) => db.insert(t, r),
    update: (t, id, p) => db.update(t, id, p),
    async lock() {
      if (!local) return db.rpc('fn_sociedade_lock', { p_org: db.orgId, p_segundos: 25 }).catch((e) => { console.warn('[sociedade] rode o schema.sql atualizado (fn_sociedade_lock)', e.message); return false; });
      try {
        const ate = Number(localStorage.getItem(LOCK_KEY) || 0);
        if (ate > Date.now()) return false;
        localStorage.setItem(LOCK_KEY, String(Date.now() + 25e3));
      } catch { /* sem storage: roda mesmo assim */ }
      return true;
    },
    async liberar(mundo) {
      if (local) { try { localStorage.removeItem(LOCK_KEY); } catch { /* */ } return; }
      if (mundo?.id) await db.update('agent_mundo', mundo.id, { tick_lock_ate: null }).catch(() => null);
    },
    async gastar(tokens) {
      if (!local) return db.rpc('fn_sociedade_gastar', { p_org: db.orgId, p_tokens: tokens }).catch(() => false);
      const meta = db.store.data._meta, hoje = new Date().toISOString().slice(0, 10);
      const m = (meta.soc_tokens ||= { dia: hoje, usados: 0 });
      if (m.dia !== hoje) { m.dia = hoje; m.usados = 0; }
      const teto = db.store.t('agent_mundo')[0]?.orcamento_tokens_dia || 150000;
      if (m.usados + tokens > teto) return false;
      m.usados += tokens;
      const mundo = db.store.t('agent_mundo')[0];
      if (mundo) { mundo.tokens_hoje = m.usados; mundo.dia = hoje; }
      db.store.save();
      return true;
    },
    async manutencao() {
      if (!local) return db.rpc('fn_sociedade_manutencao', { p_org: db.orgId });
      const lim = Date.now() - 14 * 864e5, limEv = Date.now() - 45 * 864e5;
      db.store.t('agent_memorias').forEach((m) => { if (m.status === 'ativa' && m.tipo === 'episodica' && m.importancia < 4 && new Date(m.ultimo_acesso || m.created_at).getTime() < lim) m.status = 'esquecida'; });
      db.store.data.agent_eventos = db.store.t('agent_eventos').filter((e) => new Date(e.created_at).getTime() >= limEv);
      db.store.save();
    },
    async dadosCRM() { return ctx.data ? { ...ctx.data } : db.loadAll(); },
    /** Conversas pedidas pelo gestor ficam também no histórico antigo (ai_interacoes) e viram conhecimento. */
    async registrarOrdem(c, msgs, resumo, aprendizados) {
      let conhecimento = null;
      if (c.tipo === 'treinamento' || c.tipo === 'reuniao') {
        const corpo = [
          `Resumo: ${resumo}`,
          aprendizados.length ? `\nAprendizados:\n${aprendizados.map((a) => `• ${a}`).join('\n')}` : '',
          `\nPrincipais orientações:\n${msgs.filter((m) => m.de === c.iniciador || c.tipo === 'reuniao').slice(0, 8).map((m) => `• ${m.texto}`).join('\n')}`,
        ].join('\n');
        const alvo = c.tipo === 'treinamento' ? c.participantes.find((p) => p !== c.iniciador) : null;
        conhecimento = await db.insert('ai_conhecimento', { agente: alvo, titulo: `${c.tipo === 'treinamento' ? 'Treinamento' : 'Reunião'}: ${c.tema}`.slice(0, 120), conteudo: corpo, tipo: c.tipo === 'treinamento' ? 'treinamento' : 'regra', fonte: `${c.tipo}: ${c.iniciador}`, ativo: true, created_by: db.user?.id }).catch(() => null);
      }
      const row = await db.insert('ai_interacoes', {
        tipo: c.tipo === 'mentoria' ? 'conversa' : c.tipo, participantes: c.participantes, iniciador: c.iniciador, tema: c.tema,
        transcricao: msgs.map((m) => ({ agente: m.de, fala: m.texto })), resultado: resumo, conhecimento_id: conhecimento?.id || null, created_by: db.user?.id,
      }).catch((e) => { console.warn('[sociedade] ai_interacoes', e.message); return null; });
      return { row, conhecimento };
    },
    emit: emitir,
  };
}

/** Instância única da sociedade para esta aba. */
export function obterSociedade(ctx) {
  if (!_inst) _inst = new Sociedade(api(ctx));
  return _inst;
}

/** Começa a rodar o ciclo (20 s por padrão) enquanto a aba estiver visível. */
export function iniciarSociedade(ctx, { intervalo = 20000 } = {}) {
  const soc = obterSociedade(ctx);
  if (_timer) return soc;
  const rodar = async () => {
    if (document.visibilityState !== 'visible') return;
    const r = await soc.tick();
    emitir('soc:ciclo', r);
  };
  setTimeout(rodar, 2500);
  _timer = setInterval(rodar, intervalo);
  assinarRealtime(ctx);
  window.__soc = soc;
  return soc;
}

/** Mudanças feitas por outro navegador/servidor também chegam na tela. */
function assinarRealtime(ctx) {
  const db = ctx.db;
  if (_rt || db.mode !== 'supabase' || !db.orgId) return;
  _rt = db.sb.channel(`soc-${db.orgId}`);
  for (const t of ['agent_mensagens', 'agent_conversas', 'agent_estado', 'agent_eventos']) {
    _rt.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `org_id=eq.${db.orgId}` }, (p) => emitir('soc:remoto', { tabela: t, novo: p.new, tipo: p.eventType }));
  }
  _rt.subscribe();
}

export const statusIA = () => ({ desligadaAte: falhasIA.ate });
