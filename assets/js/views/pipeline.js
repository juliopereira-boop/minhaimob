import { $, $$, esc, brl, brlK, num, pct, rel, date, toast, modal, drawer, STAGES, stageLabel, healthColor, waLink, formData } from '../ui.js';
import { STAGE_PLAYBOOK, OBJECOES } from '../engine/playbook.js';
import { STAGE_SLA, forecast } from '../engine/scoring.js';

let filtroEmp = '';
let mostrarFechados = false;

export async function render(el, ctx) { draw(el, ctx); }
export function onData() { const el = document.getElementById('view'); if (el && location.hash.startsWith('#/pipeline')) draw(el, window.__mi); }

function draw(el, ctx) {
  const d = ctx.data;
  const leadById = Object.fromEntries(d.leads.map((l) => [l.id, l]));
  const empById = Object.fromEntries(d.empreendimentos.map((e) => [e.id, e]));
  let deals = d.deals;
  if (filtroEmp) deals = deals.filter((x) => x.empreendimento_id === filtroEmp);
  const cols = STAGES.filter((s) => mostrarFechados || !['ganho', 'perdido'].includes(s.id));
  const fc = forecast(deals);
  el.innerHTML = `
  <div class="page-head"><div><h1>Pipeline</h1><p>${fc.abertos} negócios · ${brlK(deals.filter((x) => !['ganho', 'perdido'].includes(x.stage)).reduce((s, x) => s + (x.valor || 0), 0))} em aberto · forecast ${brlK(fc.ponderado)}</p></div>
    <div class="row wrap"><select id="p-emp" style="max-width:240px"><option value="">Todos os empreendimentos</option>${d.empreendimentos.map((e) => `<option value="${e.id}" ${filtroEmp === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" id="p-closed" ${mostrarFechados ? 'checked' : ''} /> Vendidos/perdidos</label></div></div>
  <div class="kanban">${cols.map((s) => {
    const ds = deals.filter((x) => x.stage === s.id).sort((a, b) => (b.probabilidade || 0) * (b.valor || 0) - (a.probabilidade || 0) * (a.valor || 0));
    return `<div class="k-col" data-stage="${s.id}">
      <div class="k-head"><div class="t1"><span class="dot" style="background:${s.cor}"></span>${s.label}<span class="muted right">${ds.length}</span></div>
      <div class="t2">${brlK(ds.reduce((a, x) => a + (x.valor || 0), 0))} · SLA ${STAGE_SLA[s.id] < 999 ? STAGE_SLA[s.id] + 'd' : '—'}</div></div>
      <div class="k-body">${ds.map((x) => {
        const l = leadById[x.lead_id] || {};
        const late = (x.dias_no_stage || 0) > (STAGE_SLA[x.stage] || 99);
        return `<div class="k-card" draggable="true" data-id="${x.id}">
          <span class="health" style="background:${healthColor(x.health ?? 80)}"></span>
          <div class="row between"><div class="name ellipsis">${esc(l.nome || x.titulo)}</div><b style="font-size:12px">${brlK(x.valor)}</b></div>
          <div class="meta ellipsis">${esc(empById[x.empreendimento_id]?.nome || 'Sem empreendimento')}</div>
          <div class="row mt-s" style="gap:6px"><span class="badge b-gold">${pct(x.probabilidade)}</span><span class="badge ${late ? 'b-red' : 'b-gray'}">${x.dias_no_stage ?? 0}d</span><span class="badge b-gray">${rel(l.ultimo_contato)}</span></div>
          ${x.proxima_acao ? `<div class="action">→ ${esc(x.proxima_acao)}</div>` : ''}
        </div>`;
      }).join('')}</div></div>`;
  }).join('')}</div>
  <div class="hint mt">Arraste os cards entre etapas. A probabilidade e a próxima ação são recalculadas automaticamente. Barra lateral = saúde do negócio.</div>`;

  $('#p-emp', el).onchange = (e) => { filtroEmp = e.target.value; draw(el, ctx); };
  $('#p-closed', el).onchange = (e) => { mostrarFechados = e.target.checked; draw(el, ctx); };
  let dragId = null;
  $$('.k-card', el).forEach((c) => {
    c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
    c.addEventListener('click', () => openDeal(ctx, c.dataset.id));
  });
  $$('.k-col', el).forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const deal = ctx.data.deals.find((x) => x.id === dragId);
      if (!deal || deal.stage === col.dataset.stage) return;
      moverStage(ctx, deal, col.dataset.stage, () => draw(el, ctx));
    });
  });
}

async function moverStage(ctx, deal, stage, after) {
  const apply = async (extra = {}) => {
    try {
      await ctx.db.update('deals', deal.id, { stage, ...extra });
      await ctx.db.insert('activities', { lead_id: deal.lead_id, deal_id: deal.id, tipo: 'nota', titulo: `Etapa: ${stageLabel(deal.stage)} → ${stageLabel(stage)}`, resultado: stage === 'perdido' ? 'negativo' : 'positivo', concluido: true, user_id: ctx.db.user?.id });
      await ctx.refresh();
      after && after();
      toast(stage === 'ganho' ? '🎉 Venda registrada! Unidade marcada como vendida.' : `Movido para ${stageLabel(stage)}`, 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  if (stage === 'perdido') {
    const m = modal(`<h2>Motivo da perda</h2><p class="muted mt-s">Registrar o motivo treina o time e melhora as previsões.</p>
      <div class="row wrap mt">${['Preço', 'Crédito reprovado', 'Comprou com concorrente', 'Desistiu de comprar', 'Localização', 'Sem retorno', 'Prazo de entrega', 'Outro'].map((x) => `<span class="chip click" data-m="${x}">${x}</span>`).join('')}</div>
      <div class="field mt"><label>Detalhe</label><input id="mp" /></div><div class="row mt" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" id="ok">Marcar como perdido</button></div>`);
    let motivo = '';
    $$('[data-m]', m.el).forEach((c) => c.onclick = () => { motivo = c.dataset.m; $$('[data-m]', m.el).forEach((x) => x.classList.toggle('on', x === c)); });
    m.el.querySelector('#ok').onclick = () => { m.close(); apply({ motivo_perda: [motivo, m.el.querySelector('#mp').value].filter(Boolean).join(' — ') }); };
    return;
  }
  if (stage === 'ganho') {
    const m = modal(`<h2>Registrar venda</h2><div class="field mt"><label>Valor final de venda</label><input id="vf" data-num value="${deal.valor_proposta || deal.valor || ''}" /></div>
      <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="ok">Confirmar venda</button></div>`);
    m.el.querySelector('#ok').onclick = () => { const v = Number(String(m.el.querySelector('#vf').value).replace(/\./g, '').replace(',', '.')); m.close(); apply(v ? { valor_proposta: v } : {}); };
    return;
  }
  apply();
}

function openDeal(ctx, id) {
  const deal = ctx.data.deals.find((x) => x.id === id);
  if (!deal) return;
  const l = ctx.data.leads.find((x) => x.id === deal.lead_id) || {};
  const emp = ctx.data.empreendimentos.find((e) => e.id === deal.empreendimento_id);
  const uni = ctx.data.unidades.find((u) => u.id === deal.unidade_id);
  const hist = (ctx.data.deal_stage_history || []).filter((x) => x.deal_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const pb = STAGE_PLAYBOOK[deal.stage];
  const ck = JSON.parse(localStorage.getItem('mi_ck_' + id) || '{}');
  const objs = OBJECOES.filter((o) => ({ proposta: ['preco', 'prazo'], visita: ['produto', 'conjuge'], analise_credito: ['credito'], qualificacao: ['credito', 'prazo'] })[deal.stage]?.includes(o.categoria)).slice(0, 3);
  const dr = drawer(`<div class="drawer-head"><div class="grow"><h2>${esc(deal.titulo || l.nome)}</h2><div class="muted mt-s" style="font-size:12.5px">${stageLabel(deal.stage)} · ${brl(deal.valor)} · comissão ${pct(deal.comissao_pct, 1)} = ${brl((deal.valor || 0) * (deal.comissao_pct || 0) / 100)}</div></div><button class="btn ghost icon" data-close>✕</button></div>
  <div class="drawer-body">
    <div class="grid g3"><div class="card kpi"><div class="label">Probabilidade</div><div class="value">${pct(deal.probabilidade)}</div></div>
    <div class="card kpi"><div class="label">Saúde</div><div class="value" style="color:${healthColor(deal.health ?? 80)}">${num(deal.health ?? 0)}</div></div>
    <div class="card kpi"><div class="label">Dias na etapa</div><div class="value">${deal.dias_no_stage ?? 0}<span class="muted" style="font-size:14px"> / ${STAGE_SLA[deal.stage] < 999 ? STAGE_SLA[deal.stage] : '—'}</span></div></div></div>
    ${deal.proxima_acao ? `<div class="callout mt"><b>Próxima melhor ação:</b> ${esc(deal.proxima_acao)}</div>` : ''}
    <div class="row wrap mt"><select id="mv">${STAGES.map((s) => `<option value="${s.id}" ${s.id === deal.stage ? 'selected' : ''}>${s.label}</option>`).join('')}</select>
      ${l.telefone ? `<a class="btn success" target="_blank" rel="noopener" href="${waLink(l.telefone, `Oi, ${(l.nome || '').split(' ')[0]}!`)}">WhatsApp</a>` : ''}<a class="btn" href="#/leads/${l.id}" data-close>Ver cliente</a></div>
    ${pb ? `<div class="card mt"><h3>Playbook: ${stageLabel(deal.stage)}</h3><div class="muted" style="font-size:12px">Meta da etapa: ${esc(pb.meta)}</div>
      <div class="list mt-s">${pb.checklist.map((c, i) => `<label class="check list-item" style="padding:7px 0"><input type="checkbox" data-ck="${i}" ${ck[deal.stage + i] ? 'checked' : ''} /> ${esc(c)}</label>`).join('')}</div></div>` : ''}
    ${objs.length ? `<div class="card mt"><h3>Objeções comuns nesta etapa</h3>${objs.map((o) => `<div class="lesson mt-s"><h4>"${esc(o.objecao)}"</h4><p class="muted">${esc(o.resposta)}</p></div>`).join('')}</div>` : ''}
    <form class="card mt" id="ed"><h3>Dados do negócio</h3><div class="field-row mt-s">
      <div class="field"><label>Valor</label><input name="valor" data-num value="${deal.valor ?? ''}" /></div>
      <div class="field"><label>Valor da proposta</label><input name="valor_proposta" data-num value="${deal.valor_proposta ?? ''}" /></div>
      <div class="field"><label>Comissão %</label><input name="comissao_pct" data-num value="${deal.comissao_pct ?? 5}" /></div>
      <div class="field"><label>Previsão de fechamento</label><input type="date" name="previsao_fechamento" value="${esc(deal.previsao_fechamento || '')}" /></div></div>
      <div class="muted" style="font-size:12.5px">${esc(emp?.nome || 'Sem empreendimento')}${uni ? ' · unidade ' + esc(uni.identificacao) + ' (' + esc(uni.status) + ')' : ''}</div>
      <button class="btn sm primary mt">Salvar</button></form>
    <div class="card mt"><h3>Histórico de etapas</h3><div class="list mt-s">${hist.map((x) => `<div class="list-item" style="padding:7px 0"><span class="dot" style="background:var(--gold)"></span><div class="grow">${x.de_stage ? stageLabel(x.de_stage) + ' → ' : ''}<b>${stageLabel(x.para_stage)}</b></div><span class="muted" style="font-size:12px">${date(x.created_at)}</span></div>`).join('') || '<div class="muted">—</div>'}</div>
    ${deal.motivo_perda ? `<div class="callout red mt">Motivo da perda: ${esc(deal.motivo_perda)}</div>` : ''}</div>
  </div>`);
  $$('[data-ck]', dr.el).forEach((c) => c.onchange = () => { ck[deal.stage + c.dataset.ck] = c.checked; localStorage.setItem('mi_ck_' + id, JSON.stringify(ck)); });
  $('#mv', dr.el).onchange = (e) => { dr.close(); moverStage(ctx, deal, e.target.value, () => onData()); };
  $('#ed', dr.el).onsubmit = async (ev) => { ev.preventDefault(); try { await ctx.db.update('deals', deal.id, formData(ev.target)); await ctx.refresh(); toast('Negócio atualizado', 'ok'); dr.close(); onData(); } catch (e) { toast(e.message, 'err'); } };
}
