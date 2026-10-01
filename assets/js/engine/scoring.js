// Lead scoring, deal health e próxima melhor ação — espelha as funções SQL.
import { capacidadeLead } from './credito.js';
import { daysSince } from '../ui.js';

export const STAGE_PROB = { novo: 5, qualificacao: 12, visita: 25, proposta: 45, analise_credito: 60, contrato: 78, repasse: 88, assinatura: 95, ganho: 100, perdido: 0 };
export const STAGE_SLA = { novo: 1, qualificacao: 3, visita: 5, proposta: 4, analise_credito: 10, contrato: 7, repasse: 25, assinatura: 5, ganho: 999, perdido: 999 };

function percentil(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = (s.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Score 0-100: Fit 30 · Engajamento 25 · Recência 15 · Urgência 15 · Dados 10 · Origem 5 */
export function leadScore(l, { atividades = [], unidades = [] } = {}) {
  let fit = 0, cap = null;
  const renda = (l.renda_bruta || 0) + (l.renda_composta || 0);
  if (renda > 0) {
    cap = capacidadeLead(l);
    const capImovel = cap.imovelMaxSemLtv * (cap.limitadoPor === 'entrada' ? 0.8 : 1);
    const oferta = percentil(unidades.filter((u) => u.status === 'disponivel' && u.valor > 0).map((u) => u.valor), 0.25);
    fit = oferta ? Math.min(30, (30 * capImovel) / oferta) : 18;
    if (l.score_credito != null) fit *= l.score_credito >= 700 ? 1 : l.score_credito >= 500 ? 0.85 : 0.55;
  } else if (l.orcamento_max) fit = 10;

  const recentes = atividades.filter((a) => a.lead_id === l.id && daysSince(a.created_at) <= 21);
  const eng = Math.min(25, recentes.length * 3 + recentes.filter((a) => a.resultado === 'positivo').length * 4);
  const dias = daysSince(l.ultimo_contato || l.created_at);
  const rec = 15 * Math.exp(-dias / 7.2);
  const urg = { imediato: 15, '30d': 12, '90d': 8, '6m': 4 }[l.prazo_decisao] ?? 2;
  const dados = (l.telefone ? 2 : 0) + (l.renda_bruta != null ? 3 : 0) + ((l.fgts || 0) > 0 ? 1 : 0) + (l.cpf ? 2 : 0) + (l.quartos_min != null || l.bairros_interesse?.length ? 2 : 0);
  const orig = { indicacao: 5, plantao: 4.5, retorno: 4.5, portal: 3, instagram: 2.5, trafego: 2 }[String(l.origem || '').toLowerCase()] ?? 1.5;
  const total = Math.round(Math.min(100, fit + eng + rec + urg + dados + orig) * 100) / 100;
  const temperatura = total >= 80 ? 'fervendo' : total >= 60 ? 'quente' : total >= 35 ? 'morno' : 'frio';
  return {
    score: total, temperatura,
    detalhe: { fit: +fit.toFixed(2), engajamento: eng, recencia: +rec.toFixed(2), urgencia: urg, dados, origem: orig, capacidade: cap },
  };
}

export const SCORE_DIMS = [
  { k: 'fit', label: 'Fit financeiro', max: 30, dica: 'Capacidade de compra vs. estoque disponível' },
  { k: 'engajamento', label: 'Engajamento', max: 25, dica: 'Interações nos últimos 21 dias' },
  { k: 'recencia', label: 'Recência', max: 15, dica: 'Decai rápido sem contato (meia-vida ~5 dias)' },
  { k: 'urgencia', label: 'Urgência', max: 15, dica: 'Prazo de decisão declarado' },
  { k: 'dados', label: 'Dados completos', max: 10, dica: 'Telefone, renda, CPF, FGTS e preferências' },
  { k: 'origem', label: 'Origem', max: 5, dica: 'Indicação e plantão convertem mais' },
];

/** Saúde e probabilidade do negócio (regressão logística com pesos de mercado). */
export function dealHealth(d, lead, historico = []) {
  const ultimo = historico.filter((x) => x.deal_id === d.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const dias = Math.floor(daysSince(ultimo?.created_at || d.created_at));
  const sla = STAGE_SLA[d.stage] ?? 7;
  const semContato = daysSince(lead?.ultimo_contato || d.created_at);
  const logit = -2.2 + 0.045 * (STAGE_PROB[d.stage] ?? 10) + 0.025 * (lead?.score ?? 30)
    - 0.9 * Math.max(0, dias / sla - 1) - 0.12 * Math.min(semContato, 20) + (d.unidade_id ? 0.4 : 0);
  const prob = d.stage === 'ganho' ? 100 : d.stage === 'perdido' ? 0 : Math.round((1000 / (1 + Math.exp(-logit)))) / 10;
  const health = Math.round(Math.max(0, Math.min(100, 100 - Math.max(0, dias - sla) * 8 - Math.min(semContato, 15) * 3)) * 10) / 10;
  return { probabilidade: prob, health, dias_no_stage: dias, proxima_acao: proximaAcao(d.stage, semContato), detalhe: { sla, estourouSla: dias > sla, semContato: +semContato.toFixed(1) } };
}

export function proximaAcao(stage, semContato = 0) {
  if (stage === 'ganho' || stage === 'perdido') return null;
  if (semContato > 5) return `Retomar contato hoje: ${Math.round(semContato)} dias sem falar com o cliente`;
  return {
    novo: 'Ligar em até 5 minutos e qualificar renda/FGTS',
    qualificacao: 'Rodar simulação de crédito e agendar visita',
    visita: 'Confirmar visita D-1 e levar 2 opções + 1 âncora',
    proposta: 'Fechar condição: prazo de validade da proposta em 48h',
    analise_credito: 'Cobrar pendências de documentação e acompanhar avaliação',
    contrato: 'Agendar assinatura e conferir minuta',
    repasse: 'Acompanhar conformidade CEF e laudo de engenharia',
    assinatura: 'Enviar envelope DocuSign e monitorar assinaturas',
  }[stage];
}

/** Radar do dia: prioriza ações por impacto esperado (VGV × probabilidade × urgência). */
export function radarDoDia({ leads = [], deals = [] } = {}) {
  const byLead = Object.fromEntries(leads.map((l) => [l.id, l]));
  const itens = [];
  deals.filter((d) => !['ganho', 'perdido'].includes(d.stage)).forEach((d) => {
    const l = byLead[d.lead_id];
    const sem = daysSince(l?.ultimo_contato || d.created_at);
    const risco = sem > 5 || (d.dias_no_stage || 0) > (STAGE_SLA[d.stage] || 7);
    const impacto = (d.valor || 0) * ((d.probabilidade || 10) / 100) * (risco ? 1.6 : 1) * (1 + (l?.score || 0) / 100);
    itens.push({ tipo: 'deal', id: d.id, lead: l, deal: d, impacto, risco, acao: d.proxima_acao || proximaAcao(d.stage, sem) });
  });
  leads.filter((l) => !l.arquivado && !deals.some((d) => d.lead_id === l.id) && (l.score || 0) >= 40).forEach((l) => {
    itens.push({ tipo: 'lead', id: l.id, lead: l, impacto: (l.orcamento_max || 250000) * 0.08 * (l.score / 100), risco: false, acao: 'Lead qualificado sem negócio: abrir oportunidade e agendar visita' });
  });
  return itens.sort((a, b) => b.impacto - a.impacto);
}

/** Forecast do mês: soma ponderada + cenário pessimista/otimista. */
export function forecast(deals = []) {
  const abertos = deals.filter((d) => !['ganho', 'perdido'].includes(d.stage));
  const ponderado = abertos.reduce((s, d) => s + (d.valor || 0) * (d.probabilidade || 0) / 100, 0);
  const otimista = abertos.filter((d) => (d.probabilidade || 0) >= 30).reduce((s, d) => s + (d.valor || 0), 0);
  const pessimista = abertos.filter((d) => (d.probabilidade || 0) >= 75).reduce((s, d) => s + (d.valor || 0), 0);
  return { ponderado, otimista, pessimista, abertos: abertos.length };
}
