import { $, $$, esc, brl, brlK, num, pct, m2, date, toast, modal, confirmBox, formData, UNIT_STATUS } from '../ui.js';
import { leadsParaUnidade } from '../engine/match.js';
import { enrichUnidades } from '../engine/agents.js';
import { tipologiaResumo } from '../engine/parser.js';
import { simular, PARAMS } from '../engine/credito.js';
import { dealForm } from './leads.js';

export async function render(el, ctx, params) {
  if (params?.[0]) return detalhe(el, ctx, params[0]);
  lista(el, ctx);
}
export function onData() { window.dispatchEvent(new HashChangeEvent('hashchange')); }

const ST = { lancamento: ['Lançamento', 'b-blue'], em_obra: ['Em obras', 'b-amber'], pronto: ['Pronto', 'b-green'], usado: ['Usado', 'b-gray'] };

function lista(el, ctx) {
  const d = ctx.data;
  el.innerHTML = `
  <div class="page-head"><div><h1>Imóveis</h1><p>${d.empreendimentos.length} empreendimentos · ${d.unidades.filter((u) => u.status === 'disponivel').length} unidades disponíveis</p></div>
    <div class="row"><button class="btn" id="btn-new">+ Cadastrar manualmente</button><a class="btn primary" href="#/book">✦ Cadastrar por book</a></div></div>
  <div class="grid g-auto">${d.empreendimentos.map((e) => {
    const us = d.unidades.filter((u) => u.empreendimento_id === e.id);
    const vend = us.filter((u) => u.status === 'vendido').length;
    const disp = us.filter((u) => u.status === 'disponivel').length;
    const tips = d.tipologias.filter((t) => t.empreendimento_id === e.id);
    return `<a class="card" href="#/imoveis/${e.id}" style="color:inherit;display:block">
      <div class="row between"><span class="badge ${(ST[e.status_obra] || ST.lancamento)[1]}">${(ST[e.status_obra] || ST.lancamento)[0]}</span>${e.programa ? `<span class="badge b-gray">${esc(e.programa)}</span>` : ''}</div>
      <h2 class="mt-s">${esc(e.nome)}</h2><div class="muted" style="font-size:12.5px">${esc([e.bairro, e.cidade].filter(Boolean).join(' · ') || '—')}</div>
      <div class="mt-s" style="font-weight:700;font-size:13px">${esc(tipologiaResumo(tips))}</div>
      <div class="row between mt"><div><div class="muted" style="font-size:11px">A PARTIR DE</div><div class="pill-num">${brlK(e.valor_min)}</div></div>
      <div class="right center"><div class="muted" style="font-size:11px">VENDIDO</div><div class="pill-num">${us.length ? pct((vend / us.length) * 100) : '—'}</div></div></div>
      <div class="meter mt-s"><i style="width:${us.length ? (vend / us.length) * 100 : 0}%;background:var(--green)"></i></div>
      <div class="muted mt-s" style="font-size:12px">${disp} disponíveis · ${(e.lazer || []).length} itens de lazer${e.score_produto ? ` · score produto ${Math.round(e.score_produto)}` : ''}</div></a>`;
  }).join('') || '<div class="card empty"><div class="big">⌂</div>Nenhum empreendimento. Comece destrinchando um book.</div>'}</div>`;
  $('#btn-new', el).onclick = () => empForm(ctx);
}

function empForm(ctx, e = {}) {
  const m = modal(`<h2>${e.id ? 'Editar' : 'Novo'} empreendimento</h2><form id="ef" class="mt">
    <div class="field-row"><div class="field"><label>Nome *</label><input name="nome" required value="${esc(e.nome || '')}" /></div><div class="field"><label>Construtora</label><input name="construtora" value="${esc(e.construtora || '')}" /></div></div>
    <div class="field-row"><div class="field"><label>Bairro</label><input name="bairro" value="${esc(e.bairro || '')}" /></div><div class="field"><label>Cidade</label><input name="cidade" value="${esc(e.cidade || ctx.db.org?.cidade || '')}" /></div><div class="field"><label>UF</label><input name="uf" maxlength="2" value="${esc(e.uf || ctx.db.org?.uf || '')}" /></div></div>
    <div class="field"><label>Endereço</label><input name="endereco" value="${esc(e.endereco || '')}" /></div>
    <div class="field-row"><div class="field"><label>Status</label><select name="status_obra">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${e.status_obra === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
    <div class="field"><label>Entrega</label><input type="date" name="previsao_entrega" value="${esc(e.previsao_entrega || '')}" /></div><div class="field"><label>Programa</label><input name="programa" value="${esc(e.programa || '')}" placeholder="MCMV / SBPE" /></div></div>
    <div class="field-row"><div class="field"><label>Torres</label><input name="torres" data-num value="${e.torres ?? ''}" /></div><div class="field"><label>Andares</label><input name="andares" data-num value="${e.andares ?? ''}" /></div>
    <div class="field"><label>Unid./andar</label><input name="unidades_por_andar" data-num value="${e.unidades_por_andar ?? ''}" /></div><div class="field"><label>Valor mínimo</label><input name="valor_min" data-num value="${e.valor_min ?? ''}" /></div>
    <div class="field"><label>Condomínio</label><input name="condominio_estimado" data-num value="${e.condominio_estimado ?? ''}" /></div></div>
    <div class="field"><label>Lazer (vírgula)</label><input name="lazer" data-list value="${esc((e.lazer || []).join(', '))}" /></div>
    <div class="field"><label>Diferenciais (vírgula)</label><input name="diferenciais" data-list value="${esc((e.diferenciais || []).join(', '))}" /></div>
    <div class="field"><label>Descrição</label><textarea name="descricao">${esc(e.descricao || '')}</textarea></div>
    <label class="check"><input type="checkbox" name="aceita_fgts" ${e.aceita_fgts !== false ? 'checked' : ''} /> Aceita FGTS</label>
    <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`, { wide: true });
  m.el.querySelector('#ef').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    if (f.uf) f.uf = f.uf.toUpperCase();
    try {
      const r = e.id ? await ctx.db.update('empreendimentos', e.id, f) : await ctx.db.insert('empreendimentos', { ...f, ativo: true, created_by: ctx.db.user?.id });
      await ctx.refresh(); m.close(); toast('Salvo', 'ok'); ctx.go('imoveis/' + r.id);
    } catch (err) { toast(err.message, 'err'); }
  };
}

function detalhe(el, ctx, id) {
  const d = ctx.data;
  const e = d.empreendimentos.find((x) => x.id === id);
  if (!e) { el.innerHTML = '<div class="empty">Empreendimento não encontrado. <a href="#/imoveis">Voltar</a></div>'; return; }
  const tips = d.tipologias.filter((t) => t.empreendimento_id === id);
  const tipById = Object.fromEntries(tips.map((t) => [t.id, t]));
  const us = d.unidades.filter((u) => u.empreendimento_id === id);
  const cnt = (s) => us.filter((u) => u.status === s).length;
  const vgvDisp = us.filter((u) => u.status === 'disponivel').reduce((s, u) => s + (u.valor || 0), 0);
  const vgvVend = us.filter((u) => u.status === 'vendido').reduce((s, u) => s + (u.valor || 0), 0);
  const intel = e.dados_extraidos?.inteligencia;
  el.innerHTML = `
  <div class="page-head"><div><a href="#/imoveis" class="muted" style="font-size:12.5px">← Imóveis</a><h1 class="mt-s">${esc(e.nome)}</h1>
    <p>${esc([e.construtora, e.bairro, e.cidade && `${e.cidade}${e.uf ? '/' + e.uf : ''}`].filter(Boolean).join(' · '))}${e.previsao_entrega ? ` · entrega ${date(e.previsao_entrega)}` : ''}</p></div>
    <div class="row wrap"><button class="btn" id="b-edit">Editar</button><button class="btn" id="b-tip">+ Tipologia</button><button class="btn" id="b-gen">▦ Gerar unidades</button><a class="btn primary" href="#/marketing/${e.id}">✎ Anúncios</a></div></div>
  <div class="grid g4">
    <div class="card kpi"><div class="label">Disponíveis</div><div class="value" style="color:var(--green)">${cnt('disponivel')}</div><div class="delta muted">${brlK(vgvDisp)}</div></div>
    <div class="card kpi"><div class="label">Reservadas / proposta</div><div class="value" style="color:var(--amber)">${cnt('reservado') + cnt('proposta')}</div></div>
    <div class="card kpi"><div class="label">Vendidas</div><div class="value" style="color:var(--red)">${cnt('vendido')}</div><div class="delta muted">${brlK(vgvVend)}</div></div>
    <div class="card kpi"><div class="label">Velocidade de venda</div><div class="value">${us.length ? pct((cnt('vendido') / us.length) * 100) : '—'}</div><div class="delta muted">do estoque</div></div>
  </div>
  <div class="tabs mt" id="itabs">${[['esp', 'Espelho de vendas'], ['tip', `Tipologias (${tips.length})`], ['ficha', 'Ficha & argumentos']].map(([k, t], i) => `<button data-t="${k}" class="${i ? '' : 'on'}">${t}</button>`).join('')}</div>
  <div id="ib"></div>`;

  const T = {
    esp: () => {
      if (!us.length) return '<div class="card empty"><div class="big">▦</div>Sem unidades. Use "Gerar unidades" para montar o espelho a partir das tipologias.</div>';
      const torres = [...new Set(us.map((u) => u.torre || 'Única'))].sort();
      return `<div class="row wrap mb">${Object.entries(UNIT_STATUS).map(([k, v]) => `<span class="chip"><span class="dot st-${k}" style="width:10px;height:10px"></span>${v} (${cnt(k)})</span>`).join('')}</div>
      <div class="grid ${torres.length > 1 ? 'g2' : ''}">${torres.map((t) => {
        const ut = us.filter((u) => (u.torre || 'Única') === t);
        const andares = [...new Set(ut.map((u) => u.andar ?? 0))].sort((a, b) => b - a);
        const cols = Math.max(...andares.map((a) => ut.filter((u) => (u.andar ?? 0) === a).length));
        return `<div class="card"><h3>${esc(t)}</h3><div class="espelho mt-s" style="--cols:${cols}">${andares.map((a) => `<div class="esp-row"><div class="esp-floor">${a}º</div>${ut.filter((u) => (u.andar ?? 0) === a).sort((x, y) => x.identificacao.localeCompare(y.identificacao)).map((u) => `<div class="esp-u st-${u.status}" data-u="${u.id}" title="${esc(u.identificacao)} · ${brl(u.valor)} · ${esc(tipById[u.tipologia_id]?.nome || '')}">${esc(u.identificacao.split(/[-\s]/).filter(Boolean).slice(-1)[0] || u.identificacao)}<small>${brlK(u.valor).replace('R$ ', '')}</small></div>`).join('')}</div>`).join('')}</div></div>`;
      }).join('')}</div>`;
    },
    tip: () => `<div class="card pad-0"><div class="table-wrap"><table class="t"><thead><tr><th>Planta</th><th>Quartos</th><th>Suítes</th><th>Vagas</th><th>Área</th><th>Valor base</th><th>R$/m²</th><th>Renda mín.</th><th>Unidades</th><th></th></tr></thead><tbody>
      ${tips.map((t) => { const r = t.valor_base ? simular({ valor: t.valor_base, entrada: t.valor_base * 0.2, taxaAnual: PARAMS.sbpe }).rendaMinima : null; return `<tr><td><b>${esc(t.nome)}</b></td><td>${t.quartos ?? '—'}</td><td>${t.suites ?? '—'}</td><td>${t.vagas ?? '—'}</td><td>${m2(t.area_privativa)}</td><td>${brl(t.valor_base)}</td><td>${t.valor_base && t.area_privativa ? brl(t.valor_base / t.area_privativa) : '—'}</td><td>${r ? brl(r) : '—'}</td><td>${us.filter((u) => u.tipologia_id === t.id).length}</td><td><button class="btn xs danger" data-dt="${t.id}">✕</button></td></tr>`; }).join('') || '<tr><td colspan="10"><div class="empty">Nenhuma tipologia</div></td></tr>'}</tbody></table></div></div>`,
    ficha: () => `<div class="grid g2"><div class="card"><h3>Lazer</h3><div class="row wrap mt-s">${(e.lazer || []).map((x) => `<span class="chip on">${esc(x)}</span>`).join('') || '—'}</div>
      <h3 class="mt">Diferenciais</h3><div class="row wrap mt-s">${(e.diferenciais || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('') || '—'}</div>
      <dl class="kv mt"><dt>Torres</dt><dd>${e.torres ?? '—'}</dd><dt>Andares</dt><dd>${e.andares ?? '—'}</dd><dt>Unid./andar</dt><dd>${e.unidades_por_andar ?? '—'}</dd><dt>Condomínio</dt><dd>${brl(e.condominio_estimado)}</dd><dt>Programa</dt><dd>${esc(e.programa || '—')}</dd><dt>FGTS</dt><dd>${e.aceita_fgts ? 'Sim' : 'Não'}</dd>${e.ri_matricula ? `<dt>RI</dt><dd>${esc(e.ri_matricula)}</dd>` : ''}</dl>
      ${e.descricao ? `<p class="muted mt">${esc(e.descricao)}</p>` : ''}</div>
      <div class="card"><h3>Argumentos de venda</h3>${intel?.argumentos?.length ? `<div class="list mt-s">${intel.argumentos.map((a, i) => `<div class="list-item" style="padding:8px 0"><b style="color:var(--gold)">${i + 1}</b>${esc(a)}</div>`).join('')}</div>` : '<div class="muted mt-s">Cadastre por book para gerar argumentos automaticamente.</div>'}
      ${intel?.pitch ? `<h3 class="mt">Pitch</h3><p class="mt-s">${esc(intel.pitch)}</p>` : ''}</div></div>
      <div class="row mt"><button class="btn danger sm" id="b-del">Excluir empreendimento</button></div>`,
  };
  const body = $('#ib', el);
  const show = (k) => {
    $$('#itabs button', el).forEach((b) => b.classList.toggle('on', b.dataset.t === k));
    body.innerHTML = T[k]();
    $$('[data-u]', body).forEach((c) => c.onclick = () => unidadeModal(ctx, us.find((u) => u.id === c.dataset.u), e, tipById));
    $$('[data-dt]', body).forEach((b) => b.onclick = async () => { if (await confirmBox('Excluir tipologia?', { danger: true })) { await ctx.db.remove('tipologias', b.dataset.dt); await ctx.refresh(); detalhe(el, ctx, id); } });
    const del = $('#b-del', body); if (del) del.onclick = async () => { if (await confirmBox(`Excluir ${e.nome} e todas as unidades?`, { danger: true, ok: 'Excluir' })) { await ctx.db.remove('empreendimentos', e.id); await ctx.refresh(); ctx.go('imoveis'); } };
  };
  $('#itabs', el).onclick = (ev) => { const b = ev.target.closest('[data-t]'); if (b) show(b.dataset.t); };
  show('esp');
  $('#b-edit', el).onclick = () => empForm(ctx, e);
  $('#b-tip', el).onclick = () => tipForm(ctx, e, () => detalhe(el, ctx, id));
  $('#b-gen', el).onclick = () => gerarUnidades(ctx, e, tips, () => detalhe(el, ctx, id));
}

function tipForm(ctx, e, after) {
  const m = modal(`<h2>Nova tipologia</h2><form id="tf" class="mt"><div class="field"><label>Nome</label><input name="nome" required placeholder="Tipo A — 2 quartos" /></div>
    <div class="field-row">${[['quartos', 'Quartos'], ['suites', 'Suítes'], ['banheiros', 'Banheiros'], ['vagas', 'Vagas'], ['area_privativa', 'Área privativa'], ['valor_base', 'Valor base']].map(([k, l]) => `<div class="field"><label>${l}</label><input name="${k}" data-num /></div>`).join('')}</div>
    <div class="row wrap"><label class="check"><input type="checkbox" name="varanda" /> Varanda</label><label class="check"><input type="checkbox" name="varanda_gourmet" /> Varanda gourmet</label></div>
    <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`);
  m.el.querySelector('#tf').onsubmit = async (ev) => { ev.preventDefault(); try { await ctx.db.insert('tipologias', { ...formData(ev.target), empreendimento_id: e.id }); await ctx.refresh(); m.close(); after(); } catch (err) { toast(err.message, 'err'); } };
}

function gerarUnidades(ctx, e, tips, after) {
  if (!tips.length) return toast('Cadastre ao menos uma tipologia', 'err');
  const m = modal(`<h2>Gerar espelho de vendas</h2><form id="gf" class="mt"><div class="field-row">
    <div class="field"><label>Torres</label><input name="torres" data-num value="${e.torres || 1}" /></div><div class="field"><label>Andares</label><input name="andares" data-num value="${e.andares || 10}" /></div>
    <div class="field"><label>Unid. por andar</label><input name="upa" data-num value="${e.unidades_por_andar || tips.length}" /></div><div class="field"><label>Valorização/andar %</label><input name="premio" data-num value="0,4" /></div></div>
    <p class="hint">As posições do andar recebem as tipologias em sequência (${tips.map((t) => esc(t.nome)).join(', ')}).</p>
    <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Gerar</button></div></form>`);
  m.el.querySelector('#gf').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const exist = new Set(ctx.data.unidades.filter((u) => u.empreendimento_id === e.id).map((u) => u.identificacao));
    const rows = [];
    for (let t = 1; t <= f.torres; t++) for (let a = 1; a <= f.andares; a++) for (let p = 1; p <= f.upa; p++) {
      const tp = tips[(p - 1) % tips.length];
      const ident = `${f.torres > 1 ? `T${t}-` : ''}${a}${String(p).padStart(2, '0')}`;
      if (exist.has(ident)) continue;
      const v = tp.valor_base || e.valor_min ? Math.round((tp.valor_base || e.valor_min) * (1 + (a - 1) * (f.premio || 0) / 100)) : null;
      rows.push({ empreendimento_id: e.id, tipologia_id: tp.id, identificacao: ident, torre: `Torre ${t}`, andar: a, status: 'disponivel', valor: v, valor_tabela: v });
    }
    if (rows.length > 3000) return toast('Máximo de 3.000 unidades por vez', 'err');
    try { for (let i = 0; i < rows.length; i += 500) await ctx.db.insert('unidades', rows.slice(i, i + 500)); await ctx.refresh(); m.close(); toast(`${rows.length} unidades criadas`, 'ok'); after(); }
    catch (err) { toast(err.message, 'err'); }
  };
}

function unidadeModal(ctx, u, e, tipById) {
  const t = tipById[u.tipologia_id] || {};
  const eu = { ...u, emp: e, tip: t };
  const best = leadsParaUnidade(eu, ctx.data.leads, 6).filter((x) => x.score >= 30);
  const m = modal(`<div class="row between"><div><h2>${esc(u.identificacao)}</h2><div class="muted">${esc(t.nome || '')}${t.area_privativa ? ' · ' + m2(t.area_privativa) : ''}${u.andar ? ` · ${u.andar}º andar` : ''}</div></div><span class="badge st-${u.status}">${UNIT_STATUS[u.status]}</span></div>
    <div class="field-row mt"><div class="field"><label>Status</label><select id="us">${Object.entries(UNIT_STATUS).map(([k, v]) => `<option value="${k}" ${u.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>Valor</label><input id="uv" data-num value="${u.valor ?? ''}" /></div><div class="field"><label>Desconto máx. %</label><input id="ud" data-num value="${u.desconto_max_pct ?? ''}" /></div></div>
    <div class="field"><label>Observações</label><input id="uo" value="${esc(u.observacoes || '')}" /></div>
    <button class="btn sm primary" id="usave">Salvar unidade</button>
    <h3 class="mt">Melhores compradores para esta unidade</h3>
    <div class="list mt-s">${best.map((x) => `<div class="list-item"><div class="grow"><div class="li-title">${esc(x.lead.nome)} <span class="badge b-gold">${x.score}</span></div><div class="li-sub">${esc([...(x.motivos || []).slice(0, 2), ...(x.bloqueios || []).slice(0, 1).map((b) => '⚠ ' + b)].join(' · '))}</div></div><button class="btn xs" data-deal="${x.lead.id}">Negócio</button></div>`).join('') || '<div class="muted">Nenhum cliente aderente na base.</div>'}</div>`);
  m.el.querySelector('#usave').onclick = async () => {
    const num_ = (s) => (s === '' ? null : Number(String(s).replace(/\./g, '').replace(',', '.')));
    try { await ctx.db.update('unidades', u.id, { status: m.el.querySelector('#us').value, valor: num_(m.el.querySelector('#uv').value), desconto_max_pct: num_(m.el.querySelector('#ud').value), observacoes: m.el.querySelector('#uo').value || null }); await ctx.refresh(); m.close(); toast('Unidade atualizada', 'ok'); onData(); }
    catch (err) { toast(err.message, 'err'); }
  };
  $$('[data-deal]', m.el).forEach((b) => b.onclick = () => { m.close(); dealForm(ctx, ctx.data.leads.find((l) => l.id === b.dataset.deal), u); });
}
