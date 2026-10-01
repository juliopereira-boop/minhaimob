import { $, $$, esc, md, copy, toast } from '../ui.js';
import { AGENTS, agentById, buildContexto, responderOffline, runTarefa } from '../engine/agents.js';

const histKey = (id) => `mi_chat_${id}`;
const loadHist = (id) => { try { return JSON.parse(localStorage.getItem(histKey(id)) || '[]'); } catch { return []; } };
const saveHist = (id, h) => { try { localStorage.setItem(histKey(id), JSON.stringify(h.slice(-40))); } catch { /* */ } };
let dbAgents = null;

export async function render(el, ctx, params) {
  const sel = params?.[0] && agentById(params[0]) ? params[0] : 'ana';
  el.innerHTML = `
  <div class="page-head"><div><h1>Corretores IA</h1><p>Seu time virtual: cada agente é especialista em uma parte da venda e trabalha com os dados do seu CRM.</p></div>
    <a class="btn primary" href="office.html">◭ Entrar no escritório 3D</a></div>
  <div class="grid" style="grid-template-columns:minmax(240px,300px) 1fr;align-items:start" id="iagrid">
    <div class="col">${AGENTS.map((a) => `<div class="agent-card ${a.id === sel ? 'on' : ''}" data-a="${a.id}"><div class="agent-face" style="background:${a.cor}">${a.nome[0]}</div><div class="grow"><div style="font-weight:800">${a.nome}</div><div class="muted" style="font-size:12px">${a.cargo}</div></div></div>`).join('')}
      <div class="callout ${ctx.db.aiMode() ? 'green' : ''}" style="font-size:12.5px">${ctx.db.aiMode() ? '● IA Claude conectada: respostas geradas com contexto do seu CRM.' : '○ Modo offline: os agentes respondem com os motores da plataforma (score, matching, crédito, playbook). Conecte a IA em Configurações para conversas livres.'}</div></div>
    <div class="card pad-0" style="height:calc(100vh - 220px);min-height:520px" id="chatbox"></div>
  </div>`;
  if (window.innerWidth < 860) $('#iagrid', el).style.gridTemplateColumns = '1fr';
  mountChat($('#chatbox', el), ctx, sel);
  $$('[data-a]', el).forEach((c) => c.onclick = () => { history.replaceState(null, '', '#/ia/' + c.dataset.a); render(el, ctx, [c.dataset.a]); });
}

async function dbAgentId(ctx, nome) {
  if (ctx.db.mode !== 'supabase') return null;
  if (!dbAgents) { try { dbAgents = await ctx.db.list('ai_agents'); } catch { dbAgents = []; } }
  return dbAgents.find((a) => a.nome === nome)?.id || null;
}

/** Monta um chat completo com o agente dentro de `box`. Retorna { send }. */
export function mountChat(box, ctx, agentId, { onState } = {}) {
  const ag = agentById(agentId);
  let hist = loadHist(agentId);
  const estado = {};
  box.innerHTML = `<div class="chat">
    <div class="row" style="padding:14px 16px;border-bottom:1px solid var(--border)"><div class="agent-face" style="background:${ag.cor}">${ag.nome[0]}</div>
      <div class="grow"><div style="font-weight:800">${ag.nome} <span class="muted" style="font-weight:600;font-size:12px">· ${ag.cargo}</span></div><div class="muted" style="font-size:12px">${esc(ag.especialidade)}</div></div>
      <button class="btn xs ghost" data-clear title="Limpar conversa">Limpar</button></div>
    <div class="row wrap" style="padding:10px 16px;border-bottom:1px solid var(--border);gap:6px">${ag.tarefas.map((t) => `<button class="btn xs" data-task="${t.id}">▶ ${esc(t.titulo)}</button>`).join('')}</div>
    <div class="chat-log"></div>
    <div class="row wrap" style="padding:0 12px 6px;gap:6px" data-sugs>${ag.sugestoes.map((s) => `<span class="chip click" data-sug="${esc(s)}">${esc(s)}</span>`).join('')}</div>
    <form class="chat-input"><textarea placeholder="Fale com ${ag.nome}…" rows="1"></textarea><button class="btn primary">Enviar</button></form></div>`;
  const log = $('.chat-log', box), ta = $('textarea', box);

  const bubble = (role, content, { raw = false } = {}) => {
    const b = document.createElement('div');
    b.className = `msg ${role === 'user' ? 'user' : 'bot'}`;
    b.innerHTML = raw ? content : role === 'user' ? esc(content) : md(content) + '<span class="copy" data-copy>copiar</span>';
    log.appendChild(b);
    log.scrollTop = log.scrollHeight;
    return b;
  };
  const renderHist = () => {
    log.innerHTML = '';
    if (!hist.length) bubble('assistant', `Oi! Eu sou ${ag.nome}, ${ag.cargo.toLowerCase()}. ${ag.frase}\n\nUse os botões ▶ para eu trabalhar nos seus dados, ou me pergunte qualquer coisa.`);
    hist.forEach((m) => bubble(m.role, m.content));
  };
  renderHist();
  log.addEventListener('click', (e) => {
    if (e.target.matches('[data-copy]')) copy(e.target.parentElement.innerText.replace(/copiar$/, '').trim());
    const c = e.target.closest('[data-cp]'); if (c) copy(decodeURIComponent(c.dataset.cp));
  });

  let busy = false;
  async function send(text) {
    text = (text || '').trim();
    if (!text || busy) return;
    busy = true;
    onState && onState('falando');
    hist.push({ role: 'user', content: text });
    bubble('user', text);
    const b = bubble('assistant', '<div class="typing"><span></span><span></span><span></span></div>', { raw: true });
    let resposta = '';
    const ia = ctx.db.aiMode() && !(agentId === 'elisa' && estado.persona && !ctx.db.aiMode());
    if (ia) {
      try {
        resposta = await ctx.db.aiChat({
          persona: { nome: ag.nome, papel: ag.papel, system_prompt: ag.system_prompt },
          agentId: await dbAgentId(ctx, ag.nome),
          messages: hist.map(({ role, content }) => ({ role, content })),
          contexto: buildContexto(ctx.data, agentId),
          onDelta: (_, full) => { b.innerHTML = md(full); log.scrollTop = log.scrollHeight; },
        });
      } catch (e) {
        resposta = responderOffline(agentId, text, ctx.data, estado) + `\n\n_(IA indisponível: ${e.message}. Respondi com o motor offline.)_`;
      }
    } else {
      await new Promise((r) => setTimeout(r, 350));
      resposta = responderOffline(agentId, text, ctx.data, estado);
    }
    b.innerHTML = md(resposta) + '<span class="copy" data-copy>copiar</span>';
    hist.push({ role: 'assistant', content: resposta });
    saveHist(agentId, hist);
    log.scrollTop = log.scrollHeight;
    busy = false;
    onState && onState('ok');
  }

  $('form', box).onsubmit = (e) => { e.preventDefault(); const t = ta.value; ta.value = ''; send(t); };
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('form', box).requestSubmit(); } });
  $$('[data-sug]', box).forEach((c) => c.onclick = () => send(c.dataset.sug));
  $('[data-clear]', box).onclick = () => { hist = []; saveHist(agentId, hist); Object.keys(estado).forEach((k) => delete estado[k]); renderHist(); };
  $$('[data-task]', box).forEach((btn) => btn.onclick = () => {
    const r = runTarefa(agentId, btn.dataset.task, ctx.data);
    bubble('user', `▶ ${btn.textContent.replace('▶ ', '')}`);
    const html = `<b>${esc(r.titulo)}</b><div class="muted" style="font-size:12px;margin:4px 0 8px">${esc(r.resumo)}</div>${r.itens.map((i) => `<div style="padding:8px 0;border-top:1px solid var(--border)"><b>${esc(i.titulo)}</b>${i.sub ? `<div style="font-size:12.5px">${esc(i.sub)}</div>` : ''}${i.detalhe ? `<div class="muted" style="font-size:12px">${esc(i.detalhe)}</div>` : ''}${i.copiar ? `<span class="copy" data-cp="${encodeURIComponent(i.copiar)}">copiar mensagem</span>` : ''}${i.lead_id ? ` · <a href="app.html#/leads/${i.lead_id}" style="font-size:11px">abrir cliente</a>` : ''}</div>`).join('') || '<div class="muted">Nada a fazer agora.</div>'}`;
    bubble('assistant', html, { raw: true });
    hist.push({ role: 'user', content: `Execute a tarefa: ${btn.textContent}` }, { role: 'assistant', content: `${r.titulo}: ${r.resumo}\n${r.itens.slice(0, 10).map((i) => `- ${i.titulo}: ${i.sub || ''}`).join('\n')}` });
    saveHist(agentId, hist);
    onState && onState('trabalhando');
    setTimeout(() => onState && onState('ok'), 2500);
  });
  return { send };
}
