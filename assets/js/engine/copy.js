// Gerador de anúncios multicanal a partir dos dados do empreendimento.
import { tipologiaResumo } from './parser.js';

const brl = (n) => (n == null ? null : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const cut = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');
const tag = (s) => '#' + String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '');

export function gerarAnuncios(emp, tipologias = [], intel = {}) {
  const nome = emp.nome || 'Lançamento';
  const bairro = emp.bairro ? ` no ${emp.bairro}` : '';
  const cidade = emp.cidade || '';
  const tipTxt = tipologiaResumo(tipologias);
  const preco = brl(emp.valor_min || intel.precoEntrada);
  const lazer = (emp.lazer || []).slice(0, 5);
  const difs = (emp.diferenciais || []).slice(0, 4);
  const fgts = emp.aceita_fgts || emp.programa === 'MCMV';
  const st = { lancamento: 'Lançamento', em_obra: 'Em obras', pronto: 'Pronto para morar' }[emp.status_obra] || '';
  const args = (intel.argumentos || []).slice(0, 3);

  const instagram = [
    `${st ? st.toUpperCase() + ' · ' : ''}${nome}${bairro} ✨`,
    '',
    `🏢 ${tipTxt}`,
    lazer.length ? `🌴 ${lazer.join(' · ')}` : null,
    difs.length ? `⭐ ${difs.join(' · ')}` : null,
    preco ? `💰 A partir de ${preco}` : null,
    fgts ? '✅ Use seu FGTS' : null,
    '',
    args[0] ? `👉 ${args[0]}` : null,
    '',
    'Chama no direct ou no link da bio e receba a simulação da sua parcela em minutos.',
    '',
    [tag(nome), cidade && tag(cidade), emp.bairro && tag(emp.bairro), '#imovelnaplanta', '#apartamento', '#casapropria', fgts && '#fgts', emp.programa === 'MCMV' && '#minhacasaminhavida'].filter(Boolean).join(' '),
  ].filter((l) => l !== null).join('\n');

  const stories = [
    { frame: 1, texto: `Você ainda paga aluguel?`, visual: 'Vídeo da fachada/perspectiva com zoom lento' },
    { frame: 2, texto: `${nome}${bairro}\n${tipTxt}${preco ? `\nA partir de ${preco}` : ''}`, visual: 'Decorado: sala + varanda' },
    { frame: 3, texto: `${lazer.slice(0, 3).join(' · ') || 'Lazer completo'}\nResponda "QUERO" e receba a simulação`, visual: 'Área de lazer + sticker de pergunta' },
  ];

  const portalTitulo = cut(`${tipTxt.split(' · ')[0]}${bairro} - ${nome}${difs.includes('vista mar') ? ' - Vista mar' : ''}`, 60);
  const portalDesc = [
    `${nome}${bairro}${cidade ? `, ${cidade}` : ''}. ${st ? st + '.' : ''}`,
    '',
    `Plantas: ${tipTxt}.`,
    tipologias.length ? tipologias.map((t) => `• ${t.nome}: ${t.quartos ?? '-'} quarto(s)${t.suites ? `, ${t.suites} suíte(s)` : ''}${t.vagas ? `, ${t.vagas} vaga(s)` : ''}${t.area_privativa ? `, ${String(t.area_privativa).replace('.', ',')} m² privativos` : ''}`).join('\n') : null,
    '',
    lazer.length ? `Lazer: ${(emp.lazer || []).join(', ')}.` : null,
    difs.length ? `Diferenciais: ${(emp.diferenciais || []).join(', ')}.` : null,
    emp.condominio_estimado ? `Condomínio estimado: ${brl(emp.condominio_estimado)}.` : null,
    preco ? `Valores a partir de ${preco}.` : null,
    fgts ? 'Aceita FGTS e financiamento bancário.' : null,
    emp.previsao_entrega ? `Previsão de entrega: ${new Date(emp.previsao_entrega).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}.` : null,
    '',
    'Agende sua visita e receba uma simulação personalizada.',
  ].filter((l) => l !== null).join('\n');

  const whatsapp = `Oi, {nome}! 👋\n\nTenho uma oportunidade que combina com você:\n\n🏢 *${nome}*${bairro}\n🛏 ${tipTxt}\n${lazer.length ? `🌴 ${lazer.slice(0, 3).join(', ')}\n` : ''}${preco ? `💰 A partir de ${preco}\n` : ''}${fgts ? '✅ Aceita FGTS\n' : ''}\nQuer que eu simule a parcela para você? Leva 2 minutos.`;

  const headlines = [
    cut(nome, 30), cut(`${tipTxt.split(' · ')[0]}${bairro}`, 30), preco ? cut(`A partir de ${preco}`, 30) : 'Simule sua parcela',
    fgts ? 'Use seu FGTS na entrada' : 'Agende sua visita', cut(st || 'Condições especiais', 30),
  ];
  const descricoes = [
    cut(`${tipTxt}${lazer.length ? ` e lazer com ${lazer.slice(0, 2).join(' e ')}` : ''}. Agende sua visita.`, 90),
    cut(`${args[0] || 'Condição especial de lançamento'}. Receba a simulação em minutos.`, 90),
  ];

  const reels = [
    `0-3s: Gancho — "Quanto custa morar${bairro || ' aqui'}? Você vai se surpreender."`,
    `3-10s: Fachada e lazer (${lazer.slice(0, 3).join(', ') || 'lazer'}) com cortes rápidos.`,
    `10-20s: Tour no decorado mostrando ${difs[0] || 'a varanda'} — fale o benefício, não a característica.`,
    `20-27s: Número na tela: ${preco ? `a partir de ${preco}` : 'parcelas que cabem no bolso'}${fgts ? ' + FGTS' : ''}.`,
    '27-30s: CTA — "Comenta QUERO que eu te mando a simulação."',
  ];

  return { instagram, stories, portal: { titulo: portalTitulo, descricao: portalDesc }, whatsapp, googleAds: { headlines, descricoes }, reels };
}
