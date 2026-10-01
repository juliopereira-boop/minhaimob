// Fala de UM agente, do ponto de vista dele: personalidade, humor, memórias, relação com
// quem está na conversa e só o que ele sabe. Uma chamada por turno — nunca a conversa inteira.
import { nome, ESTILO, AREAS, ESTRATEGIAS } from './perfis.js';
import { recuperar, textoMemoria } from './memoria.js';
import { TRILHAS, OBJECOES } from '../engine/playbook.js';

export const INTENCOES = ['cumprimentar', 'perguntar', 'responder', 'pedir_ajuda', 'oferecer_ajuda', 'ensinar', 'sugerir', 'concordar', 'discordar', 'parabenizar', 'provocar', 'desabafar', 'agradecer', 'combinar_acao', 'convidar', 'aceitar', 'recusar', 'encerrar'];

export const FALA_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['pensamento', 'mensagem', 'intencao', 'sentimento', 'encerrar', 'aprendizado', 'compromisso'],
  properties: {
    pensamento: { type: 'string', description: 'seu raciocínio privado em 1 frase curta (só o gestor vê)' },
    mensagem: { type: 'string', description: 'o que você diz agora, 1 a 3 frases faladas' },
    intencao: { type: 'string', enum: INTENCOES },
    sentimento: { type: 'number', description: 'como você está se sentindo nesta fala: -1 (irritado/abatido) a 1 (muito positivo)' },
    encerrar: { type: 'boolean', description: 'true se o assunto se resolveu ou não há mais o que dizer' },
    aprendizado: { type: 'string', description: 'algo novo e útil que VOCÊ aprendeu nesta conversa; vazio se nada' },
    compromisso: { type: 'string', description: 'ação concreta que VOCÊ se comprometeu a fazer; vazio se nenhuma' },
  },
};

const TIPO_TXT = { conversa: 'uma conversa na mesa', cafe: 'um café na copa', reuniao: 'uma reunião na Sala de Fechamento', treinamento: 'um treinamento na Sala de Treinamento', mentoria: 'uma mentoria', recado: 'um recado direto ao gestor (o humano dono da imobiliária)' };
const nivel = (v) => (v >= 0.75 ? 'muito alta' : v >= 0.55 ? 'alta' : v >= 0.4 ? 'média' : v >= 0.25 ? 'baixa' : 'muito baixa');
const pct = (v) => Math.round((v ?? 0) * 100);

export function descreverPersonalidade(p = {}) {
  return Object.entries(p).map(([k, v]) => `${k} ${nivel(v)}`).join(', ');
}
export function descreverHumor(h = {}) {
  const partes = [];
  if (h.energia < 0.35) partes.push('cansado(a)'); else if (h.energia > 0.75) partes.push('com energia');
  if (h.estresse > 0.6) partes.push('estressado(a)'); else if (h.estresse < 0.2) partes.push('tranquilo(a)');
  if (h.motivacao > 0.75) partes.push('motivado(a)'); else if (h.motivacao < 0.4) partes.push('desmotivado(a)');
  if (h.frustracao > 0.45) partes.push('frustrado(a)');
  if (h.confianca > 0.75) partes.push('confiante'); else if (h.confianca < 0.4) partes.push('inseguro(a)');
  return (partes.join(', ') || 'normal') + ` (motivação ${pct(h.motivacao)}%, energia ${pct(h.energia)}%, estresse ${pct(h.estresse)}%)`;
}
export function descreverRelacao(r) {
  if (!r) return 'conhece pouco';
  const p = [];
  p.push(r.afinidade > 0.45 ? 'gosta muito' : r.afinidade > 0.2 ? 'tem simpatia' : r.afinidade < -0.15 ? 'tem atrito' : 'relação neutra');
  if (r.confianca > 0.6) p.push('confia'); else if (r.confianca < 0.2) p.push('desconfia');
  if (r.respeito > 0.65) p.push('respeita profissionalmente');
  if (r.rivalidade > 0.3) p.push('sente rivalidade');
  return `${p.join(', ')} · ${r.interacoes || 0} interações (${r.positivas || 0} boas, ${r.negativas || 0} ruins)`;
}

/** Contexto privado do agente para um turno (nada de memórias/KPIs dos outros). */
export function montarPrompt({ agente, org, estado, relacoes, memorias, conversa, mensagens, kpi, objetivos, conhecidos = [], instrucao = '', historico = null }) {
  const outros = conversa.participantes.filter((p) => p !== agente);
  const consulta = [conversa.tema, conversa.motivo, ...mensagens.slice(-3).map((m) => m.texto)].join(' ');
  const mems = recuperar(memorias, agente, { consulta, k: 6 });
  const sobreOutros = outros.flatMap((o) => recuperar(memorias, agente, { sobre: o, tipos: ['social', 'episodica'], k: 2 })).filter((m) => !mems.includes(m));
  const est = (ESTRATEGIAS[agente] || []).find((s) => s.id === estado.estrategia);
  const transcript = (historico || mensagens).slice(-10).map((m) => `${nome(m.de)}: ${m.texto}`).join('\n') || '(ninguém falou ainda — você abre a conversa)';
  const sistema = [
    `Você é ${nome(agente)}, corretor(a) virtual da imobiliária ${org || 'MinhaImob'} (Brasil). Você é uma pessoa do time, não um assistente.`,
    `Áreas em que você é referência: ${AREAS[agente].join(', ')}. Jeito de falar: ${ESTILO[agente]}.`,
    `Personalidade (estável): ${descreverPersonalidade(estado.personalidade)}.`,
    'Regras: fale SOMENTE como você mesmo(a), em 1 a 3 frases naturais de conversa de escritório, em português do Brasil. Não narre ações, não escreva falas dos outros, não use listas.',
    'Use apenas o que você sabe (abaixo). Não invente números, clientes ou imóveis. Se não souber, pergunte ou diga que vai verificar.',
    'Você pode discordar, recusar, provocar de leve ou mudar de assunto se sua personalidade, humor e relação justificarem. Não seja bajulador(a).',
    'Não repita o que já foi dito. Quando o assunto se resolver ou começar a se repetir, encerre (encerrar=true) de forma natural.',
  ].join('\n');
  const prompt = [
    `<situacao>Você está em ${TIPO_TXT[conversa.tipo] || 'uma conversa'} com ${outros.map(nome).join(', ') || 'ninguém'}. Tema: ${conversa.tema || 'livre'}. Motivo: ${conversa.motivo || '—'}. Turno ${mensagens.length + 1} de no máximo ${conversa.max_turnos}.</situacao>`,
    `<seu_estado>Humor agora: ${descreverHumor(estado.humor)}. Ranking interno: ${estado.ranking || '—'}º. Estratégia que você está testando: ${est ? `${est.nome} (${est.dica})` : 'nenhuma'}.</seu_estado>`,
    kpi ? `<seus_numeros>${Object.entries(kpi).filter(([k, v]) => !['problemas', 'desempenho', 'ranking'].includes(k) && v != null).map(([k, v]) => `${k}=${v}`).join(', ')}${kpi.problemas?.length ? ` · problemas: ${kpi.problemas.map((p) => p.texto).join('; ')}` : ''}</seus_numeros>` : '',
    objetivos?.length ? `<seus_objetivos>${objetivos.map((o) => `${o.descricao} (atual ${o.atual ?? '—'}, alvo ${o.alvo})`).join('; ')}</seus_objetivos>` : '',
    `<o_que_voce_sente_por>${outros.map((o) => `${nome(o)}: ${o === 'gestor' ? 'é seu gestor — respeito e franqueza' : descreverRelacao(relacoes.find((r) => r.agente === agente && r.outro === o))}`).join(' | ')}</o_que_voce_sente_por>`,
    mems.length || sobreOutros.length ? `<suas_memorias>\n${[...mems, ...sobreOutros].map(textoMemoria).join('\n')}\n</suas_memorias>` : '',
    conhecidos.length ? `<fatos_publicos>${conhecidos.join(' | ')}</fatos_publicos>` : '',
    `<conversa_ate_agora>\n${transcript}\n</conversa_ate_agora>`,
    instrucao ? `<observacao>${instrucao}</observacao>` : '',
    `Agora é a sua vez, ${nome(agente)}. Responda no formato pedido.`,
  ].filter(Boolean).join('\n');
  return { sistema, prompt, memoriasUsadas: [...mems, ...sobreOutros] };
}

/** Normaliza a saída da IA (defensivo: corta, valida intenção, limita números). */
export function normalizarFala(o, agente) {
  const txt = String(o?.mensagem || '').replace(/^\s*\w+\s*:\s*/, (m) => (m.toLowerCase().includes(nome(agente).toLowerCase()) ? '' : m)).trim().slice(0, 600);
  return {
    mensagem: txt,
    intencao: INTENCOES.includes(o?.intencao) ? o.intencao : 'responder',
    sentimento: Math.max(-1, Math.min(1, Number(o?.sentimento) || 0)),
    encerrar: !!o?.encerrar,
    pensamento: String(o?.pensamento || '').slice(0, 300),
    aprendizado: String(o?.aprendizado || '').slice(0, 400),
    compromisso: String(o?.compromisso || '').slice(0, 300),
  };
}

// ---------------------------------------------------------------------------
// Modo offline: fala determinística a partir de dados reais + personalidade.
// Mantém a sociedade viva sem IA (e quando o orçamento do dia acaba).
// ---------------------------------------------------------------------------
const TRILHA_DO_TEMA = { leads: 'qualificacao', primeiro_contato: 'qualificacao', prospeccao: 'qualificacao', credito: 'credito', financiamento: 'credito', documentacao: 'credito', negociacao: 'fechamento', fechamento: 'fechamento', proposta: 'fechamento', objecoes: 'objecoes', marketing: 'marketing', anuncios: 'marketing', campanha: 'marketing', metodo: 'mentalidade', rotina: 'mentalidade', preco: 'objecoes' };
export function dicaDe(tag, seed = 0) {
  const tr = TRILHAS.find((t) => t.id === (TRILHA_DO_TEMA[tag] || tag)) || TRILHAS[0];
  const l = tr.licoes[seed % tr.licoes.length];
  return { titulo: l.t.replace(/\.$/, ''), corpo: l.p.slice(0, 2).join(' '), trilha: tr.titulo, exercicio: tr.exercicio };
}
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export function falaOffline({ agente, conversa, mensagens, estado, kpi, historico = null, instrucao = '' }) {
  const c = conversa.contexto || {};
  const n = mensagens.length;
  const minhas = mensagens.filter((m) => m.de === agente).length;
  const seed = hash(conversa.id + ':' + agente) + minhas;
  const outros = conversa.participantes.filter((p) => p !== agente);
  const alvo = outros[0];
  const A = nome(alvo);
  const G = outros.length > 1 ? 'pessoal' : A;
  const ultima = mensagens[n - 1];
  const souIniciador = agente === conversa.iniciador;
  const p = estado.personalidade || {};
  const h = estado.humor || {};
  const meuProblema = kpi?.problemas?.[0];
  const tag = c.tag || AREAS[agente][0];
  const dica = dicaDe(AREAS[agente].includes(tag) || agente === 'elisa' || ['compartilhar', 'treinamento'].includes(c.kind) ? tag : AREAS[agente][0], seed);
  const ditos = new Set([...(historico || []), ...mensagens].map((m) => m.texto));
  const escolhe = (arr) => { for (let i = 0; i < arr.length; i++) { const t = arr[(seed + i) % arr.length]; if (!ditos.has(t)) return t; } return arr[seed % arr.length]; };
  const fim = n >= conversa.max_turnos - 1;
  const r = (mensagem, intencao, sentimento = 0.3, extra = {}) => ({ mensagem, intencao, sentimento, encerrar: !!extra.encerrar, pensamento: extra.pensamento || '', aprendizado: extra.aprendizado || '', compromisso: extra.compromisso || '' });
  const convite = /CONVIDANDO/.test(instrucao);
  const recusar = /decidiu NÃO/.test(instrucao);
  const jaConvidou = n === 0 && (historico?.length || 0) > 0;

  if (recusar) return r(escolhe([`Agora não consigo, ${A}. Depois a gente vê isso.`, `${A}, tô no meio de uma coisa aqui. Fica pra outra hora?`, 'Agora não dá, desculpa.']), 'recusar', -0.1, { encerrar: true, pensamento: instrucao.replace(/.*\(([^)]*)\).*/, 'Não é a hora: $1.') });

  if (conversa.tipo === 'recado') {
    if (souIniciador && n === 0) return r(`${c.texto || 'Gestor, queria te atualizar.'}${c.sugestao ? ` ${c.sugestao.charAt(0).toUpperCase() + c.sugestao.slice(1)}` : ''}`, 'sugerir', 0.1, { pensamento: 'O gestor precisa saber disso para decidir.' });
    if (ultima?.de === 'gestor') return r(escolhe(['Entendido, vou seguir assim e te aviso o resultado.', 'Combinado. Começo agora e te atualizo no fim do dia.', 'Certo, faz sentido. Já começo por aí.']), 'combinar_acao', 0.5, { encerrar: true, compromisso: `seguir a orientação do gestor: ${ultima.texto.slice(0, 140)}` });
    return r('Fico no aguardo da sua orientação.', 'encerrar', 0, { encerrar: true });
  }

  if (convite) {
    const onde = { cafe: 'um café na copa', reuniao: 'uma reunião rápida na Sala de Fechamento', treinamento: 'um treino rápido na sala de treinamento' }[conversa.tipo] || 'uma conversa';
    if (c.kind === 'comemorar') return r(`${G}, ${c.evento || 'saiu venda'}! Bora ${onde} pra comemorar?`, 'convidar', 0.8);
    if (conversa.tipo === 'cafe') return r(escolhe([`${G}, bora ${onde}? Preciso de 10 minutos longe da tela.`, `Café, ${G}? Daqui a pouco, na copa.`]), 'convidar', 0.5);
    return r(`${G}, daqui a pouco ${onde}: ${c.texto || c.problema || conversa.tema}. Pode ser?`, 'convidar', 0.2, { pensamento: conversa.motivo || '' });
  }

  if (n === 0) {
    switch (c.kind) {
      case 'pedir_ajuda': return r(`${A}, tem um minuto? Estou com ${c.problema || 'uma dificuldade'} e você manja de ${c.tag}. Como você faria?`, 'pedir_ajuda', 0, { pensamento: `${A} é referência nisso; melhor perguntar do que errar.` });
      case 'oferecer_ajuda': return r(`${A}, vi que ${c.problema || 'a sua fila apertou'}. Se quiser, te passo como eu tenho feito — me dá 5 minutos?`, 'oferecer_ajuda', 0.4, { pensamento: 'Ajudar agora evita que vire problema do time.' });
      case 'cafe': return r(escolhe([`E aí, ${G}, como está o dia?`, `Ufa, precisava disso. Como estão as coisas, ${G}?`]), 'cumprimentar', 0.5);
      case 'comemorar': return r(`Então, ${G}: ${c.evento || 'fechamos mais uma'}. ${p.extroversao > 0.6 ? 'Que dia!' : 'Bom sinal para o mês.'}`, 'parabenizar', 0.8);
      case 'ranking': return r(p.competitividade > 0.7 ? `${A}, você passou na minha frente no ranking. O que você mudou? Quero entender — e recuperar.` : `${A}, parabéns pela posição no ranking. O que tem funcionado pra você?`, p.competitividade > 0.7 ? 'provocar' : 'perguntar', 0.1);
      case 'compartilhar': return r(`${A}, aprendi uma coisa que pode te ajudar: ${c.aprendizado || dica.titulo}.`, 'sugerir', 0.5);
      case 'reuniao': return r(`${jaConvidou ? 'Obrigado por virem. ' : ''}Chamei vocês porque ${c.texto || 'temos um padrão se repetindo'}. Quero sair daqui com uma ação de cada um.`, 'sugerir', 0.1);
      case 'treinamento': return r(`${jaConvidou ? 'Vamos lá. ' : `${A}, `}${c.ordem ? 'o gestor pediu e eu concordo: ' : ''}hoje o tema é ${conversa.tema}. ${c.problema && !jaConvidou ? `Vi que ${c.problema}. ` : ''}Me conta: o que está mais difícil pra você nisso?`, 'perguntar', 0.4);
      default: return r(`${A}, ${c.texto || conversa.motivo || conversa.tema || 'queria alinhar uma coisa com você'}.`, 'perguntar', 0.2);
    }
  }

  if (fim) {
    const comp = c.kind === 'reuniao' && souIniciador ? 'acompanhar as ações combinadas na reunião' : souIniciador ? `aplicar "${dica.titulo}" nos próximos atendimentos` : '';
    return r(souIniciador && c.kind === 'reuniao' ? 'Fechado: cada um executa o que falou e a gente revisa amanhã cedo.' : escolhe(['Fechado. Vou aplicar e te conto como foi.', 'Combinado, valeu pela conversa.', 'Perfeito, cada um sabe o próximo passo.']), 'encerrar', 0.5, { encerrar: true, compromisso: comp });
  }
  const pergunta = ultima && /\?\s*$/.test(ultima.texto);
  switch (c.kind) {
    case 'pedir_ajuda':
      if (!souIniciador) return minhas === 0 ? r(`${dica.titulo}. ${dica.corpo}`, 'ensinar', 0.4, { pensamento: 'Vou passar o que funciona, sem enrolar.' }) : r(`Na prática: ${dica.exercicio}`, 'ensinar', 0.4);
      return minhas < 2 ? r(escolhe(['Faz sentido. E se o cliente não responder?', 'Entendi. Tem algum exemplo prático?']), 'perguntar', 0.4) : r('Boa. Vou testar isso hoje mesmo, valeu!', 'agradecer', 0.6, { aprendizado: `${dica.titulo} — ${dica.corpo}`, encerrar: true });
    case 'oferecer_ajuda':
      if (!souIniciador && minhas === 0) return h.estresse > 0.6 || p.autoconfianca > 0.8 ? r('Agradeço, mas acho que dou conta. Se apertar eu te chamo.', 'recusar', -0.1, { encerrar: true, pensamento: 'Prefiro resolver sozinho(a) agora.' }) : r('Quero sim. O que você tem feito?', 'aceitar', 0.4);
      if (souIniciador) return r(minhas === 1 ? `${dica.titulo}. ${dica.corpo}` : `E um exercício: ${dica.exercicio}`, 'ensinar', 0.5);
      return r('Valeu! Vou aplicar no próximo lead.', 'agradecer', 0.6, { aprendizado: `${dica.titulo} (dica de ${A})`, encerrar: true });
    case 'cafe':
    case 'comemorar': {
      if (c.kind === 'comemorar' && !souIniciador && minhas === 0) return r(escolhe([`Boa demais! Qual foi o argumento que fechou?`, `Parabéns, time! Isso anima a semana.`, `Que notícia boa. Bora manter o ritmo.`]), pergunta ? 'parabenizar' : 'parabenizar', 0.7);
      if (c.kind === 'comemorar' && souIniciador && pergunta) { const d2 = dicaDe('fechamento', seed); return r(`O que pesou foi: ${d2.titulo.toLowerCase()}. ${d2.corpo}`, 'ensinar', 0.6); }
      const assunto = meuProblema ? `meu dia está puxado: ${meuProblema.texto}` : 'hoje rendeu, meus números estão em dia';
      return r(minhas === 0 ? escolhe([`Sinceramente? ${assunto.charAt(0).toUpperCase() + assunto.slice(1)}.`, `Do meu lado, ${assunto}. E vocês?`]) : escolhe(meuProblema ? [`Vou atacar isso depois do café. ${p.colaboracao > 0.6 ? 'Se alguém tiver dica, aceito.' : ''}`.trim(), 'Bom, deixa eu voltar que a fila não para.'] : ['Bom dar uma respirada. Voltando com a cabeça mais leve.', 'Valeu pelo café, bora voltar.']), meuProblema && minhas === 0 ? 'desabafar' : 'responder', meuProblema ? 0.1 : 0.5, { encerrar: minhas >= 1 && n >= 3 });
    }
    case 'ranking':
      if (!souIniciador) return r(`Nada mágico: ${dica.titulo.toLowerCase()}. ${p.competitividade > 0.7 ? 'Mas não vou facilitar, hein.' : 'Se quiser, te mostro.'}`, 'responder', 0.3);
      return r(p.competitividade > 0.7 ? 'Vou testar. Semana que vem a gente vê quem está na frente.' : 'Valeu pela dica.', 'agradecer', 0.3, { aprendizado: `${A} está subindo no ranking com: ${dica.titulo}`, encerrar: true });
    case 'compartilhar':
      if (!souIniciador) return minhas === 0 ? r(p.abertura > 0.6 ? 'Interessante. Como você aplicou isso?' : 'Hum, não sei se funciona no meu caso. Por quê?', p.abertura > 0.6 ? 'perguntar' : 'discordar', p.abertura > 0.6 ? 0.4 : 0) : r('Vou testar e te digo.', 'agradecer', 0.4, { aprendizado: c.aprendizado || dica.titulo, encerrar: true });
      return r(`Apliquei no meu dia a dia: ${dica.corpo}`, 'ensinar', 0.4);
    case 'treinamento':
      if (souIniciador) {
        const obj = /objec|preco|caro/.test(tag) ? OBJECOES[seed % OBJECOES.length] : null;
        if (obj && minhas % 2) return r(`Quando o cliente disser "${obj.objecao}", responda assim: ${obj.resposta}`, 'ensinar', 0.5);
        return r(minhas >= 3 ? `Exercício para hoje: ${dica.exercicio}` : `${dica.titulo}. ${dica.corpo}`, 'ensinar', 0.5);
      }
      return minhas === 0 ? r(meuProblema ? `O mais difícil: ${meuProblema.texto}. Não sei por onde começar.` : 'Sinto que perco tempo com quem não vai comprar.', 'desabafar', 0, { pensamento: 'Melhor ser honesto(a) sobre a dificuldade.' })
        : r(escolhe(['Entendi. Na prática, como eu começo amanhã cedo?', 'Isso muda minha abordagem. Posso testar com os leads de hoje?', 'Faz sentido. E se o cliente travar?']), 'perguntar', 0.5, { aprendizado: minhas >= 1 ? `${dicaDe(tag, hash(conversa.id + ':' + conversa.iniciador) + minhas - 1).titulo}` : '' });
    case 'reuniao':
      if (minhas > 0) return r(`Fechado, eu fico com ${AREAS[agente][0]}.`, 'combinar_acao', 0.3, { compromisso: meuProblema ? `resolver: ${meuProblema.texto}` : `apoiar o time em ${AREAS[agente][0]}` });
      return r(meuProblema ? `Do meu lado: ${meuProblema.texto}. Proponho atacar isso primeiro.` : `Do meu lado está sob controle. Posso ajudar com ${AREAS[agente][0]}.`, meuProblema ? 'sugerir' : 'oferecer_ajuda', 0.2, { compromisso: meuProblema ? `resolver: ${meuProblema.texto}` : '' });
    default:
      return r(souIniciador ? 'Perfeito, era isso. Valeu!' : `Do meu lado: ${meuProblema ? meuProblema.texto : 'tudo em dia'}.`, souIniciador ? 'agradecer' : 'responder', 0.3, { encerrar: souIniciador && n >= 2 });
  }
}

/**
 * Gera a próxima fala de `agente`. `ia(params)` é a chamada de IA (ou null).
 * `gastar(tokens)` → boolean (orçamento). Retorna fala normalizada + usou_ia + tokens.
 */
export async function falar(params, { ia, gastar } = {}) {
  const { agente } = params;
  if (ia) {
    const { sistema, prompt } = montarPrompt(params);
    const estimativa = Math.ceil((sistema.length + prompt.length + 2500) / 3.5) + 250;
    if (!gastar || (await gastar(estimativa))) {
      try {
        const o = await ia({ system: sistema, prompt, schema: FALA_SCHEMA, schemaName: 'fala', agente });
        const f = normalizarFala(o, agente);
        if (f.mensagem) return { ...f, usou_ia: true, tokens: estimativa };
      } catch (e) { console.warn('[sociedade] fala com IA falhou, usando offline', e.message || e); }
    } else params.semOrcamento = true;
  }
  return { ...normalizarFala(falaOffline(params), agente), usou_ia: false, tokens: 0 };
}
