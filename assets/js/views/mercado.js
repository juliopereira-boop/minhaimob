import { $, $$, esc, brl, brlK, num, pct, m2, toast, formData, parseNum, confirmBox } from '../ui.js';
import { avaliar, diagnosticoEstoque } from '../engine/pricing.js';
import { enrichUnidades } from '../engine/agents.js';
import { norm } from '../engine/match.js';

let alvo = { bairro: '', cidade: 'São Luís', quartos: 2, vagas: 1, area: 65, status_obra: 'pronto', vista_mar: false, andar_alto: false, lazer_completo: true };

export async function render(el, ctx) {
  const d = ctx.data;
  const bairros = [...new Set([...d.comparaveis.map((c) => c.bairro), ...d.empreendimentos.map((e) => e.bairro)].filter(Boolean))].sort();
  if (!alvo.bairro && bairros[0]) alvo.bairro = bairros[0];
  const porBairro = Object.entries(d.comparaveis.reduce((m, c) => { if (c.area > 0) (m[c.bairro || '—'] ||= []).push(c.valor_m2 || c.valor / c.area); return m; }, {}))
    .map(([b, arr]) => ({ b, m: arr.sort((x, y) => x - y)[Math.floor(arr.length / 2)], n: arr.length })).sort((a, b) => b.m - a.m);
  const maxM = Math.max(1, ...porBairro.map((x) => x.m));
  const diag = diagnosticoEstoque(enrichUnidades(d.unidades, d.empreendimentos, d.tipologias), d.comparaveis);
  el.innerHTML = `
  <div class="page-head"><div><h1>Mercado & precificação</h1><p>Avaliação automática por comparáveis (kNN ponderado) · ${d.comparaveis.length} comparáveis cadastrados</p></div></div>
  <div class="grid g2">
    <div class="card"><h3>Avaliar imóvel</h3><form id="av" class="mt-s"><div class="field-row">
      <div class="field"><label>Bairro</label><input name="bairro" list="bl" value="${esc(alvo.bairro)}" /><datalist id="bl">${bairros.map((b) => `<option>${esc(b)}</option>`).join('')}</datalist></div>
      <div class="field"><label>Cidade</label><input name="cidade" value="${esc(alvo.cidade)}" /></div>
      <div class="field"><label>Quartos</label><input name="quartos" data-num value="${alvo.quartos}" /></div><div class="field"><label>Vagas</label><input name="vagas" data-num value="${alvo.vagas}" /></div>
      <div class="field"><label>Área privativa (m²)</label><input name="area" data-num value="${alvo.area}" /></div>
      <div class="field"><label>Status</label><select name="status_obra">${[['pronto', 'Pronto/usado'], ['em_obra', 'Em obras'], ['lancamento', 'Lançamento']].map(([v, l]) => `<option value="${v}" ${alvo.status_obra === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div class="row wrap"><label class="check"><input type="checkbox" name="vista_mar" ${alvo.vista_mar ? 'checked' : ''} /> Vista mar (+8%)</label><label class="check"><input type="checkbox" name="andar_alto" ${alvo.andar_alto ? 'checked' : ''} /> Andar alto (+3%)</label><label class="check"><input type="checkbox" name="lazer_completo" ${alvo.lazer_completo ? 'checked' : ''} /> Lazer completo (+3%)</label></div>
      <button class="btn primary mt">Avaliar</button></form><div id="avr" class="mt"></div></div>
    <div class="card"><h3>Preço mediano por m² (bairro)</h3><div class="mt-s">${porBairro.map((x) => `<div class="funnel-row" style="grid-template-columns:140px 1fr 110px"><span class="ellipsis" style="font-weight:700">${esc(x.b)}</span><div><div class="funnel-bar" style="width:${(x.m / maxM) * 100}%;background:var(--chart-1)"></div></div><span class="right nowrap" style="font-weight:700">${brl(x.m)}<small class="muted"> · ${x.n}</small></span></div>`).join('') || '<div class="empty">Cadastre comparáveis abaixo.</div>'}</div></div>
  </div>
  <div class="card mt"><div class="card-head"><h3>Estoque vs. mercado</h3><span class="muted" style="font-size:12px">acima de +10% = risco de encalhe · abaixo de −8% = oportunidade para campanha</span></div>
    <div class="table-wrap"><table class="t"><thead><tr><th>Unidade</th><th>Planta</th><th class="num">Tabela</th><th class="num">Sugerido</th><th class="num">Gap</th><th>Leitura</th></tr></thead><tbody>
    ${diag.slice(0, 40).map((x) => `<tr><td><b>${esc(x.unidade.emp?.nome)}</b> · ${esc(x.unidade.identificacao)}</td><td>${esc(x.unidade.tip?.nome || '')} · ${m2(x.unidade.tip?.area_privativa)}</td><td class="num">${brl(x.unidade.valor)}</td><td class="num">${brl(x.avaliacao.valorSugerido)}</td><td class="num ${x.gap > 10 ? 'down' : x.gap < -8 ? 'up' : ''}">${x.gap > 0 ? '+' : ''}${num(x.gap, 1)}%</td><td><span class="badge ${x.sinal === 'acima' ? 'b-red' : x.sinal === 'oportunidade' ? 'b-green' : 'b-gray'}">${{ acima: 'acima do mercado', oportunidade: 'oportunidade', alinhado: 'alinhado' }[x.sinal]}</span></td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">Sem dados suficientes.</div></td></tr>'}</tbody></table></div></div>
  <div class="card mt"><div class="card-head"><h3>Comparáveis</h3><button class="btn sm" id="b-imp">Importar CSV</button></div>
    <form id="cf" class="field-row">${[['titulo', 'Título', ''], ['bairro', 'Bairro', ''], ['cidade', 'Cidade', 'São Luís'], ['quartos', 'Quartos', '', 1], ['vagas', 'Vagas', '', 1], ['area', 'Área', '', 1], ['valor', 'Valor', '', 1], ['dias_anunciado', 'Dias anunciado', '', 1]].map(([k, l, v, isN]) => `<div class="field"><label>${l}</label><input name="${k}" ${isN ? 'data-num' : ''} value="${v}" /></div>`).join('')}<div class="field"><label>&nbsp;</label><button class="btn primary block">+ Adicionar</button></div></form>
    <div class="table-wrap"><table class="t"><thead><tr><th>Título</th><th>Bairro</th><th>Q</th><th>V</th><th class="num">Área</th><th class="num">Valor</th><th class="num">R$/m²</th><th class="num">Dias</th><th></th></tr></thead><tbody>
    ${d.comparaveis.map((c) => `<tr><td>${esc(c.titulo || '—')}</td><td>${esc(c.bairro || '')}</td><td>${c.quartos ?? ''}</td><td>${c.vagas ?? ''}</td><td class="num">${num(c.area)}</td><td class="num">${brl(c.valor)}</td><td class="num">${brl(c.valor_m2 || c.valor / c.area)}</td><td class="num">${c.dias_anunciado ?? '—'}</td><td><button class="btn xs danger" data-del="${c.id}">✕</button></td></tr>`).join('')}</tbody></table></div></div>`;

  const runAv = () => {
    const r = avaliar(alvo, d.comparaveis);
    $('#avr', el).innerHTML = r ? `<div class="row wrap" style="gap:24px"><div><div class="muted" style="font-size:12px">VALOR SUGERIDO</div><div class="pill-num" style="font-size:30px;color:var(--gold-2)">${brl(r.valorSugerido)}</div><div class="muted" style="font-size:12px">faixa ${brlK(r.faixa[0])} – ${brlK(r.faixa[1])}</div></div>
      <div><div class="muted" style="font-size:12px">R$/m²</div><div class="pill-num">${brl(r.m2Ajustado)}</div></div><div><div class="muted" style="font-size:12px">LIQUIDEZ</div><div class="pill-num">~${r.liquidezDias} dias</div></div><div><div class="muted" style="font-size:12px">CONFIANÇA</div><div class="pill-num">${pct(r.confianca)}</div></div></div>
      <div class="callout mt">Para vender em ~metade do tempo, anuncie perto de <b>${brl(r.precoRapido)}</b> (−5%).</div>
      <div class="table-wrap mt"><table class="t"><thead><tr><th>Comparável</th><th>Bairro</th><th class="num">Área</th><th class="num">R$/m²</th><th class="num">Distância</th></tr></thead><tbody>${r.vizinhos.slice(0, 6).map((v) => `<tr><td>${esc(v.titulo || '')}</td><td>${esc(v.bairro)}</td><td class="num">${num(v.area)}</td><td class="num">${brl(v.m2v)}</td><td class="num">${num(v.distancia, 2)}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="muted">Cadastre comparáveis para avaliar.</div>';
  };
  $('#av', el).onsubmit = (e) => { e.preventDefault(); alvo = formData(e.target); runAv(); };
  runAv();
  $('#cf', el).onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!f.area || !f.valor) return toast('Informe área e valor', 'err');
    await ctx.db.insert('comparaveis', { ...f, fonte: 'manual', valor_m2: Math.round(f.valor / f.area) });
    await ctx.refresh(); render(el, ctx);
  };
  $$('[data-del]', el).forEach((b) => b.onclick = async () => { if (await confirmBox('Excluir comparável?')) { await ctx.db.remove('comparaveis', b.dataset.del); await ctx.refresh(); render(el, ctx); } });
  $('#b-imp', el).onclick = () => {
    const txt = prompt('Cole linhas no formato:\ntitulo;bairro;quartos;vagas;area;valor;dias');
    if (!txt) return;
    const rows = txt.split('\n').map((l) => l.split(/[;\t]/)).filter((c) => c.length >= 6).map(([titulo, bairro, q, v, area, valor, dias]) => ({ titulo, bairro, cidade: alvo.cidade, quartos: parseNum(q), vagas: parseNum(v), area: parseNum(area), valor: parseNum(valor), dias_anunciado: parseNum(dias), fonte: 'csv' }))
      .filter((r) => r.area && r.valor).map((r) => ({ ...r, valor_m2: Math.round(r.valor / r.area) }));
    if (!rows.length) return toast('Nenhuma linha válida', 'err');
    ctx.db.insert('comparaveis', rows).then(async () => { await ctx.refresh(); render(el, ctx); toast(`${rows.length} comparáveis importados`, 'ok'); });
  };
}
