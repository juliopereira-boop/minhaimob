import { $, $$, esc, h, brl, brlK, num, pct, rel, dateTime, date, toast, modal, drawer, confirmBox, formData, scoreBar, tempBadge, waLink, stageLabel, STAGES, copy, initials, debounce } from '../ui.js';
import { capacidadeLead, checklistDocs, simular } from '../engine/credito.js';
import { matchUnidades } from '../engine/match.js';
import { SCORE_DIMS } from '../engine/scoring.js';
import { enrichUnidades } from '../engine/agents.js';
import { SCRIPTS, preencher } from '../engine/playbook.js';

let filtro = { q: '', temp: '', origem: '', ordem: 'score' };

export async function render(el, ctx, params) {
  draw(el, ctx);
  if (params?.[0]) openLead(ctx, params[0]);
}
export function onData() { const el = document.getElementById('view'); if (el && location.hash.startsWith('#/leads')) draw(el, window.__mi); }

function draw(el, ctx) {
  const d = ctx.data;
  let leads = d.leads.filter((l) => !l.arquivado);
  if (filtro.q) { const q = filtro.q.toLowerCase(); leads = leads.filter((l) => [l.nome, l.telefone, l.email, (l.bairros_interesse || []).join(' ')].some((x) => String(x || '').toLowerCase().includes(q))); }
  if (filtro.temp) leads = leads.filter((l) => l.temperatura === filtro.temp);
  if (filtro.origem) leads = leads.filter((l) => l.origem === filtro.origem);
  leads.sort((a, b) => filtro.ordem === 'nome' ? a.nome.localeCompare(b.nome) : filtro.ordem === 'recente' ? new Date(b.created_at) - new Date(a.created_at) : filtro.ordem === 'contato' ? new Date(a.ultimo_contato || 0) - new Date(b.ultimo_contato || 0) : (b.score || 0) - (a.score || 0));
  const origens = [...new Set(d.leads.map((l) => l.origem).filter(Boolean))];
  const cont = (t) => d.leads.filter((l) => !l.arquivado && l.temperatura === t).length;
  el.innerHTML = `
  <div class="page-head"><div><h1>Clientes</h1><p>${d.leads.filter((l) => !l.arquivado).length} clientes · score recalculado a cada interação</p></div>
    <div class="row"><button class="btn" id="btn-recalc">↻ Recalcular scores</button><button class="btn primary" id="btn-add">+ Novo cliente</button></div></div>
  <div class="card">
    <div class="row wrap">
      <input id="f-q" placeholder="Buscar por nome, telefone, bairro…" value="${esc(filtro.q)}" style="max-width:300px" />
      <div class="row wrap">${['', 'fervendo', 'quente', 'morno', 'frio'].map((t) => `<span class="chip click ${filtro.temp === t ? 'on' : ''}" data-temp="${t}">${t ? `${({ fervendo: '🔥', quente: '▲', morno: '◐', frio: '❄' })[t]} ${t} (${cont(t)})` : 'Todos'}</span>`).join('')}</div>
      <select id="f-origem" style="max-width:170px"><option value="">Todas as origens</option>${origens.map((o) => `<option ${filtro.origem === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>
      <select id="f-ordem" style="max-width:190px" class="right">${[['score', 'Maior score'], ['contato', 'Mais tempo sem contato'], ['recente', 'Mais recentes'], ['nome', 'Nome']].map(([v, l]) => `<option value="${v}" ${filtro.ordem === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
  </div>
  <div class="card pad-0 mt"><div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Temperatura</th><th>Score</th><th>Compra até*</th><th>Busca</th><th>Origem</th><th>Último contato</th><th></th></tr></thead><tbody>
  ${leads.map((l) => { const c = capacidadeLead(l); return `<tr class="click" data-id="${l.id}">
    <td><div class="row"><div class="avatar">${esc(initials(l.nome))}</div><div><div style="font-weight:700">${esc(l.nome)}</div><div class="muted" style="font-size:12px">${esc(l.telefone || l.email || '—')}</div></div></div></td>
    <td>${tempBadge(l.temperatura)}</td><td style="min-width:130px">${scoreBar(l.score)}</td>
    <td class="nowrap">${c ? brlK(c.imovelMaxSemLtv) : '<span class="badge b-amber">sem renda</span>'}</td>
    <td class="muted" style="font-size:12px">${esc([l.quartos_min && `${l.quartos_min}q+`, (l.bairros_interesse || []).slice(0, 2).join(', ')].filter(Boolean).join(' · ') || '—')}</td>
    <td>${esc(l.origem || '—')}</td><td class="nowrap ${(Date.now() - new Date(l.ultimo_contato || l.created_at)) / 864e5 > 5 ? 'down' : ''}">${rel(l.ultimo_contato)}</td>
    <td>${l.telefone ? `<a class="btn xs" target="_blank" rel="noopener" href="${waLink(l.telefone, '')}" onclick="event.stopPropagation()">WhatsApp</a>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="8"><div class="empty">Nenhum cliente encontrado.</div></td></tr>'}
  </tbody></table></div></div>
  <div class="hint mt">* Valor máximo de imóvel estimado pela renda (1ª parcela SAC ≤ 30%) + entrada + FGTS + subsídio.</div>`;
  $('#f-q', el).oninput = debounce((e) => { filtro.q = e.target.value; draw(el, ctx); $('#f-q', el).focus(); $('#f-q', el).setSelectionRange(filtro.q.length, filtro.q.length); }, 250);
  $$('[data-temp]', el).forEach((c) => c.onclick = () => { filtro.temp = c.dataset.temp; draw(el, ctx); });
  $('#f-origem', el).onchange = (e) => { filtro.origem = e.target.value; draw(el, ctx); };
  $('#f-ordem', el).onchange = (e) => { filtro.ordem = e.target.value; draw(el, ctx); };
  $('#btn-add', el).onclick = () => leadForm(ctx);
  $('#btn-recalc', el).onclick = async () => { await ctx.db.rpc('fn_recalcular_tudo', { p_org: ctx.db.orgId }); await ctx.refresh(); draw(el, ctx); toast('Scores e saúde dos negócios recalculados', 'ok'); };
  $$('tr[data-id]', el).forEach((tr) => tr.onclick = () => { history.replaceState(null, '', '#/leads/' + tr.dataset.id); openLead(ctx, tr.dataset.id); });
}

export function leadForm(ctx, lead = null) {
  const l = lead || { origem: 'instagram', objetivo: 'moradia', prazo_decisao: '90d', cidade_interesse: ctx.db.org?.cidade || 'São Luís' };
  const sel = (name, opts, v) => `<select name="${name}">${opts.map(([val, lab]) => `<option value="${val}" ${v === val ? 'selected' : ''}>${lab}</option>`).join('')}</select>`;
  const m = modal(`<h2>${lead ? 'Editar cliente' : 'Novo cliente'}</h2>
  <form id="lf" class="mt">
    <div class="field-row"><div class="field"><label>Nome *</label><input name="nome" required value="${esc(l.nome || '')}" /></div>
    <div class="field"><label>Telefone</label><input name="telefone" value="${esc(l.telefone || '')}" placeholder="(98) 9…" /></div>
    <div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(l.email || '')}" /></div></div>
    <div class="field-row">
      <div class="field"><label>Origem</label>${sel('origem', [['instagram', 'Instagram'], ['indicacao', 'Indicação'], ['plantao', 'Plantão'], ['portal', 'Portal'], ['trafego', 'Tráfego pago'], ['retorno', 'Cliente antigo'], ['outro', 'Outro']], l.origem)}</div>
      <div class="field"><label>Objetivo</label>${sel('objetivo', [['moradia', 'Moradia'], ['investimento', 'Investimento'], ['permuta', 'Permuta']], l.objetivo)}</div>
      <div class="field"><label>Prazo de decisão</label>${sel('prazo_decisao', [['imediato', 'Imediato'], ['30d', 'Até 30 dias'], ['90d', 'Até 90 dias'], ['6m', 'Até 6 meses'], ['indefinido', 'Indefinido']], l.prazo_decisao)}</div>
    </div>
    <h3 class="mt">Financeiro <span class="muted" style="font-size:12px;font-weight:600">— essencial para o score e o crédito</span></h3>
    <div class="field-row mt-s">
      <div class="field"><label>Renda bruta</label><input name="renda_bruta" data-num value="${l.renda_bruta ?? ''}" /></div>
      <div class="field"><label>Renda composta (2º prop.)</label><input name="renda_composta" data-num value="${l.renda_composta ?? ''}" /></div>
      <div class="field"><label>FGTS</label><input name="fgts" data-num value="${l.fgts ?? ''}" /></div>
      <div class="field"><label>Entrada disponível</label><input name="entrada_disponivel" data-num value="${l.entrada_disponivel ?? ''}" /></div>
      <div class="field"><label>Subsídio MCMV</label><input name="subsidio" data-num value="${l.subsidio ?? ''}" /></div>
      <div class="field"><label>Comprometimento mensal</label><input name="comprometimento_mensal" data-num value="${l.comprometimento_mensal ?? ''}" /></div>
      <div class="field"><label>Score de crédito</label><input name="score_credito" data-num value="${l.score_credito ?? ''}" /></div>
      <div class="field"><label>Nascimento</label><input name="nascimento" type="date" value="${esc(l.nascimento || '')}" /></div>
    </div>
    <div class="row wrap"><label class="check"><input type="checkbox" name="tres_anos_fgts" ${l.tres_anos_fgts ? 'checked' : ''} /> 3+ anos de FGTS (cotista)</label>
    <label class="check"><input type="checkbox" name="servidor_publico" ${l.servidor_publico ? 'checked' : ''} /> Servidor público</label>
    <label class="check"><input type="checkbox" name="possui_imovel" ${l.possui_imovel ? 'checked' : ''} /> Já possui imóvel</label></div>
    <h3 class="mt">O que procura</h3>
    <div class="field-row mt-s">
      <div class="field"><label>Quartos mín.</label><input name="quartos_min" data-num value="${l.quartos_min ?? ''}" /></div>
      <div class="field"><label>Vagas mín.</label><input name="vagas_min" data-num value="${l.vagas_min ?? ''}" /></div>
      <div class="field"><label>Área mín. (m²)</label><input name="area_min" data-num value="${l.area_min ?? ''}" /></div>
      <div class="field"><label>Orçamento máx.</label><input name="orcamento_max" data-num value="${l.orcamento_max ?? ''}" /></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Bairros de interesse (vírgula)</label><input name="bairros_interesse" data-list value="${esc((l.bairros_interesse || []).join(', '))}" /></div>
      <div class="field"><label>Cidade</label><input name="cidade_interesse" value="${esc(l.cidade_interesse || '')}" /></div>
    </div>
    <div class="field"><label>Lazer desejado (vírgula)</label><input name="amenidades_desejadas" data-list value="${esc((l.amenidades_desejadas || []).join(', '))}" placeholder="piscina, academia, pet place" /></div>
    <div class="field-row"><div class="field"><label>Estado civil</label><input name="estado_civil" value="${esc(l.estado_civil || '')}" /></div>
    <div class="field"><label>Profissão</label><input name="profissao" value="${esc(l.profissao || '')}" /></div>
    <div class="field"><label>Dependentes</label><input name="dependentes" data-num value="${l.dependentes ?? ''}" /></div></div>
    <div class="field"><label>Observações</label><textarea name="observacoes">${esc(l.observacoes || '')}</textarea></div>
    <label class="check"><input type="checkbox" name="consentimento_lgpd" ${l.consentimento_lgpd ? 'checked' : ''} /> Cliente autorizou contato e tratamento de dados (LGPD)</label>
    <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Salvar</button></div>
  </form>`, { wide: true });
  m.el.querySelector('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    const data = formData(ev.target);
    try {
      let saved;
      if (lead) saved = await ctx.db.update('leads', lead.id, data);
      else saved = await ctx.db.insert('leads', { ...data, responsavel_id: ctx.db.user?.id, ultimo_contato: new Date().toISOString() });
      await ctx.refresh();
      m.close();
      toast(lead ? 'Cliente atualizado' : 'Cliente cadastrado', 'ok');
      location.hash = '#/leads/' + saved.id;
      openLead(ctx, saved.id);
    } catch (e) { toast(e.message, 'err'); }
  };
}

export function openLead(ctx, id) {
  const l = ctx.data.leads.find((x) => x.id === id);
  if (!l) return;
  document.querySelectorAll('.drawer, .overlay').forEach((x) => x.remove());
  const enriched = enrichUnidades(ctx.data.unidades, ctx.data.empreendimentos, ctx.data.tipologias);
  const matches = matchUnidades(l, enriched, 8);
  const cap = capacidadeLead(l);
  const deals = ctx.data.deals.filter((d) => d.lead_id === id);
  const acts = ctx.data.activities.filter((a) => a.lead_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const det = l.score_detalhe || {};
  const primeiro = (l.nome || '').split(' ')[0];
  const dr = drawer(`
    <div class="drawer-head"><div class="avatar" style="width:44px;height:44px">${esc(initials(l.nome))}</div>
      <div class="grow"><h2>${esc(l.nome)}</h2><div class="row mt-s">${tempBadge(l.temperatura)}<span class="muted" style="font-size:12px">score ${Math.round(l.score || 0)} · ${esc(l.origem || '')} · contato ${rel(l.ultimo_contato)}</span></div></div>
      <button class="btn ghost icon" data-close>✕</button></div>
    <div class="drawer-body">
      <div class="row wrap">
        ${l.telefone ? `<a class="btn sm success" target="_blank" rel="noopener" href="${waLink(l.telefone, `Oi, ${primeiro}! Tudo bem?`)}">WhatsApp</a><a class="btn sm" href="tel:${esc(l.telefone)}">Ligar</a>` : ''}
        <button class="btn sm" id="b-act">+ Atividade</button><button class="btn sm" id="b-deal">+ Negócio</button><button class="btn sm" id="b-edit">Editar</button>
        <button class="btn sm ghost right" id="b-arch">Arquivar</button>
      </div>
      <div class="tabs mt" id="ltabs">${[['res', 'Resumo'], ['imo', `Imóveis ideais (${matches.length})`], ['cred', 'Crédito'], ['ati', `Atividades (${acts.length})`]].map(([k, t], i) => `<button data-t="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
      <div id="lt-body"></div>
    </div>`);

  const T = {
    res: () => `
      <div class="grid g2">
        <div class="card"><h3>Por que esse score?</h3><div class="col mt-s">${SCORE_DIMS.map((s) => `<div><div class="row between" style="font-size:12.5px"><span style="font-weight:700">${s.label}</span><span class="muted">${num(det[s.k] || 0, 1)} / ${s.max}</span></div>
          <div class="meter mt-s"><i style="width:${Math.min(100, ((det[s.k] || 0) / s.max) * 100)}%"></i></div><div class="hint">${s.dica}</div></div>`).join('')}</div></div>
        <div class="col">
          <div class="card"><h3>Dados</h3><dl class="kv mt-s">
            <dt>Telefone</dt><dd>${esc(l.telefone || '—')}</dd><dt>E-mail</dt><dd class="ellipsis">${esc(l.email || '—')}</dd>
            <dt>Renda familiar</dt><dd>${brl((l.renda_bruta || 0) + (l.renda_composta || 0) || null)}</dd><dt>FGTS</dt><dd>${brl(l.fgts)}</dd><dt>Entrada</dt><dd>${brl(l.entrada_disponivel)}</dd>
            <dt>Objetivo</dt><dd>${esc(l.objetivo || '—')}</dd><dt>Prazo</dt><dd>${esc(l.prazo_decisao || '—')}</dd><dt>Profissão</dt><dd>${esc(l.profissao || '—')}</dd></dl></div>
          <div class="card"><h3>Procura</h3><div class="row wrap mt-s">${[l.quartos_min && `${l.quartos_min}+ quartos`, l.vagas_min && `${l.vagas_min}+ vagas`, l.area_min && `${l.area_min}+ m²`, l.orcamento_max && `até ${brlK(l.orcamento_max)}`, ...(l.bairros_interesse || []), ...(l.amenidades_desejadas || [])].filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '<span class="muted">Preferências não informadas</span>'}</div></div>
        </div>
      </div>
      ${deals.length ? `<div class="card mt"><h3>Negócios</h3><div class="list mt-s">${deals.map((d) => `<div class="list-item"><div class="grow"><div class="li-title">${esc(d.titulo || '')}</div><div class="li-sub">${stageLabel(d.stage)} · ${brl(d.valor)} · prob. ${pct(d.probabilidade)}</div></div><span class="muted" style="font-size:12px">${esc(d.proxima_acao || '')}</span></div>`).join('')}</div></div>` : ''}
      ${l.observacoes ? `<div class="card mt"><h3>Observações</h3><p class="mt-s muted">${esc(l.observacoes)}</p></div>` : ''}`,
    imo: () => matches.length ? `<div class="col">${matches.map((m) => `<div class="card">
      <div class="row between"><div><div class="li-title">${esc(m.unidade.emp?.nome)} · ${esc(m.unidade.identificacao)}</div><div class="li-sub">${esc(m.unidade.tip?.nome || '')} · ${m.unidade.tip?.area_privativa ? num(m.unidade.tip.area_privativa, 1) + ' m²' : ''} · ${esc(m.unidade.emp?.bairro || '')}</div></div>
      <div class="center"><div class="pill-num" style="color:${m.score >= 70 ? 'var(--green)' : m.score >= 50 ? 'var(--amber)' : 'var(--muted)'}">${m.score}</div><small class="muted">aderência</small></div></div>
      <div class="row wrap mt-s">${m.motivos.map((x) => `<span class="badge b-green">✓ ${esc(x)}</span>`).join('')}${m.bloqueios.map((x) => `<span class="badge b-red">⚠ ${esc(x)}</span>`).join('')}</div>
      <div class="row mt-s"><b>${brl(m.valor)}</b><span class="right"></span><button class="btn xs" data-wa="${m.unidade.id}">Enviar no WhatsApp</button><button class="btn xs primary" data-neg="${m.unidade.id}">Abrir negócio</button></div></div>`).join('')}</div>`
      : '<div class="empty">Sem unidades disponíveis. Cadastre empreendimentos ou destrinche um book.</div>',
    cred: () => cap ? `<div class="grid g2"><div class="card"><h3>Capacidade de compra</h3><div class="pill-num mt-s">${brl(cap.imovelMaxSemLtv)}</div><div class="muted">valor máximo de imóvel (estimativa)</div>
      <dl class="kv mt"><dt>Parcela máxima (30%)</dt><dd>${brl(cap.parcelaMax)}</dd><dt>Financiamento máx.</dt><dd>${brl(cap.financiamentoMax)}</dd><dt>Recursos próprios</dt><dd>${brl((l.entrada_disponivel || 0) + (l.fgts || 0) + (l.subsidio || 0))}</dd>
      <dt>Enquadramento</dt><dd>${cap.faixaMCMV ? `MCMV Faixa ${cap.faixaMCMV}` : 'SBPE'}</dd><dt>Taxa de referência</dt><dd>${num(cap.taxaAnual, 2)}% a.a.</dd><dt>Prazo</dt><dd>${cap.prazo} meses</dd></dl>
      ${cap.limitadoPor === 'entrada' ? `<div class="callout red mt">Limitado pela entrada: para usar todo o financiamento, faltam <b>${brl(cap.entradaNecessaria)}</b>. Alternativas: FGTS, subsídio, entrada parcelada, composição de renda.</div>` : '<div class="callout green mt">Renda é o limitador — entrada suficiente.</div>'}
      ${matches[0] ? (() => { const s = simular({ valor: matches[0].valor, entrada: Math.max(matches[0].valor * 0.2, (l.entrada_disponivel || 0) + (l.fgts || 0)), taxaAnual: cap.taxaAnual }); return `<h3 class="mt">Simulação na melhor unidade</h3><dl class="kv mt-s"><dt>${esc(matches[0].unidade.emp?.nome)}</dt><dd>${brl(matches[0].valor)}</dd><dt>1ª parcela</dt><dd>${brl(s.primeiraParcela)}</dd><dt>Renda mínima</dt><dd class="${s.rendaMinima > (l.renda_bruta || 0) + (l.renda_composta || 0) ? 'down' : 'up'}">${brl(s.rendaMinima)}</dd></dl>`; })() : ''}</div>
      <div class="card"><div class="card-head"><h3>Documentação CEF</h3><button class="btn xs" id="cp-docs">Pedir ao cliente</button></div><div class="list">${checklistDocs(l).map((x) => `<label class="check list-item" style="padding:7px 0"><input type="checkbox" /> ${esc(x)}</label>`).join('')}</div></div></div>`
      : '<div class="callout">Informe a renda do cliente (Editar) para calcular a capacidade de compra.</div>',
    ati: () => `<form id="af" class="card"><div class="field-row">
        <div class="field"><label>Tipo</label><select name="tipo">${[['ligacao', 'Ligação'], ['whatsapp', 'WhatsApp'], ['visita', 'Visita'], ['reuniao', 'Reunião'], ['proposta', 'Proposta'], ['email', 'E-mail'], ['documento', 'Documento'], ['nota', 'Nota']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
        <div class="field"><label>Resultado</label><select name="resultado"><option value="positivo">Positivo</option><option value="neutro">Neutro</option><option value="negativo">Negativo</option><option value="sem_resposta">Sem resposta</option></select></div></div>
        <div class="field"><label>O que aconteceu</label><input name="titulo" placeholder="Ex.: Enviou simulação, gostou da Torre 2" /></div>
        <div class="field"><label>Agendar próximo contato</label><input type="datetime-local" name="proximo" /></div>
        <button class="btn primary sm">Registrar (recalcula o score)</button></form>
      <div class="list mt">${acts.map((a) => `<div class="list-item"><span class="badge ${a.resultado === 'positivo' ? 'b-green' : a.resultado === 'negativo' ? 'b-red' : 'b-gray'}">${esc(a.tipo)}</span><div class="grow"><div class="li-title">${esc(a.titulo || a.conteudo || '—')}</div><div class="li-sub">${dateTime(a.created_at)}${a.agendado_para ? ' · agendado ' + dateTime(a.agendado_para) : ''}</div></div></div>`).join('') || '<div class="empty">Sem atividades</div>'}</div>`,
  };
  const body = $('#lt-body', dr.el);
  const show = (k) => {
    $$('#ltabs button', dr.el).forEach((b) => b.classList.toggle('on', b.dataset.t === k));
    body.innerHTML = T[k]();
    $$('[data-neg]', body).forEach((b) => b.onclick = () => dealForm(ctx, l, enriched.find((u) => u.id === b.dataset.neg)));
    $$('[data-wa]', body).forEach((b) => b.onclick = () => {
      const m = matches.find((x) => x.unidade.id === b.dataset.wa);
      const txt = `Oi, ${primeiro}! Separei uma opção que tem tudo a ver com você:\n\n🏢 *${m.unidade.emp?.nome}* — ${m.unidade.emp?.bairro || ''}\n🛏 ${m.unidade.tip?.nome || ''}${m.unidade.tip?.area_privativa ? ` · ${num(m.unidade.tip.area_privativa, 1)} m²` : ''}\n💰 ${brl(m.valor)}\n${m.motivos.slice(0, 2).map((x) => '✅ ' + x).join('\n')}\n\nPosso te mandar a simulação da parcela?`;
      if (l.telefone) window.open(waLink(l.telefone, txt), '_blank'); else copy(txt);
    });
    const cd = $('#cp-docs', body); if (cd) cd.onclick = () => copy(preencher(SCRIPTS.find((s) => s.categoria === 'credito').corpo, { nome: primeiro }));
    const af = $('#af', body); if (af) af.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = formData(af);
      try {
        await ctx.db.insert('activities', { lead_id: l.id, deal_id: deals.find((d) => !['ganho', 'perdido'].includes(d.stage))?.id || null, tipo: f.tipo, resultado: f.resultado, titulo: f.titulo, concluido: true, user_id: ctx.db.user?.id });
        if (f.proximo) await ctx.db.update('leads', l.id, { proximo_contato: new Date(f.proximo).toISOString() });
        await ctx.refresh();
        toast('Atividade registrada · score atualizado', 'ok');
        openLead(ctx, l.id);
        setTimeout(() => document.querySelector('#ltabs [data-t="ati"]')?.click(), 0);
      } catch (e) { toast(e.message, 'err'); }
    };
  };
  $('#ltabs', dr.el).onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
  show('res');
  $('#b-edit', dr.el).onclick = () => { dr.close(); leadForm(ctx, l); };
  $('#b-deal', dr.el).onclick = () => dealForm(ctx, l, matches[0]?.unidade);
  $('#b-act', dr.el).onclick = () => show('ati');
  $('#b-arch', dr.el).onclick = async () => { if (await confirmBox(`Arquivar ${l.nome}?`)) { await ctx.db.update('leads', l.id, { arquivado: true }); await ctx.refresh(); dr.close(); toast('Cliente arquivado', 'ok'); } };
}

export function dealForm(ctx, lead, unidade) {
  const emps = ctx.data.empreendimentos;
  const disp = ctx.data.unidades.filter((u) => u.status === 'disponivel' || u.id === unidade?.id);
  const m = modal(`<h2>Novo negócio</h2><p class="muted mt-s">${esc(lead.nome)}</p>
    <form id="df" class="mt">
      <div class="field"><label>Empreendimento</label><select name="empreendimento_id" id="d-emp"><option value="">—</option>${emps.map((e) => `<option value="${e.id}" ${unidade?.empreendimento_id === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
      <div class="field"><label>Unidade</label><select name="unidade_id" id="d-uni"></select></div>
      <div class="field-row"><div class="field"><label>Valor</label><input name="valor" data-num id="d-val" value="${unidade?.valor ?? lead.orcamento_max ?? ''}" /></div>
      <div class="field"><label>Etapa</label><select name="stage">${STAGES.filter((s) => !['ganho', 'perdido'].includes(s.id)).map((s) => `<option value="${s.id}">${s.label}</option>`).join('')}</select></div>
      <div class="field"><label>Comissão (%)</label><input name="comissao_pct" data-num value="5" /></div></div>
      <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar negócio</button></div>
    </form>`);
  const fill = () => {
    const eid = m.el.querySelector('#d-emp').value;
    m.el.querySelector('#d-uni').innerHTML = '<option value="">— sem unidade —</option>' + disp.filter((u) => u.empreendimento_id === eid).map((u) => `<option value="${u.id}" data-v="${u.valor || ''}" ${unidade?.id === u.id ? 'selected' : ''}>${esc(u.identificacao)} · ${brl(u.valor)}</option>`).join('');
  };
  fill();
  m.el.querySelector('#d-emp').onchange = fill;
  m.el.querySelector('#d-uni').onchange = (e) => { const v = e.target.selectedOptions[0]?.dataset.v; if (v) m.el.querySelector('#d-val').value = v; };
  m.el.querySelector('#df').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const emp = emps.find((e) => e.id === f.empreendimento_id);
    try {
      await ctx.db.insert('deals', { ...f, lead_id: lead.id, titulo: `${lead.nome}${emp ? ' — ' + emp.nome : ''}`, responsavel_id: ctx.db.user?.id });
      await ctx.refresh();
      m.close();
      toast('Negócio criado no pipeline', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
}
