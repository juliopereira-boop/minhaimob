// Precificação automática (AVM) por kNN ponderado sobre comparáveis + liquidez estimada.
import { norm } from './match.js';

export function avaliar(alvo, comparaveis = []) {
  const pool = comparaveis.filter((c) => c.area > 0 && c.valor > 0);
  if (!pool.length || !alvo.area) return null;
  const vizinhos = pool.map((c) => {
    let d = 0;
    d += norm(c.bairro) === norm(alvo.bairro) ? 0 : norm(c.cidade) === norm(alvo.cidade) ? 1.2 : 3;
    d += Math.abs((c.quartos || 0) - (alvo.quartos || 0)) * 0.6;
    d += Math.abs(Math.log((c.area || 1) / (alvo.area || 1))) * 2.2;
    d += Math.abs((c.vagas || 0) - (alvo.vagas || 0)) * 0.3;
    const m2v = c.valor_m2 || c.valor / c.area;
    return { c, d, m2v, w: 1 / Math.pow(0.35 + d, 2) };
  }).sort((a, b) => a.d - b.d).slice(0, 8);
  const sw = vizinhos.reduce((s, v) => s + v.w, 0);
  const m2 = vizinhos.reduce((s, v) => s + v.m2v * v.w, 0) / sw;
  const varM2 = vizinhos.reduce((s, v) => s + v.w * Math.pow(v.m2v - m2, 2), 0) / sw;
  const dp = Math.sqrt(varM2);
  let ajuste = 1;
  if (alvo.vista_mar) ajuste += 0.08;
  if (alvo.andar_alto) ajuste += 0.03;
  if (alvo.lazer_completo) ajuste += 0.03;
  if (alvo.status_obra === 'lancamento') ajuste -= 0.06;
  const valor = m2 * alvo.area * ajuste;
  const diasMedio = vizinhos.reduce((s, v) => s + (v.c.dias_anunciado || 60) * v.w, 0) / sw;
  const confianca = Math.max(20, Math.min(95, 100 - vizinhos[0].d * 18 - (dp / m2) * 120 - (vizinhos.length < 4 ? 20 : 0)));
  return {
    valorSugerido: valor,
    faixa: [(m2 - dp * 0.8) * alvo.area * ajuste, (m2 + dp * 0.8) * alvo.area * ajuste],
    m2, m2Ajustado: m2 * ajuste, ajuste, dp, confianca,
    liquidezDias: Math.round(diasMedio),
    precoRapido: valor * 0.95, // vender em ~metade do tempo médio
    vizinhos: vizinhos.map((v) => ({ ...v.c, distancia: +v.d.toFixed(2), m2v: v.m2v })),
  };
}

/** Diagnóstico de estoque: unidades caras vs. mercado e paradas. */
export function diagnosticoEstoque(unidades, comparaveis) {
  return unidades.filter((u) => u.status === 'disponivel' && u.valor && u.tip?.area_privativa).map((u) => {
    const av = avaliar({ area: u.tip.area_privativa, quartos: u.tip.quartos, vagas: u.tip.vagas, bairro: u.emp?.bairro, cidade: u.emp?.cidade, status_obra: u.emp?.status_obra }, comparaveis);
    if (!av) return null;
    const gap = (u.valor / av.valorSugerido - 1) * 100;
    return { unidade: u, avaliacao: av, gap, sinal: gap > 10 ? 'acima' : gap < -8 ? 'oportunidade' : 'alinhado' };
  }).filter(Boolean).sort((a, b) => b.gap - a.gap);
}
