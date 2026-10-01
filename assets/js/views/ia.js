import { $, $$, esc, md, copy, toast } from '../ui.js';
import { AGENTS, agentById, runTarefa } from '../engine/agents.js';
import { comando } from '../engine/orquestrador.js';
import { mountConhecimento, mountFeed } from './time.js';

const histKey = (id) => `mi_chat_${id}`;
const loadHist = (id) => { try { return JSON.parse(localStorage.getItem(histKey(id)) || '[]'); } catch { return []; } };
const saveHist = (id, h) => { try { localStorage.setItem(histKey(id), JSON.stringify(h.slice(-40))); } catch { /* */ } };
let aba = 'chat', feed = null;

export async function render(el, ctx, params) {
  const sel = params?.[0] && agentById(params[0]) ? params[0] : 'elisa';
  aba = ['chat', 'conhecimento', 'conversas'].includes(params?.[1]) ? params[1] : 'chat';
  feed?.destroy(); feed = null;
  el.innerHTML = `
  <div class="page-head"><div><h1>Corretores IA</h1><p>Dê ordens, ensine e acompanhe o time virtual. Eles agem sobre os dados do seu CRM e conversam entre si.</p></div>
    <a class="btn primary" href="office.html?agente=${sel}">◭ Ver no escritório 3D</a></div>
  <div class="tabs" id="iatabs">${[['chat', 'Chat e ordens'], ['conhecimento', '📚 Ensinar o time'], ['conversas', '💬 Conversas do time']].map(([k, l]) => `<button data-t="${k}" class="${aba === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="iabody"></div>`;
  $('#iatabs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { history.replaceState(null, '', `#/ia/${sel}/${b.dataset.t}`); render(el, ctx, [sel, b.dataset.t]); } };
  const body = $('#iabody', el);
  if (aba === 'conhecimento') return mountConhecimento(body, ctx);
  if (aba === 'conversas') { feed = mountFeed(body, ctx); return; }
  body.innerHTML = `<div class="grid" style="grid-template-columns:minmax(240px,300px) 1fr;align-items:start" id="iagrid">
    <div class="col">${AGENTS.map((a) => `<div class="agent-card ${a.id === sel ? 'on' : ''}" data-a="${a.id}"><div class="agent-face" style="background:${a.cor}">${a.nome[0]}</div><div class="grow"><div style="font-weight:800">${a.nome}</div><div class="muted" style="font-size:12px">${a.cargo}</div></div></div>`).join('')}
      <div class="callout ${ctx.db.aiMode() ? 'green' : ''}" style="font-size:12.5px">${ctx.db.aiMode() ? '● IA conectada: conversa livre, ordens com ação e treinamentos gerados por IA.' : '○ Sem IA: os corretores entendem ordens diretas (treinar, conversar, reunião, "a partir de agora…") e respondem com os motores da plataforma.'}</div>
      <div class="card" style="font-size:12.5px"><b>Exemplos de ordens</b><div class="list mt-s">${['Elisa, treine a Ana para captar leads mais quentes', 'Bruno, converse com a Carla sobre os clientes em análise de crédito', 'Fábio, faça uma reunião com Bruno e Diego sobre o estoque parado', 'A partir de agora, sempre ofereça a simulação na primeira mensagem'].map((x) => `<div class="list-item click" data-ex="${esc(x)}" style="padding:7px 0">${esc(x)}</div>`).join('')}</div></div></div>
    <div class="card pad-0" style="height:calc(100vh - 260px);min-height:520px" id="chatbox"></div></div>`;
  if (window.innerWidth < 860) $('#iagrid', el).style.gridTemplateColumns = '1fr';
  const chat = mountChat($('#chatbox', el), ctx, sel);
  $$('[data-a]', el).forEach((c) => c.onclick = () => { history.replaceState(null, '', '#/ia/' + c.dataset.a); render(el, ctx, [c.dataset.a]); });
  $$('[data-ex]', el).forEach((c) => c.onclick = () => chat.send(c.dataset.ex));
}
export function destroy() { feed?.destroy(); feed = null; }

/** Chat com o agente: conversa + ordens com ação. Retorna { send }. */
export function mountChat(box, ctx, agentId, { onState, stage } = {}) {
  const ag = agentById(agentId);
  let hist = loadHist(agentId);
  const estado = {};
  box.innerHTML = `<div class="chat">
    <div class="row" style="padding:14px 16px;border-bottom:1px solid var(--border)"><div class="agent-face" style="background:${ag.cor}">${ag.nome[0]}</div>
      <div class="grow"><div style="font-weight:800">${ag.nome} <span class="muted" style="font-weight:600;font-size:12px">· ${ag.cargo}</span></div><div class="muted" style="font-size:12px">${esc(ag.especialidade)}</div></div>
      <a class="btn xs" href="app.html#/ia/${agentId}/conhecimento" title="Ensinar">📚 Ensinar</a><button class="btn xs ghost" data-clear title="Limpar conversa">Limpar</button></div>
    <div class="row wrap" style="padding:10px 16px;border-bottom:1px solid var(--border);gap:6px">${ag.tarefas.map((t) => `<button class="btn xs" data-task="${t.id}">▶ ${esc(t.titulo)}</button>`).join('')}</div>
    <div class="chat-log"></div>
    <div class="row wrap" style="padding:0 12px 6px;gap:6px">${ag.sugestoes.map((s) => `<span class="chip click" data-sug="${esc(s)}">${esc(s)}</span>`).join('')}</div>
    <form class="chat-input"><textarea placeholder="Converse ou dê uma ordem para ${ag.nome}…" rows="1"></textarea><button class="btn primary">Enviar</button></form></div>`;
  const log = $('.chat-log', box), ta = $('textarea', box);
  const bubble = (role, content, { raw = false } = {}) => {
    const b = document.createElement('div');
    b.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    b.innerHTML = raw ? content : role === 'user' ? esc(content) : md(content) + '<span class="copy" data-copy>copiar</span>';
    log.appendChild(b); log.scrollTop = log.scrollHeight;
    return b;
  };
  const renderHist = () => {
    log.innerHTML = '';
    if (!hist.length) bubble('assistant', `Oi! Eu sou ${ag.nome}, ${ag.cargo.toLowerCase()}. ${ag.frase}\n\nConverse comigo ou me dê ordens — posso treinar colegas, alinhar com eles, convocar reuniões e guardar regras que você me passar.`);
    hist.forEach((m) => bubble(m.role, m.content));
  };
  renderHist();
  log.addEventListener('click', (e) => {
    if (e.target.matches('[data-copy]')) copy(e.target.parentElement.innerText.replace(/copiar$/, '').trim());
    const c = e.target.closest('[data-cp]'); if (c) copy(decodeURIComponent(c.dataset.cp));
  });
  const push = (role, content) => { hist.push({ role, content }); saveHist(agentId, hist); };

  let busy = false;
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true; onState && onState('falando');
    push('user', text); bubble('user', text);
    const b = bubble('assistant', '<div class="typing"><span></span><span></span><span></span></div>', { raw: true });
    try {
      const r = await comando(ctx, agentId, hist.map(({ role, content }) => ({ role, content })), { stage, estado });
      b.innerHTML = md(r.texto) + '<span class="copy" data-copy>copiar</span>';
      push('assistant', r.texto);
      if (r.pendentes.length) onState && onState('acao');
      r.pendentes.forEach((p) => p.then(({ resumo, conhecimento }) => {
        const msg = `✓ ${resumo}${conhecimento ? `\n📚 Lição salva na base: "${conhecimento.titulo}"` : ''}\n_Veja a conversa completa em "Conversas do time"._`;
        bubble('assistant', msg); push('assistant', msg);
      }).catch((e) => bubble('assistant', `Não consegui concluir: ${e.message}`)));
    } catch (e) { b.innerHTML = esc('Erro: ' + e.message); }
    log.scrollTop = log.scrollHeight;
    busy = false; onState && onState('ok');
  }
  $('form', box).onsubmit = (e) => { e.preventDefault(); const t = ta.value; ta.value = ''; send(t); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form', box).requestSubmit(); } });
  $$('[data-sug]', box).forEach((c) => c.onclick = () => send(c.dataset.sug));
  $('[data-clear]', box).onclick = () => { hist = []; saveHist(agentId, hist); Object.keys(estado).forEach((k) => delete estado[k]); renderHist(); };
  $$('[data-task]', box).forEach((btn) => btn.onclick = () => {
    const r = runTarefa(agentId, btn.dataset.task, ctx.data);
    bubble('user', `▶ ${btn.textContent.replace('▶ ', '')}`);
    bubble('assistant', `<b>${esc(r.titulo)}</b><div class="muted" style="font-size:12px;margin:4px 0 8px">${esc(r.resumo)}</div>${r.itens.map((i) => `<div style="padding:8px 0;border-top:1px solid var(--border)"><b>${esc(i.titulo)}</b>${i.sub ? `<div style="font-size:12.5px">${esc(i.sub)}</div>` : ''}${i.detalhe ? `<div class="muted" style="font-size:12px">${esc(i.detalhe)}</div>` : ''}${i.copiar ? `<span class="copy" data-cp="${encodeURIComponent(i.copiar)}">copiar mensagem</span>` : ''}${i.lead_id ? ` · <a href="app.html#/leads/${i.lead_id}" style="font-size:11px">abrir cliente</a>` : ''}</div>`).join('') || '<div class="muted">Nada a fazer agora.</div>'}`, { raw: true });
    push('user', `Execute a tarefa: ${btn.textContent}`);
    push('assistant', `${r.titulo}: ${r.resumo}\n${r.itens.slice(0, 10).map((i) => `- ${i.titulo}: ${i.sub || ''}`).join('\n')}`);
    onState && onState('trabalhando'); setTimeout(() => onState && onState('ok'), 2500);
  });
  return { send };
}
