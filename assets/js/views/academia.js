import { $, $$, esc, brl, brlK, num, copy, parseNum, toast } from '../ui.js';
import { TRILHAS, OBJECOES, SCRIPTS, CONVERSAO_PADRAO, funilReverso, preencher } from '../engine/playbook.js';
import { mountChat } from './ia.js';

const prog = () => { try { return JSON.parse(localStorage.getItem('mi_academia') || '{}'); } catch { return {}; } };
const saveProg = (p) => localStorage.setItem('mi_academia', JSON.stringify(p));
let tab = 'trilhas';

export async function render(el, ctx, params) {
  if (params?.[0]) tab = params[0];
  const p = prog();
  const feitos = TRILHAS.filter((t) => p[t.id]?.ok).length;
  el.innerHTML = `
  <div class="page-head"><div><h1>Academia de vendas</h1><p>Aprenda o método, pratique com IA e transforme em rotina. ${feitos}/${TRILHAS.length} trilhas concluídas.</p></div>
    <div style="width:220px"><div class="meter"><i style="width:${(feitos / TRILHAS.length) * 100}%"></i></div></div></div>
  <div class="tabs" id="atabs">${[['trilhas', 'Trilhas'], ['funil', 'Funil reverso'], ['objecoes', `Objeções (${OBJECOES.length})`], ['scripts', `Scripts (${SCRIPTS.length})`], ['roleplay', 'Roleplay com IA']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="ab"></div>`;
  $('#atabs', el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; render(el, ctx); } };
  const body = $('#ab', el);
  ({ trilhas, funil, objecoes, scripts, roleplay })[tab](body, ctx, p);
}

function trilhas(body, ctx, p) {
  body.innerHTML = `<div class="grid g-auto">${TRILHAS.map((t) => `<div class="card" style="cursor:pointer" data-tr="${t.id}">
    <div class="row between"><span class="badge ${t.nivel === 'Avançado' ? 'b-red' : t.nivel === 'Intermediário' ? 'b-amber' : 'b-blue'}">${t.nivel}</span>${p[t.id]?.ok ? `<span class="badge b-green">✓ ${p[t.id].nota}/${t.quiz.length}</span>` : `<span class="muted" style="font-size:12px">${t.min} min</span>`}</div>
    <h2 class="mt-s">${t.icone} ${esc(t.titulo)}</h2><div class="muted mt-s" style="font-size:12.5px">${t.licoes.length} lições · exercício prático · quiz</div></div>`).join('')}</div><div id="mod" class="mt"></div>`;
  $$('[data-tr]', body).forEach((c) => c.onclick = () => modulo($('#mod', body), TRILHAS.find((t) => t.id === c.dataset.tr), p, () => trilhas(body, ctx, prog())));
}

function modulo(box, t, p, done) {
  box.innerHTML = `<div class="card glow"><div class="row between"><h2>${t.icone} ${esc(t.titulo)}</h2><button class="btn ghost sm" id="x">Fechar</button></div>
    <div class="col mt">${t.licoes.map((l, i) => `<div class="lesson"><h4>${i + 1}. ${esc(l.t)}</h4><ul>${l.p.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}</div>
    <div class="callout mt"><b>Exercício prático:</b> ${esc(t.exercicio)}</div>
    <h3 class="mt">Quiz</h3><form id="qz">${t.quiz.map((q, i) => `<div class="lesson mt-s"><h4>${esc(q.q)}</h4>${q.o.map((o, j) => `<label class="check mt-s"><input type="radio" name="q${i}" value="${j}" required /> ${esc(o)}</label>`).join('')}</div>`).join('')}
    <button class="btn primary mt">Enviar respostas</button></form><div id="qr" class="mt"></div></div>`;
  box.scrollIntoView({ behavior: 'smooth' });
  $('#x', box).onclick = () => (box.innerHTML = '');
  $('#qz', box).onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const nota = t.quiz.filter((q, i) => +fd.get('q' + i) === q.r).length;
    const ok = nota >= Math.ceil(t.quiz.length * 0.6);
    $('#qr', box).innerHTML = `<div class="callout ${ok ? 'green' : 'red'}">${ok ? '✓ Trilha concluída!' : 'Revise as lições e tente de novo.'} Acertos: ${nota}/${t.quiz.length}</div>`;
    if (ok) { p[t.id] = { ok: true, nota, em: new Date().toISOString() }; saveProg(p); toast('Trilha concluída', 'ok'); setTimeout(done, 900); }
  };
}

function funil(body, ctx) {
  const ganhos = ctx.data.deals.filter((d) => d.stage === 'ganho');
  const ticketReal = ganhos.length ? ganhos.reduce((s, d) => s + (d.valor_proposta || d.valor || 0), 0) / ganhos.length : null;
  const ticketEstoque = ctx.data.unidades.filter((u) => u.status === 'disponivel' && u.valor);
  const tk = ticketReal || (ticketEstoque.length ? ticketEstoque.reduce((s, u) => s + u.valor, 0) / ticketEstoque.length : 400000);
  const st = { meta: ctx.db.profile?.meta_mensal || 2000000, ticket: Math.round(tk), ...Object.fromEntries(Object.entries(CONVERSAO_PADRAO).map(([k, v]) => [k, v * 100])), dias: 22 };
  body.innerHTML = `<div class="grid g2"><div class="card"><h3>Sua meta → sua rotina</h3><p class="muted mt-s">O funil reverso transforma a meta de VGV em quantos leads, atendimentos e visitas você precisa por dia.</p>
    <div class="field-row mt">${[['meta', 'Meta de VGV no mês'], ['ticket', 'Ticket médio'], ['dias', 'Dias úteis'], ['lead_atendimento', '% lead → atendimento'], ['atendimento_visita', '% atendimento → visita'], ['visita_proposta', '% visita → proposta'], ['proposta_venda', '% proposta → venda']].map(([k, l]) => `<div class="field"><label>${l}</label><input data-k="${k}" value="${st[k]}" inputmode="decimal" /></div>`).join('')}</div>
    <div class="hint">${ticketReal ? 'Ticket calculado das suas vendas.' : 'Ticket estimado pelo estoque disponível.'} Ajuste as taxas com os números reais da sua equipe.</div></div>
    <div class="card" id="fr"></div></div>`;
  const calc = () => {
    $$('[data-k]', body).forEach((i) => (st[i.dataset.k] = parseNum(i.value) || 0));
    const r = funilReverso({ metaVgv: st.meta, ticket: st.ticket, diasUteis: st.dias || 22, conv: { lead_atendimento: st.lead_atendimento / 100 || 0.01, atendimento_visita: st.atendimento_visita / 100 || 0.01, visita_proposta: st.visita_proposta / 100 || 0.01, proposta_venda: st.proposta_venda / 100 || 0.01 } });
    const rows = [['Leads', r.leads, r.porDia.leads], ['Atendimentos', r.atendimentos, r.porDia.atendimentos], ['Visitas', r.visitas, r.porDia.visitas], ['Propostas', r.propostas, null], ['Vendas', r.vendas, null]];
    const mx = Math.max(...rows.map((x) => x[1]), 1);
    $('#fr', body).innerHTML = `<h3>Para bater ${brlK(st.meta)} você precisa de:</h3><div class="mt">${rows.map(([l, v, dia]) => `<div class="funnel-row"><span style="font-weight:700">${l}</span><div><div class="funnel-bar" style="width:${Math.max(8, (v / mx) * 100)}%">${num(v)}</div></div><span class="right nowrap muted">${dia != null ? `${num(dia, 1)}/dia` : ''}</span></div>`).join('')}</div>
      <div class="callout mt">Rotina diária: <b>${num(r.porDia.leads, 1)} leads novos</b>, <b>${num(r.porDia.atendimentos, 1)} atendimentos</b> e <b>${num(r.porDia.visitas, 1)} visitas</b> por dia útil.</div>`;
  };
  $$('[data-k]', body).forEach((i) => i.addEventListener('input', calc));
  calc();
}

function objecoes(body) {
  const cats = [...new Set(OBJECOES.map((o) => o.categoria))];
  body.innerHTML = `<div class="row wrap mb"><input id="oq" placeholder="O que o cliente disse? Ex.: está caro, vou pensar…" style="max-width:420px" />${cats.map((c) => `<span class="chip click" data-c="${c}">${c}</span>`).join('')}</div><div id="ol" class="grid g2"></div>`;
  let cat = '';
  const draw = () => {
    const q = $('#oq', body).value.toLowerCase();
    const list = OBJECOES.filter((o) => (!cat || o.categoria === cat) && (!q || (o.objecao + ' ' + o.resposta).toLowerCase().includes(q)));
    $('#ol', body).innerHTML = list.map((o, i) => `<div class="card"><div class="row between"><span class="badge b-gold">${esc(o.categoria)}</span><span class="muted" style="font-size:11.5px">${esc(o.tecnica.replace(/_/g, ' '))}</span></div>
      <h3 class="mt-s">"${esc(o.objecao)}"</h3><p class="mt-s" style="line-height:1.6">${esc(o.resposta)}</p><div class="callout mt-s"><b>Avance com:</b> ${esc(o.follow_up)}</div>
      <button class="btn xs mt-s" data-cp="${OBJECOES.indexOf(o)}">Copiar resposta</button></div>`).join('') || '<div class="empty">Nada encontrado.</div>';
    $$('[data-cp]', body).forEach((b) => b.onclick = () => copy(OBJECOES[+b.dataset.cp].resposta));
  };
  $('#oq', body).oninput = draw;
  $$('[data-c]', body).forEach((c) => c.onclick = () => { cat = cat === c.dataset.c ? '' : c.dataset.c; $$('[data-c]', body).forEach((x) => x.classList.toggle('on', x.dataset.c === cat)); draw(); });
  draw();
}

function scripts(body, ctx) {
  const vars = { corretor: (ctx.db.profile?.nome || '').split(' ')[0], imobiliaria: ctx.db.org?.nome || '' };
  body.innerHTML = `<div class="card mb"><div class="field-row">${[['nome', 'Nome do cliente'], ['corretor', 'Seu nome'], ['imobiliaria', 'Imobiliária'], ['empreendimento', 'Empreendimento'], ['unidade', 'Unidade'], ['validade', 'Validade']].map(([k, l]) => `<div class="field"><label>${l}</label><input data-v="${k}" value="${esc(vars[k] || '')}" /></div>`).join('')}</div><div class="hint">Preencha as variáveis e copie o script pronto.</div></div><div id="sl" class="grid g2"></div>`;
  const draw = () => {
    $$('[data-v]', body).forEach((i) => (vars[i.dataset.v] = i.value));
    $('#sl', body).innerHTML = SCRIPTS.map((s, i) => `<div class="card"><div class="row between"><span class="badge b-gold">${esc(s.categoria)}</span><span class="muted" style="font-size:11.5px">${esc(s.canal)}</span></div><h3 class="mt-s">${esc(s.titulo)}</h3><div class="code mt-s">${esc(preencher(s.corpo, vars))}</div><button class="btn xs mt-s" data-cp="${i}">Copiar</button></div>`).join('');
    $$('[data-cp]', body).forEach((b) => b.onclick = () => copy(preencher(SCRIPTS[+b.dataset.cp].corpo, vars)));
  };
  $$('[data-v]', body).forEach((i) => i.addEventListener('input', draw));
  draw();
}

function roleplay(body, ctx) {
  body.innerHTML = `<div class="grid g3"><div class="card"><h3>Como funciona</h3><div class="list mt-s" style="font-size:13px">
    <div class="list-item">1. Escolha o cliente: <b>preço</b>, <b>medo</b>, <b>cônjuge</b> ou <b>investidor</b>.</div>
    <div class="list-item">2. A Elisa interpreta o cliente. Responda como responderia de verdade.</div>
    <div class="list-item">3. Escreva <b>avaliar</b> para receber nota, pontos fortes e a resposta ideal.</div></div>
    <div class="row wrap mt">${['Quero treinar objeção de preço', 'Simule um cliente com medo de não ser aprovado', 'Cliente que precisa falar com a esposa', 'Investidora com pressa'].map((s) => `<span class="chip click" data-s="${esc(s)}">${esc(s)}</span>`).join('')}</div></div>
    <div class="card span2 pad-0" style="height:560px" id="rp"></div></div>`;
  const chat = mountChat($('#rp', body), ctx, 'elisa');
  $$('[data-s]', body).forEach((c) => c.onclick = () => chat.send(c.dataset.s));
}
