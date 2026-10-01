import { esc, brl, brlK, num, pct, rel, scoreBar, tempBadge, STAGES, stageLabel, sparkline, waLink, daysSince, healthColor } from '../ui.js';
import { radarDoDia, forecast, STAGE_SLA } from '../engine/scoring.js';
import { diagnosticoEstoque } from '../engine/pricing.js';
import { enrichUnidades } from '../engine/agents.js';
import { usarDadosReais } from './ajustes.js';

export async function render(el, ctx) {
  const d = ctx.data;
  const abertos = d.deals.filter((x) => !['ganho', 'perdido'].includes(x.stage));
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0);
  const ganhosMes = d.deals.filter((x) => x.stage === 'ganho' && new Date(x.fechado_em || x.updated_at) >= inicioMes);
  const vgvMes = ganhosMes.reduce((s, x) => s + (x.valor_proposta || x.valor || 0), 0);
  const meta = ctx.db.profile?.meta_mensal || 2000000;
  const fc = forecast(d.deals);
  const quentes = d.leads.filter((l) => ['quente', 'fervendo'].includes(l.temperatura));
  const disp = d.unidades.filter((u) => u.status === 'disponivel');
  const radar = radarDoDia({ leads: d.leads, deals: d.deals }).slice(0, 6);
  const leadById = Object.fromEntries(d.leads.map((l) => [l.id, l]));

  // atividade nos últimos 14 dias
  const serie = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(); dia.setHours(0, 0, 0, 0); dia.setDate(dia.getDate() - (13 - i));
    const fim = new Date(dia); fim.setDate(fim.getDate() + 1);
    return d.activities.filter((a) => { const t = new Date(a.created_at); return t >= dia && t < fim; }).length;
  });
  const leadsSerie = Array.from({ length: 14 }, (_, i) => {
    const dia = new Date(); dia.setHours(0, 0, 0, 0); dia.setDate(dia.getDate() - (13 - i));
    return d.leads.filter((l) => new Date(l.created_at) <= dia).length;
  });

  // insights
  const insights = [];
  const sla = abertos.filter((x) => (x.dias_no_stage || 0) > (STAGE_SLA[x.stage] || 7));
  if (sla.length) insights.push({ c: 'red', t: `${sla.length} negócio(s) com SLA de etapa estourado`, a: '#/pipeline', b: 'Ver pipeline' });
  const esquecidos = d.leads.filter((l) => !l.arquivado && (l.score || 0) >= 45 && daysSince(l.ultimo_contato || l.created_at) > 5);
  if (esquecidos.length) insights.push({ c: 'amber', t: `${esquecidos.length} lead(s) bons sem contato há mais de 5 dias — o score está caindo`, a: '#/leads', b: 'Retomar' });
  const semRenda = d.leads.filter((l) => !l.arquivado && !l.renda_bruta);
  if (semRenda.length) insights.push({ c: 'blue', t: `${semRenda.length} lead(s) sem renda informada: sem isso não dá para simular nem casar imóvel`, a: '#/leads', b: 'Qualificar' });
  const semNegocio = d.leads.filter((l) => !l.arquivado && (l.score || 0) >= 50 && !d.deals.some((x) => x.lead_id === l.id));
  if (semNegocio.length) insights.push({ c: 'green', t: `${semNegocio.length} lead(s) qualificados sem oportunidade aberta`, a: '#/leads', b: 'Abrir negócio' });
  const diag = diagnosticoEstoque(enrichUnidades(d.unidades, d.empreendimentos, d.tipologias), d.comparaveis);
  const caros = diag.filter((x) => x.sinal === 'acima');
  if (caros.length) insights.push({ c: 'amber', t: `${caros.length} unidade(s) mais de 10% acima do preço de mercado`, a: '#/mercado', b: 'Analisar' });

  const nome = (ctx.db.profile?.nome || '').split(' ')[0];
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
  const maxStage = Math.max(1, ...STAGES.filter((s) => !['ganho', 'perdido'].includes(s.id)).map((s) => abertos.filter((x) => x.stage === s.id).length));

  el.innerHTML = `
  <div class="page-head">
    <div><h1>${saud}${nome ? ', ' + esc(nome) : ''}.</h1><p>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })} · ${radar.length} ações prioritárias hoje</p></div>
    <div class="row wrap"><a class="btn" href="office.html">◭ Abrir escritório 3D</a><a class="btn primary" href="#/book">✦ Destrinchar book</a></div>
  </div>

  <div class="grid g4">
    <div class="card kpi glow"><div class="label">Forecast ponderado</div><div class="value">${brlK(fc.ponderado)}</div><div class="delta muted">${fc.abertos} negócios abertos</div>${sparkline(serie)}</div>
    <div class="card kpi"><div class="label">Vendido no mês</div><div class="value">${brlK(vgvMes)}</div><div class="delta ${vgvMes >= meta ? 'up' : 'muted'}">${pct((vgvMes / meta) * 100)} da meta de ${brlK(meta)}</div></div>
    <div class="card kpi"><div class="label">Leads quentes</div><div class="value">${quentes.length}<span class="muted" style="font-size:15px"> / ${d.leads.length}</span></div><div class="delta muted">score ≥ 60</div>${sparkline(leadsSerie, { color: 'var(--blue)' })}</div>
    <div class="card kpi"><div class="label">Estoque disponível</div><div class="value">${disp.length}</div><div class="delta muted">${brlK(disp.reduce((s, u) => s + (u.valor || 0), 0))} em VGV</div></div>
  </div>

  ${ctx.db.temDemo(d) && (ctx.db.mode === 'local' || ['owner', 'admin', 'gestor'].includes(ctx.db.role)) ? `<div class="callout blue mt row between wrap"><span>◆ Você está vendo <b>dados de demonstração</b>. Quando quiser começar de verdade, remova tudo que é fictício com um clique.</span><button class="btn sm primary" id="b-real">✓ Usar dados reais</button></div>` : ''}
  ${insights.length ? `<div class="grid mt" style="gap:8px">${insights.map((i) => `<div class="callout ${i.c} row between"><span>${esc(i.t)}</span><a class="btn xs" href="${i.a}">${i.b} →</a></div>`).join('')}</div>` : ''}

  <div class="grid g3 mt">
    <div class="card span2">
      <div class="card-head"><h3>◎ Radar do dia <span class="muted" style="font-weight:600;font-size:12px">priorizado por VGV × probabilidade × urgência</span></h3><a class="btn sm ghost" href="office.html">Delegar à Ana →</a></div>
      ${radar.length ? `<div class="list">${radar.map((r, i) => {
        const l = r.lead || {};
        return `<div class="list-item">
          <div class="avatar" style="background:${r.risco ? 'var(--red-soft)' : 'var(--gold-soft)'};color:${r.risco ? 'var(--red)' : 'var(--gold-2)'}">${i + 1}</div>
          <div class="grow"><div class="li-title">${esc(l.nome || '—')} ${r.deal ? `<span class="badge b-gray">${stageLabel(r.deal.stage)}</span>` : ''} ${r.risco ? '<span class="badge b-red">em risco</span>' : ''}</div>
          <div class="li-sub">${esc(r.acao || '')}</div></div>
          <div class="nowrap muted hide-m" style="font-size:12px">${r.deal ? brlK(r.deal.valor) : ''}</div>
          ${l.telefone ? `<a class="btn xs" target="_blank" rel="noopener" href="${waLink(l.telefone, `Oi, ${(l.nome || '').split(' ')[0]}! Tudo bem?`)}">WhatsApp</a>` : ''}
          <a class="btn xs" href="#/leads/${l.id}">Abrir</a></div>`;
      }).join('')}</div>` : '<div class="empty"><div class="big">☕</div>Nada urgente. Bora prospectar.</div>'}
    </div>
    <div class="card">
      <div class="card-head"><h3>Meta do mês</h3></div>
      <div class="row" style="justify-content:center;padding:6px 0 12px"><div class="ring" style="--p:${Math.min(100, (vgvMes / meta) * 100)}"><div><b>${pct((vgvMes / meta) * 100)}</b><small>${brlK(vgvMes)}</small></div></div></div>
      <dl class="kv">
        <dt>Pessimista</dt><dd>${brlK(fc.pessimista)}</dd>
        <dt>Ponderado</dt><dd style="color:var(--gold-2)">${brlK(fc.ponderado)}</dd>
        <dt>Otimista</dt><dd>${brlK(fc.otimista)}</dd>
        <dt>Falta para a meta</dt><dd>${brlK(Math.max(0, meta - vgvMes))}</dd>
      </dl>
      <div class="hint mt">Pessimista: negócios com prob. ≥ 75%. Otimista: prob. ≥ 30%.</div>
    </div>
  </div>

  <div class="grid g2 mt">
    <div class="card">
      <div class="card-head"><h3>Funil de vendas</h3><a class="btn sm ghost" href="#/pipeline">Pipeline →</a></div>
      ${STAGES.filter((s) => !['ganho', 'perdido'].includes(s.id)).map((s) => {
        const ds = abertos.filter((x) => x.stage === s.id);
        return `<div class="funnel-row"><span class="muted" style="font-weight:700">${s.label}</span>
          <div><div class="funnel-bar" style="width:${Math.max(6, (ds.length / maxStage) * 100)}%;background:${s.cor}">${ds.length}</div></div>
          <span class="right nowrap" style="font-weight:700">${brlK(ds.reduce((a, x) => a + (x.valor || 0), 0))}</span></div>`;
      }).join('')}
    </div>
    <div class="card">
      <div class="card-head"><h3>Clientes mais quentes</h3><a class="btn sm ghost" href="#/leads">Todos →</a></div>
      <div class="list">${[...d.leads].filter((l) => !l.arquivado).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 6).map((l) => `
        <div class="list-item click" onclick="location.hash='#/leads/${l.id}'">
          <div class="avatar">${esc((l.nome || '?')[0])}</div>
          <div class="grow"><div class="li-title">${esc(l.nome)}</div><div class="li-sub">${esc(l.origem || '—')} · contato ${rel(l.ultimo_contato)}</div></div>
          ${tempBadge(l.temperatura)}<div style="width:120px">${scoreBar(l.score)}</div>
        </div>`).join('') || '<div class="empty">Sem clientes ainda</div>'}</div>
    </div>
  </div>`;
  const br = el.querySelector('#b-real'); if (br) br.onclick = async () => { if (await usarDadosReais(ctx)) render(el, ctx); };
}

export function onData() { if (location.hash.startsWith('#/dashboard') || location.hash === '' || location.hash === '#/') window.dispatchEvent(new HashChangeEvent('hashchange')); }
