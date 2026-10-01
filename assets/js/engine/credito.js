// Motor de crédito imobiliário — espelha as funções SQL fn_capacidade_compra / fn_simular_sac.
// Valores de referência MCMV/SBPE: ajuste em PARAMS conforme normativo vigente.
export const PARAMS = {
  mcmv: [
    { faixa: 1, ate: 2850, taxa: 4.5, teto: 264000 },
    { faixa: 2, ate: 4700, taxa: 6.5, taxaCotista: 6.0, teto: 264000 },
    { faixa: 3, ate: 8600, taxa: 8.16, taxaCotista: 7.66, teto: 350000 },
    { faixa: 4, ate: 12000, taxa: 10.0, teto: 500000 },
  ],
  sbpe: 11.49,
  seguroMensal: 0.00035, // MIP+DFI aproximado sobre saldo
  taxaAdm: 25,
  pctRenda: 0.30,
  ltv: 0.80,
  prazoMax: 420,
  idadeMaxMeses: 80 * 12 + 6,
};

export function faixaMCMV(renda) {
  if (!renda) return null;
  return PARAMS.mcmv.find((f) => renda <= f.ate)?.faixa ?? null;
}
export function tetoMCMV(renda) {
  const f = PARAMS.mcmv.find((x) => x.faixa === faixaMCMV(renda));
  return f ? f.teto : null;
}
export function taxaReferencia(renda, cotista = false) {
  const f = PARAMS.mcmv.find((x) => x.faixa === faixaMCMV(renda));
  if (!f) return PARAMS.sbpe;
  return cotista && f.taxaCotista ? f.taxaCotista : f.taxa;
}
export const taxaMensal = (anual) => Math.pow(1 + anual / 100, 1 / 12) - 1;

export function prazoPorIdade(nascimento) {
  if (!nascimento) return PARAMS.prazoMax;
  const idadeMeses = (Date.now() - new Date(nascimento).getTime()) / (86400000 * 30.4375);
  return Math.max(60, Math.min(PARAMS.prazoMax, Math.floor(PARAMS.idadeMaxMeses - idadeMeses)));
}

/** Capacidade de compra a partir da renda (1ª parcela SAC ≤ % da renda). */
export function capacidade({ renda, comprometimento = 0, recursos = 0, taxaAnual, prazo = PARAMS.prazoMax, pctRenda = PARAMS.pctRenda, ltv = PARAMS.ltv, cotista = false } = {}) {
  if (!renda || renda <= 0) return null;
  const taxa = taxaAnual ?? taxaReferencia(renda, cotista);
  const i = taxaMensal(taxa);
  const n = Math.max(prazo || PARAMS.prazoMax, 12);
  const rec = Math.max(recursos || 0, 0);
  const parcela = Math.max(renda * pctRenda - (comprometimento || 0), 0);
  const pv = Math.max((parcela - PARAMS.taxaAdm) / (1 / n + i + PARAMS.seguroMensal), 0);
  const semLtv = pv + rec;
  const comLtv = ltv < 1 ? Math.min(semLtv, rec / (1 - ltv)) : semLtv;
  return {
    taxaAnual: taxa,
    taxaMensal: i * 100,
    prazo: n,
    parcelaMax: parcela,
    financiamentoMax: pv,
    imovelMax: comLtv,
    imovelMaxSemLtv: semLtv,
    entradaNecessaria: Math.max((pv / ltv) * (1 - ltv) - rec, 0),
    faixaMCMV: faixaMCMV(renda),
    tetoMCMV: tetoMCMV(renda),
    limitadoPor: rec / (1 - ltv) < semLtv ? 'entrada' : 'renda',
  };
}

export function capacidadeLead(l) {
  const renda = (l.renda_bruta || 0) + (l.renda_composta || 0);
  return capacidade({
    renda,
    comprometimento: l.comprometimento_mensal || 0,
    recursos: (l.entrada_disponivel || 0) + (l.fgts || 0) + (l.subsidio || 0),
    prazo: prazoPorIdade(l.nascimento),
    cotista: !!l.tres_anos_fgts,
  });
}

/** Simulação completa SAC ou PRICE com tabela anual. */
export function simular({ valor, entrada = 0, taxaAnual = PARAMS.sbpe, prazo = PARAMS.prazoMax, sistema = 'SAC' } = {}) {
  const pv = Math.max((valor || 0) - (entrada || 0), 0);
  const i = taxaMensal(taxaAnual);
  const n = Math.max(prazo, 1);
  let saldo = pv, total = 0, p1 = 0, pn = 0;
  const anual = [];
  const pricePmt = i > 0 ? (pv * i) / (1 - Math.pow(1 + i, -n)) : pv / n;
  let acJ = 0, acA = 0;
  for (let m = 1; m <= n; m++) {
    const juros = saldo * i;
    const amort = sistema === 'PRICE' ? pricePmt - juros : pv / n;
    const seguro = saldo * PARAMS.seguroMensal;
    const parcela = amort + juros + seguro + PARAMS.taxaAdm;
    if (m === 1) p1 = parcela;
    if (m === n) pn = parcela;
    total += parcela; acJ += juros; acA += amort;
    saldo = Math.max(saldo - amort, 0);
    if (m % 12 === 0 || m === n) { anual.push({ ano: Math.ceil(m / 12), parcela, saldo, jurosAno: acJ, amortAno: acA }); acJ = 0; acA = 0; }
  }
  return {
    sistema, valor, entrada, financiado: pv, taxaAnual, prazo: n,
    primeiraParcela: p1, ultimaParcela: pn, totalPago: total, jurosTotais: total - pv,
    rendaMinima: p1 / PARAMS.pctRenda, ltv: valor ? (pv / valor) * 100 : 0, anual,
  };
}

/** Checklist de documentação CEF por perfil. */
export function checklistDocs(l = {}) {
  const base = [
    'RG e CPF (ou CNH) de todos os compradores',
    'Certidão de nascimento ou casamento (com averbação, se houver)',
    'Comprovante de residência atualizado (até 60 dias)',
    'Declaração de IR completa + recibo (se declarante)',
    'Autorização de consulta ao SCR/Bacen assinada',
  ];
  const renda = String(l.profissao || '').toLowerCase();
  if (l.servidor_publico || /servidor|público|publico/.test(renda)) base.push('Contracheques dos últimos 3 meses');
  else if (/autônom|autonom|empres|liberal|médic|medic|advog|dentist/.test(renda)) base.push('Extratos bancários de 6 meses + DECORE ou pró-labore', 'Contrato social (se sócio)');
  else base.push('3 últimos contracheques', 'Carteira de trabalho (páginas de identificação e contrato)');
  if ((l.fgts || 0) > 0) base.push('Extrato analítico do FGTS + autorização de movimentação');
  if (l.renda_composta) base.push('Documentos de renda do segundo proponente');
  if (l.estado_civil && /casad|união|uniao/i.test(l.estado_civil)) base.push('Documentos do cônjuge (RG, CPF, renda se compuser)');
  if (faixaMCMV((l.renda_bruta || 0) + (l.renda_composta || 0))) base.push('Declaração de não possuir imóvel (enquadramento MCMV)', 'CadÚnico (se Faixa 1)');
  return base;
}
