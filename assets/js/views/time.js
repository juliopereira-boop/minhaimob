// Componentes do time virtual: base de conhecimento e conversas entre agentes.
import { $, $$, esc, toast, modal, confirmBox, rel, dateTime, num } from '../ui.js';
import { AGENTS, agentById } from '../engine/agents.js';
import { bus, aoVivo, listarConhecimento, salvarConhecimento, listarInteracoes } from '../engine/orquestrador.js';
import { extractText } from '../engine/parser.js';

const LIMITE = 150000;
const face = (k, s = 28) => { const a = agentById(k); return a ? `<span class="agent-face" title="${a.nome}" style="background:${a.cor};width:${s}px;height:${s}px;font-size:${s * 0.42}px;border-radius:${s * 0.3}px">${a.nome[0]}</span>` : ''; };
const alvoLbl = (k) => (k ? agentById(k)?.nome || k : 'Todo o time');

// ---------------------------------------------------------------------------
// Base de conhecimento
// ---------------------------------------------------------------------------
export function mountConhecimento(el, ctx, { agente = '' } = {}) {
  let filtro = agente;
  const draw = async (force) => {
    const itens = await listarConhecimento(ctx, force);
    const vis = itens.filter((k) => !filtro || k.agente === filtro || (filtro === '_geral' && !k.agente));
    const usado = (k) => itens.filter((x) => x.ativo !== false && (!x.agente || x.agente === k)).reduce((s, x) => s + (x.conteudo || '').length, 0);
    el.querySelector('#k-list').innerHTML = vis.map((k) => `<div class="card" style="opacity:${k.ativo === false ? 0.5 : 1}">
      <div class="row between"><div class="row">${k.agente ? face(k.agente, 24) : '<span class="badge b-gold">Time</span>'}<b>${esc(k.titulo)}</b></div>
      <div class="row"><span class="badge ${k.tipo === 'regra' ? 'b-red' : k.tipo === 'treinamento' ? 'b-violet' : 'b-gray'}">${({ regra: 'regra obrigatória', treinamento: 'treinamento', arquivo: 'arquivo', texto: 'conhecimento' })[k.tipo] || k.tipo}</span></div></div>
      <p class="muted mt-s" style="font-size:12.5px;white-space:pre-wrap;max-height:66px;overflow:hidden">${esc(String(k.conteudo).slice(0, 320))}</p>
      <div class="row wrap mt-s" style="font-size:11.5px"><span class="muted">${esc(k.fonte || 'manual')} · ${num((k.conteudo || '').length)} caracteres · ${rel(k.created_at)}${k.arquivo_nome ? ' · ' + esc(k.arquivo_nome) : ''}</span>
      <span class="right"></span><button class="btn xs" data-ver="${k.id}">Ver</button><button class="btn xs" data-tog="${k.id}">${k.ativo === false ? 'Ativar' : 'Pausar'}</button><button class="btn xs danger" data-del="${k.id}">Excluir</button></div></div>`).join('') || '<div class="empty">Nada ensinado ainda. Use o formulário ao lado ou dê ordens no chat ("a partir de agora…").</div>';
    el.querySelector('#k-uso').innerHTML = AGENTS.map((a) => { const u = usado(a.id); return `<div class="row" style="gap:8px;margin:5px 0">${face(a.id, 22)}<div class="grow"><div class="meter"><i style="width:${Math.min(100, (u / LIMITE) * 100)}%;background:${a.cor}"></i></div></div><span class="muted" style="font-size:11px;width:70px;text-align:right">${num(u / 1000, 0)}k / 150k</span></div>`; }).join('');
    $$('[data-ver]', el).forEach((b) => b.onclick = () => { const k = itens.find((x) => x.id === b.dataset.ver); modal(`<h2>${esc(k.titulo)}</h2><div class="muted mt-s" style="font-size:12px">${esc(alvoLbl(k.agente))} · ${esc(k.fonte || '')}</div><div class="code mt" style="max-height:60vh;overflow:auto">${esc(k.conteudo)}</div><div class="row mt" style="justify-content:flex-end"><button class="btn" data-close>Fechar</button></div>`, { wide: true }); });
    $$('[data-tog]', el).forEach((b) => b.onclick = async () => { const k = itens.find((x) => x.id === b.dataset.tog); await ctx.db.update('ai_conhecimento', k.id, { ativo: k.ativo === false }); draw(true); });
    $$('[data-del]', el).forEach((b) => b.onclick = async () => { if (await confirmBox('Excluir este conhecimento?', { danger: true })) { try { await ctx.db.remove('ai_conhecimento', b.dataset.del); draw(true); } catch (e) { toast(e.message, 'err'); } } });
  };
  el.innerHTML = `<div class="grid" style="grid-template-columns:minmax(280px,380px) 1fr;align-items:start" id="k-grid">
    <div class="col">
      <form class="card" id="k-form"><h3>📚 Ensinar o time</h3><p class="muted mt-s" style="font-size:12.5px">Tabelas de preço, políticas da imobiliária, roteiros, regras de desconto, perfil de clientes, manuais. Os corretores usam isso em toda resposta.</p>
        <div class="field mt"><label>Para quem</label><select name="agente"><option value="">Todo o time</option>${AGENTS.map((a) => `<option value="${a.id}" ${agente === a.id ? 'selected' : ''}>${a.nome} — ${a.cargo}</option>`).join('')}</select></div>
        <div class="field"><label>Tipo</label><select name="tipo"><option value="texto">Conhecimento (referência)</option><option value="regra">Regra obrigatória (sempre seguir)</option></select></div>
        <div class="field"><label>Título</label><input name="titulo" required placeholder="Ex.: Política de descontos 2026" /></div>
        <div class="field"><label>Arquivo (PDF, TXT, MD, CSV, imagem)</label><input type="file" id="k-file" accept=".pdf,.txt,.md,.csv,.html,image/*" style="padding:7px" /><div class="hint" id="k-st"></div></div>
        <div class="field"><label>Conteúdo</label><textarea name="conteudo" id="k-txt" required style="min-height:160px" placeholder="Escreva ou cole aqui — ou envie um arquivo acima"></textarea></div>
        <button class="btn primary">Salvar na base</button></form>
      <div class="card"><h3>Uso da memória por corretor</h3><div id="k-uso" class="mt-s"></div><div class="hint mt-s">Até 150 mil caracteres por corretor entram em cada resposta (os mais recentes primeiro).</div></div>
    </div>
    <div class="col"><div class="row wrap"><span class="muted" style="font-weight:700;font-size:12px">FILTRAR:</span>
      ${[['', 'Tudo'], ['_geral', 'Time'], ...AGENTS.map((a) => [a.id, a.nome])].map(([k, l]) => `<span class="chip click ${filtro === k ? 'on' : ''}" data-f="${k}">${l}</span>`).join('')}</div><div id="k-list" class="col"></div></div></div>`;
  if (window.innerWidth < 860) $('#k-grid', el).style.gridTemplateColumns = '1fr';
  $$('[data-f]', el).forEach((c) => c.onclick = () => { filtro = c.dataset.f; $$('[data-f]', el).forEach((x) => x.classList.toggle('on', x === c)); draw(); });
  let arquivo = null;
  $('#k-file', el).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const st = $('#k-st', el); st.textContent = 'Lendo arquivo…';
    try {
      const r = await extractText(f, (p) => (st.textContent = p.msg || 'Lendo…'));
      $('#k-txt', el).value = r.text.replace(/\n=== Página \d+ ===\n/g, '\n').trim();
      const ti = $('[name=titulo]', el); if (!ti.value) ti.value = f.name.replace(/\.[^.]+$/, '');
      arquivo = f.name; st.textContent = `✓ ${num(r.text.length)} caracteres extraídos${r.paginas > 1 ? ` de ${r.paginas} páginas` : ''}${r.ocrPaginas ? ` (${r.ocrPaginas} por OCR)` : ''}. Revise e salve.`;
    } catch (err) { st.textContent = 'Não consegui ler: ' + err.message; }
  };
  $('#k-form', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await salvarConhecimento(ctx, { agente: f.agente.value || null, titulo: f.titulo.value.trim(), conteudo: f.conteudo.value.trim(), tipo: f.tipo.value === 'regra' ? 'regra' : arquivo ? 'arquivo' : 'texto', fonte: arquivo ? 'upload' : 'manual', arquivo_nome: arquivo });
      toast(`Ensinado para ${alvoLbl(f.agente.value || null)}`, 'ok');
      f.reset(); arquivo = null; $('#k-st', el).textContent = ''; draw(true);
    } catch (err) { toast(err.message, 'err'); }
  };
  draw(true);
}

// ---------------------------------------------------------------------------
// Conversas entre agentes
// ---------------------------------------------------------------------------
const TIPO = { treinamento: ['🎓', 'Treinamento', 'b-violet'], conversa: ['💬', 'Conversa', 'b-blue'], reuniao: ['🤝', 'Reunião', 'b-gold'] };
export function cardInteracao(i, { aberto = false } = {}) {
  const [ico, lbl, cls] = TIPO[i.tipo] || ['💬', i.tipo, 'b-gray'];
  return `<div class="card" data-int="${esc(i.id)}" style="padding:14px">
    <div class="row between"><div class="row">${(i.participantes || []).map((k) => face(k, 26)).join('')}<span class="badge ${cls}">${ico} ${lbl}</span>${i.ao_vivo ? '<span class="badge b-red">● ao vivo</span>' : ''}</div><span class="muted" style="font-size:11.5px">${rel(i.created_at)}</span></div>
    <div class="mt-s" style="font-weight:700">${esc(i.tema || '')}</div>
    ${i.resultado ? `<div class="muted mt-s" style="font-size:12.5px">${esc(i.resultado)}</div>` : ''}
    <div class="int-tx ${aberto || i.ao_vivo ? '' : 'hide'}" style="margin-top:10px;border-top:1px solid var(--border);padding-top:8px">${(i.transcricao || []).map(linhaHTML).join('')}</div>
    ${!i.ao_vivo ? `<button class="btn xs ghost mt-s" data-tx>${aberto ? 'Ocultar conversa' : `Ver conversa (${(i.transcricao || []).length} falas)`}</button>` : ''}</div>`;
}
export const linhaHTML = (l) => { const a = agentById(l.agente); return `<div class="row" style="align-items:flex-start;gap:8px;margin:6px 0">${face(l.agente, 22)}<div style="font-size:13px"><b style="color:${a?.cor || 'inherit'}">${esc(a?.nome || l.agente)}:</b> ${esc(l.fala)}</div></div>`; };

export function mountFeed(el, ctx, { limite = 30, compacto = false } = {}) {
  el.innerHTML = `<div class="col" id="f-list"><div class="empty">Carregando…</div></div>`;
  const list = $('#f-list', el);
  const bind = () => $$('[data-tx]', list).forEach((b) => b.onclick = () => { const c = b.closest('[data-int]'); const tx = c.querySelector('.int-tx'); tx.classList.toggle('hide'); b.textContent = tx.classList.contains('hide') ? 'Ver conversa' : 'Ocultar conversa'; });
  (async () => {
    const itens = [...aoVivo.values(), ...(await listarInteracoes(ctx, limite))];
    list.innerHTML = itens.map((i) => cardInteracao(i)).join('') || `<div class="empty"><div class="big">💬</div>Nenhuma conversa ainda.${compacto ? '' : '<br>Peça no chat: <i>"Elisa, treine a Ana para captar leads mais quentes"</i>.'}</div>`;
    bind();
  })();
  const onIni = (e) => { list.querySelector('.empty')?.remove(); list.insertAdjacentHTML('afterbegin', cardInteracao(e.detail)); };
  const onFala = (e) => { const tx = list.querySelector(`[data-int="${CSS.escape(e.detail.id)}"] .int-tx`); if (tx) { tx.insertAdjacentHTML('beforeend', linhaHTML(e.detail)); tx.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } };
  const onFim = (e) => {
    const c = list.querySelector(`[data-int="${CSS.escape(e.detail.temp_id)}"]`);
    if (c) c.outerHTML = cardInteracao(e.detail, { aberto: true });
    else { list.querySelector('.empty')?.remove(); list.insertAdjacentHTML('afterbegin', cardInteracao(e.detail, { aberto: true })); }
    bind();
  };
  bus.addEventListener('interacao:inicio', onIni); bus.addEventListener('interacao:fala', onFala); bus.addEventListener('interacao:fim', onFim);
  return { destroy() { bus.removeEventListener('interacao:inicio', onIni); bus.removeEventListener('interacao:fala', onFala); bus.removeEventListener('interacao:fim', onFim); } };
}
