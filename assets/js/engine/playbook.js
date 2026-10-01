// Conhecimento de vendas: trilhas da Academia, objeções, scripts, playbook por etapa e roleplay.

export const OBJECOES = [
  { categoria: 'preco', objecao: 'Está caro', tecnica: 'reframe',
    resposta: 'Entendo. Caro comparado a quê? Me conta qual valor você tinha em mente — assim eu vejo se ajusto a unidade, o prazo ou a entrada para caber no seu bolso sem abrir mão do que é importante para você.',
    follow_up: 'Se a parcela ficasse em torno de R$ X, faria sentido para você?' },
  { categoria: 'preco', objecao: 'Vi mais barato em outro lugar', tecnica: 'comparacao',
    resposta: 'Ótimo que você está pesquisando. Vamos comparar lado a lado: metragem privativa, vaga, lazer, acabamento, condomínio e localização. Muitas vezes o "mais barato" sai mais caro no m² ou na revenda. Me manda o anúncio que eu faço a comparação para você.',
    follow_up: 'Se o nosso entregar mais pelo mesmo valor por m², você fecharia com a gente?' },
  { categoria: 'preco', objecao: 'Consegue um desconto?', tecnica: 'concessao_condicionada',
    resposta: 'Consigo levar uma proposta para a diretoria. Para eu defender um desconto, preciso de algo em troca: entrada maior, fechamento hoje ou uma unidade específica. Qual dessas opções funciona para você?',
    follow_up: 'Se eu conseguir essa condição, assinamos a proposta hoje?' },
  { categoria: 'prazo', objecao: 'Vou pensar', tecnica: 'clarificacao',
    resposta: 'Claro, é uma decisão importante. Para eu te ajudar a pensar: o que ainda está pesando mais — o valor, a localização ou a planta? Se for o valor, eu rodo outra simulação agora.',
    follow_up: 'Posso te ligar amanhã às 19h para fecharmos as dúvidas?' },
  { categoria: 'prazo', objecao: 'Não é o momento / vou esperar', tecnica: 'custo_da_espera',
    resposta: 'Faz sentido avaliar o momento. Só para você considerar: enquanto espera, o aluguel continua saindo e a tabela sobe a cada etapa de obra. Se você paga R$ 1.500 de aluguel, em 12 meses são R$ 18.000 que poderiam virar entrada.',
    follow_up: 'Vamos simular quanto você economiza começando agora?' },
  { categoria: 'conjuge', objecao: 'Preciso falar com meu marido/esposa', tecnica: 'inclusao',
    resposta: 'Perfeito, é uma decisão de vocês dois. Que tal marcarmos uma visita com ele(a) junto? Assim eu tiro as dúvidas pessoalmente e vocês decidem com segurança. Amanhã ou no sábado fica melhor?',
    follow_up: 'O que você acha que vai ser a principal dúvida dele(a)?' },
  { categoria: 'credito', objecao: 'Tenho nome sujo / medo de não aprovar', tecnica: 'seguranca',
    resposta: 'Isso é mais comum do que parece e tem solução. A gente faz a análise antes de qualquer compromisso — se tiver restrição, eu te mostro o caminho: regularizar, compor renda com alguém da família ou ajustar o valor do imóvel.',
    follow_up: 'Posso fazer uma pré-análise com seu CPF agora, sem compromisso?' },
  { categoria: 'credito', objecao: 'Não tenho dinheiro para a entrada', tecnica: 'alternativas',
    resposta: 'Vamos montar a entrada juntos: FGTS, subsídio (se enquadrar no Minha Casa Minha Vida), parcelamento direto com a construtora durante a obra e até composição de renda. Muita gente compra com entrada parcelada que cabe no mês.',
    follow_up: 'Quanto você tem de FGTS hoje, mais ou menos?' },
  { categoria: 'credito', objecao: 'A parcela vai pesar', tecnica: 'ancoragem',
    resposta: 'Vamos comparar com o que você paga hoje de aluguel. No SAC a parcela começa mais alta e cai todo mês. E diferente do aluguel, cada parcela vira patrimônio seu.',
    follow_up: 'Quanto você paga de aluguel hoje?' },
  { categoria: 'confianca', objecao: 'E se a construtora não entregar?', tecnica: 'prova_social',
    resposta: 'Pergunta certa. O empreendimento tem registro de incorporação no cartório, e no financiamento na planta o banco libera conforme a obra avança e fiscaliza com engenharia própria. Posso te levar para conhecer obras já entregues da construtora.',
    follow_up: 'Quer agendar uma visita ao decorado e ao canteiro?' },
  { categoria: 'confianca', objecao: 'Prefiro imóvel pronto', tecnica: 'reframe',
    resposta: 'Pronto tem a vantagem da mudança imediata. Na planta você paga menos, parcela a entrada durante a obra e ganha a valorização até a entrega. Se mudar logo for prioridade, eu tenho opções prontas também — quer ver as duas lado a lado?',
    follow_up: 'O que pesa mais para você: mudar logo ou pagar menos?' },
  { categoria: 'concorrencia', objecao: 'Já estou vendo com outro corretor', tecnica: 'diferenciacao',
    resposta: 'Sem problema. O que eu posso somar: simulação completa de crédito, comparação imparcial entre opções e acompanhamento até a entrega das chaves. Se fizer sentido, eu te mando uma análise sem compromisso.',
    follow_up: 'Quais empreendimentos você já viu?' },
  { categoria: 'produto', objecao: 'O apartamento é pequeno', tecnica: 'reframe',
    resposta: 'A planta é inteligente: sem corredor desperdiçado, com ambientes integrados. E o lazer do condomínio vira extensão da sua casa. Quer ver o decorado? A sensação de espaço é bem diferente da planta no papel.',
    follow_up: 'Quais ambientes são indispensáveis para você?' },
  { categoria: 'produto', objecao: 'Condomínio caro', tecnica: 'decomposicao',
    resposta: 'Vamos dividir: academia, piscina, segurança 24h, salão de festas e manutenção. Só a academia fora custaria boa parte disso. E condomínio bem cuidado valoriza o imóvel.',
    follow_up: 'Você usaria quais áreas de lazer?' },
  { categoria: 'produto', objecao: 'Localização não é ideal', tecnica: 'clarificacao',
    resposta: 'Me conta o que é mais importante na localização: trabalho, escola das crianças ou família por perto? Assim eu calculo os trajetos reais e, se não fizer sentido, te mostro outra opção na região certa.',
    follow_up: 'Qual endereço você mais frequenta no dia a dia?' },
];

export const SCRIPTS = [
  { categoria: 'abordagem', canal: 'whatsapp', titulo: 'Primeiro contato (lead de anúncio)',
    corpo: 'Oi, {nome}! Aqui é {corretor}, da {imobiliaria}. Vi que você se interessou pelo {empreendimento}. Para eu te mandar as opções certas: você procura para morar ou investir, e quantos quartos precisa?' },
  { categoria: 'abordagem', canal: 'ligacao', titulo: 'Ligação em até 5 minutos',
    corpo: '{nome}, tudo bem? {corretor} da {imobiliaria}. Você acabou de pedir informações do {empreendimento} — te liguei rapidinho para entender o que você procura e não te mandar nada fora do perfil. Tem 2 minutinhos?' },
  { categoria: 'qualificacao', canal: 'whatsapp', titulo: 'Qualificação de crédito',
    corpo: 'Para eu simular a parcela certinha, me ajuda com 3 informações: 1) renda bruta familiar aproximada; 2) se tem FGTS (e mais ou menos quanto); 3) quanto consegue dar de entrada. Fica tudo entre a gente 😉' },
  { categoria: 'visita', canal: 'whatsapp', titulo: 'Convite para visita',
    corpo: '{nome}, separei 2 unidades que encaixam no que você me falou. A melhor forma de decidir é ver de perto. Consigo te receber {dia} às {hora} ou {dia2} às {hora2}. Qual fica melhor?' },
  { categoria: 'visita', canal: 'whatsapp', titulo: 'Confirmação D-1',
    corpo: 'Oi, {nome}! Confirmando nossa visita amanhã às {hora} no {empreendimento}. Já deixei a simulação pronta para te mostrar. Precisa do endereço no mapa?' },
  { categoria: 'followup', canal: 'whatsapp', titulo: 'Follow-up pós-visita',
    corpo: '{nome}, obrigado pela visita hoje! O que mais te chamou atenção? Lembrando que a condição que conversamos vale até {validade}. Quer que eu reserve a unidade {unidade} enquanto vocês decidem?' },
  { categoria: 'followup', canal: 'whatsapp', titulo: 'Reativação de lead frio',
    corpo: 'Oi, {nome}! Faz um tempo que conversamos sobre imóvel. Saiu uma condição nova no {empreendimento} que pode te interessar: {condicao}. Ainda está procurando?' },
  { categoria: 'fechamento', canal: 'whatsapp', titulo: 'Fechamento por alternativa',
    corpo: '{nome}, pelo que conversamos, a unidade {unidade} é a que mais combina com vocês. Preferem seguir com entrada de {entrada1} ou {entrada2}? Assim já preparo a proposta.' },
  { categoria: 'fechamento', canal: 'whatsapp', titulo: 'Proposta com validade',
    corpo: 'Segue a proposta da unidade {unidade}: valor {valor}, entrada {entrada} e parcelas de {parcela}. Essa condição foi aprovada até {validade}. Posso agendar a assinatura?' },
  { categoria: 'credito', canal: 'whatsapp', titulo: 'Pedido de documentação CEF',
    corpo: '{nome}, ótima notícia: vamos dar entrada na análise de crédito! Me envia por aqui, em foto legível: RG/CPF, comprovante de residência, 3 últimos contracheques, carteira de trabalho e extrato do FGTS. Qualquer dúvida me chama.' },
  { categoria: 'posvenda', canal: 'whatsapp', titulo: 'Pedido de indicação',
    corpo: '{nome}, foi um prazer fazer parte dessa conquista! 🏡 Se você conhece alguém que também está pensando em comprar imóvel, me indica? Vou cuidar com o mesmo carinho.' },
];

export const STAGE_PLAYBOOK = {
  novo: { meta: 'Contato em até 5 min', checklist: ['Ligar ou mandar WhatsApp em até 5 minutos', 'Confirmar interesse e objetivo (morar/investir)', 'Registrar origem e campanha'] },
  qualificacao: { meta: 'Saber se pode e quer comprar', checklist: ['Renda bruta familiar', 'FGTS e entrada disponível', 'Prazo de decisão', 'Quem decide (cônjuge?)', 'Rodar simulação de crédito'] },
  visita: { meta: 'Visita agendada e realizada', checklist: ['Levar 3 opções: âncora, alvo e alternativa', 'Simulação impressa/no celular', 'Mapear objeções na visita', 'Sair com próximo passo marcado'] },
  proposta: { meta: 'Proposta assinada', checklist: ['Proposta com validade de 48h', 'Condição de entrada clara', 'Reservar unidade', 'Antecipar objeções finais'] },
  analise_credito: { meta: 'Crédito aprovado', checklist: ['Documentação completa (checklist CEF)', 'Pré-análise de restrições', 'Acompanhar avaliação de engenharia', 'Atualizar cliente a cada 48h'] },
  contrato: { meta: 'Contrato assinado', checklist: ['Conferir minuta', 'Agendar assinatura', 'Recolher sinal'] },
  repasse: { meta: 'Contrato com o banco assinado', checklist: ['Conformidade CEF', 'ITBI emitido', 'Agendamento da assinatura no banco'] },
  assinatura: { meta: 'Envelope concluído', checklist: ['Envelope DocuSign enviado', 'Monitorar signatários', 'Registro em cartório'] },
};

/** Taxas de conversão padrão do funil (ajuste com dados reais da sua equipe). */
export const CONVERSAO_PADRAO = { lead_atendimento: 0.6, atendimento_visita: 0.25, visita_proposta: 0.35, proposta_venda: 0.45 };

/** Funil reverso: de quanto VGV preciso → quantos leads e atividades por dia. */
export function funilReverso({ metaVgv, ticket, conv = CONVERSAO_PADRAO, diasUteis = 22 }) {
  const vendas = Math.ceil(metaVgv / Math.max(ticket, 1));
  const propostas = Math.ceil(vendas / conv.proposta_venda);
  const visitas = Math.ceil(propostas / conv.visita_proposta);
  const atendimentos = Math.ceil(visitas / conv.atendimento_visita);
  const leads = Math.ceil(atendimentos / conv.lead_atendimento);
  return { vendas, propostas, visitas, atendimentos, leads, porDia: { leads: +(leads / diasUteis).toFixed(1), atendimentos: +(atendimentos / diasUteis).toFixed(1), visitas: +(visitas / diasUteis).toFixed(1) } };
}

export const TRILHAS = [
  {
    id: 'mentalidade', titulo: 'Rotina do corretor que vende muito', nivel: 'Base', min: 12, icone: '◆',
    licoes: [
      { t: 'Venda é consequência de atividade', p: ['Quem vende muito não tem mais sorte — tem mais conversas qualificadas por dia.', 'Defina meta de atividade, não só de resultado: contatos, visitas e propostas por dia.', 'Use o funil reverso (abaixo) para saber exatamente quantos leads você precisa.'] },
      { t: 'Blocos de tempo', p: ['08h–10h: prospecção ativa e retorno de leads novos (nunca deixe lead esfriar).', '10h–12h e 14h–17h: visitas e reuniões.', '17h–19h: follow-up — é quando o cliente responde.', 'Bloqueie 30 min/dia para estudar produto e mercado.'] },
      { t: 'Speed to lead', p: ['Lead respondido em até 5 minutos converte muito mais do que em 1 hora.', 'Ative notificações do CRM e responda primeiro com uma pergunta, não com um catálogo.'] },
    ],
    exercicio: 'Calcule seu funil reverso para a meta do mês e escreva sua agenda-padrão da semana.',
    quiz: [
      { q: 'Qual é a métrica que você controla diretamente?', o: ['Número de vendas', 'Número de atividades qualificadas', 'Preço do imóvel'], r: 1 },
      { q: 'Em quanto tempo o lead novo deve ser respondido?', o: ['Até 5 minutos', 'No mesmo dia', 'Em até 24h'], r: 0 },
    ],
  },
  {
    id: 'qualificacao', titulo: 'Qualificação RÁPIDO', nivel: 'Base', min: 15, icone: '◎',
    licoes: [
      { t: 'O método R.Á.P.I.D.O.', p: ['R — Renda: bruta familiar e se compõe com alguém.', 'Á — Aprovação: FGTS, entrada, restrições no CPF, score.', 'P — Prazo: quando quer mudar/comprar.', 'I — Imóvel ideal: quartos, vagas, bairro, lazer indispensável.', 'D — Decisor: quem mais decide junto.', 'O — Objetivo: morar, investir, upgrade.'] },
      { t: 'Perguntas que abrem', p: ['"O que te fez começar a procurar agora?" (descobre a dor e a urgência)', '"Como seria o imóvel perfeito para vocês?" (descobre critérios)', '"Se encontrarmos hoje, o que impediria de fechar?" (antecipa objeção)'] },
      { t: 'Simule antes de mostrar', p: ['Mostrar imóvel fora da capacidade de crédito queima o cliente e o seu tempo.', 'Use o simulador de crédito da plataforma antes da visita.'] },
    ],
    exercicio: 'Pegue 3 leads mornos e complete o RÁPIDO de cada um no CRM.',
    quiz: [
      { q: 'O que o "D" do RÁPIDO investiga?', o: ['Documentação', 'Decisor', 'Desconto'], r: 1 },
      { q: 'Quando fazer a simulação de crédito?', o: ['Depois da proposta', 'Antes de apresentar imóveis', 'Só na análise do banco'], r: 1 },
    ],
  },
  {
    id: 'apresentacao', titulo: 'Apresentação e visita que convertem', nivel: 'Intermediário', min: 18, icone: '▣',
    licoes: [
      { t: 'Regra das 3 opções', p: ['Âncora: uma opção acima do orçamento (dá referência de valor).', 'Alvo: a que mais combina com o perfil.', 'Alternativa: opção mais econômica.', 'O cliente escolhe entre opções, não entre comprar ou não.'] },
      { t: 'Roteiro da visita', p: ['Comece pelo lazer/ambiente mais bonito, termine na unidade.', 'Faça o cliente se imaginar: "onde ficaria a mesa de jantar de vocês?"', 'Observe sinais de compra: pergunta sobre condomínio, prazo, mobília.', 'Nunca encerre sem próximo passo marcado.'] },
      { t: 'Benefício > característica', p: ['"Varanda gourmet" é característica; "receber a família no domingo sem sair de casa" é benefício.', 'Use os argumentos gerados pelo Destrinchador de Book como base.'] },
    ],
    exercicio: 'Monte o roteiro de visita do seu principal empreendimento com 3 opções.',
    quiz: [{ q: 'Para que serve a opção âncora?', o: ['Para vender a mais cara', 'Para dar referência de valor', 'Para preencher a lista'], r: 1 }],
  },
  {
    id: 'objecoes', titulo: 'Contorno de objeções (A.C.R.)', nivel: 'Intermediário', min: 20, icone: '⟲',
    licoes: [
      { t: 'Método A.C.R.', p: ['Acolher: "Entendo, faz sentido você pensar nisso."', 'Clarificar: "O que exatamente pesa mais: X ou Y?"', 'Responder: com dado, prova social ou nova condição — e confirmar: "Isso resolve?"'] },
      { t: 'Objeção é pedido de informação', p: ['Cliente que objeta está engajado. Silêncio é pior.', 'A objeção real costuma ser a segunda — a primeira é defesa.'] },
      { t: 'Pratique', p: ['Use o Roleplay com a Elisa (escritório 3D) para treinar até automatizar as respostas.'] },
    ],
    exercicio: 'Escolha 5 objeções da matriz e grave sua resposta em áudio.',
    quiz: [{ q: 'O que vem depois de acolher a objeção?', o: ['Dar desconto', 'Clarificar', 'Mudar de assunto'], r: 1 }],
  },
  {
    id: 'fechamento', titulo: 'Negociação e fechamento', nivel: 'Avançado', min: 20, icone: '✦',
    licoes: [
      { t: 'Técnicas de fechamento', p: ['Alternativa: "Prefere entrada de X ou de Y?"', 'Resumo: recapitule tudo que o cliente disse que queria e pergunte "faz sentido seguirmos?"', 'Urgência legítima: tabela vigente, unidade específica, condição com validade real.', 'Concessão condicionada: "consigo isso se fecharmos hoje".'] },
      { t: 'Nunca dê desconto de graça', p: ['Toda concessão pede contrapartida: prazo, entrada, assinatura imediata.', 'Desconto sem troca ensina o cliente a pedir mais.'] },
      { t: 'Proposta escrita', p: ['Proposta sempre por escrito, com validade (48–72h) e unidade reservada.'] },
    ],
    exercicio: 'Reescreva sua última proposta perdida aplicando concessão condicionada.',
    quiz: [{ q: 'O que é concessão condicionada?', o: ['Dar desconto para agradar', 'Conceder algo em troca de compromisso', 'Esperar o cliente decidir'], r: 1 }],
  },
  {
    id: 'credito', titulo: 'Crédito imobiliário e repasse CEF', nivel: 'Avançado', min: 25, icone: '⌂',
    licoes: [
      { t: 'Fluxo do repasse', p: ['Simulação → análise de crédito (SICAQ) → avaliação de engenharia → conformidade → assinatura do contrato → registro em cartório → liberação.', 'Cada etapa tem SLA; atraso em uma trava a comissão no final.'] },
      { t: 'Capacidade de pagamento', p: ['Na CEF a 1ª parcela (SAC) não pode passar de ~30% da renda bruta.', 'Composição de renda com cônjuge/familiar aumenta o teto.', 'Prazo máximo limitado pela idade (idade + prazo ≤ 80 anos e 6 meses).'] },
      { t: 'Erros que derrubam o repasse', p: ['Documento ilegível ou vencido.', 'Divergência de estado civil/nome entre documentos.', 'Restrição no CPF não identificada antes.', 'Renda informal sem comprovação (extratos).'] },
    ],
    exercicio: 'Rode o simulador para seus 5 leads quentes e marque quem precisa compor renda.',
    quiz: [
      { q: 'Qual o limite usual da 1ª parcela na CEF?', o: ['50% da renda', '30% da renda', '10% da renda'], r: 1 },
      { q: 'No SAC, a parcela...', o: ['É fixa', 'Começa maior e diminui', 'Começa menor e aumenta'], r: 1 },
    ],
  },
  {
    id: 'posvenda', titulo: 'Pós-venda e indicações', nivel: 'Base', min: 10, icone: '♥',
    licoes: [
      { t: 'Cliente feliz vende por você', p: ['Peça indicação no momento de maior alegria: aprovação do crédito e entrega das chaves.', 'Mande mensagem no aniversário de compra.', 'Indicação converte várias vezes mais que lead de anúncio.'] },
    ],
    exercicio: 'Mande o script de indicação para seus 10 últimos clientes.',
    quiz: [{ q: 'Melhor momento para pedir indicação?', o: ['Na primeira visita', 'Na aprovação do crédito / entrega', 'Nunca'], r: 1 }],
  },
];

/** Personas de cliente para roleplay (usadas pela Elisa). */
export const ROLEPLAY = [
  { id: 'preco', nome: 'Sr. Roberto, 52, comerciante', perfil: 'Desconfiado, acha tudo caro, compara com outros 3 empreendimentos. Tem dinheiro mas quer sentir que ganhou na negociação.', abertura: 'Olha, gostei do apartamento, mas achei caro. O do outro lado da avenida está 40 mil mais barato.' },
  { id: 'medo', nome: 'Larissa, 29, enfermeira', perfil: 'Primeiro imóvel, renda R$ 4.200, tem FGTS de R$ 18 mil. Medo de não ser aprovada e de a parcela apertar.', abertura: 'Eu queria muito sair do aluguel, mas tenho medo de não conseguir pagar... e meu nome teve uma restrição ano passado.' },
  { id: 'conjuge', nome: 'Marcelo, 38, engenheiro', perfil: 'Decide junto com a esposa, que não veio à visita. Gostou mas usa a esposa como escudo.', abertura: 'O apartamento é ótimo, mas preciso conversar com a minha esposa antes. Ela que vai decidir.' },
  { id: 'investidor', nome: 'Dra. Camila, 45, dentista', perfil: 'Investidora, quer números: valorização, aluguel, liquidez. Tem pouco tempo e não gosta de enrolação.', abertura: 'Tenho 10 minutos. Me convença de que esse é um bom investimento comparado a deixar o dinheiro aplicado.' },
];

/** Monta texto de script substituindo variáveis. */
export function preencher(corpo, vars = {}) {
  return corpo.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null && vars[k] !== '' ? vars[k] : m));
}
