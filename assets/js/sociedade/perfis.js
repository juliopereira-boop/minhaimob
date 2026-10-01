// Identidade dos corretores virtuais: personalidade (estável), humor inicial, áreas,
// estratégias que podem testar e objetivos ligados a KPIs reais do CRM.
export const AGENTES = ['ana', 'bruno', 'carla', 'diego', 'elisa', 'fabio'];
export const NOMES = { ana: 'Ana', bruno: 'Bruno', carla: 'Carla', diego: 'Diego', elisa: 'Elisa', fabio: 'Fábio', gestor: 'Gestor' };
export const nome = (k) => NOMES[k] || k;

// Traços 0..1. Eles mudam decisões (aceitar convite, iniciar conversa, reagir a ranking, ajudar, arriscar estratégia).
export const PERSONALIDADE = {
  ana:   { extroversao: 0.8, sociabilidade: 0.8, disciplina: 0.6, competitividade: 0.7, ambicao: 0.75, empatia: 0.6, autoconfianca: 0.65, paciencia: 0.4, curiosidade: 0.6, abertura: 0.7, colaboracao: 0.6, risco: 0.6 },
  bruno: { extroversao: 0.7, sociabilidade: 0.55, disciplina: 0.55, competitividade: 0.9, ambicao: 0.9, empatia: 0.4, autoconfianca: 0.85, paciencia: 0.35, curiosidade: 0.4, abertura: 0.4, colaboracao: 0.45, risco: 0.7 },
  carla: { extroversao: 0.4, sociabilidade: 0.55, disciplina: 0.9, competitividade: 0.3, ambicao: 0.5, empatia: 0.7, autoconfianca: 0.7, paciencia: 0.8, curiosidade: 0.6, abertura: 0.6, colaboracao: 0.8, risco: 0.2 },
  diego: { extroversao: 0.75, sociabilidade: 0.8, disciplina: 0.4, competitividade: 0.5, ambicao: 0.6, empatia: 0.55, autoconfianca: 0.6, paciencia: 0.5, curiosidade: 0.9, abertura: 0.85, colaboracao: 0.65, risco: 0.75 },
  elisa: { extroversao: 0.65, sociabilidade: 0.8, disciplina: 0.75, competitividade: 0.3, ambicao: 0.55, empatia: 0.9, autoconfianca: 0.75, paciencia: 0.85, curiosidade: 0.7, abertura: 0.8, colaboracao: 0.9, risco: 0.4 },
  fabio: { extroversao: 0.3, sociabilidade: 0.4, disciplina: 0.8, competitividade: 0.6, ambicao: 0.65, empatia: 0.45, autoconfianca: 0.7, paciencia: 0.7, curiosidade: 0.8, abertura: 0.5, colaboracao: 0.5, risco: 0.35 },
};

export const ESTILO = {
  ana: 'animada e rápida, fala de forma próxima, às vezes ansiosa por resultado',
  bruno: 'direto e confiante, gosta de números e de fechar, um pouco competitivo',
  carla: 'cuidadosa e precisa, explica com calma, odeia improviso em documentação',
  diego: 'criativo e informal, cheio de ideias, às vezes disperso',
  elisa: 'acolhedora e didática, faz boas perguntas antes de aconselhar',
  fabio: 'analítico e econômico nas palavras, sempre traz um dado',
};

// Temas em que cada um é referência (usado para decidir a quem pedir ajuda / quem convidar)
export const AREAS = {
  ana: ['prospeccao', 'leads', 'primeiro_contato', 'whatsapp'],
  bruno: ['negociacao', 'objecoes', 'fechamento', 'proposta'],
  carla: ['credito', 'financiamento', 'documentacao', 'repasse'],
  diego: ['marketing', 'anuncios', 'conteudo', 'campanha'],
  elisa: ['treinamento', 'metodo', 'objecoes', 'rotina'],
  fabio: ['mercado', 'preco', 'estoque', 'forecast'],
};
export const especialistaEm = (tag) => AGENTES.find((a) => AREAS[a].includes(tag));

export const HUMOR_INICIAL = (k) => ({ motivacao: 0.7, energia: 0.8, estresse: 0.25, confianca: PERSONALIDADE[k].autoconfianca, satisfacao: 0.6, frustracao: 0.1, foco: 0.7 });

// Relação inicial derivada de papéis (complementaridade, mentoria e competição natural) — não é aleatória.
const PARES_COMPLEMENTARES = [['ana', 'diego'], ['bruno', 'carla'], ['bruno', 'fabio'], ['ana', 'carla'], ['diego', 'fabio']];
export function relacaoInicial(a, b) {
  const pa = PERSONALIDADE[a], pb = PERSONALIDADE[b];
  const comp = PARES_COMPLEMENTARES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return {
    afinidade: +(0.1 + (comp ? 0.12 : 0) + (pa.sociabilidade + pb.sociabilidade - 1) * 0.08).toFixed(3),
    confianca: +(0.3 + (comp ? 0.08 : 0) + (b === 'elisa' ? 0.1 : 0)).toFixed(3),
    respeito: +(0.4 + (b === 'elisa' ? 0.2 : 0) + (b === 'fabio' && a === 'bruno' ? 0.1 : 0) + pb.disciplina * 0.1).toFixed(3),
    rivalidade: +(pa.competitividade > 0.65 && pb.competitividade > 0.65 ? 0.15 : 0).toFixed(3),
  };
}

// Estratégias que cada agente pode adotar e testar (aprendizado = comparar KPI antes/depois).
export const ESTRATEGIAS = {
  ana: [
    { id: 'ordem_chegada', nome: 'Atender por ordem de chegada', dica: 'responde quem chegou primeiro' },
    { id: 'urgencia_primeiro', nome: 'Prazo de decisão primeiro', dica: 'prioriza quem quer decidir em até 30 dias' },
    { id: 'origem_quente', nome: 'Indicação e plantão primeiro', dica: 'origens que historicamente convertem mais' },
    { id: 'qualificar_renda', nome: 'Pedir renda na 1ª mensagem', dica: 'qualifica crédito antes de mandar opções' },
  ],
  bruno: [
    { id: 'proposta_48h', nome: 'Proposta com validade de 48h', dica: 'urgência legítima' },
    { id: 'concessao_condicionada', nome: 'Desconto só com contrapartida', dica: 'nunca dar desconto de graça' },
    { id: 'visita_com_ancora', nome: 'Visita com 3 opções (âncora)', dica: 'cliente escolhe entre opções' },
  ],
  carla: [
    { id: 'docs_antecipados', nome: 'Pedir documentos na qualificação', dica: 'evita travar na análise' },
    { id: 'pre_analise', nome: 'Pré-análise antes da proposta', dica: 'descobre restrição cedo' },
    { id: 'acompanhamento_48h', nome: 'Atualizar cliente a cada 48h', dica: 'confiança durante o repasse' },
  ],
  diego: [
    { id: 'publico_unico', nome: 'Um público por anúncio', dica: 'criativo específico por perfil' },
    { id: 'oferta_fgts', nome: 'Gancho do FGTS', dica: 'primeiro imóvel' },
    { id: 'prova_social', nome: 'Prova social (vendas recentes)', dica: 'usa vendas do time' },
  ],
  elisa: [
    { id: 'treino_reativo', nome: 'Treinar quem está com dificuldade', dica: 'age quando o KPI cai' },
    { id: 'treino_preventivo', nome: 'Treino curto preventivo', dica: 'antes do problema aparecer' },
  ],
  fabio: [
    { id: 'alerta_preco', nome: 'Alertar preço acima do mercado', dica: 'evita encalhe' },
    { id: 'oportunidade_estoque', nome: 'Divulgar oportunidades abaixo do mercado', dica: 'âncora de campanha' },
  ],
};

// Objetivos ligados a KPIs (direcao: 'baixo' = quanto menor melhor)
export const OBJETIVOS = {
  ana: [{ kpi: 'sem_contato_24h', descricao: 'Nenhum lead novo sem contato por mais de 24h', alvo: 0, direcao: 'baixo' }, { kpi: 'pct_com_renda', descricao: 'Ter renda informada em 70% dos leads', alvo: 70, direcao: 'alto' }],
  bruno: [{ kpi: 'em_risco', descricao: 'Zerar negócios em risco no pipeline', alvo: 0, direcao: 'baixo' }, { kpi: 'conversao', descricao: 'Converter 40% das propostas', alvo: 40, direcao: 'alto' }],
  carla: [{ kpi: 'credito_travado', descricao: 'Nenhum negócio travado no crédito além do prazo', alvo: 0, direcao: 'baixo' }],
  diego: [{ kpi: 'leads_7d', descricao: 'Gerar pelo menos 10 leads por semana', alvo: 10, direcao: 'alto' }],
  elisa: [{ kpi: 'score_medio', descricao: 'Elevar o score médio dos leads para 55', alvo: 55, direcao: 'alto' }],
  fabio: [{ kpi: 'acima_mercado', descricao: 'Nenhuma unidade mais de 10% acima do mercado', alvo: 0, direcao: 'baixo' }],
};

// Como cada tema aparece numa conversa
export const TEMAS = {
  leads: 'velocidade e qualificação de leads', prospeccao: 'prospecção', primeiro_contato: 'primeiro contato', whatsapp: 'atendimento no WhatsApp',
  credito: 'crédito e documentação', financiamento: 'financiamento', documentacao: 'documentação', repasse: 'repasse',
  negociacao: 'negociação', objecoes: 'objeções', fechamento: 'fechamento', proposta: 'propostas',
  marketing: 'geração de leads com anúncios', anuncios: 'anúncios', conteudo: 'conteúdo', campanha: 'campanhas',
  treinamento: 'treinamento', metodo: 'método de atendimento', rotina: 'rotina do time',
  mercado: 'mercado', preco: 'preço e posicionamento', estoque: 'estoque', forecast: 'previsão de vendas',
};
export const temaDe = (tag) => TEMAS[tag] || tag;
