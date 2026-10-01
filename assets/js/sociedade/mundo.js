// Percepção do mundo: KPIs reais do CRM por agente, problemas, ranking e padrões coletivos.
import { AGENTES, OBJETIVOS, nome } from './perfis.js';
import { STAGE_SLA } from '../engine/scoring.js';
import { diagnosticoEstoque } from '../engine/pricing.js';
import { enrichUnidades } from '../engine/agents.js';

const dias = (d) => (d ? (Date.now() - new Date(d).getTime()) / 864e5 : 999);

export function kpis(d) {
  const leads = (d.leads || []).filter((l) => !l.arquivado);
  const deals = d.deals || [];
  const abertos = deals.filter((x) => !['ganho', 'perdido'].includes(x.stage));
  const actsPorLead = new Set((d.activities || []).map((a) => a.lead_id));
  const recentes = (n) => deals.filter((x) => ['ganho', 'perdido'].includes(x.stage) && dias(x.fechado_em || x.updated_at) <= n);
  const fechados = recentes(60);
  const ganhos = fechados.filter((x) => x.stage === 'ganho').length;
  const diag = d.unidades?.length && d.comparaveis?.length ? diagnosticoEstoque(enrichUnidades(d.unidades, d.empreendimentos || [], d.tipologias || []), d.comparaveis) : [];
  const k = {
    ana: {
      sem_contato_24h: leads.filter((l) => dias(l.created_at) > 1 && dias(l.created_at) < 30 && !actsPorLead.has(l.id) && dias(l.ultimo_contato || l.created_at) > 1).length,
      esfriando: leads.filter((l) => (l.score || 0) >= 45 && dias(l.ultimo_contato || l.created_at) > 5).length,
      pct_com_renda: leads.length ? Math.round((leads.filter((l) => l.renda_bruta).length / leads.length) * 100) : null,
    },
    bruno: {
      em_risco: abertos.filter((x) => (x.health ?? 100) < 70 || (x.dias_no_stage || 0) > (STAGE_SLA[x.stage] || 99)).length,
      quentes: abertos.filter((x) => ['visita', 'proposta'].includes(x.stage)).length,
      conversao: fechados.length ? Math.round((ganhos / fechados.length) * 100) : null,
    },
    carla: {
      credito_travado: abertos.filter((x) => ['analise_credito', 'contrato', 'repasse'].includes(x.stage) && (x.dias_no_stage || 0) > (STAGE_SLA[x.stage] || 99)).length,
      em_credito: abertos.filter((x) => ['analise_credito', 'contrato', 'repasse'].includes(x.stage)).length,
      perdas_credito: recentes(30).filter((x) => x.stage === 'perdido' && /cr[eé]dito/i.test(x.motivo_perda || '')).length,
    },
    diego: {
      leads_7d: leads.filter((l) => dias(l.created_at) <= 7).length,
      pct_origem_quente: leads.length ? Math.round((leads.filter((l) => ['indicacao', 'plantao'].includes(l.origem)).length / leads.length) * 100) : null,
    },
    elisa: {
      score_medio: leads.length ? Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / leads.length) : null,
      treinos_7d: (d.agent_conversas || []).filter((c) => c.tipo === 'treinamento' && dias(c.created_at) <= 7).length,
    },
    fabio: {
      acima_mercado: diag.filter((x) => x.sinal === 'acima').length,
      oportunidades: diag.filter((x) => x.sinal === 'oportunidade').length,
    },
  };
  for (const a of AGENTES) {
    k[a].desempenho = desempenho(a, k[a]);
    k[a].problemas = problemas(a, k[a]);
  }
  const ordem = [...AGENTES].sort((x, y) => k[y].desempenho - k[x].desempenho);
  ordem.forEach((a, i) => (k[a].ranking = i + 1));
  return k;
}

function desempenho(a, v) {
  const notas = OBJETIVOS[a].map((o) => {
    const x = v[o.kpi];
    if (x == null) return 60;
    return o.direcao === 'baixo' ? Math.max(0, 100 - x * 15) : Math.min(100, (x / (o.alvo || 1)) * 100);
  });
  return Math.round(notas.reduce((s, n) => s + n, 0) / notas.length);
}

function problemas(a, v) {
  const p = [];
  const add = (tag, texto, gravidade) => p.push({ tag, texto, gravidade: Math.min(1, gravidade) });
  if (a === 'ana') {
    if (v.sem_contato_24h) add('leads', `${v.sem_contato_24h} lead(s) novos sem contato há mais de 24h`, v.sem_contato_24h / 4);
    if (v.esfriando) add('leads', `${v.esfriando} lead(s) bons esfriando sem contato`, v.esfriando / 5);
    if (v.pct_com_renda != null && v.pct_com_renda < 60) add('credito', `só ${v.pct_com_renda}% dos leads com renda informada`, (60 - v.pct_com_renda) / 60);
  }
  if (a === 'bruno') {
    if (v.em_risco) add('negociacao', `${v.em_risco} negócio(s) em risco no pipeline`, v.em_risco / 4);
    if (v.conversao != null && v.conversao < 35) add('fechamento', `conversão de ${v.conversao}% nas propostas`, (35 - v.conversao) / 35);
  }
  if (a === 'carla') {
    if (v.credito_travado) add('credito', `${v.credito_travado} negócio(s) travado(s) no crédito além do prazo`, v.credito_travado / 3);
    if (v.perdas_credito) add('credito', `${v.perdas_credito} negócio(s) perdido(s) por crédito no mês`, v.perdas_credito / 2);
  }
  if (a === 'diego' && v.leads_7d < 5) add('marketing', v.leads_7d ? `só ${v.leads_7d} lead(s) novo(s) na semana` : 'nenhum lead novo na semana', (5 - v.leads_7d) / 5);
  if (a === 'elisa' && v.score_medio != null && v.score_medio < 45) add('metodo', `score médio dos leads em ${v.score_medio}`, (45 - v.score_medio) / 45);
  if (a === 'fabio' && v.acima_mercado) add('preco', `${v.acima_mercado} unidade(s) acima do preço de mercado`, v.acima_mercado / 6);
  return p.sort((x, y) => y.gravidade - x.gravidade);
}

/** Padrões que pedem ação coletiva (reunião/treinamento). */
export function padroesEquipe(k, eventos = []) {
  const out = [];
  const perdasCredito = eventos.filter((e) => e.tipo === 'negocio_perdido' && /cr[eé]dito/i.test(e.resumo) && dias(e.created_at) <= 7).length + (k.carla.perdas_credito || 0);
  if ((k.carla.credito_travado >= 2) || perdasCredito >= 2) out.push({ tag: 'credito', texto: perdasCredito >= 2 ? `${perdasCredito} perdas ligadas a crédito recentemente` : `${k.carla.credito_travado} negócios travados no crédito`, envolvidos: ['carla', 'bruno', 'ana'], gravidade: 0.8 });
  if (k.ana.esfriando >= 3 && k.bruno.em_risco >= 2) out.push({ tag: 'rotina', texto: `leads esfriando (${k.ana.esfriando}) e negócios em risco (${k.bruno.em_risco}) ao mesmo tempo`, envolvidos: ['ana', 'bruno', 'elisa'], gravidade: 0.7 });
  if (k.fabio.acima_mercado >= 3 && k.diego.leads_7d < 5) out.push({ tag: 'preco', texto: `${k.fabio.acima_mercado} unidades caras e pouca geração de leads`, envolvidos: ['fabio', 'diego', 'bruno'], gravidade: 0.65 });
  return out;
}

export const resumoKpi = (a, v) => {
  const map = {
    ana: () => `${v.sem_contato_24h} sem contato 24h · ${v.esfriando} esfriando · ${v.pct_com_renda ?? '—'}% com renda`,
    bruno: () => `${v.quentes} quentes · ${v.em_risco} em risco · conversão ${v.conversao ?? '—'}%`,
    carla: () => `${v.em_credito} em crédito · ${v.credito_travado} travados`,
    diego: () => `${v.leads_7d} leads/7d · ${v.pct_origem_quente ?? '—'}% origem quente`,
    elisa: () => `score médio ${v.score_medio ?? '—'} · ${v.treinos_7d} treinos/7d`,
    fabio: () => `${v.acima_mercado} acima do mercado · ${v.oportunidades} oportunidades`,
  };
  return map[a] ? map[a]() : '';
};
export { nome };
