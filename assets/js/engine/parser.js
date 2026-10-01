// ============================================================================
// Destrinchador de Book — extração de texto (PDF/OCR) + parser semântico
// de material de vendas imobiliário brasileiro + inteligência comercial.
// ============================================================================
import { simular, taxaReferencia, faixaMCMV, PARAMS } from './credito.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs';
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

// ---------------------------------------------------------------------------
// 1) EXTRAÇÃO DE TEXTO
// ---------------------------------------------------------------------------
let _pdfjs, _tess;
async function pdfjs() {
  if (!_pdfjs) { _pdfjs = await import(PDFJS); _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; }
  return _pdfjs;
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function tesseract() {
  if (!_tess) { await loadScript(TESSERACT); _tess = await window.Tesseract.createWorker('por'); }
  return _tess;
}

/** Reconstrói linhas a partir dos itens posicionados do pdf.js. */
function pageItemsToText(items) {
  const rows = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = it.transform[5], x = it.transform[4], hgt = Math.abs(it.transform[3]) || 10;
    let row = rows.find((r) => Math.abs(r.y - y) < Math.max(2.5, hgt * 0.45));
    if (!row) { row = { y, h: hgt, parts: [] }; rows.push(row); }
    row.parts.push({ x, s: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => {
    r.parts.sort((a, b) => a.x - b.x);
    let line = '', lastEnd = null;
    for (const p of r.parts) {
      if (lastEnd != null && p.x - lastEnd > r.h * 2.2) line += '  |  ';
      else if (lastEnd != null && p.x - lastEnd > 1 && !line.endsWith(' ') && !p.s.startsWith(' ')) line += ' ';
      line += p.s; lastEnd = p.x + p.w;
    }
    return line.trim();
  }).join('\n');
}

/**
 * Extrai texto de PDF, imagem ou texto puro.
 * onProgress({etapa, pagina, total, msg})
 */
export async function extractText(file, onProgress = () => {}, { ocr = true, maxOcrPages = 40 } = {}) {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  if (type.startsWith('text/') || /\.(txt|md|csv|html?)$/.test(name)) {
    onProgress({ etapa: 'texto', msg: 'Lendo texto' });
    let t = await file.text();
    if (/\.html?$/.test(name)) t = new DOMParser().parseFromString(t, 'text/html').body.innerText;
    return { text: t, paginas: 1, metodo: 'texto', ocrPaginas: 0 };
  }
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|bmp)$/.test(name)) {
    onProgress({ etapa: 'ocr', pagina: 1, total: 1, msg: 'Lendo imagem com OCR' });
    const w = await tesseract();
    const { data } = await w.recognize(file);
    return { text: data.text, paginas: 1, metodo: 'ocr', ocrPaginas: 1 };
  }
  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const lib = await pdfjs();
    const buf = await file.arrayBuffer();
    const doc = await lib.getDocument({ data: buf }).promise;
    const out = [];
    let ocrPaginas = 0;
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress({ etapa: 'pdf', pagina: p, total: doc.numPages, msg: `Lendo página ${p}/${doc.numPages}` });
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      let t = pageItemsToText(tc.items);
      if (t.replace(/\s/g, '').length < 40 && ocr && ocrPaginas < maxOcrPages) {
        onProgress({ etapa: 'ocr', pagina: p, total: doc.numPages, msg: `Página ${p} é imagem — OCR` });
        const vp = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        const w = await tesseract();
        const { data } = await w.recognize(canvas);
        t = data.text; ocrPaginas++;
      }
      out.push(`\n=== Página ${p} ===\n${t}`);
    }
    return { text: out.join('\n'), paginas: doc.numPages, metodo: ocrPaginas ? 'pdf+ocr' : 'pdf', ocrPaginas };
  }
  throw new Error('Formato não suportado. Envie PDF, imagem (JPG/PNG) ou texto.');
}

// ---------------------------------------------------------------------------
// 2) NORMALIZAÇÃO E UTILITÁRIOS
// ---------------------------------------------------------------------------
const WORDNUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, 'três': 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 };
const NUMW = '(\\d{1,2}|um|uma|dois|duas|tr[eê]s|quatro|cinco|seis)';
const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };

const toInt = (s) => { if (s == null) return null; const k = String(s).toLowerCase().trim(); return WORDNUM[k] ?? (isNaN(+k) ? null : parseInt(k, 10)); };
const strip = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function normalize(t) {
  return String(t || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[   \t]/g, ' ')
    .replace(/[“”]/g, '"').replace(/[‘’´`]/g, "'").replace(/[–—]/g, '-')
    .replace(/(\d)\s?m\s?(?:2|²|\^2)(?!\d)/gi, '$1 m²')
    .replace(/metros quadrados/gi, 'm²')
    .replace(/(\d)\s*,\s*(\d)/g, '$1,$2')
    .replace(/R\s*\$\s*/g, 'R$ ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');
}

/** "58,40" → 58.4 | "1.250,00" → 1250 | "58.40" → 58.4 (área) */
function parseArea(s) {
  s = String(s).trim();
  if (/^\d{1,3}\.\d{1,2}$/.test(s)) return parseFloat(s);
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}
/** Dinheiro BR: "389.900,00" → 389900 | "389,9 mil" → 389900 | "1,2 milhão" → 1200000 */
function parseMoney(numStr, mult) {
  let s = String(numStr).trim();
  let n;
  if (mult) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  else if (/,\d{1,2}$/.test(s)) n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  else n = parseFloat(s.replace(/\./g, '').replace(',', ''));
  if (isNaN(n)) return null;
  const m = strip(mult || '');
  if (m.startsWith('mil') && !m.startsWith('milh')) n *= 1e3;
  else if (m.startsWith('milh') || m === 'mi' || m === 'mm') n *= 1e6;
  else if (m === 'k') n *= 1e3;
  return n;
}
function titleCase(s) {
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e', "d'", 'em']);
  return s.toLowerCase().split(/\s+/).map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
    .replace(/D'([a-z])/g, (m, c) => "d'" + c.toUpperCase());
}
const uniq = (arr) => [...new Set(arr.filter(Boolean))];
const field = (value, conf, fonte) => ({ value, conf, fonte });

// ---------------------------------------------------------------------------
// 3) DICIONÁRIOS
// ---------------------------------------------------------------------------
export const LAZER_DICT = [
  ['piscina adulto', /piscina\s+(adulto|adulta|principal)/],
  ['piscina infantil', /piscina\s+infantil|piscina\s+kids/],
  ['piscina aquecida', /piscina\s+(coberta\s+e\s+)?aquecida/],
  ['piscina com raia', /piscina\s+(com\s+)?raia|raia\s+de\s+\d+/],
  ['borda infinita', /borda\s+infinita/],
  ['deck molhado', /deck\s+molhado|prainha/],
  ['piscina', /\bpiscinas?\b/],
  ['academia', /academia|fitness|espa[cç]o\s+fit|\bgym\b/],
  ['espaço gourmet', /espa[cç]o\s+gourmet|gourmet\s+(space|club)|sal[aã]o\s+gourmet/],
  ['churrasqueira', /churrasqueira|espa[cç]o\s+churrasco|\bbbq\b|parrilla/],
  ['salão de festas', /sal[aã]o\s+de\s+festas?|espa[cç]o\s+de\s+eventos|party\s*room/],
  ['salão de jogos', /sal[aã]o\s+de\s+jogos|game\s*room|espa[cç]o\s+gamer|sala\s+de\s+jogos/],
  ['brinquedoteca', /brinquedoteca|espa[cç]o\s+kids|kids\s+club/],
  ['playground', /playground|parquinho/],
  ['quadra poliesportiva', /quadra\s+poliesportiva|quadra\s+esportiva|quadra\s+multiuso/],
  ['quadra de tênis', /quadra\s+de\s+t[eê]nis/],
  ['beach tennis', /beach\s*tennis|quadra\s+de\s+areia/],
  ['quadra de squash', /squash/],
  ['campo de futebol', /campo\s+de\s+futebol|campinho|society/],
  ['pista de cooper', /pista\s+de\s+(cooper|caminhada|corrida)|cooper/],
  ['bicicletário', /biciclet[aá]rio|bike\s+(sharing|station)/],
  ['pet place', /pet\s*(place|care|park|play)|espa[cç]o\s+pet|cachorr[oó]dromo/],
  ['espaço zen', /espa[cç]o\s+zen|yoga|medita[cç][aã]o|pilates/],
  ['sauna', /sauna/],
  ['spa', /\bspa\b/],
  ['hidromassagem', /hidromassagem|ofur[oô]|jacuzzi/],
  ['cinema', /cinema|home\s*theater|sala\s+de\s+cinema/],
  ['coworking', /coworking|co-working|espa[cç]o\s+de\s+trabalho|business\s+center|sala\s+de\s+reuni/],
  ['lavanderia', /lavanderia/],
  ['mini mercado', /mini\s*mercado|market|minimercado|conveni[eê]ncia/],
  ['espaço beleza', /espa[cç]o\s+beleza|sal[aã]o\s+de\s+beleza|beauty/],
  ['praça', /\bpra[cç]as?\b/],
  ['redário', /red[aá]rio/],
  ['fire place', /fire\s*place|lareira|fogo\s+de\s+ch[aã]o/],
  ['horta', /horta|pomar/],
  ['rooftop', /rooftop|roof\s+top|terra[cç]o\s+panor[aâ]mico/],
  ['lounge', /lounge/],
  ['adega', /adega|wine\s+bar/],
  ['espaço teen', /espa[cç]o\s+teen|teen\s+club/],
  ['solarium', /sol[aá]rium|solarium/],
  ['heliponto', /heliponto/],
  ['car wash', /car\s*wash|lava\s*-?\s*jato/],
  ['espaço delivery', /delivery|smart\s+lockers?|arm[aá]rio\s+inteligente/],
  ['portaria 24h', /portaria\s+24|seguran[cç]a\s+24|guarita/],
  ['piquenique', /piquenique|pic\s*nic/],
];

export const DIFERENCIAIS_DICT = [
  ['vista mar', /vista\s+(para\s+o\s+|pro\s+)?mar|vista\s+da\s+ba[ií]a/],
  ['frente mar', /frente\s+(para\s+o\s+)?mar|p[eé]\s+na\s+areia|beira\s*-?\s*mar/],
  ['varanda gourmet', /(varanda|sacada|terra[cç]o)\s+gourmet/],
  ['varanda', /\bvaranda|\bsacada/],
  ['fechadura digital', /fechadura\s+(digital|eletr[oô]nica|biom[eé]trica)/],
  ['automação residencial', /automa[cç][aã]o|casa\s+inteligente|smart\s+home/],
  ['energia solar', /energia\s+solar|fotovoltaic|placas?\s+solares/],
  ['gerador', /gerador/],
  ['infra para ar-condicionado', /infra(estrutura)?\s+(para\s+)?(ar|split)|ponto\s+(para\s+)?(ar|split)/],
  ['aquecimento a gás/solar', /aquecimento\s+(a\s+g[aá]s|solar|central)|aquecedor/],
  ['medição individualizada', /medi[cç][aã]o\s+individual|hidr[oô]metro\s+individual|g[aá]s\s+individual/],
  ['porcelanato', /porcelanato/],
  ['pé-direito duplo', /p[eé]\s*-?\s*direito\s+(duplo|alto)/],
  ['carregador de carro elétrico', /carro\s+el[eé]trico|ve[ií]culo\s+el[eé]trico|recarga\s+el[eé]trica/],
  ['depósito privativo', /dep[oó]sito\s+privativo|hobby\s*box/],
  ['home office', /home\s*office/],
  ['closet', /closet/],
  ['cozinha integrada', /cozinha\s+(americana|integrada)/],
  ['lavabo', /lavabo/],
  ['nascente', /nascente|sol\s+da\s+manh[aã]/],
  ['ventilação cruzada', /ventila[cç][aã]o\s+cruzada/],
  ['reúso de água', /re[uú]so\s+de\s+[aá]gua|capta[cç][aã]o\s+de\s+[aá]gua/],
  ['CFTV / câmeras', /cftv|c[aâ]meras|monitoramento/],
  ['portaria remota', /portaria\s+(remota|virtual|inteligente)/],
  ['condomínio clube', /condom[ií]nio\s+clube|clube\s+completo|lazer\s+completo/],
  ['ITBI e registro grátis', /itbi\s+(e\s+registro\s+)?(gr[aá]tis|gratuito|incluso)|documenta[cç][aã]o\s+gr[aá]tis/],
  ['mobiliado / decorado', /mobiliad|decorad|entregue\s+equipad/],
  ['elevador', /elevador/],
  ['área privativa / garden', /garden|[aá]rea\s+privativa\s+descoberta|quintal/],
];

const BAIRROS_CONHECIDOS = [
  "Ponta d'Areia", 'Ponta da Areia', 'Calhau', 'Altos do Calhau', 'Renascença', 'Jardim Renascença', 'Cohama', 'Turu', 'Cohafuma',
  'Vinhais', 'Recanto dos Vinhais', "Olho d'Água", 'Araçagi', 'Ponta do Farol', 'São Francisco', 'Península', 'Jardim Eldorado',
  'Cohajap', 'Bequimão', 'Angelim', 'Maranhão Novo', 'Forquilha', 'São Cristóvão', 'Cidade Operária', 'Cohatrac', 'Vicente Fialho',
  'Monte Castelo', 'Centro', 'Lagoa da Jansen', 'Quintas do Calhau', 'Planalto Turu', 'Parque Shalon', 'Raposa', 'São José de Ribamar',
];

const NAME_STOP = /^(lazer|plantas?|localiza[cç][aã]o|diferenciais|tipo|apartamentos?|ficha t[eé]cnica|implanta[cç][aã]o|perspectiva|imagens?|ilustra|condi[cç][oõ]es|tabela|pagamento|contato|venda|vendas|sobre|realiza[cç][aã]o|incorpora|constru|endere[cç]o|p[aá]gina|quartos?|su[ií]tes?|vagas?|m²|area|[aá]rea|valores|pre[cç]o|entrega|lan[cç]amento|breve|novo|exclusivo|o seu|seu|sua|viva|more|bem-vindo|conhe[cç]a)\b/i;

// ---------------------------------------------------------------------------
// 4) EXTRATORES
// ---------------------------------------------------------------------------
function extrairNome(text, lines) {
  const cand = new Map();
  const add = (raw, w, pos) => {
    let n = raw.replace(/\s+/g, ' ').replace(/[|:•\-–,.;]+$/g, '').trim();
    if (n.length < 4 || n.length > 60 || NAME_STOP.test(n) || /\d{3,}/.test(n)) return;
    if (n === n.toUpperCase()) n = titleCase(n);
    const k = strip(n);
    const prev = cand.get(k) || { nome: n, score: 0, fonte: raw };
    prev.score += w * (1 + Math.max(0, 1 - pos / Math.max(text.length, 1)) * 1.5);
    cand.set(k, prev);
  };
  const pre = /\b(Residencial|Edif[ií]cio|Condom[ií]nio|Parque|Vila|Jardim|Reserva|Villaggio|Solar|Mirante|Torres?|Living|Res\.)[ \t]+((?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*|d[aeo]s?|de|of|the|by)(?:[ \t]+(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*|d[aeo]s?|de|of|the|by)){0,4})/g;
  let m;
  while ((m = pre.exec(text))) add(`${m[1]} ${m[2]}`.replace(/\s+(d[aeo]s?|de|of|the|by)$/i, ''), 3, m.index);
  const suf = /\b((?:[A-ZÀ-Ý][\wÀ-ÿ'’]+[ \t]+){0,3}[A-ZÀ-Ý][\wÀ-ÿ'’]+)[ \t]+(Residence|Residences|Tower|Towers|Home|Homes|Park|Life|Prime|Club|Gardens?|Square|Concept|Exclusive|Style|Living|Village|Studios?|Boulevard|Premium|Mall|Office|Business|Condominium)\b/g;
  while ((m = suf.exec(text))) add(`${m[1]} ${m[2]}`, 3, m.index);
  const SUF_UP = /\b((?:[A-ZÀ-Ý]{2,}[ \t]+){0,3}[A-ZÀ-Ý]{2,})[ \t]+(RESIDENCE|RESIDENCES|TOWER|TOWERS|HOME|HOMES|PARK|LIFE|PRIME|CLUB|GARDENS?|SQUARE|CONCEPT|EXCLUSIVE|LIVING|VILLAGE|BOULEVARD|PREMIUM)\b/g;
  while ((m = SUF_UP.exec(text))) add(`${m[1]} ${m[2]}`, 3, m.index);
  // Linhas em caixa alta no início do material
  let pos = 0;
  for (const ln of lines.slice(0, 60)) {
    const l = ln.replace(/===.*===/, '').trim();
    if (/^[A-ZÀ-Ý0-9'’&\s.-]{5,48}$/.test(l) && /[A-ZÀ-Ý]{3,}/.test(l) && l.split(/\s+/).length <= 6 && l.split(/\s+/).length >= 1) add(l, 1.4, pos);
    pos += ln.length + 1;
  }
  const best = [...cand.values()].sort((a, b) => b.score - a.score)[0];
  if (!best) return field(null, 0);
  return field(best.nome, Math.min(0.95, 0.35 + best.score / 10), best.fonte);
}

function extrairConstrutora(text) {
  const kwRe = /(incorpora[cç][aã]o(?:\s+e\s+constru[cç][aã]o)?|incorporadora|realiza[cç][aã]o|constru[cç][aã]o|construtora|uma\s+obra\s+d[ae]|um\s+empreendimento\s+d[ae]|um\s+produto\s+d[ae]|desenvolvimento)[ \t]*[:\-|]?[ \t]*/gi;
  const nameRe = /^([A-ZÀ-Ý][\wÀ-ÿ&.'’]*(?:[ \t]+(?:[A-ZÀ-Ý&][\wÀ-ÿ&.'’]*|d[aeo]s?|e)){0,4})/;
  const out = { construtora: null, incorporadora: null };
  let m;
  while ((m = kwRe.exec(text))) {
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 90);
    const nm = rest.match(nameRe);
    if (!nm) continue;
    const nome = nm[1].replace(/\s+(e|d[aeo]s?)$/i, '').trim();
    if (nome.length < 3 || /^(e|de|da|do|a|o|lazer|planta|tipo|vendas?|s[aã]o)\b/i.test(nome)) continue;
    const ctx = strip(m[1]);
    const fonte = m[0] + nm[0];
    if (/incorpora/.test(ctx) && !out.incorporadora) out.incorporadora = field(nome, 0.75, fonte);
    if (/constru|obra|realiza|empreendimento|produto|desenvolvimento/.test(ctx) && !out.construtora) out.construtora = field(nome, 0.75, fonte);
  }
  if (!out.construtora && out.incorporadora) out.construtora = { ...out.incorporadora, conf: 0.5 };
  return out;
}

function extrairLocal(text) {
  const r = {};
  const end = text.match(/\b(Rua|R\.|Avenida|Av\.?|Alameda|Al\.|Travessa|Tv\.|Estrada|Rodovia|Rod\.|Pra[cç]a|Quadra|Qd\.?|Loteamento)\s+[^\n|]{3,110}/i);
  if (end) r.endereco = field(end[0].replace(/\s{2,}/g, ' ').replace(/[|.;]+$/, '').trim(), 0.8, end[0]);
  const cid = text.match(new RegExp(`([A-ZÀ-Ý][a-zà-ÿ'’]+(?:\\s+(?:d[aeo]s?\\s+)?[A-ZÀ-Ý][a-zà-ÿ'’]+){0,3})\\s*[\\/,-]\\s*(${UFS})\\b`));
  if (cid) { r.cidade = field(cid[1].trim(), 0.85, cid[0]); r.uf = field(cid[2], 0.9, cid[0]); }
  const cep = text.match(/\b\d{5}-?\d{3}\b/);
  if (cep) r.cep = field(cep[0].replace(/(\d{5})(\d{3})/, '$1-$2'), 0.9, cep[0]);
  const bx = text.match(/bairro\s*[:\-]?\s*([A-ZÀ-Ý][\wÀ-ÿ'’ ]{2,40}?)(?=[\n,.;|-]|$)/i);
  if (bx) r.bairro = field(bx[1].trim(), 0.85, bx[0]);
  if (!r.bairro) {
    const st = strip(text);
    const hit = BAIRROS_CONHECIDOS.map((b) => ({ b, i: st.indexOf(strip(b)) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
    if (hit) r.bairro = field(hit.b, 0.7, hit.b);
  }
  if (!r.bairro && r.endereco) {
    const parts = r.endereco.value.split(/\s+-\s+|,\s*/).map((s) => s.trim());
    const cand = parts.find((p, i) => i > 0 && /^[A-ZÀ-Ý]/.test(p) && !/^\d/.test(p) && !new RegExp(`\\b(${UFS})$`).test(p) && p !== r.cidade?.value);
    if (cand) r.bairro = field(cand, 0.5, r.endereco.value);
  }
  if (!r.cidade && /s[aã]o\s+lu[ií]s/i.test(text)) { r.cidade = field('São Luís', 0.6, 'São Luís'); r.uf = r.uf || field('MA', 0.6, 'São Luís'); }
  return r;
}

function extrairEntrega(text) {
  const st = strip(text);
  let status = null;
  if (/pronto(s)?\s+para\s+morar|imove(l|is)\s+prontos?|entregue|pronta\s+entrega|chaves\s+na\s+m[aã]o/.test(st)) status = field('pronto', 0.85);
  else if (/em\s+obras?|em\s+constru[cç][aã]o|obras\s+(aceleradas|iniciadas|em\s+andamento)|\d{1,3}\s*%\s*(da\s+obra|conclu|executad)/.test(st)) status = field('em_obra', 0.8);
  else if (/pre-?\s*lan[cç]amento|breve\s+lan[cç]amento|lan[cç]amento/.test(st)) status = field('lancamento', 0.75);
  const re = /(entrega|previs[aã]o\s+de\s+entrega|conclus[aã]o|pronto\s+em|chaves\s+em|t[eé]rmino\s+da\s+obra)[^\n\d]{0,25}?((\d{1,2})\s*\/\s*(\d{4})|(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?\s*(?:\/|de)?\s*(\d{4})|(\d)\s*[ºo°]?\s*semestre\s*(?:de)?\s*(\d{4})|(\d{4}))/i;
  const m = text.match(re);
  let prev = null;
  if (m) {
    if (m[3]) prev = `${m[4]}-${String(m[3]).padStart(2, '0')}`;
    else if (m[5]) prev = `${m[6]}-${String(MESES[strip(m[5]).slice(0, 3)]).padStart(2, '0')}`;
    else if (m[7]) prev = `${m[8]}-${m[7] === '1' ? '06' : '12'}`;
    else if (m[9]) prev = m[9];
    prev = field(prev, 0.85, m[0]);
  }
  const obra = st.match(/(\d{1,3})\s*%\s*(?:da\s+obra|conclu|executad)/);
  if (!status && prev?.value) {
    const d = new Date(String(prev.value).length === 4 ? `${prev.value}-12-01` : `${prev.value}-01`);
    const meses = (d - Date.now()) / (86400000 * 30.4);
    status = field(meses <= 0 ? 'pronto' : meses > 24 ? 'lancamento' : 'em_obra', 0.35, 'inferido pela data de entrega');
  }
  return { status_obra: status, previsao_entrega: prev, percentual_obra: obra ? field(+obra[1], 0.8, obra[0]) : null };
}

function extrairEstrutura(text) {
  const st = strip(text);
  const r = {};
  let m;
  if ((m = st.match(new RegExp(`${NUMW}\\s+(torres|blocos|predios|edificios)\\b`)))) r.torres = field(toInt(m[1]), 0.85, m[0]);
  else if (/torre\s+unica|uma\s+unica\s+torre|torre\s+exclusiva/.test(st)) r.torres = field(1, 0.85, 'torre única');
  if ((m = st.match(/(\d{1,3})\s*(?:pavimentos|andares)(?:\s+tipo)?/))) r.andares = field(+m[1], 0.8, m[0]);
  if ((m = st.match(/(\d{1,2})\s*(?:apartamentos|aptos?\.?|unidades|apts?\.?)?\s*por\s*(?:andar|pavimento)/))) r.unidades_por_andar = field(+m[1], 0.85, m[0]);
  const totals = [...st.matchAll(/(\d{2,4})\s*(?:unidades|apartamentos|aptos|casas|lotes)\b(?!\s*por)/g)].map((x) => +x[1]).filter((n) => n >= 4 && n < 5000);
  if (totals.length) r.total_unidades = field(Math.max(...totals), 0.75, `${Math.max(...totals)} unidades`);
  else if (r.torres && r.andares && r.unidades_por_andar) r.total_unidades = field(r.torres.value * r.andares.value * r.unidades_por_andar.value, 0.4, 'estimado: torres × andares × unid./andar');
  if ((m = st.match(new RegExp(`${NUMW}\\s+elevadores`)))) r.elevadores = field(toInt(m[1]), 0.85, m[0]);
  if ((m = text.match(/terreno\s+(?:de|com)\s+([\d.,]+)\s*m²/i))) r.area_terreno = field(parseArea(m[1]), 0.8, m[0]);
  return r;
}

const AREA_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s*m²/g;
function areasIn(seg) {
  const out = [];
  let m;
  AREA_RE.lastIndex = 0;
  while ((m = AREA_RE.exec(seg))) {
    const v = parseArea(m[1]);
    if (v >= 15 && v <= 2000) {
      const before = strip(seg.slice(Math.max(0, m.index - 30), m.index));
      const after = strip(seg.slice(m.index, m.index + 30));
      const kind = /total/.test(before + after) ? 'total' : /terreno|lote/.test(before + after) ? 'terreno' : /lazer|area\s+verde|comum/.test(before) ? 'comum' : 'privativa';
      out.push({ v, kind, idx: m.index });
    }
  }
  // faixas "58 a 92 m²"
  const fx = seg.match(/(\d{2,4}(?:[.,]\d{1,2})?)\s*(?:m²)?\s*(?:a|até|-|e)\s*(\d{2,4}(?:[.,]\d{1,2})?)\s*m²/i);
  if (fx) { const a = parseArea(fx[1]); if (a >= 15 && !out.some((x) => x.v === a)) out.unshift({ v: a, kind: 'privativa', idx: fx.index }); }
  return out;
}

const MONEY_RE = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*(mil(?:h[oõ]es|h[aã]o)?|mi\b|k\b)?|(\d{1,3}(?:[.,]\d{1,3})?)\s*(mil\b|milh[oõ]es|milh[aã]o)/gi;
function moneyIn(text) {
  const out = [];
  let m;
  MONEY_RE.lastIndex = 0;
  while ((m = MONEY_RE.exec(text))) {
    const v = m[1] ? parseMoney(m[1], m[2]) : parseMoney(m[3], m[4]);
    if (!v || v < 50) continue;
    const before = strip(text.slice(Math.max(0, m.index - 70), m.index));
    const after = strip(text.slice(m.index + m[0].length, m.index + m[0].length + 25));
    const near = before.slice(-35);
    let kind = 'preco';
    if (/condom|cond\.|taxa\s+condominial/.test(near)) kind = 'condominio';
    else if (/iptu/.test(near)) kind = 'iptu';
    else if (/\/\s*m²|o\s+m²|por\s+m²|metro/.test(after.slice(0, 12)) || /m²\s*$/.test(near)) kind = 'm2';
    else if (/renda|salario|ganha|familiar/.test(near)) kind = 'renda';
    else if (/subsidio|desconto|bonus|economia/.test(near)) kind = 'subsidio';
    else if (/entrada|sinal|\bato\b/.test(near)) kind = 'entrada';
    else if (/intermedi|balao|baloes|anuais|semestrais|reforco/.test(near + after)) kind = 'intermediaria';
    else if (/chaves/.test(near + after)) kind = 'chaves';
    else if (/parcela|mensa|\d+\s*x\s*(de)?\s*$|vezes|prestac/.test(near) || /^\s*(\/\s*m[eê]s|mensa|por\s+m[eê]s)/.test(after)) kind = 'parcela';
    const aPartir = /a\s+partir\s+de|desde|apenas|por\s+apenas|valores?\s+a\s+partir/.test(near);
    const ate = /\bate\b/.test(near.slice(-10));
    out.push({ v, kind, aPartir, ate, idx: m.index, raw: m[0], ctx: text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 20) });
  }
  // sanidade por magnitude
  return out.filter((x) => {
    if (x.kind === 'preco') return x.v >= 40000 && x.v <= 80e6;
    if (x.kind === 'condominio' || x.kind === 'iptu') return x.v < 20000;
    if (x.kind === 'parcela') return x.v < 100000;
    if (x.kind === 'm2') return x.v >= 1000 && x.v <= 80000;
    return true;
  });
}

function nomeTipologia(seg, prevLine) {
  const s = `${prevLine || ''}\n${seg}`;
  const m = s.match(/\b(tipo\s+[a-z0-9]{1,3}|planta\s+[a-z0-9]{1,3}|final\s+\d{1,2}(?:\s*(?:e|\/)\s*\d{1,2})?|apto\.?\s+tipo\s*[a-z0-9]*|cobertura(?:\s+duplex|\s+linear)?|garden|studio|est[uú]dio|loft|duplex|penthouse|casa\s+tipo\s+[a-z0-9]+)\b/i);
  return m ? titleCase(m[1]) : null;
}

function extrairTipologias(text, lines) {
  const QUARTOS = new RegExp(`${NUMW}\\s*(?:\\(\\s*\\d\\s*\\)\\s*)?(?:quartos?|dormit[oó]rios?|dorms?\\.?|qts?\\.?|qtos?\\.?|su[ií]tes?\\s+(?:sendo|e))\\b`, 'gi');
  const MULTI = new RegExp(`${NUMW}\\s*(?:,\\s*${NUMW}\\s*)?(?:e|ou|a|\\/|-)\\s*${NUMW}\\s*(?:quartos?|dormit[oó]rios?|dorms?\\.?|qts?\\.?|su[ií]tes)`, 'i');
  const detalhadas = [], resumos = [];
  const processSeg = (seg, prevLine) => {
    const ss = strip(seg);
    const hasQ = QUARTOS.test(seg); QUARTOS.lastIndex = 0;
    const isStudio = /\b(studio|estudio|loft|kitnet|quitinete)\b/.test(ss);
    const allSuites = hasQ ? null : ss.match(new RegExp(`${NUMW}\\s+su[ií]tes\\b`));
    const multi = seg.match(MULTI);
    const areas = areasIn(seg);
    const money = moneyIn(seg).filter((x) => x.kind === 'preco');
    let mm, suites = null;
    if ((mm = ss.match(new RegExp(`(?:sendo|com|c\\/)\\s*${NUMW}\\s*su[ií]tes?`)))) suites = toInt(mm[1]);
    else if ((mm = ss.match(new RegExp(`${NUMW}\\s*su[ií]tes?`)))) suites = toInt(mm[1]);
    else if (/su[ií]te\s+master|com\s+su[ií]te|uma\s+su[ií]te/.test(ss)) suites = 1;
    if (/todos?\s+(os\s+)?(quartos\s+)?(s[aã]o\s+)?su[ií]tes|todas\s+(as\s+)?su[ií]tes/.test(ss)) suites = -1;
    let vagas = null;
    if ((mm = ss.match(new RegExp(`${NUMW}\\s*(?:ou\\s*${NUMW}\\s*)?vagas?`)))) vagas = toInt(mm[2] || mm[1]);
    else if (/vaga\s+de\s+garagem|vaga\s+coberta|com\s+vaga/.test(ss)) vagas = 1;
    let banheiros = null;
    if ((mm = ss.match(new RegExp(`${NUMW}\\s*(?:banheiros?|wcs?|bwcs?)`)))) banheiros = toInt(mm[1]);
    const varandaG = /(varanda|sacada|terra[cç]o)\s+gourmet/.test(ss);
    const varanda = varandaG || /varanda|sacada|terra[cç]o/.test(ss);
    const nome = nomeTipologia(seg, prevLine);
    if (multi) {
      const qs = [toInt(multi[1]), toInt(multi[2]), toInt(multi[3])].filter((x) => x != null);
      resumos.push({ quartos: uniq(qs).sort(), areas: areas.map((a) => a.v).sort((a, b) => a - b), vagas, fonte: seg.trim() });
      return;
    }
    QUARTOS.lastIndex = 0;
    const q = QUARTOS.exec(seg); QUARTOS.lastIndex = 0;
    let quartos = q ? toInt(q[1]) : null;
    if (!q && allSuites) quartos = toInt(allSuites[1]);
    if (isStudio && quartos == null) quartos = 0;
    if (quartos == null || quartos > 8) return;
    if (suites === -1 || allSuites) suites = quartos;
    const priv = areas.find((a) => a.kind === 'privativa');
    const tot = areas.find((a) => a.kind === 'total');
    detalhadas.push({
      nome: nome || (isStudio ? 'Studio' : `${quartos} quarto${quartos === 1 ? '' : 's'}${suites ? ` (${suites} suíte${suites > 1 ? 's' : ''})` : ''}`),
      quartos, suites, banheiros, vagas,
      area_privativa: priv ? priv.v : null, area_total: tot ? tot.v : null,
      varanda, varanda_gourmet: varandaG,
      valor: money.length ? Math.min(...money.map((x) => x.v)) : null,
      observacoes: null, _fonte: seg.trim().slice(0, 200),
      _conf: 0.45 + (priv ? 0.25 : 0) + (suites != null ? 0.1 : 0) + (vagas != null ? 0.1 : 0) + (nome ? 0.05 : 0),
    });
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const sl = strip(ln);
    const idx = [...ln.matchAll(new RegExp(QUARTOS.source, 'gi'))].map((x) => x.index);
    const isStudio = /\b(studio|estudio|loft|kitnet|quitinete)\b/.test(sl);
    const allSuites = new RegExp(`${NUMW}\\s+su[ií]tes\\b`).test(sl);
    if (!idx.length && !isStudio && !allSuites) continue;
    const chunks = idx.length > 1 && !MULTI.test(ln)
      ? idx.map((start, k) => ln.slice(k === 0 ? 0 : start, idx[k + 1] ?? ln.length))
      : [ln];
    chunks.forEach((chunk, k) => {
      let seg = chunk;
      if (k === chunks.length - 1) {
        if (!areasIn(seg).length && lines[i + 1]) seg += ' ' + lines[i + 1];
        if (!areasIn(seg).length && lines[i + 2] && lines[i + 1].length < 40) seg += ' ' + lines[i + 2];
      }
      processSeg(seg, lines[i - 1]);
    });
  }
  // Dedupe por quartos + área (±1 m²)
  const merged = [];
  for (const t of detalhadas) {
    const same = merged.find((x) => x.quartos === t.quartos && (x.area_privativa == null || t.area_privativa == null || Math.abs(x.area_privativa - t.area_privativa) <= 1));
    if (same) {
      for (const k of Object.keys(t)) if (same[k] == null || same[k] === false) same[k] = t[k];
      same._conf = Math.max(same._conf, t._conf);
      if (/^\d quarto/.test(same.nome) && !/^\d quarto/.test(t.nome)) same.nome = t.nome;
    } else merged.push({ ...t });
  }
  // Sem tipologias detalhadas → expande resumo ("2 e 3 quartos | 58 a 92 m²")
  if (!merged.length && resumos.length) {
    const r = resumos.sort((a, b) => b.areas.length - a.areas.length)[0];
    r.quartos.forEach((q, idx) => {
      const area = r.areas.length === r.quartos.length ? r.areas[idx] : idx === 0 ? r.areas[0] : idx === r.quartos.length - 1 ? r.areas[r.areas.length - 1] : null;
      merged.push({ nome: `${q} quartos`, quartos: q, suites: null, banheiros: null, vagas: r.vagas, area_privativa: area ?? null, area_total: null,
        varanda: false, varanda_gourmet: false, valor: null, observacoes: 'Derivado do resumo do book', _fonte: r.fonte, _conf: 0.4 });
    });
  }
  // Áreas soltas sem quartos associados (plantas listadas só por metragem)
  if (!merged.length) {
    const soltas = uniq([...text.matchAll(/(?:planta|tipo|final|apto)[^\n]{0,30}?(\d{2,3}(?:[.,]\d{1,2})?)\s*m²/gi)].map((x) => parseArea(x[1])));
    soltas.slice(0, 8).forEach((a) => merged.push({ nome: `Planta ${num0(a)} m²`, quartos: null, suites: null, banheiros: null, vagas: null, area_privativa: a, area_total: null, varanda: false, varanda_gourmet: false, valor: null, observacoes: 'Quartos não informados', _fonte: '', _conf: 0.3 }));
  }
  return { tipologias: merged.sort((a, b) => (a.quartos ?? 9) - (b.quartos ?? 9) || (a.area_privativa ?? 0) - (b.area_privativa ?? 0)), resumos };
}
const num0 = (n) => String(n).replace('.', ',');

function extrairPrecos(text, tipologias) {
  const ms = moneyIn(text);
  const precos = ms.filter((x) => x.kind === 'preco');
  const r = { precos: {}, pagamento: {} };
  if (precos.length) {
    const aPartir = precos.filter((x) => x.aPartir);
    const min = aPartir.length ? Math.min(...aPartir.map((x) => x.v)) : Math.min(...precos.map((x) => x.v));
    const max = Math.max(...precos.map((x) => x.v));
    r.precos.valor_min = field(min, aPartir.length ? 0.85 : 0.65, (aPartir[0] || precos[0]).ctx);
    if (max > min) r.precos.valor_max = field(max, 0.6, precos.find((x) => x.v === max).ctx);
  }
  const pick = (k) => ms.find((x) => x.kind === k);
  const m2 = pick('m2'); if (m2) r.precos.valor_m2_medio = field(m2.v, 0.75, m2.ctx);
  const cond = pick('condominio'); if (cond) r.precos.condominio = field(cond.v, 0.8, cond.ctx);
  const iptu = pick('iptu'); if (iptu) r.precos.iptu = field(iptu.v, 0.8, iptu.ctx);
  const ent = pick('entrada'); if (ent) r.pagamento.entrada = field(ent.v, 0.75, ent.ctx);
  const par = pick('parcela'); if (par) r.pagamento.parcela_valor = field(par.v, 0.7, par.ctx);
  const ch = pick('chaves'); if (ch) r.pagamento.chaves = field(ch.v, 0.7, ch.ctx);
  const inter = pick('intermediaria'); if (inter) r.pagamento.intermediarias = field(inter.raw + ' (' + inter.ctx.trim() + ')', 0.6, inter.ctx);
  const sub = pick('subsidio'); if (sub) r.pagamento.subsidio = field(sub.v, 0.6, sub.ctx);
  const st = strip(text);
  let m;
  if ((m = st.match(/(\d{1,2})\s*%\s*(?:de\s+)?(?:entrada|sinal|ato)\b/) || st.match(/(?:entrada|sinal)\s+(?:de\s+|minima\s+de\s+)?(\d{1,2})\s*%/))) r.pagamento.entrada_pct = field(+m[1], 0.8, m[0]);
  if ((m = st.match(/(?:em\s+)?(?:ate\s+)?(\d{2,3})\s*(?:x|vezes|parcelas|meses)\b/))) r.pagamento.parcelas_qtd = field(+m[1], 0.7, m[0]);
  const fin = st.match(/(caixa\s+economica|caixa|\bcef\b|banco\s+do\s+brasil|itau|bradesco|santander|financiamento\s+bancario|direto\s+com\s+a\s+construtora|financiamento\s+direto)/);
  if (fin) r.pagamento.financiamento = field(titleCase(fin[1].replace(/\bcef\b/, 'CEF')), 0.75, fin[0]);
  // preço por tipologia se não houver
  if (!r.precos.valor_m2_medio && r.precos.valor_min && tipologias.length) {
    const menor = tipologias.filter((t) => t.area_privativa).sort((a, b) => a.area_privativa - b.area_privativa)[0];
    if (menor) r.precos.valor_m2_medio = field(Math.round(r.precos.valor_min.value / menor.area_privativa), 0.45, 'calculado: preço mínimo ÷ menor área');
  }
  return r;
}

function extrairPrograma(text) {
  const st = strip(text);
  const r = {};
  if (/minha\s+casa,?\s+minha\s+vida|\bmcmv\b|casa\s+verde\s+e\s+amarela|\bpmcmv\b/.test(st)) {
    r.programa = field('MCMV', 0.9, 'Minha Casa Minha Vida');
    const f = st.match(/faixa\s*(\d)/); if (f) r.faixa_mcmv = field(+f[1], 0.85, f[0]);
  } else if (/\bsbpe\b/.test(st)) r.programa = field('SBPE', 0.8, 'SBPE');
  else if (/pro-?\s*cotista/.test(st)) r.programa = field('Pro-Cotista', 0.8, 'Pró-Cotista');
  if (/fgts/.test(st)) r.aceita_fgts = field(true, 0.85, 'FGTS');
  const ri = text.match(/(?:\bR\.?\s?I\b\.?|registro\s+de\s+incorpora[cç][aã]o|memorial\s+de\s+incorpora[cç][aã]o)\s*(?:n[º°o.]*\s*)?[:\-]?\s*(\d[\w.\/-]{2,30})/i);
  const mat = text.match(/matr[ií]cula\s*(?:n[º°o.]*)?\s*[:\-]?\s*([\d.\/-]{3,20})/i);
  if (ri || mat) r.ri_matricula = field([ri && `RI ${ri[1]}`, mat && `Matrícula ${mat[1]}`].filter(Boolean).join(' · '), 0.8, (ri || mat)[0]);
  return r;
}

function extrairDict(text, dict) {
  const st = strip(text);
  const found = [];
  for (const [nome, re] of dict) {
    const reN = new RegExp(re.source.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'i');
    if (re.test(st) || reN.test(st)) found.push(nome);
  }
  // remove genéricos quando o específico existe
  if (found.some((f) => f.startsWith('piscina ') || f === 'borda infinita')) return found.filter((f) => f !== 'piscina');
  if (found.includes('varanda gourmet')) return found.filter((f) => f !== 'varanda');
  return found;
}

function extrairProximidades(text) {
  const re = /(?:pr[oó]ximo\s+(?:a|ao|à|do|da|de)|perto\s+(?:de|do|da)|ao\s+lado\s+(?:de|do|da)|em\s+frente\s+(?:a|ao|à)|a\s+(\d+)\s*(?:min(?:utos)?|m|metros|km)\s+(?:de|do|da|dos|das))\s+([^\n,.;|]{3,60})/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) && out.length < 12) out.push(m[0].replace(/\s+/g, ' ').trim());
  return uniq(out);
}

function extrairContatos(text) {
  return {
    telefones: uniq([...text.matchAll(/\(?\b\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}\b/g)].map((m) => m[0].trim())).slice(0, 6),
    sites: uniq([...text.matchAll(/\b(?:https?:\/\/)?(?:www\.)[\w-]+(?:\.[\w-]+)+(?:\/[\w\-./]*)?/gi)].map((m) => m[0])).slice(0, 4),
    instagram: uniq([...text.matchAll(/(?:^|\s)@([a-z0-9_.]{3,30})\b/gi)].map((m) => '@' + m[1])).filter((x) => !/@(gmail|hotmail|outlook|yahoo)/i.test(x)).slice(0, 4),
  };
}

function detectarTipo(text) {
  const st = strip(text);
  const c = (re) => (st.match(re) || []).length;
  const lote = c(/\blotes?\b|loteamento|terrenos?\b/g), casa = c(/\bcasas?\b|sobrados?|duplex\s+em\s+condominio/g), apto = c(/apartamentos?|aptos?\b|torres?\b|andar/g), sala = c(/salas?\s+comerciais|lojas?\b|corporativo|lajes?\s+corporativas/g);
  const mx = Math.max(lote, casa, apto, sala);
  if (mx === 0) return 'residencial';
  if (mx === sala) return 'comercial';
  if (mx === lote) return 'loteamento';
  if (mx === casa && casa > apto) return 'casa';
  return 'residencial';
}

// ---------------------------------------------------------------------------
// 5) PARSER PRINCIPAL
// ---------------------------------------------------------------------------
export function parseBook(rawText) {
  const text = normalize(rawText);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const nome = extrairNome(text, lines);
  const constr = extrairConstrutora(text);
  const local = extrairLocal(text);
  const entrega = extrairEntrega(text);
  const estrutura = extrairEstrutura(text);
  const { tipologias, resumos } = extrairTipologias(text, lines);
  const precos = extrairPrecos(text, tipologias);
  const programa = extrairPrograma(text);
  const lazer = extrairDict(text, LAZER_DICT);
  const diferenciais = extrairDict(text, DIFERENCIAIS_DICT);
  const proximidades = extrairProximidades(text);
  const contatos = extrairContatos(text);

  const v = (f) => (f ? f.value : null);
  const conf = {};
  const put = (k, f) => { if (f) conf[k] = { conf: f.conf, fonte: f.fonte }; };
  put('nome', nome); put('construtora', constr.construtora); put('incorporadora', constr.incorporadora);
  Object.entries(local).forEach(([k, f]) => put(k, f));
  put('status_obra', entrega.status_obra); put('previsao_entrega', entrega.previsao_entrega);
  Object.entries(estrutura).forEach(([k, f]) => put(k, f));
  Object.entries(precos.precos).forEach(([k, f]) => put(k, f));
  Object.entries(precos.pagamento).forEach(([k, f]) => put(k, f));
  Object.entries(programa).forEach(([k, f]) => put(k, f));

  const out = {
    empreendimento: {
      nome: v(nome), construtora: v(constr.construtora), incorporadora: v(constr.incorporadora),
      tipo: detectarTipo(text), padrao: null, status_obra: v(entrega.status_obra), previsao_entrega: v(entrega.previsao_entrega),
      percentual_obra: v(entrega.percentual_obra),
      endereco: v(local.endereco), bairro: v(local.bairro), cidade: v(local.cidade), uf: v(local.uf), cep: v(local.cep),
      torres: v(estrutura.torres), andares: v(estrutura.andares), unidades_por_andar: v(estrutura.unidades_por_andar),
      total_unidades: v(estrutura.total_unidades), elevadores: v(estrutura.elevadores), area_terreno: v(estrutura.area_terreno),
      programa: v(programa.programa), faixa_mcmv: v(programa.faixa_mcmv), aceita_fgts: v(programa.aceita_fgts),
      ri_matricula: v(programa.ri_matricula), descricao: null,
    },
    tipologias: tipologias.map(({ _fonte, _conf, ...t }) => ({ ...t, _conf: Math.min(0.95, _conf), _fonte })),
    resumos,
    precos: {
      valor_min: v(precos.precos.valor_min), valor_max: v(precos.precos.valor_max), valor_m2_medio: v(precos.precos.valor_m2_medio),
      condominio: v(precos.precos.condominio), iptu: v(precos.precos.iptu),
    },
    pagamento: {
      entrada: v(precos.pagamento.entrada), entrada_pct: v(precos.pagamento.entrada_pct), parcelas_qtd: v(precos.pagamento.parcelas_qtd),
      parcela_valor: v(precos.pagamento.parcela_valor), intermediarias: v(precos.pagamento.intermediarias), chaves: v(precos.pagamento.chaves),
      subsidio: v(precos.pagamento.subsidio), financiamento: v(precos.pagamento.financiamento), observacoes: null,
    },
    lazer, diferenciais, proximidades, contatos,
    _conf: conf,
    _stats: { caracteres: text.length, linhas: lines.length },
  };
  // preço citado pelo nome da planta em outra linha ("Cobertura R$ 1,89 milhão")
  for (const t of out.tipologias) {
    if (t.valor || !t.nome || /^\d+ quarto/.test(t.nome)) continue;
    const words = t.nome.split(/\s+/);
    const keys = [words.slice(0, 2).join(' ')];
    if (/^(cobertura|garden|studio|loft|duplex|penthouse)$/i.test(words[0])) keys.push(words[0]);
    for (const k of keys) {
      const key = k.replace(/[.*+?^${}()|[\]\\]/g, '').replace(/ /g, '\\s+');
      const mt = text.match(new RegExp(`${key}[^\\n]{0,40}?(R\\$\\s*[\\d.,]+\\s*(?:mil(?:h[oõ]es|h[aã]o)?|mi)?)`, 'i'));
      if (mt) { const mv = moneyIn(mt[1])[0]; if (mv && mv.v >= 40000) { t.valor = mv.v; break; } }
    }
  }
  // preço "a partir de" → menor planta sem valor (se for o menor preço do book)
  if (out.precos.valor_min && out.tipologias.length) {
    const comValor = out.tipologias.filter((t) => t.valor).map((t) => t.valor);
    if (!comValor.length || out.precos.valor_min < Math.min(...comValor)) {
      const alvo = out.tipologias.filter((t) => !t.valor).sort((a, b) => (a.area_privativa ?? 1e9) - (b.area_privativa ?? 1e9))[0];
      if (alvo) { alvo.valor = out.precos.valor_min; alvo.observacoes = 'Valor "a partir de" do book'; }
    }
  }
  const comp = completude(out);
  out.confianca = comp.confianca;
  out.campos_faltando = comp.faltando;
  return out;
}

export function completude(ex) {
  const e = ex.empreendimento || {}, p = ex.precos || {}, pg = ex.pagamento || {};
  const tips = ex.tipologias || [];
  const checks = [
    ['nome do empreendimento', 12, !!e.nome],
    ['tipologias (quartos)', 10, tips.some((t) => t.quartos != null)],
    ['metragem das plantas', 10, tips.some((t) => t.area_privativa)],
    ['preço', 15, !!(p.valor_min || tips.some((t) => t.valor))],
    ['endereço/bairro', 10, !!(e.endereco || e.bairro)],
    ['cidade/UF', 5, !!e.cidade],
    ['prazo de entrega / status da obra', 10, !!(e.previsao_entrega || e.status_obra)],
    ['lazer', 8, (ex.lazer || []).length >= 3],
    ['estrutura (torres/andares/unidades)', 7, !!(e.torres || e.andares || e.total_unidades)],
    ['construtora/incorporadora', 5, !!(e.construtora || e.incorporadora)],
    ['condições de pagamento', 8, !!(pg.entrada || pg.entrada_pct || pg.parcelas_qtd || pg.parcela_valor || pg.financiamento || e.programa)],
  ];
  const total = checks.reduce((s, c) => s + c[1], 0);
  const ok = checks.filter((c) => c[2]).reduce((s, c) => s + c[1], 0);
  return { confianca: Math.round((ok / total) * 100), faltando: checks.filter((c) => !c[2]).map((c) => c[0]) };
}

/** Mescla extração local com a da IA: IA prevalece onde preencheu; listas são unidas. */
export function mergeExtractions(local, ia) {
  if (!ia) return local;
  if (!local) return ia;
  const pickObj = (a = {}, b = {}) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) if (v != null && v !== '') o[k] = v; return o; };
  const out = {
    ...local,
    empreendimento: pickObj(local.empreendimento, ia.empreendimento),
    precos: pickObj(local.precos, ia.precos),
    pagamento: pickObj(local.pagamento, ia.pagamento),
    tipologias: (ia.tipologias?.length ? ia.tipologias : local.tipologias),
    lazer: uniq([...(ia.lazer || []), ...(local.lazer || [])]),
    diferenciais: uniq([...(ia.diferenciais || []), ...(local.diferenciais || [])]),
    proximidades: uniq([...(ia.proximidades || []), ...(local.proximidades || [])]),
    contatos: {
      telefones: uniq([...(ia.contatos?.telefones || []), ...(local.contatos?.telefones || [])]),
      sites: uniq([...(ia.contatos?.sites || []), ...(local.contatos?.sites || [])]),
      instagram: uniq([...(ia.contatos?.instagram || []), ...(local.contatos?.instagram || [])]),
    },
    inteligencia_ia: ia.inteligencia || null,
    _fonte_ia: true,
  };
  const c = completude(out);
  out.confianca = Math.max(c.confianca, ia.confianca || 0);
  out.campos_faltando = c.faltando;
  return out;
}

// ---------------------------------------------------------------------------
// 6) INTELIGÊNCIA COMERCIAL DERIVADA
// ---------------------------------------------------------------------------
export function inteligencia(ex, { comparaveis = [] } = {}) {
  const e = ex.empreendimento || {}, p = ex.precos || {};
  const tips = (ex.tipologias || []).filter((t) => t.quartos != null || t.area_privativa);
  const lazer = ex.lazer || [], dif = ex.diferenciais || [];
  const precoEntrada = p.valor_min || Math.min(...tips.map((t) => t.valor).filter(Boolean)) || null;
  const menorArea = Math.min(...tips.map((t) => t.area_privativa).filter(Boolean));
  const m2 = p.valor_m2_medio || (precoEntrada && isFinite(menorArea) ? precoEntrada / menorArea : null);
  const isMCMV = e.programa === 'MCMV' || (precoEntrada && precoEntrada <= 264000);

  // Padrão
  let padrao = 'medio';
  if (isMCMV) padrao = 'economico';
  else if (m2 >= 11000 || precoEntrada >= 1800000) padrao = 'luxo';
  else if (m2 >= 7500 || precoEntrada >= 900000) padrao = 'alto';
  else if (m2 && m2 < 5000 && precoEntrada < 350000) padrao = 'economico';

  // Renda mínima para comprar a unidade de entrada
  let renda = null;
  if (precoEntrada) {
    const entradaPct = (ex.pagamento?.entrada_pct || 20) / 100;
    let taxa = PARAMS.sbpe, r = null;
    for (let i = 0; i < 4; i++) {
      const sim = simular({ valor: precoEntrada, entrada: precoEntrada * Math.max(entradaPct, 0.2), taxaAnual: taxa });
      r = sim.rendaMinima;
      taxa = isMCMV ? taxaReferencia(r) : PARAMS.sbpe;
    }
    renda = { valor: r, faixaMCMV: isMCMV ? faixaMCMV(r) : null, taxa, entrada: precoEntrada * Math.max(entradaPct, 0.2) };
  }

  // Comparação com mercado
  let mercado = null;
  if (m2 && comparaveis.length) {
    const norm = (s) => strip(s);
    const mesmo = comparaveis.filter((c) => norm(c.bairro) === norm(e.bairro) && c.area > 0);
    const base = (mesmo.length ? mesmo : comparaveis.filter((c) => norm(c.cidade) === norm(e.cidade) && c.area > 0));
    if (base.length) {
      const med = base.map((c) => c.valor_m2 || c.valor / c.area).sort((a, b) => a - b)[Math.floor(base.length / 2)];
      mercado = { m2Mercado: med, gap: (m2 / med - 1) * 100, amostras: base.length, escopo: mesmo.length ? 'bairro' : 'cidade' };
    }
  }

  // Público-alvo
  const qMin = Math.min(...tips.map((t) => t.quartos).filter((x) => x != null));
  const qMax = Math.max(...tips.map((t) => t.quartos).filter((x) => x != null));
  const publico = [];
  if (isMCMV) publico.push(`Primeiro imóvel com FGTS e subsídio — renda familiar a partir de ${renda ? fmtBRL(renda.valor) : '—'}`);
  if (qMin <= 1) publico.push('Solteiros, jovens profissionais e investidores de aluguel (studio/1q)');
  if (qMin === 2 || qMax === 2) publico.push('Casais jovens e famílias pequenas saindo do aluguel');
  if (qMax >= 3) publico.push('Famílias com filhos buscando upgrade de espaço e lazer');
  if (padrao === 'alto' || padrao === 'luxo') publico.push('Profissionais liberais, médicos, empresários — compra por status, localização e segurança');
  if (e.status_obra === 'lancamento' || e.status_obra === 'em_obra') publico.push('Investidores: preço de planta com potencial de valorização até a entrega');

  // Argumentos de venda
  const args = [];
  if (dif.includes('frente mar')) args.push('Frente mar: produto escasso, que não se repete — liquidez e valorização acima da média');
  else if (dif.includes('vista mar')) args.push('Vista mar permanente — atributo que sustenta preço na revenda');
  if (lazer.length >= 8 || dif.includes('condomínio clube')) args.push(`Condomínio clube com ${lazer.length} itens de lazer: a família não precisa sair de casa para se divertir`);
  else if (lazer.length >= 3) args.push(`Lazer completo: ${lazer.slice(0, 4).join(', ')}`);
  if (dif.includes('varanda gourmet')) args.push('Varanda gourmet integrada: o ambiente que mais vende apartamento hoje');
  if (e.status_obra === 'lancamento') args.push('Preço de lançamento: a melhor tabela que esse empreendimento vai ter');
  if (e.status_obra === 'em_obra') args.push('Obra em andamento: risco menor e ainda com preço abaixo do pronto');
  if (e.status_obra === 'pronto') args.push('Pronto para morar: mudança imediata, sem pagar aluguel durante a obra');
  if (isMCMV) args.push('Minha Casa Minha Vida: taxa de juros reduzida, uso do FGTS e possível subsídio do governo');
  if (e.aceita_fgts && !isMCMV) args.push('Aceita FGTS na entrada — reduz o desembolso do cliente');
  if (ex.pagamento?.parcelas_qtd) args.push(`Entrada parcelada em até ${ex.pagamento.parcelas_qtd}x direto com a construtora`);
  if (dif.includes('energia solar')) args.push('Energia solar nas áreas comuns: condomínio mais barato todo mês');
  if (dif.includes('fechadura digital') || dif.includes('automação residencial')) args.push('Tecnologia de série (fechadura digital/automação) — valor percebido alto');
  if (dif.includes('infra para ar-condicionado')) args.push('Infra para ar-condicionado pronta: sem quebra-quebra depois da entrega');
  if (dif.includes('ITBI e registro grátis')) args.push('ITBI e registro inclusos: economia real de 3% a 5% do valor');
  if (mercado && mercado.gap < -3) args.push(`Preço/m² ${Math.abs(mercado.gap).toFixed(0)}% abaixo da média do ${mercado.escopo} — compra inteligente`);
  if ((ex.proximidades || []).length) args.push(`Localização: ${ex.proximidades.slice(0, 2).join('; ')}`);
  if (e.elevadores && e.unidades_por_andar && e.unidades_por_andar <= 2) args.push(`Só ${e.unidades_por_andar} apartamentos por andar: privacidade e exclusividade`);
  if (tips.some((t) => t.suites && t.suites === t.quartos)) args.push('Todos os quartos são suítes — conforto para família e visitas');

  // Objeções prováveis
  const obj = [];
  const prevDate = e.previsao_entrega ? new Date(String(e.previsao_entrega).length === 4 ? `${e.previsao_entrega}-12-01` : `${e.previsao_entrega}-01`) : null;
  const mesesEntrega = prevDate ? (prevDate - Date.now()) / (86400000 * 30.4) : null;
  if (mesesEntrega && mesesEntrega > 18) obj.push({ objecao: 'Demora muito para entregar', resposta: `Por isso o preço está em tabela de planta. Até ${fmtMes(e.previsao_entrega)} o imóvel tende a valorizar, e você paga a entrada parcelada sem pesar no orçamento. Quem compra pronto paga essa valorização.` });
  if (isFinite(menorArea) && menorArea < 50) obj.push({ objecao: 'O apartamento é pequeno', resposta: `A planta de ${num0(menorArea)} m² foi pensada sem desperdício de circulação. E o lazer do condomínio vira extensão da sua casa — você usa ${lazer.length || 'vários'} espaços sem pagar por eles na sua metragem.` });
  if (p.condominio && precoEntrada && p.condominio * 12 > precoEntrada * 0.012) obj.push({ objecao: 'O condomínio é caro', resposta: `Divida o condomínio pelos serviços: ${lazer.slice(0, 3).join(', ') || 'lazer'}, segurança e manutenção. Academia e lazer equivalentes fora custariam mais que isso por mês.` });
  if (isMCMV) obj.push({ objecao: 'Tenho medo de não ser aprovado', resposta: 'Fazemos a simulação e a análise de crédito antes de qualquer compromisso. Se não aprovar, você não perde nada — e eu já te digo o que ajustar (composição de renda, FGTS, prazo).' });
  if (e.status_obra !== 'pronto') obj.push({ objecao: 'E se a construtora não entregar?', resposta: `O empreendimento tem registro de incorporação${e.ri_matricula ? ` (${e.ri_matricula})` : ''} e o financiamento na planta é acompanhado pelo banco, que só libera conforme a obra avança. Posso te mostrar as obras já entregues da ${e.construtora || 'construtora'}.` });
  if (mercado && mercado.gap > 8) obj.push({ objecao: 'Achei caro comparado a outros', resposta: `Compare o pacote completo: ${args.slice(0, 2).join('; ')}. Preço por m² isolado não mostra lazer, acabamento e liquidez de revenda.` });
  obj.push({ objecao: 'Vou pensar / falar com meu cônjuge', resposta: 'Perfeito, é uma decisão de família. Vamos marcar agora uma visita com vocês dois para eu tirar as dúvidas dele(a) pessoalmente? Qual o melhor horário amanhã ou sábado?' });

  const nome = e.nome || 'o empreendimento';
  const tipTxt = tipologiaResumo(tips);
  const pitch = `${nome}${e.bairro ? `, no ${e.bairro}` : ''}: ${tipTxt}${precoEntrada ? `, a partir de ${fmtBRL(precoEntrada)}` : ''}. ${args.slice(0, 2).join('. ')}.${renda ? ` Com renda familiar de ${fmtBRL(renda.valor)} já dá para financiar.` : ''} Quer que eu simule para você agora?`;
  const whats = `Oi, {nome}! Tudo bem? Separei uma oportunidade que tem a ver com o que você procura:\n\n🏢 *${nome}*${e.bairro ? ` — ${e.bairro}` : ''}\n🛏 ${tipTxt}\n${lazer.length ? `🌴 ${lazer.slice(0, 4).join(', ')}\n` : ''}${precoEntrada ? `💰 A partir de ${fmtBRL(precoEntrada)}\n` : ''}${e.aceita_fgts || isMCMV ? '✅ Aceita FGTS\n' : ''}\nPosso te mandar a simulação com o valor da parcela?`;

  const scoreProduto = Math.round(Math.min(100,
    Math.min(lazer.length, 12) * 2.5 + Math.min(dif.length, 8) * 3 + (e.bairro ? 8 : 0) + (precoEntrada ? 10 : 0) +
    (mercado ? Math.max(-10, Math.min(15, -mercado.gap)) : 5) + (e.status_obra === 'pronto' ? 10 : e.status_obra === 'em_obra' ? 7 : 4) + ((ex.confianca || 0) * 0.12)));

  return { padrao, precoEntrada, m2, renda, mercado, publico, argumentos: args.slice(0, 10), objecoes: obj, pitch, whatsapp: whats, scoreProduto, mesesEntrega };
}

export function tipologiaResumo(tips) {
  const qs = uniq(tips.map((t) => t.quartos).filter((x) => x != null)).sort((a, b) => a - b);
  const as = tips.map((t) => t.area_privativa).filter(Boolean);
  const qTxt = qs.length ? (qs.length === 1 ? (qs[0] === 0 ? 'Studio' : `${qs[0]} quarto${qs[0] > 1 ? 's' : ''}`) : `${qs.slice(0, -1).join(', ')} e ${qs[qs.length - 1]} quartos`) : 'Plantas variadas';
  const aTxt = as.length ? (Math.min(...as) === Math.max(...as) ? ` · ${num0(Math.min(...as))} m²` : ` · ${num0(Math.min(...as))} a ${num0(Math.max(...as))} m²`) : '';
  return qTxt + aTxt;
}
const fmtBRL = (n) => (n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const fmtMes = (s) => { if (!s) return 'a entrega'; const [y, m] = String(s).split('-'); return m ? `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+m - 1]}/${y}` : y; };

/** Converte extração em registros prontos para o banco. */
export function toRecords(ex, intel) {
  const e = ex.empreendimento || {};
  const prev = e.previsao_entrega ? (String(e.previsao_entrega).length === 4 ? `${e.previsao_entrega}-12-01` : `${e.previsao_entrega}-01`) : null;
  const tips = (ex.tipologias || []).map((t) => ({
    nome: t.nome || `${t.quartos ?? '?'} quartos`, quartos: t.quartos ?? 0, suites: t.suites ?? 0, banheiros: t.banheiros ?? 0, vagas: t.vagas ?? 0,
    area_privativa: t.area_privativa, area_total: t.area_total, varanda: !!t.varanda, varanda_gourmet: !!t.varanda_gourmet,
    valor_base: t.valor ?? null, caracteristicas: t.observacoes ? [t.observacoes] : null,
  }));
  return {
    empreendimento: {
      nome: e.nome || 'Empreendimento sem nome', construtora: e.construtora, incorporadora: e.incorporadora, tipo: e.tipo || 'residencial',
      padrao: intel?.padrao || e.padrao, status_obra: e.status_obra || 'lancamento', previsao_entrega: prev,
      endereco: e.endereco, bairro: e.bairro, cidade: e.cidade, uf: e.uf ? String(e.uf).slice(0, 2).toUpperCase() : null, cep: e.cep,
      torres: e.torres, andares: e.andares, unidades_por_andar: e.unidades_por_andar, total_unidades: e.total_unidades, elevadores: e.elevadores,
      valor_min: ex.precos?.valor_min ?? null, valor_max: ex.precos?.valor_max ?? null, condominio_estimado: ex.precos?.condominio ?? null,
      iptu_estimado: ex.precos?.iptu ?? null, aceita_fgts: e.aceita_fgts ?? true, programa: e.programa, faixa_mcmv: e.faixa_mcmv,
      ri_matricula: e.ri_matricula, descricao: e.descricao || intel?.pitch || null,
      diferenciais: ex.diferenciais || [], lazer: ex.lazer || [], score_produto: intel?.scoreProduto ?? null,
      dados_extraidos: { ...ex, inteligencia: intel },
    },
    tipologias: tips,
  };
}
