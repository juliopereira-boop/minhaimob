// Vida do escritório: as conversas reais entre os corretores virtuais, o que cada um sente,
// lembra, quer e decidiu — e os recados que eles mandam para o gestor.
import { $, $$, esc, toast, rel, num, drawer, debounce } from '../ui.js';
import { AGENTS, agentById } from '../engine/agents.js';
import { obterSociedade, iniciarSociedade, socBus } from '../sociedade/navegador.js';
import { ESTRATEGIAS, OBJETIVOS, nome } from '../sociedade/perfis.js';
import { descreverRelacao } from '../sociedade/fala.js';
import { resumoKpi } from '../sociedade/mundo.js';

const TIPO = { conversa: ['💬', 'Conversa'], cafe: ['☕', 'Café'], reuniao: ['🤝', 'Reunião'], treinamento: ['🎓', 'Treinamento'], mentoria: ['🧭', 'Mentoria'], recado: ['✉', 'Recado ao gestor'] };
const STATUS = { agendada: ['b-amber', 'agendada'], aberta: ['b-green', '● ao vivo'], encerrada: ['b-gray', 'encerrada'], recusada: ['b-red', 'recusada'], proposta: ['b-blue', 'proposta'] };
const INTENCAO = { pedir_ajuda: 'pede ajuda', oferecer_ajuda: 'oferece ajuda', ensinar: 'ensina', perguntar: 'pergunta', responder: 'responde', sugerir: 'sugere', concordar: 'concorda', discordar: 'discorda', parabenizar: 'parabeniza', provocar: 'provoca', desabafar: 'desabafa', agradecer: 'agradece', combinar_acao: 'combina ação', convidar: 'convida', aceitar: 'aceita', recusar: 'recusa', encerrar: 'encerra', cumprimentar: 'cumprimenta' };
const TRACO = { extroversao: 'Extroversão', sociabilidade: 'Sociabilidade', disciplina: 'Disciplina', competitividade: 'Competitividade', ambicao: 'Ambição', empatia: 'Empatia', autoconfianca: 'Autoconfiança', paciencia: 'Paciência', curiosidade: 'Curiosidade', abertura: 'Abertura', colaboracao: 'Colaboração', risco: 'Apetite a risco' };
const MEM = { episodica: 'Episódica', semantica: 'Aprendizados', social: 'Social', operacional: 'Compromissos', reflexao: 'Reflexões', estrategia: 'Estratégias' };
const ACAO = { pedir_ajuda: 'Pediu ajuda', oferecer_ajuda: 'Ofereceu ajuda', cafe: 'Chamou para café', comemorar: 'Puxou comemoração', ranking: 'Reagiu ao ranking', compartilhar: 'Compartilhou aprendizado', recado: 'Mandou recado ao gestor', treinamento: 'Propôs treinamento', reuniao: 'Convocou reunião', silencio: 'Ficou em silêncio', recusar_convite: 'Recusou convite', mudar_estrategia: 'Mudou de estratégia', reflexao: 'Refletiu' };

const face = (k, s = 30) => {
  const a = agentById(k);
  if (!a) return `<span class="agent-face" style="background:var(--surface-3);color:var(--gold-2);width:${s}px;height:${s}px;font-size:${s * 0.42}px;border-radius:${s * 0.3}px">${k === 'gestor' ? '♛' : '?'}</span>`;
  return `<span class="agent-face" title="${a.nome}" style="background:${a.cor};width:${s}px;height:${s}px;font-size:${s * 0.42}px;border-radius:${s * 0.3}px">${a.nome[0]}</span>`;
};
const bar = (v, cor = 'var(--gold)') => `<div class="meter" style="height:6px"><i style="width:${Math.round(Math.max(0, Math.min(1, v ?? 0)) * 100)}%;background:${cor}"></i></div>`;

const CSS = `
.soc-thread{border-left:2px solid var(--line);margin-left:14px;padding-left:14px}
.soc-msg{display:flex;gap:10px;align-items:flex-start;margin:10px 0}
.soc-msg .txt{background:var(--surface-2);border:1px solid var(--line);border-radius:4px 14px 14px 14px;padding:8px 12px;font-size:13.5px;line-height:1.45;max-width:640px}
.soc-msg.gestor .txt{background:var(--gold-soft);border-color:transparent}
.soc-meta{font-size:11px;color:var(--muted);margin-top:3px;display:flex;gap:8px;flex-wrap:wrap}
.soc-think{font-size:12px;color:var(--muted);font-style:italic;margin-top:4px}
.soc-hide-think .soc-think{display:none}
.soc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.soc-humor{display:grid;grid-template-columns:minmax(78px,auto) 1fr;gap:4px 10px;align-items:center;font-size:11.5px}
.soc-new{animation:socIn .5s ease}
@keyframes socIn{from{opacity:0}to{opacity:1}}
`;

let off = [], tab = 'conversas', mostrarPensamento = true;

export function destroy() { off.forEach((f) => f()); off = []; }

export async function render(el, ctx, params) {
  destroy();
  tab = ['conversas', 'agentes', 'recados', 'eventos', 'decisoes'].includes(params?.[0]) ? params[0] : 'conversas';
  try { mostrarPensamento = localStorage.getItem('mi_soc_think') !== '0'; } catch { /* */ }
  const soc = iniciarSociedade(ctx);
  const db = ctx.db;
  el.innerHTML = `<style>${CSS}</style>
  <div class="page-head"><div><h1>Vida do escritório</h1><p>Os corretores virtuais percebem o que acontece no CRM, lembram, decidem e conversam entre si — cada fala é gerada do ponto de vista de quem fala.</p></div>
    <div class="row wrap"><span id="soc-st" class="badge b-gray">…</span><button class="btn" id="soc-tick">▶ Rodar ciclo agora</button><button class="btn" id="soc-pause">⏸ Pausar</button><button class="btn" id="soc-cfg">⚙</button><a class="btn primary" href="office.html">◭ Ver no 3D</a></div></div>
  <div class="tabs" id="soc-tabs">${[['conversas', '💬 Conversas'], ['agentes', '🧠 Agentes'], ['recados', '✉ Recados <span id="soc-nrec"></span>'], ['eventos', '⚡ Acontecimentos'], ['decisoes', '⚙ Decisões']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="soc-body" class="${mostrarPensamento ? '' : 'soc-hide-think'}"></div>`;
  $('#soc-tabs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { history.replaceState(null, '', '#/sociedade/' + b.dataset.t); render(el, ctx, [b.dataset.t]); } };
  const body = $('#soc-body', el);

  const S = { mundo: null, conversas: [], msgs: {}, estado: [], relacoes: [], objetivos: [], memorias: [], eventos: [], acoes: [] };
  const carregar = async () => {
    const L = (t, o) => db.list(t, o).catch(() => []);
    const [mundo, conversas, estado] = await Promise.all([L('agent_mundo', { limit: 1 }), L('agent_conversas', { order: 'created_at.desc', limit: 50 }), L('agent_estado')]);
    S.mundo = mundo[0] || null; S.conversas = conversas; S.estado = estado;
    const ids = conversas.map((c) => c.id);
    const msgs = ids.length ? await L('agent_mensagens', { in: { conversa_id: ids }, order: 'created_at.asc', limit: 1500 }) : [];
    S.msgs = {}; msgs.forEach((m) => (S.msgs[m.conversa_id] ||= []).push(m));
    if (tab === 'agentes') [S.relacoes, S.objetivos] = await Promise.all([L('agent_relacoes'), L('agent_objetivos', { eq: { status: 'ativo' } })]);
    if (tab === 'eventos') S.eventos = await L('agent_eventos', { order: 'created_at.desc', limit: 120 });
    if (tab === 'decisoes') S.acoes = await L('agent_acoes', { order: 'created_at.desc', limit: 150 });
  };

  const status = () => {
    const m = S.mundo, ia = db.aiMode();
    const st = $('#soc-st', el);
    if (!m) { st.className = 'badge b-gray'; st.textContent = 'iniciando…'; return; }
    st.className = `badge ${m.pausado ? 'b-amber' : 'b-green'}`;
    st.textContent = `${m.pausado ? '⏸ pausado' : '● vivo'} · ${ia ? 'IA' : 'sem IA (modo offline)'} · ${num((m.tokens_hoje || 0) / 1000, 1)}k/${num((m.orcamento_tokens_dia || 0) / 1000, 0)}k tokens hoje`;
    $('#soc-pause', el).textContent = m.pausado ? '▶ Retomar' : '⏸ Pausar';
    const nrec = S.conversas.filter((c) => c.tipo === 'recado' && c.status === 'aberta' && (S.msgs[c.id] || []).slice(-1)[0]?.de !== 'gestor').length;
    $('#soc-nrec', el).innerHTML = nrec ? `<span class="pill-num">${nrec}</span>` : '';
  };

  const msgHTML = (m) => `<div class="soc-msg ${m.de === 'gestor' ? 'gestor' : ''}" data-m="${m.id}">${face(m.de, 30)}<div><div class="txt"><b style="font-size:12px">${esc(nome(m.de))}</b><div>${esc(m.texto)}</div></div>
    <div class="soc-meta"><span>${esc(INTENCAO[m.intencao] || m.intencao || '')}</span>${m.sentimento != null ? `<span title="sentimento">${m.sentimento > 0.3 ? '🙂' : m.sentimento < -0.2 ? '😕' : '😐'} ${Number(m.sentimento).toFixed(1)}</span>` : ''}<span>${m.usou_ia ? 'IA' : 'offline'}</span><span>${rel(m.created_at)}</span></div>
    ${m.pensamento ? `<div class="soc-think">💭 ${esc(m.pensamento)}</div>` : ''}</div></div>`;

  const convHTML = (c) => {
    const [ic, lbl] = TIPO[c.tipo] || ['💬', c.tipo];
    const [cls, stl] = STATUS[c.status] || ['b-gray', c.status];
    const ms = S.msgs[c.id] || [];
    return `<div class="card" data-c="${c.id}"><div class="row between wrap"><div class="row wrap">${(c.contexto?.convidados || c.participantes).map((p) => face(p, 26)).join('')}<b>${ic} ${lbl}: ${esc(c.tema || '')}</b><span class="badge ${cls}">${stl}</span>${c.contexto?.ordem ? '<span class="badge b-gold">ordem do gestor</span>' : ''}</div><span class="muted" style="font-size:11.5px">${rel(c.created_at)}</span></div>
      ${c.motivo ? `<div class="muted mt-s" style="font-size:12px">Por quê: ${esc(nome(c.iniciador))} — ${esc(c.motivo)}</div>` : ''}
      <div class="soc-thread mt-s">${ms.map(msgHTML).join('') || '<div class="muted" style="font-size:12px;padding:6px 0">aguardando a primeira fala…</div>'}</div>
      ${c.status === 'agendada' && c.agendada_para ? `<div class="hint mt-s">Começa ${rel(c.agendada_para)} · confirmados: ${c.participantes.map(nome).join(', ')}</div>` : ''}
      ${c.resumo ? `<div class="callout mt-s" style="font-size:12.5px">${esc(c.resumo)}</div>` : ''}
      ${c.tipo === 'recado' && c.status === 'aberta' ? `<form class="row mt-s" data-resp="${c.id}"><input name="t" placeholder="Responder ${esc(nome(c.iniciador))}…" style="flex:1" required /><button class="btn primary">Responder</button></form>` : ''}</div>`;
  };

  const vazio = (txt) => `<div class="empty">${txt}</div>`;

  const desenhar = async () => {
    await carregar();
    status();
    if (tab === 'conversas') {
      const cs = S.conversas.filter((c) => c.tipo !== 'recado');
      body.innerHTML = `<div class="row wrap mb" style="margin-bottom:10px"><label class="check"><input type="checkbox" id="soc-think" ${mostrarPensamento ? 'checked' : ''}/> Mostrar o pensamento privado de quem fala</label><span class="muted" style="font-size:12px">· conversas acontecem sozinhas a cada ~20 s enquanto a plataforma estiver aberta</span></div>
        <div class="col">${cs.map(convHTML).join('') || vazio('Ainda não houve conversas. Clique em <b>▶ Rodar ciclo agora</b> ou aguarde: os agentes decidem sozinhos quando falar — e às vezes decidem ficar em silêncio.')}</div>`;
      $('#soc-think', body).onchange = (e) => { mostrarPensamento = e.target.checked; body.classList.toggle('soc-hide-think', !mostrarPensamento); try { localStorage.setItem('mi_soc_think', mostrarPensamento ? '1' : '0'); } catch { /* */ } };
    } else if (tab === 'recados') {
      const cs = S.conversas.filter((c) => c.tipo === 'recado');
      body.innerHTML = `<div class="col">${cs.map(convHTML).join('') || vazio('Nenhum recado. Os corretores escrevem para você quando um problema persiste e precisa de decisão.')}</div>`;
      $$('[data-resp]', body).forEach((f) => (f.onsubmit = async (e) => {
        e.preventDefault();
        const t = f.t.value.trim(); if (!t) return;
        f.querySelector('button').disabled = true;
        try { await soc.responderGestor(f.dataset.resp, t); toast('Resposta enviada'); } catch (err) { toast(err.message, 'err'); }
        agendar();
      }));
    } else if (tab === 'agentes') {
      body.innerHTML = `<div class="soc-grid">${AGENTS.map((a) => {
        const e = S.estado.find((x) => x.agente === a.id);
        if (!e) return `<div class="card">${face(a.id)} <b>${a.nome}</b><p class="muted mt-s">ainda não acordou</p></div>`;
        const h = e.humor || {};
        const est = ESTRATEGIAS[a.id]?.find((s) => s.id === e.estrategia);
        const objs = S.objetivos.filter((o) => o.agente === a.id);
        const rels = S.relacoes.filter((r) => r.agente === a.id).sort((x, y) => y.afinidade - x.afinidade);
        const atual = S.conversas.find((c) => ['aberta', 'agendada'].includes(c.status) && c.participantes.includes(a.id) && c.tipo !== 'recado');
        return `<div class="card click" data-ag="${a.id}"><div class="row between"><div class="row">${face(a.id, 38)}<div><b>${a.nome}</b><div class="muted" style="font-size:12px">${a.cargo}</div></div></div><div style="text-align:right"><div style="font-weight:800;font-size:18px">${e.ranking ? e.ranking + 'º' : '—'}</div><div class="muted" style="font-size:11px">desempenho ${e.desempenho ?? '—'}</div></div></div>
          <div class="muted mt-s" style="font-size:12px">${atual ? `${TIPO[atual.tipo][0]} ${atual.status === 'agendada' ? 'vai para' : 'em'} ${TIPO[atual.tipo][1].toLowerCase()}: ${esc(atual.tema || '')}` : '🪑 na mesa'}</div>
          <div class="soc-humor mt-s"><span>Motivação</span>${bar(h.motivacao, '#3FB27F')}<span>Energia</span>${bar(h.energia, '#5B8DEF')}<span>Estresse</span>${bar(h.estresse, '#E5484D')}<span>Confiança</span>${bar(h.confianca, 'var(--gold)')}</div>
          <div class="mt-s" style="font-size:12px"><b>Números:</b> <span class="muted">${esc(resumoKpi(a.id, e.kpi || {}))}</span></div>
          ${e.kpi?.problemas?.[0] ? `<div style="font-size:12px;color:var(--red)">⚠ ${esc(e.kpi.problemas[0].texto)}</div>` : ''}
          <div class="mt-s" style="font-size:12px"><b>Estratégia:</b> ${est ? esc(est.nome) : '—'} <span class="muted">${e.estrategia_desde ? 'desde ' + rel(e.estrategia_desde) : ''}</span></div>
          ${objs.map((o) => `<div style="font-size:12px" class="mt-s">🎯 ${esc(o.descricao)} <span class="muted">(atual ${o.atual ?? '—'} · alvo ${o.alvo})</span></div>`).join('')}
          <div class="mt-s" style="font-size:12px"><b>Mais próximo(a):</b> ${rels.slice(0, 2).map((r) => `${esc(nome(r.outro))} <span class="muted">(${Math.round(r.afinidade * 100)})</span>`).join(', ') || '—'}${rels.some((r) => r.rivalidade > 0.2) ? ` · <b>rivalidade:</b> ${rels.filter((r) => r.rivalidade > 0.2).map((r) => esc(nome(r.outro))).join(', ')}` : ''}</div>
          <div class="hint mt-s">Clique para ver memórias, relações e decisões</div></div>`;
      }).join('')}</div>`;
      $$('[data-ag]', body).forEach((c) => (c.onclick = () => perfil(c.dataset.ag)));
    } else if (tab === 'eventos') {
      body.innerHTML = `<div class="card"><div class="list">${S.eventos.map((e) => `<div class="list-item"><div class="grow"><div class="li-title">${esc(e.resumo)}</div><div class="li-sub">${esc(e.tipo)} · por ${esc(nome(e.ator || 'sistema'))} · importância ${num(e.importancia, 0)}</div></div><span class="muted" style="font-size:11.5px">${rel(e.created_at)}</span></div>`).join('') || vazio('Sem acontecimentos ainda. Cadastre leads, mova negócios no pipeline ou ensine algo ao time: tudo vira evento que os agentes percebem.')}</div></div>`;
    } else if (tab === 'decisoes') {
      body.innerHTML = `<div class="card"><div class="list">${S.acoes.map((x) => `<div class="list-item"><div class="row" style="gap:10px;align-items:flex-start">${face(x.agente, 26)}<div class="grow"><div class="li-title">${esc(ACAO[x.tipo] || x.tipo)}${x.usou_ia ? ' <span class="badge b-violet">IA</span>' : ''}</div><div class="li-sub">${esc(x.motivo || '')}</div>${x.dados?.alternativas?.length ? `<div class="hint">Alternativas consideradas: ${x.dados.alternativas.map((y) => `${esc(nome(y.a))} → ${esc(y.kind)} (${y.u})`).join(' · ')}</div>` : ''}${x.dados?.utilidade != null ? `<div class="hint">utilidade ${x.dados.utilidade}</div>` : ''}</div></div><span class="muted" style="font-size:11.5px">${rel(x.created_at)}</span></div>`).join('') || vazio('Nenhuma decisão registrada ainda.')}</div></div>`;
    }
  };

  const perfil = async (ag) => {
    const a = agentById(ag);
    const [mems, rels, acoes] = await Promise.all([
      db.list('agent_memorias', { eq: { agente: ag }, order: 'created_at.desc', limit: 200 }).catch(() => []),
      db.list('agent_relacoes', { eq: { agente: ag } }).catch(() => []),
      db.list('agent_acoes', { eq: { agente: ag }, order: 'created_at.desc', limit: 30 }).catch(() => []),
    ]);
    const e = S.estado.find((x) => x.agente === ag) || {};
    const p = e.personalidade || {};
    const objs = (S.objetivos.length ? S.objetivos : await db.list('agent_objetivos', { eq: { agente: ag } }).catch(() => [])).filter((o) => o.agente === ag);
    drawer(`<div class="drawer-head"><div class="row">${face(ag, 40)}<div><h2>${a.nome}</h2><div class="muted" style="font-size:12px">${a.cargo}</div></div></div><button class="btn xs" data-close>✕</button></div>
      <div class="drawer-body">
        <h3>Personalidade</h3><div class="soc-humor mt-s">${Object.entries(p).map(([k, v]) => `<span>${esc(TRACO[k] || k)}</span>${bar(v)}`).join('')}</div>
        <h3 class="mt">Objetivos e plano</h3>${objs.map((o) => `<div class="card mt-s" style="font-size:12.5px"><b>🎯 ${esc(o.descricao)}</b> <span class="muted">atual ${o.atual ?? '—'} · alvo ${o.alvo}</span>${(o.plano || []).map((s) => `<div class="mt-s">${s.status === 'feito' ? '✅' : s.status === 'em_andamento' ? '⏳' : '▫'} ${esc(s.passo)}</div>`).join('')}</div>`).join('') || '<p class="muted">—</p>'}
        <h3 class="mt">Relações</h3><div class="list">${rels.sort((x, y) => y.afinidade - x.afinidade).map((r) => `<div class="list-item"><div class="row" style="gap:8px">${face(r.outro, 24)}<div class="grow"><b>${esc(nome(r.outro))}</b><div class="li-sub">${esc(descreverRelacao(r))}</div></div><div style="width:120px" class="soc-humor"><span>afin.</span>${bar((Number(r.afinidade) + 1) / 2)}<span>conf.</span>${bar(r.confianca, '#5B8DEF')}<span>rival.</span>${bar(r.rivalidade, '#E5484D')}</div></div></div>`).join('')}</div>
        <h3 class="mt">Memórias</h3>${Object.entries(MEM).map(([t, l]) => { const ms = mems.filter((m) => m.tipo === t && m.status !== 'esquecida'); return ms.length ? `<div class="mt-s"><b style="font-size:12px">${l} (${ms.length})</b>${ms.slice(0, 12).map((m) => `<div style="font-size:12.5px;margin:5px 0">• ${esc(m.conteudo)} <span class="muted" style="font-size:11px">imp ${num(m.importancia, 0)} · ${rel(m.created_at)}</span></div>`).join('')}</div>` : ''; }).join('') || '<p class="muted">Nenhuma memória ainda.</p>'}
        <h3 class="mt">Últimas decisões</h3>${acoes.map((x) => `<div style="font-size:12.5px;margin:6px 0"><b>${esc(ACAO[x.tipo] || x.tipo)}</b> — ${esc(x.motivo || '')} <span class="muted" style="font-size:11px">${rel(x.created_at)}</span></div>`).join('') || '<p class="muted">—</p>'}
      </div>`);
  };

  const agendar = debounce(() => desenhar().catch((e) => console.error(e)), 500);
  const onMsg = (ev) => {
    const { conversa, mensagem } = ev.detail || {};
    const box = conversa && body.querySelector(`[data-c="${conversa.id}"] .soc-thread`);
    if (box && mensagem && tab !== 'agentes') {
      if (box.querySelector('.muted')) box.innerHTML = '';
      box.insertAdjacentHTML('beforeend', msgHTML(mensagem).replace('class="soc-msg', 'class="soc-msg soc-new'));
      (S.msgs[conversa.id] ||= []).push(mensagem);
    } else agendar();
  };
  const tipos = ['soc:conversa', 'soc:estado', 'soc:acao', 'soc:evento', 'soc:remoto', 'soc:ciclo'];
  socBus.addEventListener('soc:mensagem', onMsg);
  tipos.forEach((t) => socBus.addEventListener(t, agendar));
  off.push(() => { socBus.removeEventListener('soc:mensagem', onMsg); tipos.forEach((t) => socBus.removeEventListener(t, agendar)); });

  $('#soc-tick', el).onclick = async (e) => {
    e.target.disabled = true;
    const r = await soc.tick({ forcar: true });
    e.target.disabled = false;
    if (r.pulou) toast('Ciclo não rodou: ' + r.pulou); else if (r.erro) toast(r.erro, 'err');
    else toast(`Ciclo: ${r.turnos} fala(s), ${r.iniciativas} iniciativa(s), ${r.memorias} memória(s) nova(s)`);
    agendar();
  };
  $('#soc-pause', el).onclick = async () => {
    if (!S.mundo) return;
    await db.update('agent_mundo', S.mundo.id, { pausado: !S.mundo.pausado });
    agendar();
  };
  $('#soc-cfg', el).onclick = () => {
    const m = S.mundo; if (!m) return;
    const d = drawer(`<div class="drawer-head"><h2>Configurar a sociedade</h2><button class="btn xs" data-close>✕</button></div><div class="drawer-body"><form id="soc-f">
      <div class="field"><label>Orçamento diário de IA (tokens)</label><input name="orc" type="number" min="0" step="10000" value="${m.orcamento_tokens_dia}" /><div class="hint">Quando acaba, os agentes continuam vivos no modo offline (falas geradas pelos motores da plataforma). ~150 mil tokens ≈ 80–100 falas com IA.</div></div>
      <label class="check"><input type="checkbox" name="sempre" ${m.sempre_ativo ? 'checked' : ''}/> Sempre ativos (desmarcado = só em horário comercial, seg–sáb 8h–19h)</label>
      <div class="field mt"><label>Iniciativa (limiar 0–1)</label><input name="limiar" type="number" min="0.2" max="0.95" step="0.05" value="${m.config?.limiar ?? 0.55}" /><div class="hint">Mais baixo = conversam mais. Mais alto = só falam quando há motivo forte.</div></div>
      <label class="check mt"><input type="checkbox" name="ia" ${localStorage.getItem('mi_soc_ia') === '0' ? '' : 'checked'}/> Usar IA nas falas (neste navegador)</label>
      <button class="btn primary mt">Salvar</button></form></div>`);
    $('#soc-f', d.el).onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await db.update('agent_mundo', m.id, { orcamento_tokens_dia: Math.max(0, parseInt(f.orc.value, 10) || 0), sempre_ativo: f.sempre.checked, config: { ...(m.config || {}), limiar: Math.max(0.2, Math.min(0.95, Number(f.limiar.value) || 0.55)) } });
        try { localStorage.setItem('mi_soc_ia', f.ia.checked ? '1' : '0'); } catch { /* */ }
        toast('Configuração salva'); d.close?.(); agendar();
      } catch (err) { toast(err.message, 'err'); }
    };
  };

  await desenhar();
  if (!S.estado.length) { await soc.tick({ forcar: true }); await desenhar(); }
}
