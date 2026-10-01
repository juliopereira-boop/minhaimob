// Dados de demonstração (São Luís/MA) — espelho de fn_seed_demo.
const D = 86400000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const day = (n) => new Date(Date.now() + n * D).toISOString().slice(0, 10);

export function demoData(uid, userId) {
  const e1 = uid(), e2 = uid(), e3 = uid(), e4 = uid();
  const emp = [
    { id: e1, nome: 'Residencial Maré Alta', construtora: 'Construtora Demo', padrao: 'medio', status_obra: 'em_obra', previsao_entrega: day(420), bairro: "Ponta d'Areia", cidade: 'São Luís', uf: 'MA', lat: -2.4925, lng: -44.292, torres: 2, andares: 18, unidades_por_andar: 4, total_unidades: 144, elevadores: 2, valor_min: 489000, valor_max: 812000, condominio_estimado: 650, programa: 'SBPE', aceita_fgts: true, ativo: true,
      lazer: ['piscina adulto', 'piscina infantil', 'academia', 'espaço gourmet', 'salão de festas', 'playground', 'coworking', 'pet place', 'beach tennis'], diferenciais: ['vista mar', 'varanda gourmet', 'fechadura digital', 'infra para ar-condicionado'], descricao: 'Torres com vista para a Baía de São Marcos, a 300 m da praia.' },
    { id: e2, nome: 'Parque das Palmeiras', construtora: 'Construtora Demo', padrao: 'economico', status_obra: 'lancamento', previsao_entrega: day(900), bairro: 'Turu', cidade: 'São Luís', uf: 'MA', lat: -2.524, lng: -44.218, torres: 6, andares: 5, unidades_por_andar: 8, total_unidades: 240, elevadores: 0, valor_min: 199000, valor_max: 264000, condominio_estimado: 280, programa: 'MCMV', faixa_mcmv: 3, aceita_fgts: true, ativo: true,
      lazer: ['piscina', 'churrasqueira', 'playground', 'quadra poliesportiva', 'salão de festas', 'portaria 24h'], diferenciais: ['ITBI e registro grátis', 'condomínio clube'], descricao: 'Condomínio clube MCMV com financiamento direto pela Caixa.' },
    { id: e3, nome: 'Atlântico Prime', construtora: 'Construtora Demo', padrao: 'alto', status_obra: 'pronto', previsao_entrega: day(-60), bairro: 'Calhau', cidade: 'São Luís', uf: 'MA', lat: -2.487, lng: -44.256, torres: 1, andares: 24, unidades_por_andar: 2, total_unidades: 48, elevadores: 3, valor_min: 1150000, valor_max: 1890000, condominio_estimado: 1400, programa: 'SBPE', aceita_fgts: true, ativo: true,
      lazer: ['borda infinita', 'spa', 'sauna', 'academia', 'cinema', 'adega', 'brinquedoteca', 'espaço gourmet', 'heliponto'], diferenciais: ['frente mar', 'automação residencial', 'gerador', 'closet'], descricao: 'Alto padrão frente mar no Calhau, 2 apartamentos por andar.' },
    { id: e4, nome: 'Vila Cohama Life', construtora: 'Construtora Demo', padrao: 'medio', status_obra: 'em_obra', previsao_entrega: day(210), bairro: 'Cohama', cidade: 'São Luís', uf: 'MA', lat: -2.508, lng: -44.244, torres: 3, andares: 12, unidades_por_andar: 6, total_unidades: 216, elevadores: 2, valor_min: 329000, valor_max: 455000, condominio_estimado: 420, programa: 'SBPE', aceita_fgts: true, ativo: true,
      lazer: ['piscina', 'academia', 'espaço gourmet', 'playground', 'pet place', 'bicicletário', 'mini mercado'], diferenciais: ['varanda', 'cozinha integrada'], descricao: 'Localização central, próximo a shopping, escolas e hospitais.' },
  ].map((e) => ({ ...e, demo: true }));
  const tipDefs = [
    [e1, 'Tipo A — 2 suítes', 2, 2, 3, 1, 68.4, true, true, 489000], [e1, 'Tipo B — 3 quartos', 3, 1, 3, 2, 92.15, true, true, 690000], [e1, 'Cobertura', 3, 3, 4, 3, 148, true, true, 812000],
    [e2, 'Tipo 1 — 2 quartos', 2, 0, 1, 1, 42.3, false, false, 199000], [e2, 'Tipo 2 — 2 quartos c/ suíte', 2, 1, 2, 1, 48.9, true, false, 239000],
    [e3, 'Planta Única — 4 suítes', 4, 4, 6, 4, 248, true, true, 1450000], [e3, 'Cobertura Duplex', 4, 4, 6, 5, 412, true, true, 1890000],
    [e4, 'Tipo A — 2 quartos', 2, 1, 2, 1, 57.8, true, false, 329000], [e4, 'Tipo B — 3 quartos', 3, 1, 2, 2, 74.6, true, true, 455000],
  ];
  const tip = tipDefs.map(([eid, nome, q, s, b, v, a, va, vg, val]) => ({ id: uid(), empreendimento_id: eid, nome, quartos: q, suites: s, banheiros: b, vagas: v, area_privativa: a, varanda: va, varanda_gourmet: vg, valor_base: val, quantidade: 0 }));
  const uni = [];
  for (const t of tip) {
    for (let i = 1; i <= 4; i++) {
      const andar = i * 3 + 1;
      const valor = Math.round(t.valor_base * (1 + andar * 0.004));
      uni.push({ id: uid(), empreendimento_id: t.empreendimento_id, tipologia_id: t.id, identificacao: `T${(i % 2) + 1} - ${andar}${String(i).padStart(2, '0')} ${t.nome.slice(0, 6)}`, torre: `Torre ${(i % 2) + 1}`, andar,
        posicao: i % 2 === 0 ? 'frente' : 'fundos', status: i === 4 ? 'reservado' : 'disponivel', valor, valor_tabela: valor, desconto_max_pct: 4, entrada_minima: Math.round(t.valor_base * 0.1) });
    }
  }
  const L = (o) => ({ id: uid(), demo: true, responsavel_id: userId, consentimento_lgpd: true, arquivado: false, created_at: iso(-20 * D), cidade_interesse: 'São Luís', ...o });
  const leads = [
    L({ nome: 'Mariana Costa', telefone: '(98) 98111-2201', email: 'mariana@exemplo.com', renda_bruta: 7800, renda_composta: 4200, fgts: 38000, entrada_disponivel: 60000, score_credito: 760, objetivo: 'moradia', quartos_min: 2, vagas_min: 1, orcamento_max: 520000, bairros_interesse: ["Ponta d'Areia", 'Calhau'], amenidades_desejadas: ['piscina', 'academia', 'pet place'], prazo_decisao: '30d', origem: 'instagram', estado_civil: 'casada', dependentes: 1, profissao: 'Engenheira', ultimo_contato: iso(-1 * D) }),
    L({ nome: 'Rafael Mendes', telefone: '(98) 98222-3302', email: 'rafael@exemplo.com', renda_bruta: 3900, fgts: 21000, entrada_disponivel: 8000, score_credito: 640, objetivo: 'moradia', quartos_min: 2, vagas_min: 1, orcamento_max: 260000, bairros_interesse: ['Turu', 'Cohama'], amenidades_desejadas: ['playground', 'piscina'], prazo_decisao: 'imediato', origem: 'plantao', estado_civil: 'solteiro', profissao: 'Técnico de enfermagem', ultimo_contato: iso(-3 * 3600000) }),
    L({ nome: 'Dr. Henrique Sales', telefone: '(98) 98333-4403', email: 'henrique@exemplo.com', renda_bruta: 42000, fgts: 180000, entrada_disponivel: 900000, score_credito: 820, objetivo: 'moradia', quartos_min: 4, vagas_min: 3, orcamento_max: 1900000, bairros_interesse: ['Calhau', "Ponta d'Areia"], amenidades_desejadas: ['spa', 'academia', 'cinema'], prazo_decisao: '90d', origem: 'indicacao', estado_civil: 'casado', dependentes: 2, profissao: 'Médico', ultimo_contato: iso(-6 * D) }),
    L({ nome: 'Juliana Ferreira', telefone: '(98) 98444-5504', email: 'juliana@exemplo.com', renda_bruta: 9500, fgts: 15000, entrada_disponivel: 120000, score_credito: 710, objetivo: 'investimento', quartos_min: 2, vagas_min: 1, orcamento_max: 600000, bairros_interesse: ["Ponta d'Areia", 'Cohama'], amenidades_desejadas: ['coworking'], prazo_decisao: '30d', origem: 'portal', estado_civil: 'solteira', profissao: 'Advogada', ultimo_contato: iso(-2 * D) }),
    L({ nome: 'Carlos & Ana Ribeiro', telefone: '(98) 98555-6605', email: 'ribeiro@exemplo.com', renda_bruta: 6100, renda_composta: 3500, fgts: 52000, entrada_disponivel: 30000, score_credito: 680, objetivo: 'moradia', quartos_min: 3, vagas_min: 2, orcamento_max: 470000, bairros_interesse: ['Cohama', 'Turu'], amenidades_desejadas: ['piscina', 'playground', 'academia'], prazo_decisao: '90d', origem: 'trafego', estado_civil: 'casado', dependentes: 2, profissao: 'Servidor público', servidor_publico: true, ultimo_contato: iso(-12 * D) }),
    L({ nome: 'Pedro Henrique Lima', telefone: '(98) 98666-7706', renda_bruta: 2600, fgts: 9000, entrada_disponivel: 0, objetivo: 'moradia', quartos_min: 2, orcamento_max: 210000, bairros_interesse: ['Turu'], prazo_decisao: '6m', origem: 'trafego', estado_civil: 'solteiro', profissao: 'Vendedor', ultimo_contato: iso(-20 * D) }),
  ];
  const empPara = (l) => (l.orcamento_max > 1000000 ? e3 : l.orcamento_max > 480000 ? e1 : l.orcamento_max > 300000 ? e4 : e2);
  const empNome = (id) => emp.find((e) => e.id === id).nome.replace('Residencial ', '').replace(' Life', '');
  const stages = ['qualificacao', 'novo', 'visita', 'proposta', 'novo', 'novo'];
  const deals = leads.map((l, i) => ({ id: uid(), lead_id: l.id, empreendimento_id: empPara(l), titulo: `${l.nome} — ${empNome(empPara(l))}`, stage: stages[i], valor: l.orcamento_max * 0.95, responsavel_id: userId, previsao_fechamento: day(30), created_at: iso(-((i % 3) + 1) * D + i * 3600000), comissao_pct: 5 }));
  const comparaveis = [
    ['Apto 2q vista mar', "Ponta d'Areia", 2, 1, 70, 545000, 41], ['Apto 3q varanda gourmet', "Ponta d'Areia", 3, 2, 95, 720000, 63], ['Apto 2q condomínio clube', 'Turu', 2, 1, 45, 215000, 28],
    ['Apto 4 suítes frente mar', 'Calhau', 4, 4, 260, 1650000, 120], ['Apto 2q próximo shopping', 'Cohama', 2, 1, 60, 349000, 35], ['Apto 3q nascente', 'Cohama', 3, 2, 78, 470000, 52],
    ['Apto 3q Renascença', 'Renascença', 3, 2, 105, 690000, 47], ['Apto 2q Turu MCMV', 'Turu', 2, 1, 48, 235000, 22], ['Apto 3q Calhau', 'Calhau', 3, 2, 120, 860000, 70],
  ].map(([titulo, bairro, q, v, area, valor, dias]) => ({ id: uid(), fonte: 'portal', titulo, cidade: 'São Luís', bairro, quartos: q, vagas: v, area, valor, valor_m2: Math.round(valor / area), dias_anunciado: dias, demo: true }));
  const atividades = [
    { id: uid(), lead_id: leads[0].id, deal_id: deals[0].id, tipo: 'whatsapp', titulo: 'Enviou simulação', resultado: 'positivo', concluido: true, created_at: iso(-1 * D) },
    { id: uid(), lead_id: leads[1].id, deal_id: deals[1].id, tipo: 'ligacao', titulo: 'Qualificação inicial', resultado: 'positivo', concluido: true, created_at: iso(-3 * 3600000) },
    { id: uid(), lead_id: leads[3].id, deal_id: deals[3].id, tipo: 'visita', titulo: 'Visita ao decorado', resultado: 'positivo', concluido: true, created_at: iso(-2 * D) },
    { id: uid(), lead_id: leads[3].id, deal_id: deals[3].id, tipo: 'proposta', titulo: 'Proposta enviada', resultado: 'neutro', concluido: true, created_at: iso(-2 * D + 3600000) },
    { id: uid(), lead_id: leads[2].id, deal_id: deals[2].id, tipo: 'reuniao', titulo: 'Apresentação Atlântico Prime', resultado: 'positivo', concluido: true, created_at: iso(-6 * D) },
  ];
  return { empreendimentos: emp, tipologias: tip, unidades: uni, leads, deals, comparaveis, activities: atividades };
}
