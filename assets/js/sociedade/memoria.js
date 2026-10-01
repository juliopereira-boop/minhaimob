// Memória dos agentes: episódica, semântica, social, operacional, reflexões e estratégias.
// Recuperação seletiva = importância × recência × relevância (nunca o histórico inteiro).
const TAU_DIAS = { episodica: 5, social: 45, semantica: 120, reflexao: 150, estrategia: 90, operacional: 20 };
const STOP = new Set('para com uma que não nao mais por dos das num numa como isso essa esse está esta foi ser ter tem vou você voce ele ela eles elas meu minha seu sua nos nós aos pelo pela sobre entre quando onde porque muito pouco ainda já ja hoje'.split(' '));

export const termos = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));

/** Importância efetiva com esquecimento: o banal decai, o importante permanece. */
export function importanciaEfetiva(m, agora = Date.now()) {
  const d = (agora - new Date(m.created_at).getTime()) / 864e5;
  const imp = (m.importancia || 3) / 10;
  if (m.tipo === 'operacional' && m.status === 'concluida') return imp * 0.2;
  const tau = TAU_DIAS[m.tipo] || 10;
  const reforco = Math.min(0.3, (m.acessos || 0) * 0.03);
  return Math.min(1, (imp >= 0.75 ? imp : imp * Math.exp(-d / tau)) + reforco);
}

export function recuperar(memorias, agente, { consulta = '', sobre = null, tipos = null, k = 5, agora = Date.now() } = {}) {
  const q = new Set(termos(consulta));
  return memorias
    .filter((m) => m.agente === agente && m.status !== 'esquecida' && (!tipos || tipos.includes(m.tipo)))
    .map((m) => {
      const horas = (agora - new Date(m.created_at).getTime()) / 36e5;
      const rec = Math.exp(-horas / ((TAU_DIAS[m.tipo] || 10) * 24));
      const ws = termos(m.conteudo + ' ' + (m.tags || []).join(' '));
      const rel = q.size ? ws.filter((w) => q.has(w)).length / Math.max(3, q.size) : 0;
      const so = sobre && m.sobre === sobre ? 0.35 : 0;
      return { m, s: 0.45 * importanciaEfetiva(m, agora) + 0.2 * rec + 0.35 * Math.min(1, rel) + so };
    })
    .sort((a, b) => b.s - a.s).slice(0, k).map((x) => x.m);
}

export const textoMemoria = (m) => `- [${m.tipo}${m.sobre ? ` · ${m.sobre}` : ''}] ${m.conteudo}`;

/** Similaridade de Jaccard entre textos (detecção de repetição em conversas). */
export function similaridade(a, b) {
  const A = new Set(termos(a)), B = new Set(termos(b));
  if (!A.size || !B.size) return 0;
  let i = 0; A.forEach((w) => B.has(w) && i++);
  return i / (A.size + B.size - i);
}
