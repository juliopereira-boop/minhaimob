import { $, $$, esc, brl, brlK, num, pct, toast, copy, parseNum } from '../ui.js';
import { capacidade, simular, taxaReferencia, faixaMCMV, prazoPorIdade, PARAMS, checklistDocs } from '../engine/credito.js';
import { enrichUnidades } from '../engine/agents.js';
import { lineChart } from '../chart.js';

let st = { renda: 8000, composta: 0, comp: 0, entrada: 40000, fgts: 20000, subsidio: 0, nasc: '', cotista: false, pctRenda: 30, taxa: '', valor: 350000, entradaSim: 70000, taxaSim: '', prazo: 420 };

export async function render(el, ctx) {
  const leads = ctx.data.leads.filter((l) => l.renda_bruta);
  el.innerHTML = `
  <div class="page-head"><div><h1>Simulador de crédito</h1><p>Capacidade de compra, enquadramento MCMV/SBPE e simulação SAC × PRICE.</p></div>
    <div class="row"><select id="c-lead" style="max-width:280px"><option value="">Preencher com cliente…</option>${leads.map((l) => `<option value="${l.id}">${esc(l.nome)}</option>`).join('')}</select></div></div>
  <div class="grid g2">
    <div class="card"><h3>1 · Quanto o cliente pode comprar?</h3><div class="field-row mt-s">
      ${inp('renda', 'Renda bruta')}${inp('composta', 'Renda composta')}${inp('comp', 'Comprometimento mensal')}
      ${inp('entrada', 'Entrada em dinheiro')}${inp('fgts', 'FGTS')}${inp('subsidio', 'Subsídio')}
      <div class="field"><label>Nascimento (prazo por idade)</label><input type="date" data-k="nasc" value="${esc(st.nasc)}" /></div>
      ${inp('pctRenda', '% máx. da renda')}${inp('taxa', 'Taxa a.a. (vazio = referência)')}</div>
      <label class="check"><input type="checkbox" data-k="cotista" ${st.cotista ? 'checked' : ''} /> Cotista FGTS (3+ anos)</label>
      <div id="cap" class="mt"></div></div>
    <div class="card"><h3>Unidades que cabem no bolso</h3><div id="fit" class="mt-s"></div></div>
  </div>
  <div class="card mt"><div class="card-head"><h3>2 · Simulação de financiamento</h3><button class="btn sm" id="cp-sim">Copiar para WhatsApp</button></div>
    <div class="field-row">${inp('valor', 'Valor do imóvel')}${inp('entradaSim', 'Entrada total (com FGTS)')}${inp('taxaSim', 'Taxa a.a. (vazio = referência)')}${inp('prazo', 'Prazo (meses)')}</div>
    <div class="grid g2 mt" id="sims"></div>
    <div class="grid g2 mt"><div><h3>Parcela por ano</h3><div id="ch1" class="mt-s"></div></div><div><h3>Saldo devedor por ano</h3><div id="ch2" class="mt-s"></div></div></div>
    <details class="mt"><summary class="muted" style="cursor:pointer;font-weight:700">Ver tabela anual</summary><div id="tab" class="table-wrap mt-s"></div></details>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h3>Faixas MCMV (referência)</h3><table class="t mt-s"><thead><tr><th>Faixa</th><th>Renda até</th><th>Taxa ref.</th><th>Teto imóvel</th></tr></thead><tbody>
      ${PARAMS.mcmv.map((f) => `<tr><td>Faixa ${f.faixa}</td><td>${brl(f.ate)}</td><td>${num(f.taxa, 2)}%${f.taxaCotista ? ` (${num(f.taxaCotista, 2)}% cotista)` : ''}</td><td>${brl(f.teto)}</td></tr>`).join('')}
      <tr><td>SBPE</td><td>acima</td><td>${num(PARAMS.sbpe, 2)}%</td><td>—</td></tr></tbody></table>
      <div class="hint mt-s">Valores de referência configuráveis em <code>assets/js/engine/credito.js</code> e na função SQL <code>fn_taxa_referencia</code>. Confira sempre o normativo vigente da Caixa.</div></div>
    <div class="card"><h3>Fluxo do repasse CEF</h3><div class="steps mt-s">${['Simulação e pré-análise (SICAQ)', 'Documentação completa do comprador', 'Avaliação de engenharia do imóvel', 'Conformidade da documentação', 'Emissão de ITBI e agendamento', 'Assinatura do contrato com a Caixa', 'Registro em cartório', 'Liberação do recurso à construtora'].map((s, i) => `<div class="step on" style="color:var(--text)"><span class="s-ico" style="animation:none">${i + 1}</span>${s}</div>`).join('')}</div></div>
  </div>
  <div class="hint mt">Estimativas: SAC com 1ª parcela ≤ ${st.pctRenda}% da renda, seguros MIP/DFI aproximados e taxa de administração de R$ 25. A aprovação final depende da análise do banco.</div>`;

  const upd = () => calc(el, ctx);
  $$('[data-k]', el).forEach((i) => i.addEventListener('input', () => { st[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.type === 'date' ? i.value : i.value; upd(); }));
  $('#c-lead', el).onchange = (e) => {
    const l = ctx.data.leads.find((x) => x.id === e.target.value);
    if (!l) return;
    Object.assign(st, { renda: l.renda_bruta || 0, composta: l.renda_composta || 0, comp: l.comprometimento_mensal || 0, entrada: l.entrada_disponivel || 0, fgts: l.fgts || 0, subsidio: l.subsidio || 0, nasc: l.nascimento || '', cotista: !!l.tres_anos_fgts });
    render(el, ctx);
  };
  $('#cp-sim', el).onclick = () => copy(el._resumo || '');
  upd();
}

const inp = (k, label) => `<div class="field"><label>${label}</label><input data-k="${k}" value="${esc(st[k] ?? '')}" inputmode="decimal" /></div>`;
const n = (k) => parseNum(st[k]) || 0;

function calc(el, ctx) {
  const renda = n('renda') + n('composta');
  const recursos = n('entrada') + n('fgts') + n('subsidio');
  const prazo = prazoPorIdade(st.nasc || null);
  const cap = capacidade({ renda, comprometimento: n('comp'), recursos, taxaAnual: parseNum(st.taxa) || undefined, prazo, pctRenda: (n('pctRenda') || 30) / 100, cotista: st.cotista });
  $('#cap', el).innerHTML = cap ? `
    <div class="row wrap" style="gap:24px"><div><div class="muted" style="font-size:12px">IMÓVEL ATÉ</div><div class="pill-num" style="font-size:30px;color:var(--gold-2)">${brl(cap.imovelMaxSemLtv)}</div></div>
    <div><div class="muted" style="font-size:12px">FINANCIA ATÉ</div><div class="pill-num">${brl(cap.financiamentoMax)}</div></div>
    <div><div class="muted" style="font-size:12px">PARCELA MÁX.</div><div class="pill-num">${brl(cap.parcelaMax)}</div></div></div>
    <dl class="kv mt"><dt>Enquadramento</dt><dd>${cap.faixaMCMV ? `MCMV Faixa ${cap.faixaMCMV} (teto ${brl(cap.tetoMCMV)})` : 'SBPE'}</dd><dt>Taxa</dt><dd>${num(cap.taxaAnual, 2)}% a.a. (${num(cap.taxaMensal, 4)}% a.m.)</dd>
    <dt>Prazo</dt><dd>${cap.prazo} meses${st.nasc ? ' (limitado pela idade)' : ''}</dd><dt>Recursos próprios</dt><dd>${brl(recursos)}</dd></dl>
    ${cap.limitadoPor === 'entrada' ? `<div class="callout red mt">Com 80% de LTV, os recursos próprios limitam a compra a <b>${brl(cap.imovelMax)}</b>. Faltam <b>${brl(cap.entradaNecessaria)}</b> para usar todo o financiamento — entrada parcelada, FGTS ou subsídio resolvem.</div>` : '<div class="callout green mt">A renda é o limitador; a entrada cobre os 20%.</div>'}` : '<div class="muted">Informe a renda.</div>';

  // unidades que cabem
  const unis = enrichUnidades(ctx.data.unidades, ctx.data.empreendimentos, ctx.data.tipologias).filter((u) => u.status === 'disponivel' && u.valor);
  const lim = cap ? cap.imovelMaxSemLtv : 0;
  const fit = unis.filter((u) => u.valor <= lim).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const quase = unis.filter((u) => u.valor > lim && u.valor <= lim * 1.12).sort((a, b) => a.valor - b.valor).slice(0, 3);
  $('#fit', el).innerHTML = `<div class="list">${fit.map((u) => `<div class="list-item click" data-sim="${u.valor}"><div class="grow"><div class="li-title">${esc(u.emp?.nome)} · ${esc(u.identificacao)}</div><div class="li-sub">${esc(u.tip?.nome || '')} · ${esc(u.emp?.bairro || '')}</div></div><b>${brl(u.valor)}</b><span class="badge b-green">${pct((u.valor / lim) * 100)}</span></div>`).join('') || '<div class="muted">Nenhuma unidade disponível dentro da capacidade.</div>'}
    ${quase.length ? `<div class="hint mt">Quase lá (até 12% acima — compor renda ou aumentar entrada):</div>${quase.map((u) => `<div class="list-item click" data-sim="${u.valor}"><div class="grow"><div class="li-title">${esc(u.emp?.nome)} · ${esc(u.identificacao)}</div></div><b>${brl(u.valor)}</b><span class="badge b-amber">+${pct((u.valor / lim - 1) * 100)}</span></div>`).join('')}` : ''}</div>`;
  $$('[data-sim]', el).forEach((x) => x.onclick = () => { st.valor = x.dataset.sim; st.entradaSim = Math.max(recursos, +x.dataset.sim * 0.2); $('[data-k="valor"]', el).value = st.valor; $('[data-k="entradaSim"]', el).value = Math.round(st.entradaSim); calc(el, ctx); $('#sims', el).scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  // simulação
  const valor = n('valor'), entrada = n('entradaSim');
  const taxa = parseNum(st.taxaSim) || (renda ? taxaReferencia(renda, st.cotista) : PARAMS.sbpe);
  const prazoSim = Math.min(n('prazo') || 420, 420);
  const sac = simular({ valor, entrada, taxaAnual: taxa, prazo: prazoSim, sistema: 'SAC' });
  const price = simular({ valor, entrada, taxaAnual: taxa, prazo: prazoSim, sistema: 'PRICE' });
  const ok = (s) => renda && s.rendaMinima <= renda;
  const box = (s, cor) => `<div class="card" style="border-top:3px solid ${cor}"><div class="row between"><h3>${s.sistema}</h3>${renda ? `<span class="badge ${ok(s) ? 'b-green' : 'b-red'}">${ok(s) ? 'cabe na renda' : 'renda insuficiente'}</span>` : ''}</div>
    <dl class="kv mt-s"><dt>Financiado</dt><dd>${brl(s.financiado)} (${pct(s.ltv)})</dd><dt>1ª parcela</dt><dd style="color:var(--gold-2)">${brl(s.primeiraParcela)}</dd><dt>Última parcela</dt><dd>${brl(s.ultimaParcela)}</dd>
    <dt>Total pago</dt><dd>${brl(s.totalPago)}</dd><dt>Juros totais</dt><dd>${brl(s.jurosTotais)}</dd><dt>Renda mínima</dt><dd>${brl(s.rendaMinima)}</dd></dl></div>`;
  $('#sims', el).innerHTML = (sac.ltv > 80.5 ? `<div class="callout red span2">Entrada abaixo de 20%: o financiamento passaria de 80% do valor (${pct(sac.ltv, 1)}). Ajuste a entrada.</div>` : '') + box(sac, 'var(--chart-1)') + box(price, 'var(--chart-2)');
  const cs = getComputedStyle(document.documentElement);
  const c1 = cs.getPropertyValue('--chart-1').trim(), c2 = cs.getPropertyValue('--chart-2').trim();
  const fmtK = (v) => (v >= 1000 ? `R$ ${num(v / 1000, v >= 10000 ? 0 : 1)} mil` : `R$ ${num(v)}`);
  lineChart($('#ch1', el), { title: 'Parcela por ano', series: [{ name: 'SAC', color: c1, values: sac.anual.map((a) => ({ x: a.ano, y: a.parcela })) }, { name: 'PRICE', color: c2, values: price.anual.map((a) => ({ x: a.ano, y: a.parcela })) }], xLabel: (x) => `ano ${x}`, yFmt: fmtK, height: 220 });
  lineChart($('#ch2', el), { title: 'Saldo devedor', series: [{ name: 'SAC', color: c1, values: sac.anual.map((a) => ({ x: a.ano, y: a.saldo })) }, { name: 'PRICE', color: c2, values: price.anual.map((a) => ({ x: a.ano, y: a.saldo })) }], xLabel: (x) => `ano ${x}`, yFmt: (v) => brlK(v), height: 220 });
  $('#tab', el).innerHTML = `<table class="t"><thead><tr><th>Ano</th><th class="num">Parcela SAC</th><th class="num">Saldo SAC</th><th class="num">Parcela PRICE</th><th class="num">Saldo PRICE</th></tr></thead><tbody>${sac.anual.map((a, i) => `<tr><td>${a.ano}</td><td class="num">${brl(a.parcela)}</td><td class="num">${brl(a.saldo)}</td><td class="num">${brl(price.anual[i]?.parcela)}</td><td class="num">${brl(price.anual[i]?.saldo)}</td></tr>`).join('')}</tbody></table>`;
  el._resumo = `🏡 *Simulação de financiamento*\n\nImóvel: ${brl(valor)}\nEntrada: ${brl(entrada)}\nFinanciado: ${brl(sac.financiado)}\nPrazo: ${prazoSim} meses · taxa ${num(taxa, 2)}% a.a.\n\n*SAC* — 1ª parcela ${brl(sac.primeiraParcela)}, caindo até ${brl(sac.ultimaParcela)}\n*PRICE* — parcelas de ~${brl(price.primeiraParcela)}\n\nRenda mínima: ${brl(sac.rendaMinima)}\n\n_Simulação estimada, sujeita à análise de crédito do banco._`;
}
