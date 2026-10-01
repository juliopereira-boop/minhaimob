// Matching lead × unidade (0-100) — espelha fn_match_unidades.
import { capacidadeLead } from './credito.js';

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function limiteCompra(l) {
  let lim = null;
  const renda = (l.renda_bruta || 0) + (l.renda_composta || 0);
  if (renda > 0) lim = capacidadeLead(l).imovelMaxSemLtv;
  if (l.orcamento_max) lim = lim == null ? l.orcamento_max : Math.min(lim, l.orcamento_max * 1.05);
  return lim;
}

/**
 * @param lead
 * @param unidades  [{...unidade, emp:{...}, tip:{...}}]
 */
export function matchUnidades(lead, unidades, limit = 10) {
  const lim = limiteCompra(lead);
  const bairros = (lead.bairros_interesse || []).map(norm);
  const desejos = (lead.amenidades_desejadas || []).map(norm);
  const out = [];
  for (const u of unidades) {
    if (u.status !== 'disponivel' || u.emp?.ativo === false) continue;
    const t = u.tip || {}, e = u.emp || {};
    const val = u.valor ?? t.valor_base;
    const q = t.quartos || 0, vg = t.vagas || 0, ar = t.area_privativa || 0;
    let sOrc;
    if (lim == null || val == null) sOrc = 17.5;
    else if (val <= lim) sOrc = 35 - Math.max(0, 0.6 - val / lim) * 25;
    else if (val <= lim * 1.15) sOrc = 35 * (1 - (val / lim - 1) / 0.15) * 0.6;
    else sOrc = -Math.min(30, (val / lim - 1.15) * 40);
    const sTip = (lead.quartos_min == null ? 9 : q >= lead.quartos_min ? 15 : q === lead.quartos_min - 1 ? 5 : 0)
      + (lead.vagas_min == null ? 3 : vg >= lead.vagas_min ? 5 : 0)
      + (lead.area_min == null ? 3 : ar >= lead.area_min ? 5 : ar >= lead.area_min * 0.9 ? 2 : 0);
    const sLoc = bairros.length && bairros.includes(norm(e.bairro)) ? 20
      : lead.cidade_interesse && norm(lead.cidade_interesse) === norm(e.cidade) ? 8
      : !bairros.length && !lead.cidade_interesse ? 10 : 0;
    const lz = (e.lazer || []).map(norm);
    const sLaz = !desejos.length ? 5 : (10 * desejos.filter((d) => lz.some((z) => z.includes(d))).length) / desejos.length;
    const entregaProx = e.previsao_entrega && new Date(e.previsao_entrega) <= new Date(Date.now() + 365 * 86400000);
    const sObj = lead.objetivo === 'investimento'
      ? (['lancamento', 'em_obra'].includes(e.status_obra) ? 10 : 5)
      : (e.status_obra === 'pronto' ? 10 : entregaProx ? 8 : 5);
    const score = Math.round(Math.max(0, Math.min(100, sOrc + sTip + sLoc + sLaz + sObj)) * 10) / 10;

    const motivos = [], bloqueios = [];
    if (lim != null && val <= lim) motivos.push(`Cabe no orçamento (${Math.round((val / lim) * 100)}% da capacidade)`);
    if (sLoc === 20) motivos.push(`Bairro de interesse: ${e.bairro}`);
    if (lead.quartos_min != null && q >= lead.quartos_min) motivos.push(`${q} quartos atende o mínimo de ${lead.quartos_min}`);
    if (sLaz >= 7) motivos.push('Lazer alinhado ao desejo do cliente');
    if (sObj >= 8) motivos.push(lead.objetivo === 'investimento' ? 'Fase de obra favorece valorização' : 'Entrega próxima / pronto para morar');
    if (lim != null && val > lim) bloqueios.push(`Acima do orçamento em ${Math.round((val / lim - 1) * 100)}%`);
    if (lead.quartos_min != null && q < lead.quartos_min) bloqueios.push('Menos quartos que o desejado');
    if (bairros.length && sLoc < 20) bloqueios.push('Fora dos bairros de interesse');
    out.push({ unidade: u, score, motivos, bloqueios, valor: val, limite: lim, parts: { orcamento: sOrc, tipologia: sTip, localizacao: sLoc, lazer: sLaz, objetivo: sObj } });
  }
  return out.sort((a, b) => b.score - a.score || (a.valor || 0) - (b.valor || 0)).slice(0, limit);
}

/** Inverso: melhores leads para uma unidade. */
export function leadsParaUnidade(unidade, leads, limit = 8) {
  return leads.filter((l) => !l.arquivado)
    .map((l) => ({ lead: l, ...matchUnidades(l, [unidade], 1)[0] }))
    .filter((x) => x.score != null)
    .sort((a, b) => b.score - a.score).slice(0, limit);
}
