// Corretores virtuais: personas, contexto do CRM, cérebro offline e tarefas delegáveis.
import { brl, brlK, num, pct, rel, daysSince, stageLabel } from '../ui.js';
import { capacidadeLead, simular, taxaReferencia, faixaMCMV, checklistDocs } from './credito.js';
import { matchUnidades, norm } from './match.js';
import { radarDoDia, forecast, SCORE_DIMS } from './scoring.js';
import { OBJECOES, SCRIPTS, ROLEPLAY, preencher } from './playbook.js';
import { gerarAnuncios } from './copy.js';
import { diagnosticoEstoque, avaliar } from './pricing.js';

const BASE = `Você é um corretor virtual de alta performance do escritório MinhaImob. Seu objetivo é fazer o time vender mais e mais rápido, com ética e transparência.`;

export const AGENTS = [
  {
    id: 'ana', nome: 'Ana', papel: 'prospector', cargo: 'Prospectora (SDR)', cor: '#5AA9FF', mesa: [-9, -4],
    especialidade: 'Prioriza leads, escreve primeiras mensagens e reativa contatos frios.',
    frase: 'Lead parado é dinheiro esfriando. Bora ligar?',
    system_prompt: `${BASE}\nVocê é a Ana, prospectora (SDR). Especialista em speed-to-lead, qualificação inicial (método RÁPIDO: Renda, Aprovação, Prazo, Imóvel ideal, Decisor, Objetivo) e mensagens de primeiro contato e reativação por WhatsApp e ligação. Sempre entregue: quem contatar, por quê, e a mensagem pronta.`,
    sugestoes: ['Quem eu devo ligar hoje?', 'Escreva uma mensagem de reativação para leads frios', 'Como qualificar um lead de Instagram em 2 minutos?'],
    tarefas: [{ id: 'ligar_hoje', titulo: 'Montar lista de ligações de hoje' }, { id: 'reativar', titulo: 'Reativar leads frios' }],
  },
  {
    id: 'bruno', nome: 'Bruno', papel: 'closer', cargo: 'Closer / Negociação', cor: '#F06B6B', mesa: [-3, -4],
    especialidade: 'Estratégia de fechamento por negócio, contorno de objeções e propostas.',
    frase: 'Proposta sem validade é conversa. Vamos fechar.',
    system_prompt: `${BASE}\nVocê é o Bruno, closer. Especialista em negociação imobiliária, técnicas de fechamento (alternativa, resumo, urgência legítima, concessão condicionada) e contorno de objeções pelo método A.C.R. (Acolher, Clarificar, Responder). Seja assertivo e prático; entregue falas prontas.`,
    sugestoes: ['Cliente disse que está caro. O que eu respondo?', 'Quais negócios estão mais perto de fechar?', 'Monte uma estratégia para fechar a proposta mais quente'],
    tarefas: [{ id: 'fechar', titulo: 'Plano de fechamento dos negócios quentes' }, { id: 'riscos', titulo: 'Negócios em risco (SLA estourado)' }],
  },
  {
    id: 'carla', nome: 'Carla', papel: 'credito', cargo: 'Crédito & Repasse CEF', cor: '#39C98A', mesa: [3, -4],
    especialidade: 'Capacidade de compra, enquadramento MCMV/SBPE, documentação e repasse.',
    frase: 'Primeiro a simulação, depois o imóvel.',
    system_prompt: `${BASE}\nVocê é a Carla, analista de crédito imobiliário e repasse Caixa (CEF). Domina SAC/PRICE, enquadramento Minha Casa Minha Vida por faixa de renda, uso de FGTS, composição de renda, documentação, fluxo de repasse (análise, engenharia, conformidade, assinatura, registro) e prazos. Sempre deixe claro que valores são estimativas e que a aprovação é do banco.`,
    sugestoes: ['Quanto um casal com renda de R$ 9.000 consegue financiar?', 'Quais leads precisam compor renda?', 'Checklist de documentos para servidor público'],
    tarefas: [{ id: 'capacidade', titulo: 'Capacidade de compra de todos os leads' }, { id: 'docs', titulo: 'Pendências de documentação dos negócios em crédito' }],
  },
  {
    id: 'diego', nome: 'Diego', papel: 'marketing', cargo: 'Marketing & Conteúdo', cor: '#A08CFF', mesa: [9, -4],
    especialidade: 'Anúncios para Instagram, portais, Google Ads, roteiros de Reels.',
    frase: 'Benefício na primeira linha, CTA na última.',
    system_prompt: `${BASE}\nVocê é o Diego, especialista em marketing imobiliário digital: copy para Instagram, Stories, Reels, portais (ZAP, OLX, VivaReal), Google Ads e listas de transmissão no WhatsApp. Escreva com gancho forte, benefício antes de característica e CTA claro. Respeite limites: título de portal ≤ 60 caracteres, headline Google ≤ 30, descrição ≤ 90.`,
    sugestoes: ['Crie um post de Instagram para o empreendimento mais novo', 'Roteiro de Reels de 30 segundos', 'Ideias de conteúdo para a semana'],
    tarefas: [{ id: 'anuncios', titulo: 'Gerar anúncios de todos os empreendimentos' }],
  },
  {
    id: 'elisa', nome: 'Elisa', papel: 'trainer', cargo: 'Treinadora de Vendas', cor: '#F2B544', mesa: [-6, 4],
    especialidade: 'Treina o time com roleplay de clientes reais e dá nota de 0 a 10.',
    frase: 'Treino difícil, venda fácil.',
    system_prompt: `${BASE}\nVocê é a Elisa, treinadora de vendas. Faz roleplay interpretando clientes difíceis (preço, medo de crédito, cônjuge, investidor) e depois dá feedback objetivo com nota de 0 a 10, pontos fortes, pontos a melhorar e a resposta ideal. Durante o roleplay, fique no personagem do cliente. Quando o corretor escrever "avaliar", saia do personagem e avalie.`,
    sugestoes: ['Quero treinar objeção de preço', 'Simule um cliente com medo de não ser aprovado', 'Me ensine a fechar por alternativa'],
    tarefas: [{ id: 'treino', titulo: 'Plano de treino da semana' }],
  },
  {
    id: 'fabio', nome: 'Fábio', papel: 'analista', cargo: 'Analista de Mercado', cor: '#D9A55B', mesa: [4, 4],
    especialidade: 'Precificação por comparáveis, estoque parado e argumentos de valor.',
    frase: 'Preço certo vende sozinho.',
    system_prompt: `${BASE}\nVocê é o Fábio, analista de mercado imobiliário. Trabalha com preço por m², comparáveis, liquidez (dias de anúncio), giro de estoque, VGV e forecast. Fale com números, aponte unidades acima do mercado e oportunidades, e sugira ações de preço e campanha.`,
    sugestoes: ['Quais unidades estão caras para o mercado?', 'Qual o forecast do mês?', 'Como está o preço por m² no Calhau?'],
    tarefas: [{ id: 'estoque', titulo: 'Diagnóstico de estoque vs. mercado' }, { id: 'forecast', titulo: 'Forecast do mês' }],
  },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id);

// ---------------------------------------------------------------------------
// Contexto compacto do CRM para a IA
// ---------------------------------------------------------------------------
export function buildContexto(data, agentId) {
  const { leads = [], deals = [], empreendimentos = [], unidades = [], profile } = data;
  const empById = Object.fromEntries(empreendimentos.map((e) => [e.id, e]));
  const disp = unidades.filter((u) => u.status === 'disponivel');
  const ctx = {
    hoje: new Date().toLocaleDateString('pt-BR'),
    corretor: profile?.nome || 'Corretor',
    resumo: {
      leads: leads.length, leads_quentes: leads.filter((l) => ['quente', 'fervendo'].includes(l.temperatura)).length,
      negocios_abertos: deals.filter((d) => !['ganho', 'perdido'].includes(d.stage)).length,
      unidades_disponiveis: disp.length, forecast_ponderado: Math.round(forecast(deals).ponderado),
    },
    empreendimentos: empreendimentos.slice(0, 12).map((e) => ({
      nome: e.nome, bairro: e.bairro, status: e.status_obra, programa: e.programa, valor_min: e.valor_min, valor_max: e.valor_max,
      disponiveis: disp.filter((u) => u.empreendimento_id === e.id).length, lazer: (e.lazer || []).slice(0, 6), diferenciais: (e.diferenciais || []).slice(0, 4),
    })),
    leads: [...leads].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20).map((l) => {
      const cap = capacidadeLead(l);
      return { nome: l.nome, score: Math.round(l.score || 0), temperatura: l.temperatura, renda: (l.renda_bruta || 0) + (l.renda_composta || 0) || null,
        fgts: l.fgts || 0, entrada: l.entrada_disponivel || 0, capacidade_imovel: cap ? Math.round(cap.imovelMaxSemLtv) : null,
        quartos_min: l.quartos_min, bairros: l.bairros_interesse, objetivo: l.objetivo, prazo: l.prazo_decisao, ultimo_contato: rel(l.ultimo_contato) };
    }),
    negocios: deals.filter((d) => !['ganho', 'perdido'].includes(d.stage)).slice(0, 25).map((d) => ({
      titulo: d.titulo, etapa: stageLabel(d.stage), valor: d.valor, probabilidade: d.probabilidade, saude: d.health,
      dias_na_etapa: d.dias_no_stage, proxima_acao: d.proxima_acao, empreendimento: empById[d.empreendimento_id]?.nome,
    })),
  };
  if (agentId === 'fabio') ctx.comparaveis = (data.comparaveis || []).slice(0, 30).map((c) => ({ bairro: c.bairro, quartos: c.quartos, area: c.area, valor: c.valor, dias: c.dias_anunciado }));
  return ctx;
}

// ---------------------------------------------------------------------------
// Tarefas delegáveis (rodam sobre os dados reais, sem depender de IA)
// ---------------------------------------------------------------------------
export function runTarefa(agentId, tarefaId, data) {
  const { leads = [], deals = [], empreendimentos = [], unidades = [], tipologias = [], comparaveis = [], profile, org } = data;
  const leadById = Object.fromEntries(leads.map((l) => [l.id, l]));
  const corretor = profile?.nome?.split(' ')[0] || 'seu corretor';
  const imob = org?.nome || 'MinhaImob';
  const enriched = enrichUnidades(unidades, empreendimentos, tipologias);

  if (tarefaId === 'ligar_hoje') {
    const radar = radarDoDia({ leads, deals }).slice(0, 10);
    return {
      titulo: 'Lista de ligações de hoje', resumo: `${radar.length} contatos priorizados por impacto (VGV × probabilidade × urgência).`,
      itens: radar.map((r, i) => {
        const l = r.lead || {};
        const top = matchUnidades(l, enriched, 1)[0];
        const msg = preencher(SCRIPTS[0].corpo, { nome: l.nome?.split(' ')[0], corretor, imobiliaria: imob, empreendimento: top?.unidade.emp?.nome || 'nosso lançamento' });
        return { titulo: `${i + 1}. ${l.nome || '—'} ${r.risco ? '⚠' : ''}`, sub: r.acao, detalhe: `Score ${Math.round(l.score || 0)} · ${l.telefone || 'sem telefone'}${top ? ` · Sugestão: ${top.unidade.emp?.nome} (${top.score} pts)` : ''}`, copiar: msg, lead_id: l.id };
      }),
    };
  }
  if (tarefaId === 'reativar') {
    const frios = leads.filter((l) => !l.arquivado && daysSince(l.ultimo_contato || l.created_at) > 7).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10);
    return {
      titulo: 'Reativação de leads frios', resumo: `${frios.length} leads sem contato há mais de 7 dias.`,
      itens: frios.map((l) => {
        const top = matchUnidades(l, enriched, 1)[0];
        return { titulo: l.nome, sub: `Último contato ${rel(l.ultimo_contato)}`, detalhe: top ? `Gancho: ${top.unidade.emp?.nome} — ${top.motivos[0] || 'nova condição'}` : 'Gancho: nova condição de pagamento',
          copiar: preencher(SCRIPTS[6].corpo, { nome: l.nome.split(' ')[0], empreendimento: top?.unidade.emp?.nome || 'nosso lançamento', condicao: top ? `unidade a partir de ${brl(top.valor)}` : 'entrada facilitada' }), lead_id: l.id };
      }),
    };
  }
  if (tarefaId === 'fechar') {
    const quentes = deals.filter((d) => ['visita', 'proposta', 'analise_credito', 'contrato'].includes(d.stage)).sort((a, b) => (b.probabilidade || 0) * (b.valor || 0) - (a.probabilidade || 0) * (a.valor || 0)).slice(0, 8);
    return {
      titulo: 'Plano de fechamento', resumo: `${quentes.length} negócios com maior valor esperado.`,
      itens: quentes.map((d) => {
        const l = leadById[d.lead_id] || {};
        const tecnica = d.stage === 'visita' ? 'Fechamento por alternativa: ofereça 2 unidades e pergunte qual preferem.' : d.stage === 'proposta' ? 'Proposta com validade de 48h + concessão condicionada (desconto só com entrada maior ou assinatura hoje).' : d.stage === 'analise_credito' ? 'Garanta documentação completa hoje; atualize o cliente a cada 48h para manter a confiança.' : 'Agende a assinatura com data e hora; confirme quem assina.';
        return { titulo: `${d.titulo} · ${stageLabel(d.stage)}`, sub: `${brl(d.valor)} · prob. ${pct(d.probabilidade)} · saúde ${num(d.health)}`, detalhe: tecnica,
          copiar: preencher(SCRIPTS[7].corpo, { nome: l.nome?.split(' ')[0], unidade: 'que separei', entrada1: brl((d.valor || 0) * 0.1), entrada2: brl((d.valor || 0) * 0.2) }) };
      }),
    };
  }
  if (tarefaId === 'riscos') {
    const risco = deals.filter((d) => !['ganho', 'perdido'].includes(d.stage) && ((d.health ?? 100) < 70 || d.health_detalhe?.estourou_sla || d.health_detalhe?.estourouSla)).sort((a, b) => (a.health ?? 0) - (b.health ?? 0));
    return { titulo: 'Negócios em risco', resumo: `${risco.length} negócios com saúde baixa ou SLA estourado.`,
      itens: risco.map((d) => ({ titulo: d.titulo, sub: `${stageLabel(d.stage)} · ${d.dias_no_stage ?? 0} dias na etapa · saúde ${num(d.health)}`, detalhe: d.proxima_acao || 'Retomar contato' })) };
  }
  if (tarefaId === 'capacidade') {
    const ls = leads.filter((l) => (l.renda_bruta || 0) + (l.renda_composta || 0) > 0).map((l) => ({ l, c: capacidadeLead(l) })).sort((a, b) => b.c.imovelMaxSemLtv - a.c.imovelMaxSemLtv);
    return { titulo: 'Capacidade de compra', resumo: `${ls.length} leads com renda informada. Leads sem renda: ${leads.length - ls.length} (qualificar!).`,
      itens: ls.map(({ l, c }) => ({ titulo: l.nome, sub: `Imóvel até ${brl(c.imovelMaxSemLtv)} · financia ${brl(c.financiamentoMax)} · parcela ${brl(c.parcelaMax)}`,
        detalhe: `${c.faixaMCMV ? `MCMV Faixa ${c.faixaMCMV}` : 'SBPE'} · taxa ref. ${num(c.taxaAnual, 2)}% a.a.${c.limitadoPor === 'entrada' ? ` · ⚠ limitado pela entrada (faltam ${brl(c.entradaNecessaria)})` : ''}${l.orcamento_max && c.imovelMaxSemLtv < l.orcamento_max ? ' · orçamento desejado acima da capacidade: sugerir composição de renda' : ''}` })) };
  }
  if (tarefaId === 'docs') {
    const cred = deals.filter((d) => ['analise_credito', 'contrato', 'repasse'].includes(d.stage));
    return { titulo: 'Documentação para crédito', resumo: `${cred.length} negócios em análise/repasse.`,
      itens: cred.map((d) => { const l = leadById[d.lead_id] || {}; return { titulo: d.titulo, sub: stageLabel(d.stage), detalhe: checklistDocs(l).join(' · '), copiar: preencher(SCRIPTS[9].corpo, { nome: l.nome?.split(' ')[0] }) }; }) };
  }
  if (tarefaId === 'anuncios') {
    return { titulo: 'Anúncios gerados', resumo: `${empreendimentos.length} empreendimentos.`,
      itens: empreendimentos.map((e) => { const a = gerarAnuncios(e, tipologias.filter((t) => t.empreendimento_id === e.id), e.dados_extraidos?.inteligencia || {}); return { titulo: e.nome, sub: a.portal.titulo, detalhe: 'Post de Instagram pronto para copiar', copiar: a.instagram }; }) };
  }
  if (tarefaId === 'estoque') {
    const diag = diagnosticoEstoque(enriched, comparaveis).slice(0, 12);
    return { titulo: 'Estoque vs. mercado', resumo: comparaveis.length ? `${diag.length} unidades avaliadas por comparáveis.` : 'Cadastre comparáveis em Mercado para avaliar.',
      itens: diag.map((x) => ({ titulo: `${x.unidade.emp?.nome} · ${x.unidade.identificacao}`, sub: `Tabela ${brl(x.unidade.valor)} · sugerido ${brl(x.avaliacao.valorSugerido)} (${x.gap > 0 ? '+' : ''}${num(x.gap, 1)}%)`,
        detalhe: x.sinal === 'acima' ? 'Acima do mercado: reforçar argumentos de valor ou ajustar condição de entrada.' : x.sinal === 'oportunidade' ? 'Abaixo do mercado: use como âncora de oportunidade na campanha.' : 'Alinhado ao mercado.' })) };
  }
  if (tarefaId === 'forecast') {
    const f = forecast(deals);
    return { titulo: 'Forecast do mês', resumo: `Ponderado ${brl(f.ponderado)} · pessimista ${brl(f.pessimista)} · otimista ${brl(f.otimista)}`,
      itens: deals.filter((d) => !['ganho', 'perdido'].includes(d.stage)).sort((a, b) => (b.valor || 0) * (b.probabilidade || 0) - (a.valor || 0) * (a.probabilidade || 0)).slice(0, 10)
        .map((d) => ({ titulo: d.titulo, sub: `${brl(d.valor)} × ${pct(d.probabilidade)} = ${brl((d.valor || 0) * (d.probabilidade || 0) / 100)}`, detalhe: stageLabel(d.stage) })) };
  }
  if (tarefaId === 'treino') {
    return { titulo: 'Plano de treino da semana', resumo: 'Treinos de 15 minutos por dia.',
      itens: ['Seg — Qualificação RÁPIDO com 3 leads reais', 'Ter — Roleplay: objeção de preço (Sr. Roberto)', 'Qua — Roleplay: medo de crédito (Larissa)', 'Qui — Fechamento por alternativa em 2 propostas abertas', 'Sex — Roleplay: investidora (Dra. Camila) + revisão da semana']
        .map((t) => ({ titulo: t, sub: 'Abra a Elisa no escritório 3D para treinar' })) };
  }
  return { titulo: 'Tarefa', resumo: 'Tarefa não reconhecida.', itens: [] };
}

export function enrichUnidades(unidades, empreendimentos, tipologias) {
  const e = Object.fromEntries(empreendimentos.map((x) => [x.id, x]));
  const t = Object.fromEntries(tipologias.map((x) => [x.id, x]));
  return unidades.map((u) => ({ ...u, emp: e[u.empreendimento_id], tip: t[u.tipologia_id] }));
}

// ---------------------------------------------------------------------------
// Cérebro offline: responde com base nos motores quando não há IA configurada
// ---------------------------------------------------------------------------
export function responderOffline(agentId, texto, data, estado = {}) {
  const ag = agentById(agentId);
  const t = norm(texto);
  const { leads = [], empreendimentos = [], unidades = [], tipologias = [] } = data;
  const enriched = enrichUnidades(unidades, empreendimentos, tipologias);

  // Roleplay (Elisa)
  if (agentId === 'elisa') return roleplayOffline(texto, estado);

  // Lead citado pelo nome
  const lead = leads.find((l) => l.nome && norm(l.nome).split(' ').some((p) => p.length > 3 && t.includes(p)));
  // Objeção
  const obj = melhorObjecao(t);

  if (/simul|financ|parcela|capacidade|consegue comprar|renda de/.test(t)) {
    const nums = [...texto.matchAll(/(\d[\d.,]*)\s*(mil|k)?/gi)].map((m) => { let v = parseFloat(m[1].replace(/\./g, '').replace(',', '.')); if (m[2]) v *= 1000; return v; }).filter((v) => v >= 500);
    if (lead && !nums.length) return resumoLead(lead, enriched);
    const renda = nums.find((v) => v < 100000);
    const valor = nums.find((v) => v >= 100000);
    const out = [];
    if (renda) {
      const c = capacidadeLeadLike(renda);
      out.push(`**Capacidade para renda de ${brl(renda)}** (estimativa)`, `• Parcela máxima (30%): ${brl(c.parcelaMax)}`, `• Financiamento até: ${brl(c.financiamentoMax)}`, `• Imóvel até ~${brl(c.imovelMaxSemLtv)} (com entrada/FGTS suficientes)`, `• Enquadramento: ${c.faixaMCMV ? `MCMV Faixa ${c.faixaMCMV}` : 'SBPE'} · taxa ref. ${num(c.taxaAnual, 2)}% a.a.`);
    }
    if (valor) {
      const taxa = renda ? taxaReferencia(renda) : 11.49;
      const s = simular({ valor, entrada: valor * 0.2, taxaAnual: taxa });
      out.push('', `**Simulação SAC — imóvel de ${brl(valor)}** (20% de entrada, ${num(taxa, 2)}% a.a., 420 meses)`, `• 1ª parcela: ${brl(s.primeiraParcela)} → última: ${brl(s.ultimaParcela)}`, `• Renda mínima: ${brl(s.rendaMinima)}`);
    }
    if (out.length) return out.join('\n') + '\n\nValores de referência — a aprovação final é do banco. Abra o Simulador de Crédito para detalhar.';
  }
  if (lead) return resumoLead(lead, enriched);
  if (obj && (agentId === 'bruno' || /disse|falou|objec|respond|cliente acha|caro|pensar|esposa|marido|medo|nome sujo|entrada/.test(t))) {
    return `**Objeção: "${obj.objecao}"** — técnica: ${obj.tecnica.replace(/_/g, ' ')}\n\n${obj.resposta}\n\n**Pergunta de avanço:** ${obj.follow_up}`;
  }
  if (/ligar|prioridad|hoje|quem/.test(t) || agentId === 'ana') return formatTarefa(runTarefa('ana', 'ligar_hoje', data));
  if (/anuncio|post|instagram|reels|copy|conteudo/.test(t) || agentId === 'diego') {
    const e = empreendimentos.find((x) => t.includes(norm(x.nome).split(' ')[0])) || empreendimentos[0];
    if (!e) return 'Cadastre um empreendimento (ou destrinche um book) para eu gerar os anúncios.';
    const a = gerarAnuncios(e, tipologias.filter((x) => x.empreendimento_id === e.id), e.dados_extraidos?.inteligencia || {});
    return `**Post de Instagram — ${e.nome}**\n\n${a.instagram}\n\n**Título para portal:** ${a.portal.titulo}\n\n**Reels 30s:**\n${a.reels.map((r) => '• ' + r).join('\n')}`;
  }
  if (/caro|mercado|preco|m2|m²|estoque|forecast|previs/.test(t) || agentId === 'fabio') return formatTarefa(runTarefa('fabio', /forecast|previs/.test(t) ? 'forecast' : 'estoque', data));
  if (agentId === 'carla') return formatTarefa(runTarefa('carla', 'capacidade', data));
  if (agentId === 'bruno') return formatTarefa(runTarefa('bruno', 'fechar', data));
  return `Sou ${ag.nome}, ${ag.cargo}. ${ag.especialidade}\n\nExperimente:\n${ag.sugestoes.map((s) => '• ' + s).join('\n')}`;
}

function capacidadeLeadLike(renda) { return capacidadeLead({ renda_bruta: renda, entrada_disponivel: 0, fgts: 0 }); }

function resumoLead(l, enriched) {
  const c = capacidadeLead(l);
  const top = matchUnidades(l, enriched, 3);
  const det = l.score_detalhe || {};
  const fracos = SCORE_DIMS.filter((d) => det[d.k] != null && det[d.k] / d.max < 0.4).map((d) => d.label);
  return [
    `**${l.nome}** — score ${Math.round(l.score || 0)} (${l.temperatura || '—'}) · último contato ${rel(l.ultimo_contato)}`,
    c ? `Capacidade: imóvel até ${brl(c.imovelMaxSemLtv)} · parcela máx. ${brl(c.parcelaMax)} · ${c.faixaMCMV ? `MCMV F${c.faixaMCMV}` : 'SBPE'}` : 'Sem renda informada — qualifique renda e FGTS primeiro.',
    fracos.length ? `Pontos fracos do score: ${fracos.join(', ')}` : null,
    top.length ? '\n**Melhores unidades:**\n' + top.map((m) => `• ${m.unidade.emp?.nome} ${m.unidade.identificacao} — ${brl(m.valor)} · ${m.score} pts${m.motivos[0] ? ` · ${m.motivos[0]}` : ''}${m.bloqueios[0] ? ` · ⚠ ${m.bloqueios[0]}` : ''}`).join('\n') : null,
    `\n**Mensagem pronta:**\nOi, ${l.nome.split(' ')[0]}! Separei ${top.length ? `uma opção no ${top[0].unidade.emp?.nome}` : 'algumas opções'} que encaixa no que você procura. Posso te mandar a simulação da parcela?`,
  ].filter(Boolean).join('\n');
}

export function melhorObjecao(t) {
  const words = norm(t).split(/\W+/).filter((w) => w.length > 3);
  let best = null, bs = 0;
  for (const o of OBJECOES) {
    const ow = norm(o.objecao + ' ' + o.categoria).split(/\W+/);
    const s = words.filter((w) => ow.some((x) => x.startsWith(w.slice(0, 5)))).length;
    if (s > bs) { bs = s; best = o; }
  }
  if (!best && /caro|preco|valor/.test(t)) best = OBJECOES[0];
  return best;
}

export function formatTarefa(r) {
  return `**${r.titulo}**\n${r.resumo}\n\n${r.itens.slice(0, 8).map((i) => `• **${i.titulo}** — ${i.sub || ''}${i.detalhe ? `\n  ${i.detalhe}` : ''}`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// Roleplay offline com avaliação heurística
// ---------------------------------------------------------------------------
export function avaliarResposta(txt) {
  const t = norm(txt);
  const crit = [
    ['Acolheu a objeção', /entendo|compreendo|faz sentido|normal|justo|imagino|com certeza|claro/.test(t), 2],
    ['Fez pergunta para clarificar', /\?/.test(txt), 2],
    ['Usou dado/número concreto', /\d/.test(t), 1.5],
    ['Trouxe prova ou segurança', /registro|banco|caixa|entregue|garantia|seguranc|incorporac|analise|aprovac/.test(t), 1.5],
    ['Propôs próximo passo', /agend|visita|amanha|sabado|hoje|simul|proposta|reserv|ligo|te mando/.test(t), 2],
    ['Evitou desconto gratuito', !/desconto/.test(t) || /se |condic|em troca|caso/.test(t), 1],
  ];
  const nota = Math.min(10, crit.reduce((s, c) => s + (c[1] ? c[2] : 0), 0));
  return { nota, ok: crit.filter((c) => c[1]).map((c) => c[0]), faltou: crit.filter((c) => !c[1]).map((c) => c[0]) };
}

function roleplayOffline(texto, estado) {
  const t = norm(texto);
  if (!estado.persona) {
    const p = ROLEPLAY.find((r) => t.includes(r.id) || (r.id === 'preco' && /caro|preco/.test(t)) || (r.id === 'medo' && /medo|credito|aprova/.test(t)) || (r.id === 'conjuge' && /esposa|marido|conjuge/.test(t)) || (r.id === 'investidor' && /invest/.test(t))) || ROLEPLAY[0];
    estado.persona = p.id; estado.turno = 0; estado.notas = [];
    return `🎭 **Roleplay iniciado** — você vai atender **${p.nome}**.\n_${p.perfil}_\n\nResponda como corretor. Escreva **avaliar** quando quiser o feedback.\n\n**${p.nome.split(',')[0]}:** "${p.abertura}"`;
  }
  const p = ROLEPLAY.find((r) => r.id === estado.persona);
  if (/^avaliar|^fim|^nota/.test(t)) {
    const media = estado.notas.length ? estado.notas.reduce((s, n) => s + n.nota, 0) / estado.notas.length : 0;
    const faltas = {};
    estado.notas.forEach((n) => n.faltou.forEach((f) => (faltas[f] = (faltas[f] || 0) + 1)));
    const obj = melhorObjecao(p.abertura);
    const r = `📊 **Avaliação — ${p.nome}**\nNota média: **${num(media, 1)}/10** em ${estado.notas.length} respostas\n\n**Pontos fortes:** ${uniqTop(estado.notas.flatMap((n) => n.ok)).join(', ') || '—'}\n**Melhorar:** ${Object.entries(faltas).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]).join(', ') || 'nada crítico'}\n\n**Resposta modelo:**\n${obj?.resposta || ''}\n\n${obj?.follow_up ? `**Pergunta de avanço:** ${obj.follow_up}` : ''}\n\nQuer treinar outro cliente? Diga: preço, medo, cônjuge ou investidor.`;
    estado.persona = null;
    return r;
  }
  const av = avaliarResposta(texto);
  estado.notas.push(av); estado.turno++;
  const reacoes = {
    preco: ['Hum... mas mesmo assim, 40 mil é dinheiro. O que esse aqui tem a mais?', 'Tá, e se eu fechar hoje, você melhora alguma coisa?', 'Vou ser sincero: se a condição for boa, eu fecho.'],
    medo: ['Mas e se der a restrição de novo na análise?', 'E a parcela, vai ficar em quanto mais ou menos com meu FGTS?', 'Tá... se você me ajudar com os documentos, eu topo tentar.'],
    conjuge: ['É que ela é bem exigente com cozinha e espaço...', 'Talvez no sábado ela consiga vir.', 'Tá bom, marca sábado às 10h então.'],
    investidor: ['Quanto valoriza até a entrega, em números?', 'E a liquidez? Se eu quiser vender antes da entrega, consigo?', 'Ok. Me manda a planilha com os números que eu decido até amanhã.'],
  }[p.id];
  const fala = av.nota >= 6 ? reacoes[Math.min(estado.turno, reacoes.length - 1)] : reacoes[0];
  return `**${p.nome.split(',')[0]}:** "${fala}"\n\n_(nota desta resposta: ${num(av.nota, 1)}/10${av.faltou.length ? ` · faltou: ${av.faltou.slice(0, 2).join(', ')}` : ''})_`;
}
const uniqTop = (arr) => Object.entries(arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
