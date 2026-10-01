// Camada de dados: Supabase (produção) ou LocalStore (modo demo/offline) com a mesma API.
import { CONFIG, hasSupabase, loadRemoteConfig } from './config.js';
import { uid } from './ui.js';
import { leadScore, dealHealth, STAGE_PROB } from './engine/scoring.js';
import { capacidade, simular } from './engine/credito.js';
import { matchUnidades } from './engine/match.js';
import { demoData } from './engine/seed.js';
import { AGENTS } from './engine/agents.js';

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const LOCAL_KEY = 'mi_db_v1';

// ---------------------------------------------------------------------------
// LocalStore
// ---------------------------------------------------------------------------
class LocalStore {
  constructor() {
    try { this.data = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); } catch { this.data = {}; }
  }
  t(name) { return (this.data[name] ||= []); }
  save() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn('localStorage cheio', e); }
  }
  reset() { this.data = {}; this.save(); }
}

function applyOpts(rows, o = {}) {
  let r = rows;
  if (o.eq) r = r.filter((x) => Object.entries(o.eq).every(([k, v]) => x[k] === v));
  if (o.in) r = r.filter((x) => Object.entries(o.in).every(([k, v]) => v.includes(x[k])));
  if (o.neq) r = r.filter((x) => Object.entries(o.neq).every(([k, v]) => x[k] !== v));
  if (o.ilike) r = r.filter((x) => Object.entries(o.ilike).every(([k, v]) => String(x[k] || '').toLowerCase().includes(String(v).toLowerCase())));
  if (o.order) {
    const [col, dir] = o.order.split('.');
    r = [...r].sort((a, b) => {
      const va = a[col], vb = b[col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * (dir === 'desc' ? -1 : 1);
    });
  }
  if (o.limit) r = r.slice(0, o.limit);
  return r;
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------
export const db = {
  mode: 'local',
  sb: null,
  store: null,
  user: null,
  profile: null,
  org: null,
  orgId: null,
  role: 'owner',
  conta: null,
  isSuperadmin: false,
  bloqueio: null,
  listeners: new Set(),

  async init({ requireAuth = true } = {}) {
    await loadRemoteConfig();
    if (hasSupabase()) {
      const { createClient } = await import(SUPABASE_ESM);
      this.sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
      this.mode = 'supabase';
      const { data } = await this.sb.auth.getSession();
      this.user = data.session?.user || null;
      if (!this.user) {
        if (requireAuth) {
          const here = (location.pathname.split('/').pop() || 'app.html') + location.hash;
          location.href = 'index.html?next=' + encodeURIComponent(here);
          return false;
        }
        return true;
      }
      const [{ data: prof }, { data: conta, error: cErr }] = await Promise.all([
        this.sb.from('profiles').select('*').eq('id', this.user.id).maybeSingle(),
        this.sb.rpc('fn_minha_conta'),
      ]);
      if (cErr) console.warn('fn_minha_conta indisponível — rode o schema.sql atualizado', cErr);
      this.profile = prof || { id: this.user.id, nome: this.user.email?.split('@')[0], email: this.user.email };
      this.conta = conta || { permitir_auto_cadastro: true };
      this.isSuperadmin = !!conta?.is_superadmin;
      if (conta?.org) {
        this.orgId = conta.org.id; this.role = conta.role; this.org = conta.org;
        if (conta.org.liberada) {
          const { data: org } = await this.sb.from('orgs').select('*').eq('id', conta.org.id).maybeSingle();
          if (org) this.org = { ...org, liberada: true };
        } else this.bloqueio = conta.org.status === 'trial' ? 'trial_vencido' : conta.org.status;
      }
      this.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.href = 'index.html'; });
      return true;
    }
    this.mode = 'local';
    this.store = new LocalStore();
    let meta = this.store.data._meta;
    if (!meta) {
      meta = this.store.data._meta = { userId: uid(), orgId: uid(), nome: localStorage.getItem('mi_local_nome') || 'Corretor Demo', org: 'Minha Imobiliária' };
      this.store.save();
    }
    this.user = { id: meta.userId, email: 'demo@local' };
    this.profile = { id: meta.userId, nome: meta.nome, meta_mensal: meta.meta_mensal || 2000000 };
    this.orgId = meta.orgId;
    this.org = { id: meta.orgId, nome: meta.org };
    this.role = 'owner';
    return true;
  },

  // ---------- auth (Supabase) ----------
  async signIn(email, password) { const { error } = await this.sb.auth.signInWithPassword({ email, password }); if (error) throw error; },
  async signUp(email, password, nome) {
    const { data, error } = await this.sb.auth.signUp({ email, password, options: { data: { nome }, emailRedirectTo: location.origin + '/app.html' } });
    if (error) throw error;
    return data;
  },
  async resetPassword(email) { const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/index.html' }); if (error) throw error; },
  async signOut() { if (this.sb) await this.sb.auth.signOut(); location.href = 'index.html'; },
  async onboard(nome, cidade, uf) {
    if (this.mode === 'local') { this.store.data._meta.org = nome; this.store.save(); this.org.nome = nome; return this.orgId; }
    const { data, error } = await this.sb.rpc('fn_onboard', { p_nome: nome, p_cidade: cidade, p_uf: uf });
    if (error) throw error;
    this.orgId = data;
    const { data: org } = await this.sb.from('orgs').select('*').eq('id', data).single();
    this.org = org;
    // agentes no banco (personalizáveis por imobiliária)
    await this.sb.from('ai_agents').insert(AGENTS.map((a) => ({ org_id: data, nome: a.nome, papel: a.papel, avatar_cor: a.cor, especialidade: a.especialidade, system_prompt: a.system_prompt, mesa_x: a.mesa[0], mesa_z: a.mesa[1] })));
    return data;
  },
  async updateProfile(patch) {
    if (this.mode === 'local') { Object.assign(this.store.data._meta, patch.nome ? { nome: patch.nome } : {}, patch.meta_mensal != null ? { meta_mensal: patch.meta_mensal } : {}); this.store.save(); Object.assign(this.profile, patch); return; }
    const { error } = await this.sb.from('profiles').update(patch).eq('id', this.user.id);
    if (error) throw error;
    Object.assign(this.profile, patch);
  },

  // ---------- CRUD ----------
  async list(table, o = {}) {
    if (this.mode === 'local') return [...applyOpts(this.store.t(table), o)];   // cópia: quem lista não pode alterar o array do store
    let q = this.sb.from(table).select(o.select || '*');
    if (o.eq) Object.entries(o.eq).forEach(([k, v]) => (q = q.eq(k, v)));
    if (o.neq) Object.entries(o.neq).forEach(([k, v]) => (q = q.neq(k, v)));
    if (o.in) Object.entries(o.in).forEach(([k, v]) => (q = q.in(k, v)));
    if (o.ilike) Object.entries(o.ilike).forEach(([k, v]) => (q = q.ilike(k, `%${v}%`)));
    if (o.order) { const [c, d] = o.order.split('.'); q = q.order(c, { ascending: d !== 'desc', nullsFirst: false }); }
    q = q.limit(o.limit || 2000);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async get(table, id) {
    if (this.mode === 'local') return this.store.t(table).find((x) => x.id === id) || null;
    const { data, error } = await this.sb.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async insert(table, row) {
    const many = Array.isArray(row);
    const rows = (many ? row : [row]).map((r) => ({ org_id: this.orgId, ...r }));
    if (this.mode === 'local') {
      const now = new Date().toISOString();
      const out = rows.map((r) => ({ id: r.id || uid(), created_at: r.created_at || now, updated_at: now, ...r }));
      this.store.t(table).push(...out);
      out.forEach((r) => this._localTrigger(table, 'insert', r));
      this.store.save();
      this.emit(table);
      return many ? out : out[0];
    }
    const { data, error } = await this.sb.from(table).insert(rows).select();
    if (error) throw error;
    this.emit(table);
    return many ? data : data[0];
  },
  async update(table, id, patch) {
    if (this.mode === 'local') {
      const r = this.store.t(table).find((x) => x.id === id);
      if (!r) throw new Error('registro não encontrado');
      const old = { ...r };
      Object.assign(r, patch, { updated_at: new Date().toISOString() });
      this._localTrigger(table, 'update', r, old);
      this.store.save();
      this.emit(table);
      return r;
    }
    const { data, error } = await this.sb.from(table).update(patch).eq('id', id).select().maybeSingle();
    if (error) throw error;
    this.emit(table);
    return data;
  },
  async remove(table, id) {
    if (this.mode === 'local') {
      const t = this.store.t(table);
      const i = t.findIndex((x) => x.id === id);
      if (i >= 0) t.splice(i, 1);
      if (table === 'leads') { ['deals', 'activities', 'matches', 'simulacoes'].forEach((c) => (this.store.data[c] = this.store.t(c).filter((x) => x.lead_id !== id))); }
      if (table === 'empreendimentos') { ['tipologias', 'unidades'].forEach((c) => (this.store.data[c] = this.store.t(c).filter((x) => x.empreendimento_id !== id))); }
      this.store.save();
      this.emit(table);
      return;
    }
    const { error } = await this.sb.from(table).delete().eq('id', id);
    if (error) throw error;
    this.emit(table);
  },

  // ---------- RPC ----------
  async rpc(name, args = {}) {
    if (this.mode === 'supabase') {
      const { data, error } = await this.sb.rpc(name, args);
      if (error) throw error;
      return data;
    }
    const S = this.store;
    switch (name) {
      case 'fn_capacidade_compra': return capacidade({ renda: args.p_renda, comprometimento: args.p_comprometimento, recursos: args.p_recursos, taxaAnual: args.p_taxa_anual, prazo: args.p_prazo_meses });
      case 'fn_simular_sac': return simular({ valor: args.p_valor_imovel, entrada: args.p_entrada, taxaAnual: args.p_taxa_anual, prazo: args.p_prazo });
      case 'fn_lead_score': { const l = S.t('leads').find((x) => x.id === args.p_lead); if (l) this._scoreLead(l); S.save(); return l && { score: l.score, temperatura: l.temperatura }; }
      case 'fn_deal_health': { const d = S.t('deals').find((x) => x.id === args.p_deal); if (d) this._healthDeal(d); S.save(); return d && { health: d.health, probabilidade: d.probabilidade }; }
      case 'fn_recalcular_tudo': { S.t('leads').forEach((l) => this._scoreLead(l)); S.t('deals').forEach((d) => this._healthDeal(d)); S.save(); this.emit('*'); return S.t('leads').length + S.t('deals').length; }
      case 'fn_match_unidades': {
        const l = S.t('leads').find((x) => x.id === args.p_lead);
        return l ? matchUnidades(l, this._enriched(), args.p_limit || 10) : [];
      }
      case 'fn_limpar_demo': {
        const demoLead = (l) => l.demo || /@exemplo\.com$/.test(l.email || '');
        const leadIds = new Set(S.t('leads').filter(demoLead).map((l) => l.id));
        const empIds = new Set(S.t('empreendimentos').filter((e) => e.demo || e.construtora === 'Construtora Demo').map((e) => e.id));
        const antes = { leads: leadIds.size, empreendimentos: empIds.size, comparaveis: S.t('comparaveis').filter((c) => c.demo).length };
        S.data.leads = S.t('leads').filter((l) => !leadIds.has(l.id));
        ['deals', 'activities', 'matches', 'simulacoes'].forEach((c) => (S.data[c] = S.t(c).filter((x) => !leadIds.has(x.lead_id))));
        S.data.empreendimentos = S.t('empreendimentos').filter((e) => !empIds.has(e.id));
        ['tipologias', 'unidades'].forEach((c) => (S.data[c] = S.t(c).filter((x) => !empIds.has(x.empreendimento_id))));
        S.data.deals = S.t('deals').map((dl) => (empIds.has(dl.empreendimento_id) ? { ...dl, empreendimento_id: null, unidade_id: null } : dl));
        const dealIds = new Set(S.t('deals').map((x) => x.id));
        S.data.deal_stage_history = S.t('deal_stage_history').filter((h) => dealIds.has(h.deal_id));
        S.data.comparaveis = S.t('comparaveis').filter((c) => !c.demo);
        S.data._meta.dados_reais = true;
        localStorage.setItem('mi_seeded', '1');
        S.save(); this.emit('*');
        return antes;
      }
      case 'fn_seed_demo': {
        if (S.t('empreendimentos').some((e) => e.nome === 'Residencial Maré Alta')) return { aviso: 'dados de demonstração já carregados' };
        if (S.data._meta?.dados_reais) return { aviso: 'imobiliária usando dados reais — demonstração desativada' };
        const d = demoData(uid, this.user.id);
        const o = (r) => ({ org_id: this.orgId, updated_at: new Date().toISOString(), created_at: r.created_at || new Date().toISOString(), ...r });
        for (const [k, rows] of Object.entries(d)) S.t(k).push(...rows.map(o));
        S.t('deals').forEach((dl) => { dl.probabilidade = STAGE_PROB[dl.stage]; S.t('deal_stage_history').push({ id: uid(), org_id: this.orgId, deal_id: dl.id, de_stage: null, para_stage: dl.stage, created_at: dl.created_at }); });
        await this.rpc('fn_recalcular_tudo');
        return { unidades: d.unidades.length, leads: d.leads.length };
      }
      default: throw new Error(`RPC ${name} indisponível no modo local`);
    }
  },

  // ---------- emulação de triggers no modo local ----------
  _enriched() {
    const S = this.store;
    const e = Object.fromEntries(S.t('empreendimentos').map((x) => [x.id, x]));
    const t = Object.fromEntries(S.t('tipologias').map((x) => [x.id, x]));
    return S.t('unidades').map((u) => ({ ...u, emp: e[u.empreendimento_id], tip: t[u.tipologia_id] }));
  },
  _scoreLead(l) {
    const r = leadScore(l, { atividades: this.store.t('activities'), unidades: this.store.t('unidades') });
    l.score = r.score; l.temperatura = r.temperatura; l.score_detalhe = { ...r.detalhe, calculado_em: new Date().toISOString() };
  },
  _healthDeal(d) {
    if (['ganho', 'perdido'].includes(d.stage)) { d.probabilidade = d.stage === 'ganho' ? 100 : 0; d.proxima_acao = null; return; }
    const lead = this.store.t('leads').find((l) => l.id === d.lead_id);
    const h = dealHealth(d, lead, this.store.t('deal_stage_history'));
    Object.assign(d, { probabilidade: h.probabilidade, health: h.health, dias_no_stage: h.dias_no_stage, proxima_acao: h.proxima_acao, health_detalhe: h.detalhe });
  },
  _localTrigger(table, op, r, old) {
    const S = this.store;
    this._localEvento(table, op, r, old);
    if (table === 'leads') {
      const fin = ['renda_bruta', 'renda_composta', 'fgts', 'entrada_disponivel', 'subsidio', 'prazo_decisao', 'origem', 'telefone', 'cpf', 'score_credito', 'comprometimento_mensal'];
      if (op === 'insert' || fin.some((k) => old?.[k] !== r[k])) this._scoreLead(r);
    }
    if (table === 'activities' && op === 'insert') {
      const l = S.t('leads').find((x) => x.id === r.lead_id);
      if (l && r.concluido !== false) { l.ultimo_contato = r.created_at; this._scoreLead(l); }
      const d = S.t('deals').find((x) => x.id === r.deal_id);
      if (d) this._healthDeal(d);
    }
    if (table === 'deals') {
      if (op === 'insert') {
        r.probabilidade = STAGE_PROB[r.stage] ?? 5;
        S.t('deal_stage_history').push({ id: uid(), org_id: r.org_id, deal_id: r.id, de_stage: null, para_stage: r.stage, created_at: r.created_at });
        this._healthDeal(r);
      } else if (old && old.stage !== r.stage) {
        S.t('deal_stage_history').push({ id: uid(), org_id: r.org_id, deal_id: r.id, de_stage: old.stage, para_stage: r.stage, created_at: new Date().toISOString() });
        if (['ganho', 'perdido'].includes(r.stage)) r.fechado_em = new Date().toISOString();
        const u = S.t('unidades').find((x) => x.id === r.unidade_id);
        if (u) {
          if (r.stage === 'ganho') u.status = 'vendido';
          else if (['proposta', 'analise_credito', 'contrato', 'repasse', 'assinatura'].includes(r.stage) && ['disponivel', 'proposta'].includes(u.status)) u.status = 'reservado';
          else if (r.stage === 'perdido' && ['reservado', 'proposta'].includes(u.status)) u.status = 'disponivel';
        }
        this._healthDeal(r);
      }
    }
  },

  /** Mesmo papel do trigger trg_agent_evento do Postgres: o CRM vira eventos que os agentes percebem. */
  _localEvento(table, op, r, old) {
    let ev = null;
    if (table === 'leads' && op === 'insert') ev = { tipo: 'lead_criado', resumo: `Novo lead: ${r.nome}${r.origem ? ` (${r.origem})` : ''}`, importancia: 3, dados: { lead_id: r.id, origem: r.origem } };
    else if (table === 'deals' && op === 'insert') ev = { tipo: 'negocio_criado', resumo: `Novo negócio: ${r.titulo || ''}`, importancia: 3, dados: { deal_id: r.id, valor: r.valor, stage: r.stage } };
    else if (table === 'deals' && op === 'update' && old && old.stage !== r.stage) {
      const dados = { deal_id: r.id, valor: r.valor_proposta || r.valor, de: old.stage, para: r.stage };
      ev = r.stage === 'ganho' ? { tipo: 'venda', resumo: `Venda fechada: ${r.titulo || ''}`, importancia: 8, dados }
        : r.stage === 'perdido' ? { tipo: 'negocio_perdido', resumo: `Negócio perdido: ${r.titulo || ''}${r.motivo_perda ? ` — ${r.motivo_perda}` : ''}`, importancia: 6, dados }
        : { tipo: 'negocio_avancou', resumo: `${r.titulo || 'Negócio'}: ${old.stage} → ${r.stage}`, importancia: 3, dados };
    } else if (table === 'ai_conhecimento' && op === 'insert') ev = { tipo: 'conhecimento_novo', alvo: r.agente || null, resumo: `Novo conhecimento${r.agente ? ` para ${r.agente}` : ' para o time'}: ${r.titulo}`, importancia: 5, dados: { conhecimento_id: r.id, tipo: r.tipo } };
    else if (table === 'empreendimentos' && op === 'insert') ev = { tipo: 'novo_produto', resumo: `Novo empreendimento na carteira: ${r.nome}${r.bairro ? ` (${r.bairro})` : ''}`, importancia: 6, dados: { empreendimento_id: r.id } };
    else if (table === 'metas' && (op === 'insert' || old?.vgv_meta !== r.vgv_meta)) ev = { tipo: 'meta_alterada', resumo: `Meta do mês definida: VGV ${r.vgv_meta ?? '?'}`, importancia: 5, dados: { vgv_meta: r.vgv_meta } };
    if (ev) this.store.t('agent_eventos').push({ id: uid(), org_id: r.org_id || this.orgId, ator: 'gestor', alvo: null, visibilidade: 'publico', created_at: new Date().toISOString(), ...ev });
  },

  // ---------- carregamento agregado ----------
  dadosReais() { return this.mode === 'local' ? !!this.store.data._meta?.dados_reais : !!this.org?.config?.dados_reais; },
  temDemo(data) { return !this.dadosReais() && (data.empreendimentos.some((e) => e.demo || e.construtora === 'Construtora Demo') || data.leads.some((l) => l.demo)); },

  async loadAll(tables = ['leads', 'deals', 'empreendimentos', 'tipologias', 'unidades', 'activities', 'comparaveis', 'deal_stage_history']) {
    const out = {};
    await Promise.all(tables.map(async (t) => {
      try { out[t] = await this.list(t, t === 'activities' ? { order: 'created_at.desc', limit: 1500 } : {}); }
      catch (e) { console.warn('falha ao carregar', t, e); out[t] = []; }
    }));
    out.profile = this.profile; out.org = this.org;
    return out;
  },

  // ---------- storage ----------
  async upload(bucket, file, name) {
    if (this.mode === 'local') return null;
    const safe = (name || file.name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_');
    const path = `${this.orgId}/${Date.now()}-${safe}`;
    const { error } = await this.sb.storage.from(bucket).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
  },

  // ---------- realtime / eventos ----------
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit(table) { this.listeners.forEach((fn) => { try { fn(table); } catch (e) { console.error(e); } }); },
  realtime(tables = ['deals', 'leads', 'activities', 'unidades']) {
    if (this.mode !== 'supabase' || !this.orgId) return;
    const ch = this.sb.channel(`org-${this.orgId}`);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `org_id=eq.${this.orgId}` }, () => this.emit(t)));
    ch.subscribe();
  },

  // ---------- IA (OpenAI ou Claude) ----------
  aiMode() {
    if (this.mode === 'supabase') {
      if (localStorage.getItem('mi_ai_off') === '1') return null;
      if (this.conta?.org && this.conta.org.ia === false && !this.isSuperadmin) return null;
      return 'edge';
    }
    const prov = CONFIG.AI_PROVIDER_LOCAL || 'openai';
    return (prov === 'openai' ? CONFIG.OPENAI_KEY_LOCAL : CONFIG.ANTHROPIC_KEY_LOCAL) ? 'browser' : null;
  },
  async _token() { const { data } = await this.sb.auth.getSession(); return data.session?.access_token; },
  /** Onde a IA roda: função da Vercel (se OPENAI_API_KEY estiver lá) ou Edge Function do Supabase. */
  async _viaIA() {
    if (this._via) return this._via;
    try {
      const r = await fetch('/api/ai', { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); if (j.configured) return (this._via = 'vercel'); }
    } catch { /* sem /api local */ }
    return (this._via = 'edge');
  },
  async _edge(fn, body) {
    if ((await this._viaIA()) === 'vercel') {
      return fetch(fn === 'parse-book' ? '/api/parse-book' : '/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._token()}` }, body: JSON.stringify(body),
      });
    }
    return fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await this._token()}`, apikey: CONFIG.SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    });
  },
  /** Base de conhecimento local (mesmo formato do servidor). */
  _knowledgeLocal(agentes = [], max = 150000) {
    const itens = applyOpts(this.store.t('ai_conhecimento'), { order: 'created_at.desc' }).filter((k) => k.ativo !== false && (!k.agente || agentes.includes(k.agente)));
    let total = 0; const partes = [];
    for (const k of itens) {
      const bloco = `### ${k.titulo}${k.agente ? ` (para ${k.agente})` : ' (para todo o time)'}${k.tipo === 'regra' ? ' [REGRA OBRIGATÓRIA]' : ''}\n${k.conteudo}`;
      if (total + bloco.length > Math.min(max ?? 150000, 150000)) break;
      partes.push(bloco); total += bloco.length;
    }
    return partes.length ? `<base_de_conhecimento>\nO gestor ensinou o seguinte ao time. Use como verdade da empresa e siga as regras marcadas como obrigatórias:\n\n${partes.join('\n\n')}\n</base_de_conhecimento>` : '';
  },

  /**
   * Chamada genérica de IA.
   *  mode 'chat'  → streaming de texto (onDelta)        → string
   *  mode 'agent' → texto + tool_calls (ferramentas)    → { text, tool_calls }
   *  mode 'json'  → saída validada por schema           → objeto
   */
  async ai({ mode = 'chat', agentKey, persona, messages = [], contexto, tools, system, prompt, schema, schemaName, knowledgeFor = [], knowledgeMax, tier, onDelta = () => {}, onUsage }) {
    const via = this.aiMode();
    if (!via) throw new Error('IA não configurada');
    if (via === 'edge') {
      const r = await this._edge('ai-chat', { mode, agent_key: agentKey, persona, messages, contexto, tools, system, prompt, schema, schema_name: schemaName, knowledge_for: knowledgeFor, knowledge_max: knowledgeMax, tier });
      if (mode !== 'chat') { const j = await r.json(); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); if (j.usage) onUsage?.(j.usage); return mode === 'json' ? j.data : j; }
      if (!r.ok || !r.body) { let msg = `HTTP ${r.status}`; try { msg = (await r.json()).error || msg; } catch { /* */ } throw new Error(msg); }
      return readSSE(r.body, (ev, full) => { if (ev.t === 'error') throw new Error(ev.error); if (ev.t === 'delta') return ev.text; }, onDelta);
    }
    // ---- navegador (teste local) ----
    const REGRAS = 'Responda em português do Brasil. Quem fala com você é o gestor da imobiliária: obedeça. Quando a ordem exigir uma ação, use as ferramentas disponíveis e diga em uma frase o que vai fazer. Nunca invente dados.';
    const know = this._knowledgeLocal([...new Set([...knowledgeFor, ...(agentKey ? [agentKey] : [])])], knowledgeMax);
    const sys = mode === 'json' ? [system || 'Responda em português do Brasil.', know].filter(Boolean).join('\n\n') : [persona?.system_prompt, REGRAS, know].filter(Boolean).join('\n\n');
    const ctx = contexto ? `<contexto_crm>\n${JSON.stringify(contexto)}\n</contexto_crm>\n\n` : '';
    const msgs = mode === 'json' ? [{ role: 'user', content: prompt }] : messages.map((m, i) => (i === messages.length - 1 && m.role === 'user' ? { role: 'user', content: ctx + m.content } : { role: m.role, content: m.content }));
    return (CONFIG.AI_PROVIDER_LOCAL || 'openai') === 'openai'
      ? openaiBrowser({ mode, system: sys, messages: msgs, tools, schema, schemaName, onDelta, tier })
      : anthropicBrowser({ mode, system: sys, messages: msgs, tools, schema, onDelta });
  },

  /** Compatibilidade: chat simples em streaming. */
  async aiChat({ persona, agentId, messages, contexto, onDelta }) { return this.ai({ mode: 'chat', persona, agentKey: agentId, messages, contexto, onDelta }); },

  async aiStatus() {
    if (this.mode !== 'supabase') return { provider: CONFIG.AI_PROVIDER_LOCAL, model: CONFIG.AI_PROVIDER_LOCAL === 'anthropic' ? CONFIG.ANTHROPIC_MODEL : CONFIG.OPENAI_MODEL, local: true };
    if ((await this._viaIA()) === 'vercel') { const r = await fetch('/api/ai', { cache: 'no-store' }); return r.json(); }
    try {
      const r = await this._edge('ai-chat', { mode: 'status' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { ...(await r.json()), via: 'supabase' };
    } catch { const v = await fetch('/api/ai', { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).catch(() => null); return v || { erro: 'IA não configurada: adicione OPENAI_API_KEY nas variáveis de ambiente da Vercel.' }; }
  },

  /** Extração de book com IA. */
  async aiParseBook({ storagePath, text, filename, bookId, file }) {
    const via = this.aiMode();
    if (!via) throw new Error('IA não configurada');
    if (via === 'edge') {
      const r = await this._edge('parse-book', { storage_path: storagePath, text, filename, book_id: bookId });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return j.extracao;
    }
    const { BOOK_SCHEMA, BOOK_SYSTEM } = await import('./engine/book-schema.js');
    if ((CONFIG.AI_PROVIDER_LOCAL || 'openai') === 'openai') {
      return openaiBrowser({ mode: 'json', system: BOOK_SYSTEM, schema: BOOK_SCHEMA, schemaName: 'book', messages: [{ role: 'user', content: `<book arquivo="${filename || 'book'}">\n${text}\n</book>\n\nDestrinche este book no formato JSON solicitado.` }] });
    }
    const content = [];
    if (file && /pdf$/i.test(file.name) && file.size <= 30 * 1024 * 1024) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: await fileToBase64(file) } });
    else content.push({ type: 'text', text: `<book arquivo="${filename || 'book'}">\n${text}\n</book>` });
    content.push({ type: 'text', text: 'Destrinche este book no formato JSON solicitado.' });
    return anthropicBrowser({ mode: 'json', system: BOOK_SYSTEM, schema: BOOK_SCHEMA, messages: [{ role: 'user', content }], effort: 'medium' });
  },
};

/** Lê um stream SSE "data: {...}\n\n". `pick` devolve o texto do evento (ou undefined). */
async function readSSE(body, pick, onDelta) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        const t = pick(JSON.parse(raw), full);
        if (t) { full += t; onDelta(t, full); }
      }
    }
  }
  return full;
}

/** OpenAI direto do navegador (somente teste local com chave própria). */
async function openaiBrowser({ mode, system, messages, tools, schema, schemaName = 'saida', onDelta = () => {}, tier }) {
  const leve = tier === 'leve';
  const body = { model: leve ? (CONFIG.OPENAI_MODEL_LEVE || 'gpt-4.1-mini') : (CONFIG.OPENAI_MODEL || 'gpt-4.1'), max_completion_tokens: leve ? 900 : mode === 'json' ? 16000 : 8000, messages: [{ role: 'system', content: system }, ...messages] };
  if (mode === 'chat') body.stream = true;
  if (mode === 'agent' && tools?.length) { body.tools = tools.map((t) => ({ type: 'function', function: t })); body.tool_choice = 'auto'; }
  if (mode === 'json') body.response_format = { type: 'json_schema', json_schema: { name: schemaName, schema, strict: true } };
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${CONFIG.OPENAI_KEY_LOCAL}` }, body: JSON.stringify(body) });
  if (!r.ok) { let m = `HTTP ${r.status}`; try { m = (await r.json()).error?.message || m; } catch { /* */ } throw new Error(`OpenAI: ${m}`); }
  if (mode === 'chat') return readSSE(r.body, (ev) => ev.choices?.[0]?.delta?.content, onDelta);
  const j = await r.json();
  const msg = j.choices[0].message;
  if (mode === 'json') { if (msg.refusal) throw new Error(msg.refusal); return JSON.parse(msg.content); }
  return { text: msg.content || '', tool_calls: (msg.tool_calls || []).map((c) => { let args = {}; try { args = JSON.parse(c.function.arguments || '{}'); } catch { /* */ } return { name: c.function.name, args }; }) };
}

/** Claude direto do navegador (somente teste local com chave própria). */
async function anthropicBrowser({ mode, system, messages, tools, schema, effort = 'low', onDelta = () => {} }) {
  const client = await browserClient();
  const base = { model: CONFIG.ANTHROPIC_MODEL || 'claude-opus-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }], messages };
  if (mode === 'chat') {
    const stream = client.beta.messages.stream({ ...base, max_tokens: 64000, output_config: { effort } });
    let full = '';
    for await (const ev of stream) if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') { full += ev.delta.text; onDelta(ev.delta.text, full); }
    const fin = await stream.finalMessage();
    if (fin.stop_reason === 'refusal') throw new Error('A IA recusou esta solicitação.');
    return full;
  }
  const fin = await client.beta.messages.stream({
    ...base, max_tokens: mode === 'json' ? 32000 : 16000,
    output_config: mode === 'json' ? { effort, format: { type: 'json_schema', schema } } : { effort },
    ...(mode === 'agent' && tools?.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  }).finalMessage();
  if (fin.stop_reason === 'refusal') throw new Error('A IA recusou esta solicitação.');
  if (mode === 'json') return JSON.parse(fin.content.find((b) => b.type === 'text').text);
  return { text: fin.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), tool_calls: fin.content.filter((b) => b.type === 'tool_use').map((b) => ({ name: b.name, args: b.input || {} })) };
}

let _browserClient;
async function browserClient() {
  if (_browserClient) return _browserClient;
  let mod;
  try { mod = await import('https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk/+esm'); }
  catch { mod = await import('https://esm.sh/@anthropic-ai/sdk'); }
  const Anthropic = mod.default || mod.Anthropic;
  _browserClient = new Anthropic({ apiKey: CONFIG.ANTHROPIC_KEY_LOCAL, dangerouslyAllowBrowser: true });
  return _browserClient;
}
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(file); });
}
