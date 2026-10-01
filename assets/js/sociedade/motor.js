// Motor da sociedade de agentes. Independente de ambiente: recebe um `api` com acesso a dados,
// IA, trava e orçamento (navegador ou servidor). Cada ciclo:
//   OBSERVAR (eventos + KPIs) → INTERPRETAR (relevância) → LEMBRAR (memórias) → RACIOCINAR/DECIDIR
//   (utilidade com personalidade, humor e relações) → AGIR (conversas reais turno a turno)
//   → AVALIAR (objetivos e estratégias) → APRENDER (memórias, reflexões, relações).
import { AGENTES, PERSONALIDADE, HUMOR_INICIAL, relacaoInicial, OBJETIVOS, ESTRATEGIAS, AREAS, especialistaEm, nome, temaDe, TEMAS } from './perfis.js';
import { kpis, padroesEquipe } from './mundo.js';
import { recuperar, similaridade, textoMemoria } from './memoria.js';
import { falar, dicaDe } from './fala.js';

const MIN = 60e3;
const agoraISO = () => new Date(Date.now()).toISOString();
const ms = (d) => (d ? new Date(d).getTime() : 0);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rnd = (key) => hash(key) / 4294967296;
const ATIVAS = ['proposta', 'agendada', 'aberta'];
const LOCAL_DO_TIPO = { cafe: 'cafe', reuniao: 'reuniao', treinamento: 'treinamento', conversa: 'mesa', mentoria: 'mesa', recado: 'mesa' };
const IMP_TIPO = { cafe: 3, conversa: 4, mentoria: 5, treinamento: 6, reuniao: 6, recado: 5 };

// Efeito de cada intenção em quem OUVE (sobre quem falou)
const EFEITO = {
  oferecer_ajuda: { afinidade: 0.03, confianca: 0.02 }, ensinar: { confianca: 0.03, respeito: 0.03 },
  parabenizar: { afinidade: 0.04 }, agradecer: { afinidade: 0.03 }, concordar: { afinidade: 0.01 },
  combinar_acao: { confianca: 0.02 }, aceitar: { afinidade: 0.02 }, sugerir: { respeito: 0.01 },
  discordar: { respeito: 0.01, afinidade: -0.01 }, provocar: { rivalidade: 0.04, afinidade: -0.02 },
  recusar: { afinidade: -0.03 }, desabafar: { afinidade: 0.02, confianca: 0.01 }, pedir_ajuda: { confianca: 0.01 },
};

// Relevância de cada tipo de evento para cada agente (0..10)
function relevancia(ev, a) {
  const d = ev.dados || {};
  switch (ev.tipo) {
    case 'lead_criado': return { ana: 4, diego: 3.5 }[a] || 1;
    case 'negocio_criado': return { bruno: 4, ana: 3, carla: 2 }[a] || 1;
    case 'negocio_avancou': return a === 'bruno' ? 3 : a === 'carla' && ['analise_credito', 'contrato', 'repasse'].includes(d.para) ? 4.5 : 1;
    case 'venda': return a === 'bruno' ? 8 : 6;
    case 'negocio_perdido': return a === 'bruno' ? 6 : a === 'carla' && /cr[eé]dito/i.test(ev.resumo) ? 7 : ['ana', 'elisa'].includes(a) ? 4 : 2;
    case 'conhecimento_novo': return ev.alvo ? (ev.alvo === a ? 8 : 1) : 5;
    case 'novo_produto': return { diego: 6, fabio: 6, bruno: 5, ana: 4 }[a] || 3;
    case 'meta_alterada': return 5;
    case 'ranking': return ev.alvo === a ? 6 : 1.5;
    default: return ev.alvo === a ? 5 : 1;
  }
}
function perspectiva(ev, a) {
  if (ev.tipo === 'conhecimento_novo') return `O gestor ensinou ${ev.alvo === a ? 'para mim' : 'para o time'}: ${ev.resumo.replace(/^Novo conhecimento[^:]*:\s*/, '')}`;
  if (ev.tipo === 'venda') return a === 'bruno' ? `Fechamos! ${ev.resumo}. Isso conta muito para mim.` : `O time vendeu: ${ev.resumo}.`;
  if (ev.tipo === 'negocio_perdido') return `Perdemos um negócio: ${ev.resumo.replace(/^Negócio perdido:\s*/, '')}.`;
  if (ev.tipo === 'ranking') return ev.alvo === a ? `Ranking interno: ${ev.resumo}` : ev.resumo;
  return `Percebi: ${ev.resumo}.`;
}

export class Sociedade {
  constructor(api, opts = {}) {
    this.api = api;
    this.opts = { maxTurnosPorTick: 2, maxConversas: 2, intervaloKpi: 3 * MIN, janelaEstrategia: 90 * MIN, ...opts };
    this.W = null;
    this._kpiAt = 0;
    this._k = null;
    this._ultimoSilencio = 0;
    this._rodando = false;
  }
  emit(type, detail) { try { this.api.emit?.(type, detail); } catch (e) { console.error(e); } }

  // -------------------------------------------------------------------------
  // Carregamento e inicialização
  // -------------------------------------------------------------------------
  async carregar() {
    const L = (t, o) => this.api.list(t, o).catch((e) => { console.warn('[sociedade] falha ao ler', t, e.message || e); return []; });
    const [mundo, estado, relacoes, objetivos, abertas, recentes, memorias, eventos] = await Promise.all([
      L('agent_mundo', { limit: 1 }), L('agent_estado'), L('agent_relacoes'), L('agent_objetivos', { eq: { status: 'ativo' } }),
      L('agent_conversas', { in: { status: ATIVAS }, order: 'created_at.asc', limit: 30 }),
      L('agent_conversas', { order: 'created_at.desc', limit: 60 }),
      L('agent_memorias', { in: { status: ['ativa', 'concluida'] }, order: 'created_at.desc', limit: 500 }),
      L('agent_eventos', { order: 'created_at.desc', limit: 80 }),
    ]);
    const convs = new Map([...recentes, ...abertas].map((c) => [c.id, c]));
    const ids = abertas.map((c) => c.id);
    const msgs = ids.length ? await L('agent_mensagens', { in: { conversa_id: ids }, order: 'created_at.asc', limit: 600 }) : [];
    const msgsPor = {};
    for (const m of msgs) (msgsPor[m.conversa_id] ||= []).push(m);
    const W = {
      mundo: mundo[0] || null,
      estado: Object.fromEntries(estado.map((e) => [e.agente, e])),
      relacoes, objetivos, conversas: [...convs.values()], msgsPor, memorias, eventos: eventos.reverse(),
      sujos: { estado: new Set(), relacoes: new Set() },
    };
    this.W = W;
    return W;
  }

  async inicializar() {
    const W = this.W;
    if (!W.mundo) W.mundo = await this.api.insert('agent_mundo', { pausado: false, sempre_ativo: true, orcamento_tokens_dia: 150000, tokens_hoje: 0, config: {} }).catch(() => null);
    const faltam = AGENTES.filter((a) => !W.estado[a]);
    if (faltam.length) {
      const desde = new Date(Date.now() - 6 * 36e5).toISOString();
      const rows = await this.api.insert('agent_estado', faltam.map((a) => ({
        agente: a, personalidade: PERSONALIDADE[a], humor: HUMOR_INICIAL(a), local: 'mesa', cursor_evento: desde,
        estrategia: ESTRATEGIAS[a][0].id, estrategia_desde: agoraISO(), kpi: {}, importancia_acumulada: 0,
      })));
      rows.forEach((r) => (W.estado[r.agente] = r));
      await this.api.insert('agent_memorias', faltam.map((a) => ({ agente: a, tipo: 'semantica', conteudo: `Sou ${nome(a)}. Minhas áreas: ${AREAS[a].join(', ')}. Meus objetivos: ${OBJETIVOS[a].map((o) => o.descricao).join('; ')}.`, importancia: 8, tags: ['identidade'], status: 'ativa', acessos: 0 })));
    }
    const temRel = new Set(W.relacoes.map((r) => r.agente + '>' + r.outro));
    const novas = [];
    for (const a of AGENTES) for (const b of AGENTES) if (a !== b && !temRel.has(a + '>' + b)) novas.push({ agente: a, outro: b, ...relacaoInicial(a, b), interacoes: 0, positivas: 0, negativas: 0 });
    if (novas.length) W.relacoes.push(...(await this.api.insert('agent_relacoes', novas)));
    const temObj = new Set(W.objetivos.map((o) => o.agente + ':' + o.kpi));
    const objs = AGENTES.flatMap((a) => OBJETIVOS[a].filter((o) => !temObj.has(a + ':' + o.kpi)).map((o, i) => ({ agente: a, descricao: o.descricao, kpi: o.kpi, alvo: o.alvo, prioridade: i + 1, plano: [], status: 'ativo' })));
    if (objs.length) W.objetivos.push(...(await this.api.insert('agent_objetivos', objs)));
  }

  // -------------------------------------------------------------------------
  // Utilidades de estado
  // -------------------------------------------------------------------------
  rel(a, b) { return this.W.relacoes.find((r) => r.agente === a && r.outro === b); }
  ajustarRel(a, b, delta, positiva) {
    const r = this.rel(a, b);
    if (!r) return;
    for (const [k, v] of Object.entries(delta)) r[k] = +clamp((+r[k] || 0) + v, k === 'afinidade' ? -1 : 0, 1).toFixed(3);
    if (positiva === true) r.positivas = (r.positivas || 0) + 1;
    if (positiva === false) r.negativas = (r.negativas || 0) + 1;
    this.W.sujos.relacoes.add(r);
  }
  humor(a, delta) {
    const e = this.W.estado[a];
    if (!e) return;
    const h = { ...HUMOR_INICIAL(a), ...(e.humor || {}) };
    for (const [k, v] of Object.entries(delta)) h[k] = +clamp((h[k] ?? 0.5) + v).toFixed(3);
    e.humor = h;
    this.W.sujos.estado.add(a);
  }
  setEstado(a, patch) { Object.assign(this.W.estado[a], patch); this.W.sujos.estado.add(a); }
  emConversa(a) { return this.W.conversas.some((c) => ['aberta', 'agendada'].includes(c.status) && c.tipo !== 'recado' && c.participantes.includes(a)); }
  disponivel(a) {
    const e = this.W.estado[a];
    return e && !this.emConversa(a) && ms(e.ocupado_ate) < Date.now() && (e.humor?.energia ?? 0.7) > 0.2;
  }
  ultimaConversa(filtro) {
    return this.W.conversas.filter(filtro).reduce((m, c) => Math.max(m, ms(c.created_at)), 0);
  }
  async memorizar(rows) {
    const lista = (Array.isArray(rows) ? rows : [rows]).filter((r) => r && r.conteudo);
    if (!lista.length) return [];
    const out = await this.api.insert('agent_memorias', lista.map((r) => ({ tipo: 'episodica', importancia: 3, tags: [], status: 'ativa', acessos: 0, ...r, conteudo: String(r.conteudo).slice(0, 1200) }))).catch((e) => { console.warn('[sociedade] memória', e.message || e); return []; });
    this.W.memorias.unshift(...out);
    for (const m of out) {
      const e = this.W.estado[m.agente];
      if (e) { e.importancia_acumulada = +(Number(e.importancia_acumulada || 0) + Number(m.importancia || 0)).toFixed(2); this.W.sujos.estado.add(m.agente); }
    }
    return out;
  }
  async acao(agente, tipo, motivo, dados = {}, usou_ia = false, tokens = 0) {
    const r = await this.api.insert('agent_acoes', { agente, tipo, motivo, dados, usou_ia, tokens }).catch(() => null);
    if (r) this.emit('soc:acao', r);
    return r;
  }
  async evento(row) {
    const r = await this.api.insert('agent_eventos', { visibilidade: 'publico', importancia: 3, dados: {}, ...row }).catch(() => null);
    if (r) { this.W.eventos.push(r); this.emit('soc:evento', r); }
    return r;
  }

  // -------------------------------------------------------------------------
  // Ciclo
  // -------------------------------------------------------------------------
  async tick({ forcar = false } = {}) {
    if (this._rodando) return { pulou: 'em andamento' };
    this._rodando = true;
    const rel = { turnos: 0, iniciativas: 0, memorias: 0, ia: 0 };
    try {
      const trava = await this.api.lock();
      if (trava !== true) return { pulou: typeof trava === 'string' ? trava : 'outro navegador/servidor está rodando o ciclo' };
      this._travou = true;
      await this.carregar();
      await this.inicializar();
      const m = this.W.mundo;
      if (m?.pausado && !forcar) return { pulou: 'pausado' };
      if (m && m.sempre_ativo === false && !forcar && !horarioComercial()) return { pulou: 'fora do horário comercial' };
      await this.perceberKpis(forcar);
      rel.memorias += await this.perceberEventos();
      rel.turnos += await this.avancarConversas(rel);
      rel.iniciativas += await this.iniciativa(rel);
      await this.avaliarObjetivos();
      await this.refletir(rel);
      this.derivaHumor();
      await this.salvar();
      await this.manutencao();
      this.emit('soc:tick', rel);
      return rel;
    } catch (e) {
      console.error('[sociedade] ciclo falhou', e);
      return { erro: e.message || String(e) };
    } finally {
      this._rodando = false;
      if (this._travou) { this._travou = false; await this.api.liberar?.(this.W?.mundo).catch?.(() => null); }
    }
  }

  async salvar() {
    const W = this.W;
    const jobs = [];
    for (const a of W.sujos.estado) {
      const e = W.estado[a];
      jobs.push(this.api.update('agent_estado', e.id, {
        humor: e.humor, atividade: e.atividade ?? null, local: e.local || 'mesa', ocupado_ate: e.ocupado_ate ?? null, estrategia: e.estrategia,
        estrategia_desde: e.estrategia_desde, estrategia_base: e.estrategia_base ?? null, kpi: e.kpi || {}, desempenho: e.desempenho ?? null,
        ranking: e.ranking ?? null, cursor_evento: e.cursor_evento, ultima_iniciativa: e.ultima_iniciativa ?? null,
        ultima_reflexao: e.ultima_reflexao ?? null, importancia_acumulada: e.importancia_acumulada || 0,
      }));
    }
    for (const r of W.sujos.relacoes) {
      jobs.push(this.api.update('agent_relacoes', r.id, { afinidade: r.afinidade, confianca: r.confianca, respeito: r.respeito, rivalidade: r.rivalidade, interacoes: r.interacoes || 0, positivas: r.positivas || 0, negativas: r.negativas || 0, ultima_interacao: r.ultima_interacao ?? null }));
    }
    await Promise.all(jobs.map((j) => j.catch((e) => console.warn('[sociedade] salvar', e.message || e))));
    if (W.sujos.estado.size) this.emit('soc:estado', W.estado);
    W.sujos.estado.clear(); W.sujos.relacoes.clear();
  }

  // ---------- OBSERVAR: KPIs reais do CRM, ranking e pressão ----------
  async perceberKpis(forcar) {
    if (!forcar && this._k && Date.now() - this._kpiAt < this.opts.intervaloKpi) return this._k;
    const d = await this.api.dadosCRM();
    d.agent_conversas = this.W.conversas;
    const k = kpis(d);
    this._k = k; this._kpiAt = Date.now();
    for (const a of AGENTES) {
      const e = this.W.estado[a];
      const antes = e.ranking;
      // há quanto tempo cada problema persiste (recado ao gestor só para o que não se resolve)
      for (const pr of k[a].problemas) pr.desde = (e.kpi?.problemas || []).find((x) => x.tag === pr.tag)?.desde || agoraISO();
      this.setEstado(a, { kpi: k[a], desempenho: k[a].desempenho, ranking: k[a].ranking });
      const pressao = k[a].problemas[0]?.gravidade || 0;
      const h = e.humor || {};
      this.humor(a, { estresse: ((0.15 + 0.5 * pressao) - (h.estresse ?? 0.25)) * 0.3 });
      if (antes && k[a].ranking !== antes) {
        if (k[a].ranking === 1) await this.evento({ tipo: 'ranking', ator: 'sistema', alvo: a, resumo: `${nome(a)} assumiu o 1º lugar do ranking interno (desempenho ${k[a].desempenho})`, importancia: 5, dados: { de: antes, para: 1 } });
        else if (k[a].ranking - antes >= 2) await this.evento({ tipo: 'ranking', ator: 'sistema', alvo: a, resumo: `${nome(a)} caiu do ${antes}º para o ${k[a].ranking}º lugar no ranking interno`, importancia: 4, dados: { de: antes, para: k[a].ranking } });
      }
    }
    return k;
  }

  // ---------- INTERPRETAR + LEMBRAR: eventos do mundo ----------
  async perceberEventos() {
    const W = this.W, novas = [];
    for (const a of AGENTES) {
      const e = W.estado[a];
      const cur = ms(e.cursor_evento);
      const evs = W.eventos.filter((ev) => ms(ev.created_at) > cur && ev.ator !== a);
      if (!evs.length) continue;
      const leads = evs.filter((ev) => ev.tipo === 'lead_criado');
      for (const ev of evs.filter((x) => x.tipo !== 'lead_criado')) {
        const r = relevancia(ev, a);
        if (ev.tipo === 'venda') this.humor(a, { motivacao: 0.04, satisfacao: 0.05, ...(a === 'bruno' ? { confianca: 0.04 } : {}) });
        if (ev.tipo === 'negocio_perdido' && r >= 6) this.humor(a, { frustracao: 0.06, estresse: 0.03 });
        if (ev.tipo === 'meta_alterada') this.humor(a, { motivacao: 0.03 * PERSONALIDADE[a].ambicao, estresse: 0.03 * PERSONALIDADE[a].competitividade });
        if (ev.tipo === 'conhecimento_novo' && r >= 5) this.humor(a, { foco: 0.03, motivacao: 0.02 });
        if (r < 3.5) continue;
        novas.push({
          agente: a, tipo: ev.tipo === 'conhecimento_novo' ? 'semantica' : 'episodica', conteudo: perspectiva(ev, a),
          importancia: Math.min(10, r), evento_id: ev.id, sobre: ev.tipo === 'ranking' ? ev.alvo : null,
          tags: [ev.tipo, ...(ev.tipo === 'conhecimento_novo' ? ['conhecimento', 'compartilhavel'] : [])],
        });
      }
      if (leads.length && relevancia(leads[0], a) >= 3.5) {
        novas.push({ agente: a, tipo: 'episodica', conteudo: `Entraram ${leads.length} lead(s) novo(s): ${leads.slice(0, 4).map((l) => l.resumo.replace(/^Novo lead:\s*/, '')).join(', ')}${leads.length > 4 ? '…' : ''}.`, importancia: Math.min(7, 3 + leads.length / 3), tags: ['lead_criado', 'leads'] });
      }
      this.setEstado(a, { cursor_evento: evs[evs.length - 1].created_at });
    }
    await this.memorizar(novas);
    return novas.length;
  }

  // ---------- AGIR: conversas reais, turno a turno ----------
  ctxFala(agente, conversa, mensagens, instrucao) {
    const W = this.W, e = W.estado[agente];
    const publicos = W.eventos.filter((ev) => ev.visibilidade === 'publico' && Date.now() - ms(ev.created_at) < 6 * 36e5 && ev.importancia >= 5).slice(-4).map((ev) => ev.resumo);
    return {
      agente, org: this.api.orgNome, estado: e, relacoes: W.relacoes, memorias: W.memorias, conversa, mensagens,
      kpi: e?.kpi, objetivos: W.objetivos.filter((o) => o.agente === agente), conhecidos: publicos, instrucao,
    };
  }
  async gerarFala(agente, conversa, mensagens, instrucao, historico) {
    if (agente === 'gestor') return null;
    return falar({ ...this.ctxFala(agente, conversa, mensagens, instrucao), historico }, { ia: this.api.ia, gastar: this.api.gastar });
  }
  async registrar(conversa, de, f, para) {
    const msgs = (this.W.msgsPor[conversa.id] ||= []);
    const row = await this.api.insert('agent_mensagens', {
      conversa_id: conversa.id, de, para: para || conversa.participantes.filter((p) => p !== de), texto: f.mensagem, intencao: f.intencao,
      sentimento: +(f.sentimento ?? 0).toFixed(2), pensamento: f.pensamento || null, profundidade: msgs.length, usou_ia: !!f.usou_ia, lida_por: [],
    });
    row._aprendizado = f.aprendizado; row._compromisso = f.compromisso; row._encerrar = f.encerrar;
    msgs.push(row);
    conversa.turnos = msgs.length;
    await this.api.update('agent_conversas', conversa.id, { turnos: conversa.turnos }).catch(() => null);
    // quem ouve sente algo por quem falou
    const ef = EFEITO[f.intencao] || {};
    for (const ouvinte of conversa.participantes.filter((p) => p !== de && AGENTES.includes(p))) {
      if (!AGENTES.includes(de)) continue;
      this.ajustarRel(ouvinte, de, { ...ef, afinidade: (ef.afinidade || 0) + 0.015 * (f.sentimento || 0) });
    }
    if (AGENTES.includes(de)) this.humor(de, { energia: -0.015 });
    this.emit('soc:mensagem', { conversa, mensagem: row });
    return row;
  }

  proximoFalante(c, msgs) {
    const ult = msgs[msgs.length - 1];
    if (c.tipo === 'recado') {
      if (!ult) return c.iniciador;
      return ult.de === 'gestor' ? c.iniciador : null;      // espera o gestor
    }
    const parts = c.participantes;
    if (!ult) return c.iniciador;
    if (parts.length === 2) return parts.find((p) => p !== ult.de);
    const restantes = c.max_turnos - msgs.length;
    if (restantes === 1) return c.iniciador;                 // quem convocou fecha
    const citado = parts.find((p) => p !== ult.de && new RegExp(`\\b${nome(p)}\\b`, 'i').test(ult.texto));
    if (citado) return citado;
    const falas = Object.fromEntries(parts.map((p) => [p, msgs.filter((m) => m.de === p).length]));
    return parts.filter((p) => p !== ult.de).sort((x, y) => falas[x] - falas[y] || (PERSONALIDADE[y]?.extroversao || 0) - (PERSONALIDADE[x]?.extroversao || 0))[0];
  }

  /** Decide (sem IA) se `a` topa a conversa proposta por `de`. */
  decideAceitar(a, c) {
    const p = PERSONALIDADE[a], h = this.W.estado[a]?.humor || {}, r = this.rel(a, c.iniciador) || {};
    const kind = c.contexto?.kind;
    let u = 0.35 + 0.25 * (r.afinidade || 0) + 0.2 * (r.confianca || 0) - 0.25 * (h.estresse || 0) - 0.15 * (r.rivalidade || 0);
    if (kind === 'cafe') u += 0.3 * p.sociabilidade + 0.2 * (1 - (h.energia ?? 0.7)) - 0.15 * p.disciplina;
    else if (kind === 'pedir_ajuda') u += 0.3 * p.colaboracao + 0.2 * p.empatia;
    else if (kind === 'oferecer_ajuda') u += 0.25 * p.abertura - 0.2 * p.autoconfianca;
    else u += 0.3 * p.colaboracao + 0.1 * p.disciplina;
    if (c.contexto?.ordem || c.iniciador === 'elisa') u += 0.3;
    if (this.W.conversas.some((x) => x.id !== c.id && ['aberta', 'agendada'].includes(x.status) && x.tipo !== 'recado' && x.participantes.includes(a))) u -= 0.4;
    const sorte = rnd(c.id + a);
    return { aceita: u + (sorte - 0.5) * 0.3 > 0.45, u: +u.toFixed(2), motivo: (h.estresse || 0) > 0.6 ? 'estresse alto' : (h.energia ?? 1) < 0.3 ? 'cansaço' : (r.afinidade || 0) < 0 ? 'atrito com quem chamou' : 'agenda cheia' };
  }

  async avancarConversas(rel) {
    const W = this.W;
    let turnos = 0;
    const agora = Date.now();
    for (const c of W.conversas.filter((x) => ATIVAS.includes(x.status))) {
      const msgs = W.msgsPor[c.id] || [];
      // conversa conduzida por uma ordem que ficou órfã (aba fechada) → o ciclo assume
      if (c.contexto?.conduzida && agora - ms(c.created_at) > 10 * MIN) c.contexto.conduzida = false;
      if (c.contexto?.conduzida) continue;
      // convites (café, reunião, treinamento): cada convidado decide
      if (c.status === 'agendada') {
        const ctx = (c.contexto ||= {});
        if (!ctx.respostas) {
          ctx.respostas = {};
          for (const p of c.participantes.filter((x) => x !== c.iniciador)) {
            const d = this.decideAceitar(p, c);
            ctx.respostas[p] = d.aceita;
            if (!d.aceita) {
              await this.registrar(c, p, { mensagem: recusaCurta(p, d.motivo, c), intencao: 'recusar', sentimento: -0.1, pensamento: `Recusei: ${d.motivo}.` }, [c.iniciador]);
              this.ajustarRel(c.iniciador, p, { afinidade: -0.02 }, false);
              await this.memorizar({ agente: c.iniciador, tipo: 'social', sobre: p, conteudo: `${nome(p)} recusou meu convite (${c.tema}).`, importancia: 3, conversa_id: c.id });
              await this.acao(p, 'recusar_convite', `Recusou ${rotulo(c.contexto?.kind || c.tipo)} de ${nome(c.iniciador)} (${d.motivo})`, { conversa_id: c.id, utilidade: d.u });
            } else await this.registrar(c, p, { mensagem: aceiteCurto(p, c), intencao: 'aceitar', sentimento: 0.4, pensamento: '' }, [c.iniciador]);
          }
          ctx.convidados = c.participantes;
          c.participantes = c.participantes.filter((p) => p === c.iniciador || ctx.respostas[p]);
          await this.api.update('agent_conversas', c.id, { contexto: ctx, participantes: c.participantes }).catch(() => null);
        }
        if (ms(c.agendada_para) > agora) continue;
        if (c.participantes.length < 2) { await this.encerrar(c, 'recusada', 'Ninguém pôde participar.'); continue; }
        if (c.tipo === 'reuniao') c.max_turnos = Math.min(c.max_turnos, c.participantes.length * 2 + 1);
        ctx.inicio_turnos = (W.msgsPor[c.id] || []).length;
        c.status = 'aberta';
        await this.api.update('agent_conversas', c.id, { status: 'aberta', max_turnos: c.max_turnos, contexto: ctx }).catch(() => null);
        c.participantes.forEach((p) => this.setEstado(p, { atividade: c.tipo, local: LOCAL_DO_TIPO[c.tipo] }));
        this.emit('soc:conversa', { fase: 'inicio', conversa: c });
      }
      if (c.status !== 'aberta') continue;
      if (turnos >= this.opts.maxTurnosPorTick) continue;
      if (c.tipo === 'recado') {
        if (agora - ms(c.created_at) > 72 * 36e5) { await this.encerrar(c, 'encerrada', 'O gestor não respondeu o recado.'); continue; }
      }
      const r = await this.turno(c);
      if (r) { turnos++; if (r.usou_ia) rel.ia++; }
    }
    return turnos;
  }

  /** Falas que contam como turnos (depois da abertura; convites e confirmações ficam antes). */
  falasReais(c) { return (this.W.msgsPor[c.id] || []).slice(c.contexto?.inicio_turnos || 0); }

  /** Um turno da conversa `c`. Retorna a fala (ou null se não era a vez de ninguém). */
  async turno(c) {
    const todas = (this.W.msgsPor[c.id] ||= []);
    const reais = this.falasReais(c);
    const quem = this.proximoFalante(c, reais);
    if (!quem) return null;
    let instrucao = '';
    // 1ª resposta numa conversa 1:1 → o destinatário decide se engaja (ordens do gestor não se recusam)
    if (['conversa', 'mentoria'].includes(c.tipo) && reais.length === 1 && quem !== c.iniciador && AGENTES.includes(quem) && !c.contexto?.ordem) {
      const d = this.decideAceitar(quem, c);
      if (!d.aceita) {
        if (rnd(c.id + 'ignora') < 0.35 * (1 - PERSONALIDADE[quem].empatia)) {
          await this.memorizar([
            { agente: quem, tipo: 'episodica', sobre: c.iniciador, conteudo: `Não respondi ${nome(c.iniciador)} sobre "${c.tema}" (${d.motivo}).`, importancia: 3, conversa_id: c.id },
            { agente: c.iniciador, tipo: 'social', sobre: quem, conteudo: `${nome(quem)} me ignorou quando falei sobre "${c.tema}".`, importancia: 4, conversa_id: c.id },
          ]);
          this.ajustarRel(c.iniciador, quem, { afinidade: -0.04, confianca: -0.02 }, false);
          await this.acao(quem, 'silencio', `Não respondeu ${nome(c.iniciador)} (${d.motivo})`, { conversa_id: c.id, utilidade: d.u });
          await this.encerrar(c, 'recusada', `${nome(quem)} não respondeu.`);
          return null;
        }
        instrucao = `Você decidiu NÃO entrar nessa conversa agora (${d.motivo}). Recuse com educação e sinceridade, em 1 frase, e encerre.`;
      }
    }
    const restantes = c.max_turnos - reais.length;
    if (!instrucao && c.tipo === 'recado' && reais.length === 0) instrucao = 'Você está mandando um recado direto ao gestor. Seja concreto(a): o problema com números, o que você já tentou e uma sugestão do que fazer. Até 3 frases.';
    else if (!instrucao && restantes <= 1 && c.tipo !== 'recado') instrucao = c.tipo === 'reuniao' && quem === c.iniciador ? 'É a última fala: feche a reunião com o plano de ação (quem faz o quê) e encerre.' : 'É a última fala desta conversa: feche de forma natural e encerre.';
    else if (!instrucao && c.tipo === 'treinamento' && quem === c.iniciador && reais.length >= 2) instrucao = 'Você é quem está treinando: ensine algo concreto e aplicável (método, fala pronta ou exercício), adaptado ao que o colega acabou de dizer.';
    else if (!instrucao && c.contexto?.ordem && reais.length === 0) instrucao = `O gestor pediu isto: "${c.motivo || c.tema}". Comece a conversa cumprindo o pedido.`;
    const f = await this.gerarFala(quem, c, reais, instrucao, todas);
    if (!f) return null;
    const repetida = reais.slice(-4).some((m) => similaridade(m.texto, f.mensagem) >= 0.6);   // anti-loop
    const row = await this.registrar(c, quem, f);
    if (f.compromisso) await this.memorizar({ agente: quem, tipo: 'operacional', conteudo: `Combinei: ${f.compromisso}`, importancia: 6, conversa_id: c.id, tags: ['compromisso'], prazo: new Date(Date.now() + 864e5).toISOString() });
    if (f.aprendizado) await this.memorizar({ agente: quem, tipo: 'semantica', conteudo: `Aprendi${c.participantes.length === 2 ? ` com ${nome(c.participantes.find((p) => p !== quem))}` : ' na conversa'}: ${f.aprendizado}`, importancia: c.tipo === 'treinamento' ? 7 : 5, conversa_id: c.id, tags: ['aprendizado', ...(c.contexto?.kind === 'compartilhar' ? [] : ['compartilhavel']), c.contexto?.tag].filter(Boolean) });
    const total = reais.length + 1;
    if (instrucao.startsWith('Você decidiu NÃO')) await this.encerrar(c, 'recusada', `${nome(quem)} recusou: ${f.mensagem}`);
    else if (c.tipo === 'recado') { if (total > 1 && quem !== 'gestor') await this.encerrar(c, 'encerrada'); }
    else if (total >= c.max_turnos || (f.encerrar && total >= 3) || repetida) await this.encerrar(c, 'encerrada', repetida ? 'Conversa encerrada: começou a se repetir.' : null);
    return { ...f, row };
  }

  async encerrar(c, status = 'encerrada', resumoForcado = null) {
    const W = this.W;
    const msgs = (W.msgsPor[c.id] || []).filter((m) => m.texto);
    const comp = msgs.filter((m) => m._compromisso).map((m) => `${nome(m.de)}: ${m._compromisso}`);
    const apr = msgs.filter((m) => m._aprendizado).map((m) => `${nome(m.de)}: ${m._aprendizado}`);
    const sent = msgs.length ? msgs.reduce((s, m) => s + Number(m.sentimento || 0), 0) / msgs.length : 0;
    const resumo = resumoForcado || [`${c.tema || 'Conversa'} — ${msgs.length} falas, clima ${sent > 0.35 ? 'muito bom' : sent > 0.05 ? 'bom' : sent < -0.2 ? 'tenso' : 'neutro'}.`, comp.length ? `Combinados: ${comp.join('; ')}.` : '', apr.length ? `Aprendizados: ${apr.join('; ')}.` : ''].filter(Boolean).join(' ');
    c.status = status; c.resumo = resumo; c.encerrada_em = agoraISO();
    await this.api.update('agent_conversas', c.id, { status, resumo: resumo.slice(0, 2000), encerrada_em: c.encerrada_em, contexto: c.contexto || {} }).catch(() => null);
    const agentes = c.participantes.filter((p) => AGENTES.includes(p));
    const mems = [];
    if (status === 'encerrada' && msgs.length >= 2) {
      for (const a of agentes) {
        const outros = c.participantes.filter((p) => p !== a);
        const doOutro = msgs.filter((m) => m.de !== a);
        const sOutro = doOutro.length ? doOutro.reduce((s, m) => s + Number(m.sentimento || 0), 0) / doOutro.length : 0;
        mems.push({ agente: a, tipo: 'episodica', conversa_id: c.id, importancia: Math.min(9, (IMP_TIPO[c.tipo] || 4) + Math.abs(sent) * 2), tags: [c.tipo, c.contexto?.tag].filter(Boolean),
          conteudo: `${c.tipo === 'cafe' ? 'Tomei café' : c.tipo === 'reuniao' ? 'Participei de reunião' : c.tipo === 'treinamento' ? (a === c.iniciador ? 'Dei treinamento' : 'Fui treinado(a)') : c.tipo === 'recado' ? 'Falei com o gestor' : 'Conversei'} com ${outros.map(nome).join(', ')} sobre "${c.tema}". ${resumo}`.slice(0, 900) });
        for (const o of outros.filter((x) => AGENTES.includes(x))) {
          const r = this.rel(a, o);
          if (r) { r.interacoes = (r.interacoes || 0) + 1; r.ultima_interacao = agoraISO(); this.ajustarRel(a, o, {}, sOutro > 0.15 ? true : sOutro < -0.15 ? false : undefined); }
          if (Math.abs(sOutro) >= 0.45) mems.push({ agente: a, tipo: 'social', sobre: o, conversa_id: c.id, importancia: 5, conteudo: sOutro > 0 ? `${nome(o)} foi muito ${c.tipo === 'treinamento' ? 'didático(a)' : 'parceiro(a)'} comigo na conversa sobre "${c.tema}".` : `Clima ruim com ${nome(o)} na conversa sobre "${c.tema}".` });
        }
        if (c.tipo === 'cafe') this.humor(a, { energia: 0.12, estresse: -0.08, satisfacao: 0.03 });
        else this.humor(a, { motivacao: 0.03 * Math.sign(sent), satisfacao: 0.02 * Math.sign(sent) });
      }
    }
    agentes.forEach((a) => this.setEstado(a, { atividade: null, local: 'mesa' }));
    await this.memorizar(mems);
    if (status === 'encerrada' && msgs.length >= 2 && c.tipo !== 'recado') await this.evento({ tipo: 'conversa_encerrada', ator: c.iniciador, resumo: `${c.participantes.map(nome).join(', ')} — ${c.tipo}: ${c.tema}`, importancia: 2, dados: { conversa_id: c.id, tipo: c.tipo } });
    if (c.contexto?.ordem && status === 'encerrada') c._registro = await this.api.registrarOrdem?.(c, msgs, resumo, apr).catch(() => null);
    this.emit('soc:conversa', { fase: 'fim', conversa: c });
  }

  /** Abre uma conversa. Para café/reunião/treinamento, agenda e convida (os outros decidem). */
  async iniciar({ tipo = 'conversa', iniciador, participantes, tema, motivo, contexto = {}, agendarEm = 0, maxTurnos, abertura = true }) {
    const parts = [...new Set([iniciador, ...participantes])];
    const max = maxTurnos || { conversa: 6, cafe: 6, mentoria: 8, treinamento: 8, reuniao: Math.min(10, parts.length * 2 + 1), recado: 4 }[tipo] || 6;
    const status = agendarEm > 0 ? 'agendada' : 'aberta';
    const c = await this.api.insert('agent_conversas', { tipo, participantes: parts, iniciador, tema, motivo, status, turnos: 0, agendada_para: agendarEm > 0 ? new Date(Date.now() + agendarEm).toISOString() : null, max_turnos: max, contexto });
    c.contexto ||= contexto;
    this.W.conversas.push(c);
    this.W.msgsPor[c.id] = [];
    if (AGENTES.includes(iniciador)) this.setEstado(iniciador, { ultima_iniciativa: agoraISO() });
    if (status === 'aberta' && tipo !== 'recado') parts.forEach((p) => AGENTES.includes(p) && this.setEstado(p, { atividade: tipo, local: LOCAL_DO_TIPO[tipo] }));
    this.emit('soc:conversa', { fase: status === 'agendada' ? 'convite' : 'inicio', conversa: c });
    if (abertura) {
      const instr = status === 'agendada' ? `Você está CONVIDANDO ${parts.filter((p) => p !== iniciador).map(nome).join(', ')} para ${tipo === 'cafe' ? 'um café daqui a pouco' : tipo === 'reuniao' ? 'uma reunião daqui a pouco' : 'um treinamento daqui a pouco'}. Faça o convite em 1-2 frases com o motivo.` : '';
      const f = await this.gerarFala(iniciador, c, [], instr);
      if (f) await this.registrar(c, iniciador, { ...f, intencao: status === 'agendada' ? 'convidar' : f.intencao, encerrar: false });
    }
    return c;
  }

  // ---------- RACIOCINAR + DECIDIR: uma iniciativa por ciclo (ou silêncio) ----------
  candidatos() {
    const W = this.W, k = this._k || {}, out = [];
    const agora = Date.now();
    const desde = (t) => agora - t;
    const par = (a, b) => this.ultimaConversa((c) => c.participantes.includes(a) && c.participantes.includes(b));
    const doTipo = (a, kind) => this.ultimaConversa((c) => c.iniciador === a && c.contexto?.kind === kind);
    for (const a of AGENTES.filter((x) => this.disponivel(x))) {
      const e = W.estado[a], p = PERSONALIDADE[a], h = { ...HUMOR_INICIAL(a), ...(e.humor || {}) };
      if (desde(ms(e.ultima_iniciativa)) < (6 - 3 * p.extroversao) * MIN) continue;
      const meus = k[a]?.problemas || [];
      // pedir ajuda a quem é referência no tema
      for (const pr of meus.filter((x) => x.gravidade >= 0.35)) {
        const esp = especialistaEm(pr.tag);
        if (!esp || esp === a || !this.disponivel(esp) || desde(par(a, esp)) < 40 * MIN || desde(doTipo(a, 'pedir_ajuda')) < 60 * MIN) continue;
        const r = this.rel(a, esp) || {};
        out.push({ a, kind: 'pedir_ajuda', alvo: esp, tag: pr.tag, problema: pr.texto, u: 0.3 + 0.4 * pr.gravidade + 0.15 * (1 - p.autoconfianca) + 0.15 * p.colaboracao + 0.15 * (r.confianca || 0) - 0.25 * (r.rivalidade || 0), motivo: `${pr.texto}; ${nome(esp)} é referência em ${pr.tag}` });
      }
      // oferecer ajuda a quem tem problema na minha área
      for (const b of AGENTES.filter((x) => x !== a && this.disponivel(x))) {
        const pr = (k[b]?.problemas || []).find((x) => AREAS[a].includes(x.tag) && x.gravidade >= 0.4);
        if (!pr || desde(par(a, b)) < 40 * MIN || desde(doTipo(a, 'oferecer_ajuda')) < 60 * MIN) continue;
        const r = this.rel(a, b) || {};
        out.push({ a, kind: 'oferecer_ajuda', alvo: b, tag: pr.tag, problema: pr.texto, u: 0.2 + 0.35 * pr.gravidade + 0.2 * p.empatia + 0.15 * p.colaboracao + 0.15 * (r.afinidade || 0) - 0.3 * (r.rivalidade || 0) + ((k[a]?.desempenho || 0) > 70 ? 0.08 : 0), motivo: `${nome(b)}: ${pr.texto} — é a minha área` });
      }
      // café com quem tenho afinidade (pausa, estresse, cansaço)
      if (desde(doTipo(a, 'cafe')) > 50 * MIN && this.ultimaConversa((c) => c.tipo === 'cafe') < agora - 15 * MIN) {
        const alvos = AGENTES.filter((x) => x !== a && this.disponivel(x)).map((b) => ({ b, s: (this.rel(a, b)?.afinidade || 0) + 0.15 * rnd(a + b + Math.floor(agora / 36e5)) - (desde(par(a, b)) < 90 * MIN ? 0.2 : 0) })).sort((x, y) => y.s - x.s);
        if (alvos[0]) out.push({ a, kind: 'cafe', alvo: alvos[0].b, extra: p.extroversao > 0.7 && alvos[1]?.s > 0.25 ? alvos[1].b : null, u: 0.1 + 0.3 * p.sociabilidade + 0.3 * h.estresse + 0.25 * (1 - h.energia) + 0.1 * alvos[0].s, motivo: `pausa (estresse ${Math.round(h.estresse * 100)}%, energia ${Math.round(h.energia * 100)}%) com quem tenho afinidade` });
      }
      // comemorar venda recente
      const venda = W.eventos.find((ev) => ev.tipo === 'venda' && desde(ms(ev.created_at)) < 30 * MIN && !W.conversas.some((c) => c.contexto?.evento_id === ev.id));
      if (venda) out.push({ a, kind: 'comemorar', evento: venda, u: 0.45 + 0.4 * p.extroversao, motivo: venda.resumo });
      // reagir ao ranking
      const queda = W.eventos.find((ev) => ev.tipo === 'ranking' && ev.alvo === a && ev.dados?.para > ev.dados?.de && desde(ms(ev.created_at)) < 3 * 36e5);
      const lider = AGENTES.find((x) => k[x]?.ranking === 1);
      if (queda && lider && lider !== a && this.disponivel(lider) && desde(doTipo(a, 'ranking')) > 3 * 36e5) out.push({ a, kind: 'ranking', alvo: lider, u: 0.25 + 0.45 * p.competitividade + 0.1 * p.curiosidade, motivo: `caí no ranking; ${nome(lider)} está em 1º` });
      // compartilhar algo que aprendi com quem precisa
      const apr = desde(doTipo(a, 'compartilhar')) > 2 * 36e5 && W.memorias.find((m) => m.agente === a && ['semantica', 'estrategia'].includes(m.tipo) && m.tags?.includes('compartilhavel') && desde(ms(m.created_at)) < 8 * 36e5 && !W.conversas.some((c) => c.contexto?.memoria_id === m.id));
      if (apr) {
        const jaSabe = (x) => W.memorias.some((m) => m.agente === x && similaridade(m.conteudo, apr.conteudo) >= 0.45);
        const b = AGENTES.filter((x) => x !== a && this.disponivel(x) && !jaSabe(x)).sort((x, y) => (k[y]?.problemas?.length || 0) - (k[x]?.problemas?.length || 0) || (this.rel(a, y)?.afinidade || 0) - (this.rel(a, x)?.afinidade || 0))[0];
        if (b && desde(par(a, b)) > 30 * MIN) out.push({ a, kind: 'compartilhar', alvo: b, memoria: apr, u: 0.2 + 0.3 * p.colaboracao + 0.2 * p.extroversao + 0.02 * apr.importancia, motivo: `quero passar adiante: ${apr.conteudo.slice(0, 80)}` });
      }
      // recado ao gestor quando o problema é grave e persistente
      const grave = meus.find((x) => x.gravidade >= 0.7 && desde(ms(x.desde)) > 2 * 36e5);
      if (grave && desde(doTipo(a, 'recado')) > 4 * 36e5 && W.conversas.filter((c) => c.tipo === 'recado' && c.status === 'aberta').length < 3) out.push({ a, kind: 'recado', tag: grave.tag, problema: grave.texto, u: 0.3 + 0.4 * grave.gravidade + 0.1 * p.disciplina, motivo: `problema grave: ${grave.texto}` });
    }
    // Elisa: treinamento reativo/preventivo
    if (this.disponivel('elisa')) {
      const e = W.estado.elisa, estr = e.estrategia;
      const treinou = (b) => this.ultimaConversa((c) => c.tipo === 'treinamento' && c.participantes.includes(b));
      const alvo = AGENTES.filter((b) => b !== 'elisa' && this.disponivel(b)).map((b) => ({ b, g: k[b]?.problemas?.[0]?.gravidade || 0, pr: k[b]?.problemas?.[0], d: k[b]?.desempenho ?? 60 })).filter((x) => desde(treinou(x.b)) > 3 * 36e5).sort((x, y) => y.g - x.g || x.d - y.d)[0];
      if (alvo && (alvo.g >= 0.45 || (estr === 'treino_preventivo' && alvo.d < 70)) && desde(ms(e.ultima_iniciativa)) > 8 * MIN) {
        const tag = alvo.pr?.tag || AREAS[alvo.b][0];
        out.push({ a: 'elisa', kind: 'treinamento', alvo: alvo.b, tag, problema: alvo.pr?.texto, u: 0.35 + 0.45 * alvo.g + (estr === 'treino_reativo' && alvo.g >= 0.45 ? 0.12 : 0) + (estr === 'treino_preventivo' ? 0.1 : 0), motivo: alvo.pr ? `${nome(alvo.b)}: ${alvo.pr.texto}` : `${nome(alvo.b)} com desempenho ${alvo.d}` });
      }
    }
    // padrões coletivos → reunião
    for (const pd of padroesEquipe(k, W.eventos)) {
      if (this.ultimaConversa((c) => c.tipo === 'reuniao' && c.contexto?.tag === pd.tag) > agora - 12 * 36e5) continue;
      const lider = pd.envolvidos.filter((x) => this.disponivel(x)).sort((x, y) => PERSONALIDADE[y].disciplina + PERSONALIDADE[y].colaboracao - PERSONALIDADE[x].disciplina - PERSONALIDADE[x].colaboracao)[0];
      if (lider) out.push({ a: lider, kind: 'reuniao', participantes: pd.envolvidos, tag: pd.tag, problema: pd.texto, u: 0.4 + 0.5 * pd.gravidade, motivo: `padrão coletivo: ${pd.texto}` });
    }
    // variação determinística por minuto (evita sempre a mesma escolha)
    const minuto = Math.floor(agora / MIN);
    return out.map((c) => ({ ...c, u: +(c.u + (rnd(c.a + c.kind + minuto) - 0.5) * 0.12).toFixed(3) })).sort((x, y) => y.u - x.u);
  }

  async iniciativa() {
    const W = this.W;
    const ativas = W.conversas.filter((c) => ['aberta', 'agendada'].includes(c.status) && c.tipo !== 'recado').length;
    if (ativas >= this.opts.maxConversas) return 0;
    const cands = this.candidatos();
    const limiar = Number(W.mundo?.config?.limiar ?? 0.55);
    const melhor = cands[0];
    if (!melhor || melhor.u < limiar) {
      if (melhor && Date.now() - this._ultimoSilencio > 15 * MIN) {
        this._ultimoSilencio = Date.now();
        await this.acao(melhor.a, 'silencio', `Considerou ${rotulo(melhor.kind)} (utilidade ${melhor.u}), mas abaixo do limiar ${limiar} — seguiu trabalhando`, { alternativas: cands.slice(0, 3).map((c) => ({ a: c.a, kind: c.kind, u: c.u })) });
      }
      return 0;
    }
    const c = melhor, A = c.a;
    const alt = cands.slice(1, 4).map((x) => ({ a: x.a, kind: x.kind, u: x.u }));
    let conv;
    switch (c.kind) {
      case 'pedir_ajuda':
      case 'oferecer_ajuda':
        conv = await this.iniciar({ tipo: c.kind === 'oferecer_ajuda' && PERSONALIDADE[A].disciplina > 0.7 ? 'mentoria' : 'conversa', iniciador: A, participantes: [c.alvo], tema: temaDe(c.tag), motivo: c.motivo, contexto: { kind: c.kind, tag: c.tag, problema: c.problema } });
        break;
      case 'cafe':
        conv = await this.iniciar({ tipo: 'cafe', iniciador: A, participantes: [c.alvo, c.extra].filter(Boolean), tema: 'pausa para o café', motivo: c.motivo, contexto: { kind: 'cafe' }, agendarEm: 45e3 });
        break;
      case 'comemorar': {
        const conv2 = AGENTES.filter((x) => x !== A && this.disponivel(x)).sort((x, y) => (this.rel(A, y)?.afinidade || 0) - (this.rel(A, x)?.afinidade || 0)).slice(0, 2);
        conv = await this.iniciar({ tipo: 'cafe', iniciador: A, participantes: conv2, tema: 'comemorar a venda', motivo: c.motivo, contexto: { kind: 'comemorar', evento: c.evento.resumo, evento_id: c.evento.id }, agendarEm: 40e3 });
        break;
      }
      case 'ranking':
        conv = await this.iniciar({ tipo: 'conversa', iniciador: A, participantes: [c.alvo], tema: 'ranking interno', motivo: c.motivo, contexto: { kind: 'ranking' } });
        break;
      case 'compartilhar':
        conv = await this.iniciar({ tipo: 'conversa', iniciador: A, participantes: [c.alvo], tema: 'uma dica que aprendi', motivo: c.motivo, contexto: { kind: 'compartilhar', tag: (c.memoria.tags || []).find((x) => TEMAS[x]) || null, aprendizado: c.memoria.conteudo.replace(/^(Aprendi[^:]*|O gestor ensinou[^:]*):\s*/, ''), memoria_id: c.memoria.id } });
        break;
      case 'recado': {
        const est = ESTRATEGIAS[A].find((s) => s.id === this.W.estado[A].estrategia);
        conv = await this.iniciar({ tipo: 'recado', iniciador: A, participantes: ['gestor'], tema: c.problema, motivo: c.motivo, contexto: { kind: 'recado', tag: c.tag, texto: `Gestor, ${c.problema}.`, sugestao: est ? `estou aplicando "${est.nome}" (${est.dica}); se puder, olhe isso comigo hoje.` : '' } });
        break;
      }
      case 'treinamento':
        conv = await this.iniciar({ tipo: 'treinamento', iniciador: 'elisa', participantes: [c.alvo], tema: temaDe(c.tag), motivo: c.motivo, contexto: { kind: 'treinamento', tag: c.tag, problema: c.problema }, agendarEm: 50e3 });
        break;
      case 'reuniao':
        conv = await this.iniciar({ tipo: 'reuniao', iniciador: A, participantes: c.participantes, tema: temaDe(c.tag), motivo: c.motivo, contexto: { kind: 'reuniao', tag: c.tag, texto: c.problema }, agendarEm: 75e3 });
        break;
      default: return 0;
    }
    await this.acao(A, c.kind, c.motivo, { conversa_id: conv?.id, utilidade: c.u, alvo: c.alvo || null, alternativas: alt });
    return 1;
  }

  // ---------- AVALIAR + ADAPTAR: objetivos, planos e estratégias ----------
  async avaliarObjetivos() {
    const W = this.W, k = this._k;
    if (!k) return;
    const agora = Date.now();
    for (const o of W.objetivos) {
      if (agora - ms(o.avaliado_em) < 10 * MIN) continue;
      const v = k[o.agente]?.[o.kpi];
      if (v == null) continue;
      const def = OBJETIVOS[o.agente]?.find((x) => x.kpi === o.kpi);
      const baixo = def?.direcao === 'baixo';
      const ok = baixo ? v <= Number(o.alvo) : v >= Number(o.alvo);
      const okAntes = o.atual != null && (baixo ? Number(o.atual) <= Number(o.alvo) : Number(o.atual) >= Number(o.alvo));
      const est = ESTRATEGIAS[o.agente].find((s) => s.id === W.estado[o.agente]?.estrategia);
      const pr = k[o.agente].problemas[0];
      const ajuda = pr ? especialistaEm(pr.tag) : null;
      const plano = [
        { passo: `Medir ${o.kpi}: hoje ${v}, alvo ${o.alvo}`, status: ok ? 'feito' : 'em_andamento' },
        est ? { passo: `Aplicar a estratégia "${est.nome}" (${est.dica})`, status: ok ? 'feito' : 'em_andamento' } : null,
        pr && ajuda && ajuda !== o.agente ? { passo: `Trocar ideia com ${nome(ajuda)} sobre ${pr.tag}`, status: 'pendente' } : null,
        { passo: 'Reavaliar a estratégia na próxima janela e trocar se não melhorar', status: 'pendente' },
      ].filter(Boolean);
      const patch = { atual: v, avaliado_em: agoraISO(), plano, base: o.base ?? v };
      Object.assign(o, patch);
      await this.api.update('agent_objetivos', o.id, patch).catch(() => null);
      if (ok && !okAntes) {
        await this.memorizar({ agente: o.agente, tipo: 'episodica', conteudo: `Bati meu objetivo: ${o.descricao} (${o.kpi} = ${v}).`, importancia: 7, tags: ['objetivo', o.kpi] });
        this.humor(o.agente, { satisfacao: 0.1, confianca: 0.05, motivacao: 0.05 });
      }
    }
    // estratégias: comparar KPI principal antes × depois da janela
    for (const a of AGENTES) {
      const e = W.estado[a];
      const obj = OBJETIVOS[a][0];
      const v = k[a]?.[obj.kpi];
      if (v == null) continue;
      if (!e.estrategia_base || e.estrategia_base.kpi !== obj.kpi) { this.setEstado(a, { estrategia_base: { kpi: obj.kpi, valor: v }, estrategia_desde: e.estrategia_desde || agoraISO() }); continue; }
      if (agora - ms(e.estrategia_desde) < this.opts.janelaEstrategia) continue;
      const antes = Number(e.estrategia_base.valor);
      const melhorou = obj.direcao === 'baixo' ? v < antes : v > antes;
      const piorou = obj.direcao === 'baixo' ? v > antes : v < antes;
      const noAlvo = obj.direcao === 'baixo' ? v <= obj.alvo : v >= obj.alvo;
      const est = ESTRATEGIAS[a].find((s) => s.id === e.estrategia) || ESTRATEGIAS[a][0];
      if (noAlvo && !melhorou) { this.setEstado(a, { estrategia_base: { kpi: obj.kpi, valor: v }, estrategia_desde: agoraISO() }); continue; }
      if (melhorou) {
        await this.memorizar({ agente: a, tipo: 'estrategia', conteudo: `A estratégia "${est.nome}" funcionou: ${obj.kpi} foi de ${antes} para ${v}. Vou manter.`, importancia: 7, tags: ['estrategia', est.id, 'funcionou', 'compartilhavel'] });
        this.humor(a, { confianca: 0.04, satisfacao: 0.04 });
        this.setEstado(a, { estrategia_base: { kpi: obj.kpi, valor: v }, estrategia_desde: agoraISO() });
      } else {
        const falhas = new Set(W.memorias.filter((m) => m.agente === a && m.tipo === 'estrategia' && m.tags?.includes('nao_funcionou') && agora - ms(m.created_at) < 3 * 864e5).flatMap((m) => m.tags));
        const prox = ESTRATEGIAS[a].find((s) => s.id !== est.id && !falhas.has(s.id)) || ESTRATEGIAS[a].find((s) => s.id !== est.id) || est;
        await this.memorizar({ agente: a, tipo: 'estrategia', conteudo: `A estratégia "${est.nome}" ${piorou ? 'piorou' : 'não mudou'} ${obj.kpi} (${antes} → ${v}). Vou testar "${prox.nome}".`, importancia: 6, tags: ['estrategia', est.id, 'nao_funcionou'] });
        await this.acao(a, 'mudar_estrategia', `${est.nome} não trouxe resultado em ${obj.kpi} (${antes} → ${v}); testando ${prox.nome}`, { de: est.id, para: prox.id, kpi: obj.kpi, antes, depois: v });
        this.humor(a, { frustracao: 0.04 });
        this.setEstado(a, { estrategia: prox.id, estrategia_desde: agoraISO(), estrategia_base: { kpi: obj.kpi, valor: v } });
      }
    }
  }

  // ---------- APRENDER: reflexão periódica (rara e seletiva) ----------
  async refletir(rel) {
    const W = this.W;
    const a = AGENTES.filter((x) => Number(W.estado[x].importancia_acumulada || 0) >= 25 && Date.now() - ms(W.estado[x].ultima_reflexao) > 3 * 36e5)
      .sort((x, y) => W.estado[y].importancia_acumulada - W.estado[x].importancia_acumulada)[0];
    if (!a) return;
    const mems = recuperar(W.memorias, a, { tipos: ['episodica', 'social', 'semantica', 'estrategia'], k: 12 });
    let texto = null, usou = false;
    if (this.api.ia) {
      const prompt = `Você é ${nome(a)}, corretor(a) virtual. Releia suas memórias recentes e reflita em primeira pessoa: o que está funcionando, o que não está, como estão suas relações no time e o que você vai fazer diferente. Seja concreto(a) e honesto(a).\n\n<memorias>\n${mems.map(textoMemoria).join('\n')}\n</memorias>`;
      const est = Math.ceil(prompt.length / 3.5) + 400;
      if (await this.api.gastar(est)) {
        try {
          const o = await this.api.ia({ system: 'Responda em português do Brasil.', prompt, schemaName: 'reflexao', agente: a, schema: { type: 'object', additionalProperties: false, required: ['reflexao', 'licao', 'proxima_acao'], properties: { reflexao: { type: 'string' }, licao: { type: 'string' }, proxima_acao: { type: 'string' } } } });
          texto = `${o.reflexao} Lição: ${o.licao} Próxima ação: ${o.proxima_acao}`; usou = true; rel.ia++;
        } catch (e) { console.warn('[sociedade] reflexão com IA falhou', e.message || e); }
      }
    }
    if (!texto) {
      const pos = mems.filter((m) => /funcionou|bati|parceir|didátic|aprendi/i.test(m.conteudo)).length;
      const neg = mems.filter((m) => /não funcionou|piorou|ignorou|recusou|perdemos|clima ruim/i.test(m.conteudo)).length;
      const pr = this._k?.[a]?.problemas?.[0];
      texto = `Olhando para as últimas horas: ${pos} coisa(s) boa(s) e ${neg} difícil(eis). ${pr ? `Meu ponto fraco agora é ${pr.texto}.` : 'Meus números estão sob controle.'} ${neg > pos ? 'Preciso pedir mais ajuda e ajustar a forma de trabalhar.' : 'Vou manter o que está dando certo.'}`;
    }
    await this.memorizar({ agente: a, tipo: 'reflexao', conteudo: texto, importancia: 8, tags: ['reflexao'] });
    this.setEstado(a, { ultima_reflexao: agoraISO(), importancia_acumulada: 0 });
    await this.acao(a, 'reflexao', 'Acumulou experiências importantes e parou para refletir', { texto }, usou);
  }

  derivaHumor() {
    if (Date.now() - (this._derivaAt || 0) < 3 * MIN) return;
    this._derivaAt = Date.now();
    for (const a of AGENTES) {
      const e = this.W.estado[a];
      const base = HUMOR_INICIAL(a), h = { ...base, ...(e.humor || {}) };
      const d = {};
      for (const key of ['motivacao', 'confianca', 'satisfacao', 'frustracao', 'foco']) d[key] = (base[key] - h[key]) * 0.08;
      d.energia = this.emConversa(a) ? -0.01 : 0.03;
      this.humor(a, d);
    }
  }

  async manutencao() {
    const m = this.W.mundo;
    if (!m || Date.now() - ms(m.config?.ultima_manutencao) < 6 * 36e5) return;
    try {
      await this.api.manutencao?.();
      m.config = { ...(m.config || {}), ultima_manutencao: agoraISO() };
      await this.api.update('agent_mundo', m.id, { config: m.config });
    } catch (e) { console.warn('[sociedade] manutenção', e.message || e); }
  }

  // -------------------------------------------------------------------------
  // Conversas pedidas pelo gestor (ordens): conduzidas até o fim, turno a turno
  // -------------------------------------------------------------------------
  async conduzir({ tipo, iniciador, participantes, tema, motivo, contexto = {}, maxTurnos, onFala }) {
    if (!this.W) { await this.carregar(); await this.inicializar(); }
    const c = await this.iniciar({ tipo, iniciador, participantes, tema, motivo, contexto: { ...contexto, ordem: true, conduzida: true }, maxTurnos, abertura: false });
    for (let i = 0; i < c.max_turnos + 1 && c.status === 'aberta'; i++) {
      const f = await this.turno(c);
      if (!f) break;
      if (onFala) await onFala(f.row, c);
    }
    if (c.status === 'aberta') await this.encerrar(c);
    await this.salvar();
    return c;
  }

  /** Resposta do gestor a um recado (o agente responde no próximo ciclo). */
  async responderGestor(conversaId, texto) {
    if (!this.W) await this.carregar();
    const c = this.W.conversas.find((x) => x.id === conversaId);
    if (!c) throw new Error('conversa não encontrada');
    await this.registrar(c, 'gestor', { mensagem: texto, intencao: 'responder', sentimento: 0.2, pensamento: '' }, [c.iniciador]);
    await this.memorizar({ agente: c.iniciador, tipo: 'episodica', sobre: 'gestor', conteudo: `O gestor respondeu meu recado sobre "${c.tema}": ${texto}`, importancia: 7, conversa_id: c.id, tags: ['gestor'] });
    const f = await this.turno(c);
    await this.salvar();
    return f;
  }
}

function rotulo(kind) {
  return { pedir_ajuda: 'pedir ajuda', oferecer_ajuda: 'oferecer ajuda', cafe: 'chamar para um café', comemorar: 'comemorar', ranking: 'conversar sobre o ranking', compartilhar: 'compartilhar um aprendizado', recado: 'mandar recado ao gestor', treinamento: 'propor treinamento', reuniao: 'convocar reunião' }[kind] || kind;
}
function recusaCurta(a, motivo, c) {
  const t = { 'estresse alto': 'Agora não consigo, estou apagando incêndio aqui.', cansaço: 'Hoje passo, tô sem energia.', 'atrito com quem chamou': 'Vou passar dessa vez.', 'agenda cheia': 'Não vou conseguir, estou no meio de um atendimento.' }[motivo];
  return `${t || 'Não consigo agora.'}${c.tipo === 'cafe' ? ' Fica pra próxima!' : ''}`;
}
function aceiteCurto(a, c) {
  const p = PERSONALIDADE[a];
  if (c.tipo === 'cafe') return p.extroversao > 0.6 ? 'Bora! Já tô indo.' : 'Pode ser, 10 minutos.';
  if (c.tipo === 'treinamento') return 'Combinado, te encontro na sala de treinamento.';
  return p.disciplina > 0.7 ? 'Confirmado. Levo meus números.' : 'Tô dentro.';
}
function horarioComercial(d = new Date()) {
  const h = d.getHours(), dia = d.getDay();
  return dia >= 1 && dia <= 6 && h >= 8 && h < 19;
}
export { dicaDe };
