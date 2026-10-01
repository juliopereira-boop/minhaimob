import { $, $$, esc, h, brl, brlK, num, pct, m2, toast, copy, parseNum, date, modal } from '../ui.js';
import { extractText, parseBook, inteligencia, mergeExtractions, toRecords, completude, tipologiaResumo, LAZER_DICT, DIFERENCIAIS_DICT } from '../engine/parser.js';
import { simular, taxaReferencia, PARAMS } from '../engine/credito.js';
import { leadsParaUnidade } from '../engine/match.js';

let S = null; // estado da análise corrente

export async function render(el, ctx) {
  const ai = ctx.db.aiMode();
  el.innerHTML = `
  <div class="page-head">
    <div><h1>Destrinchar Book</h1><p>Envie o book da construtora e receba todos os dados estruturados + inteligência de venda pronta.</p></div>
    <div class="row"><span class="badge ${ai ? 'b-green' : 'b-gray'}">${ai ? '● IA Claude conectada' : '○ IA desligada — análise local'}</span></div>
  </div>
  <div class="grid g3">
    <div class="card span2">
      <label class="dropzone" id="dz">
        <input type="file" id="file" accept=".pdf,image/*,.txt,.md,.html" hidden />
        <div class="big">✦</div>
        <h2 class="mt-s">Arraste o book aqui</h2>
        <p class="muted mt-s">PDF (com texto ou escaneado), imagem (JPG/PNG) ou texto · até 200 MB</p>
        <span class="btn primary mt">Escolher arquivo</span>
      </label>
      <details class="mt"><summary class="muted" style="cursor:pointer;font-weight:700">Ou cole o texto do book / anúncio</summary>
        <textarea id="paste" class="mt-s" style="min-height:160px" placeholder="Cole aqui o texto do material de vendas, tabela, anúncio de portal…"></textarea>
        <button class="btn mt-s" id="btn-paste">Analisar texto</button>
      </details>
      <div class="row wrap mt">
        <label class="check"><input type="checkbox" id="opt-ai" ${ai ? 'checked' : 'disabled'} /> Análise profunda com IA (lê o PDF inteiro, inclusive imagens)</label>
        <label class="check"><input type="checkbox" id="opt-ocr" checked /> OCR em páginas escaneadas</label>
      </div>
    </div>
    <div class="card">
      <h3>O que é extraído</h3>
      <div class="list mt-s" style="font-size:13px">
        ${['Nome, construtora, endereço, bairro, CEP', 'Tipologias: quartos, suítes, banheiros, vagas, m²', 'Preços, m², condomínio, IPTU, entrada, parcelas', 'Torres, andares, unidades, elevadores, entrega', 'Lazer e diferenciais (70+ itens reconhecidos)', 'MCMV/SBPE, FGTS, RI/matrícula, contatos', 'Renda mínima, público-alvo, argumentos, objeções', 'Pitch de 30s, WhatsApp e compradores compatíveis'].map((t) => `<div class="list-item" style="padding:7px 0"><span style="color:var(--gold)">✓</span>${t}</div>`).join('')}
      </div>
    </div>
  </div>
  <div id="progress" class="card mt hide"></div>
  <div id="result" class="mt"></div>
  <div class="card mt" id="history"></div>`;

  const dz = $('#dz', el), inp = $('#file', el);
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); if (e.dataTransfer.files[0]) processar(ctx, el, { file: e.dataTransfer.files[0] }); });
  inp.addEventListener('change', () => inp.files[0] && processar(ctx, el, { file: inp.files[0] }));
  $('#btn-paste', el).onclick = () => { const t = $('#paste', el).value.trim(); if (t.length < 30) return toast('Cole um texto maior', 'err'); processar(ctx, el, { text: t }); };
  historico(ctx, el);
  if (S?.ex) renderResult(ctx, el);
}

async function historico(ctx, el) {
  let books = [];
  try { books = await ctx.db.list('books', { order: 'created_at.desc', limit: 12 }); } catch { /* */ }
  const box = $('#history', el);
  if (!books.length) { box.innerHTML = '<h3>Books analisados</h3><div class="empty">Nenhum book ainda.</div>'; return; }
  box.innerHTML = `<h3>Books analisados</h3><div class="table-wrap mt-s"><table class="t"><thead><tr><th>Arquivo</th><th>Empreendimento</th><th>Método</th><th>Confiança</th><th>Data</th><th></th></tr></thead><tbody>
    ${books.map((b) => `<tr><td>${esc(b.nome_arquivo)}</td><td>${esc(b.extracao?.empreendimento?.nome || '—')}</td><td><span class="badge b-gray">${esc(b.metodo || '—')}</span></td>
    <td>${b.confianca != null ? pct(b.confianca) : '—'}</td><td>${date(b.created_at)}</td><td><button class="btn xs" data-open="${b.id}">Abrir</button></td></tr>`).join('')}</tbody></table></div>`;
  box.onclick = (e) => {
    const id = e.target.closest('[data-open]')?.dataset.open;
    const b = books.find((x) => x.id === id);
    if (!b?.extracao?.empreendimento) return;
    S = { ex: b.extracao, text: b.texto_bruto || '', bookId: b.id, nomeArquivo: b.nome_arquivo };
    S.intel = inteligencia(S.ex, { comparaveis: ctx.data.comparaveis });
    renderResult(ctx, el);
    $('#result', el).scrollIntoView({ behavior: 'smooth' });
  };
}

const STEPS = [['upload', 'Enviando arquivo'], ['texto', 'Extraindo texto (PDF/OCR)'], ['parser', 'Análise semântica local'], ['ia', 'Análise profunda com IA'], ['intel', 'Gerando inteligência de venda']];
function progress(el, ativo, msg, done = []) {
  const box = $('#progress', el);
  box.classList.remove('hide');
  box.innerHTML = `<div class="row between"><h3>Destrinchando…</h3><span class="muted" style="font-size:12px">${esc(msg || '')}</span></div><div class="steps mt">
    ${STEPS.map(([k, l]) => `<div class="step ${done.includes(k) ? 'done' : k === ativo ? 'on' : ''}"><span class="s-ico">${done.includes(k) ? '✓' : k === ativo ? '•' : ''}</span>${l}</div>`).join('')}</div>`;
}

async function processar(ctx, el, { file, text }) {
  const useAI = $('#opt-ai', el)?.checked && ctx.db.aiMode();
  const ocr = $('#opt-ocr', el)?.checked;
  const done = [];
  S = { file, nomeArquivo: file?.name || 'texto-colado.txt' };
  $('#result', el).innerHTML = '';
  try {
    if (file && ctx.db.mode === 'supabase') {
      progress(el, 'upload', file.name, done);
      try { S.storagePath = await ctx.db.upload('books', file); } catch (e) { toast('Upload falhou, seguindo com análise local: ' + e.message, 'err'); }
    }
    done.push('upload');
    progress(el, 'texto', '', done);
    if (file) {
      const r = await extractText(file, (p) => progress(el, 'texto', p.msg, done), { ocr });
      S.text = r.text; S.paginas = r.paginas; S.metodo = r.metodo;
    } else { S.text = text; S.metodo = 'texto'; }
    done.push('texto');
    progress(el, 'parser', `${num(S.text.length)} caracteres`, done);
    await new Promise((r) => setTimeout(r, 30));
    S.local = parseBook(S.text);
    S.ex = S.local;
    done.push('parser');
    try {
      const row = await ctx.db.insert('books', { nome_arquivo: S.nomeArquivo, storage_path: S.storagePath || null, mime: file?.type || 'text/plain', tamanho_bytes: file?.size || S.text.length,
        paginas: S.paginas || 1, status: 'extraido', metodo: S.metodo, texto_bruto: S.text.slice(0, 900000), extracao: S.ex, confianca: S.ex.confianca, campos_faltando: S.ex.campos_faltando, uploaded_by: ctx.db.user?.id });
      S.bookId = row.id;
    } catch (e) { console.warn('book não salvo', e); }
    if (useAI) {
      progress(el, 'ia', 'Claude lendo o book completo…', done);
      try {
        const ia = await ctx.db.aiParseBook({ storagePath: S.storagePath, text: S.text, filename: S.nomeArquivo, bookId: S.bookId, file });
        S.ex = mergeExtractions(S.local, ia);
        S.metodo += '+ia';
        if (S.bookId) ctx.db.update('books', S.bookId, { extracao: S.ex, confianca: S.ex.confianca, campos_faltando: S.ex.campos_faltando, metodo: S.metodo }).catch(() => {});
      } catch (e) { toast('IA indisponível (' + e.message + '). Mantive a análise local.', 'err', 6000); }
    }
    done.push('ia');
    progress(el, 'intel', '', done);
    S.intel = inteligencia(S.ex, { comparaveis: ctx.data.comparaveis });
    done.push('intel');
    progress(el, null, 'Concluído', done);
    setTimeout(() => $('#progress', el)?.classList.add('hide'), 1200);
    renderResult(ctx, el);
    $('#result', el).scrollIntoView({ behavior: 'smooth' });
    historico(ctx, el);
  } catch (e) {
    console.error(e);
    $('#progress', el).innerHTML = `<div class="callout red"><b>Falha ao processar.</b> ${esc(e.message)}</div>`;
  }
}

const conf = (k) => { const c = S.ex._conf?.[k]?.conf; if (c == null) return S.ex._fonte_ia ? '<span class="conf h" title="IA"></span>' : ''; return `<span class="conf ${c >= 0.75 ? 'h' : c >= 0.5 ? 'm' : 'l'}" title="Confiança ${Math.round(c * 100)}%${S.ex._conf[k].fonte ? ' · ' + esc(String(S.ex._conf[k].fonte).slice(0, 80)) : ''}"></span>`; };
const inputF = (path, label, v, { numF = false, k } = {}) => `<div class="field"><label>${conf(k || path.split('.').pop())}${label}</label><input data-path="${path}" ${numF ? 'data-num' : ''} value="${esc(v ?? '')}" /></div>`;

function renderResult(ctx, el) {
  const ex = S.ex, it = S.intel, e = ex.empreendimento || {}, p = ex.precos || {}, pg = ex.pagamento || {};
  const tips = ex.tipologias || [];
  const box = $('#result', el);
  const padraoLbl = { economico: 'Econômico', medio: 'Médio padrão', alto: 'Alto padrão', luxo: 'Luxo' }[it.padrao] || it.padrao;
  box.innerHTML = `
  <div class="card glow">
    <div class="row wrap between">
      <div class="grow">
        <div class="row wrap"><span class="badge b-gold">${esc(padraoLbl)}</span>${e.programa ? `<span class="badge b-green">${esc(e.programa)}${e.faixa_mcmv ? ' F' + e.faixa_mcmv : ''}</span>` : ''}${e.status_obra ? `<span class="badge b-blue">${({ lancamento: 'Lançamento', em_obra: 'Em obras', pronto: 'Pronto' })[e.status_obra] || e.status_obra}</span>` : ''}<span class="badge b-gray">${esc(S.metodo || '')}</span></div>
        <h1 class="mt-s">${esc(e.nome || 'Empreendimento sem nome')}</h1>
        <p class="muted mt-s">${esc([e.construtora, e.bairro, e.cidade && `${e.cidade}${e.uf ? '/' + e.uf : ''}`].filter(Boolean).join(' · ') || 'Localização não identificada')}</p>
        <p class="mt-s" style="font-weight:700">${esc(tipologiaResumo(tips))}${it.precoEntrada ? ` · a partir de ${brl(it.precoEntrada)}` : ''}</p>
      </div>
      <div class="row" style="gap:18px">
        <div class="ring" style="--p:${ex.confianca || 0};--c:${(ex.confianca || 0) >= 75 ? 'var(--green)' : 'var(--amber)'};width:96px;height:96px"><div><b style="font-size:20px">${ex.confianca || 0}%</b><small>dados</small></div></div>
        <div class="ring" style="--p:${it.scoreProduto || 0};width:96px;height:96px"><div><b style="font-size:20px">${it.scoreProduto || 0}</b><small>produto</small></div></div>
      </div>
    </div>
    ${ex.campos_faltando?.length ? `<div class="callout red mt"><b>Faltando no book:</b> ${ex.campos_faltando.map(esc).join(', ')}. <a href="#" id="ask-dev">Gerar mensagem para a construtora →</a></div>` : ''}
    <div class="row wrap mt">
      <button class="btn primary" id="btn-save">✓ Salvar empreendimento</button>
      <button class="btn" id="btn-buyers">◉ Encontrar compradores</button>
      <button class="btn" id="btn-ads">✎ Gerar anúncios</button>
      <button class="btn ghost" id="btn-json">{ } Exportar JSON</button>
    </div>
  </div>

  <div class="tabs mt" id="tabs">${[['geral', 'Visão geral'], ['tip', `Tipologias (${tips.length})`], ['lazer', `Lazer & diferenciais (${(ex.lazer || []).length + (ex.diferenciais || []).length})`], ['fin', 'Financeiro'], ['intel', 'Inteligência de venda'], ['txt', 'Texto extraído']].map(([k, l], i) => `<button data-tab="${k}" class="${i === 0 ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="tab-body"></div>`;

  const tabs = {
    geral: () => `<div class="card"><div class="field-row">
      ${inputF('empreendimento.nome', 'Nome', e.nome)}${inputF('empreendimento.construtora', 'Construtora', e.construtora)}${inputF('empreendimento.incorporadora', 'Incorporadora', e.incorporadora)}
      ${inputF('empreendimento.endereco', 'Endereço', e.endereco)}${inputF('empreendimento.bairro', 'Bairro', e.bairro)}${inputF('empreendimento.cidade', 'Cidade', e.cidade)}
      ${inputF('empreendimento.uf', 'UF', e.uf)}${inputF('empreendimento.cep', 'CEP', e.cep)}
      <div class="field"><label>${conf('status_obra')}Status da obra</label><select data-path="empreendimento.status_obra">${['', 'lancamento', 'em_obra', 'pronto'].map((s) => `<option value="${s}" ${e.status_obra === s ? 'selected' : ''}>${({ '': '—', lancamento: 'Lançamento', em_obra: 'Em obras', pronto: 'Pronto' })[s]}</option>`).join('')}</select></div>
      ${inputF('empreendimento.previsao_entrega', 'Entrega (AAAA-MM)', e.previsao_entrega)}
      ${inputF('empreendimento.torres', 'Torres', e.torres, { numF: true })}${inputF('empreendimento.andares', 'Andares', e.andares, { numF: true })}
      ${inputF('empreendimento.unidades_por_andar', 'Unid. por andar', e.unidades_por_andar, { numF: true })}${inputF('empreendimento.total_unidades', 'Total de unidades', e.total_unidades, { numF: true })}
      ${inputF('empreendimento.elevadores', 'Elevadores', e.elevadores, { numF: true })}${inputF('empreendimento.ri_matricula', 'RI / matrícula', e.ri_matricula)}
    </div>
    ${(ex.proximidades || []).length ? `<h3 class="mt">Proximidades</h3><div class="row wrap mt-s">${ex.proximidades.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
    ${(ex.contatos?.telefones?.length || ex.contatos?.sites?.length || ex.contatos?.instagram?.length) ? `<h3 class="mt">Contatos no material</h3><div class="row wrap mt-s">${[...(ex.contatos.telefones || []), ...(ex.contatos.sites || []), ...(ex.contatos.instagram || [])].map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>` : ''}
    <div class="hint mt"><span class="conf h"></span>alta <span class="conf m"></span>média <span class="conf l"></span>baixa confiança — passe o mouse para ver o trecho de origem. Edite o que precisar antes de salvar.</div></div>`,
    tip: () => `<div class="card pad-0"><div class="table-wrap"><table class="t" id="tip-table"><thead><tr><th>Planta</th><th>Quartos</th><th>Suítes</th><th>Banh.</th><th>Vagas</th><th>Área priv. (m²)</th><th>Valor</th><th>R$/m²</th><th>Renda mín.*</th><th></th></tr></thead><tbody>
      ${tips.map((t, i) => {
        const r = t.valor ? simular({ valor: t.valor, entrada: t.valor * 0.2, taxaAnual: e.programa === 'MCMV' ? taxaReferencia(4000) : PARAMS.sbpe }).rendaMinima : null;
        return `<tr data-i="${i}"><td><input data-tf="nome" value="${esc(t.nome || '')}" style="min-width:150px" /></td>
        ${['quartos', 'suites', 'banheiros', 'vagas'].map((k) => `<td><input data-tf="${k}" data-num value="${t[k] ?? ''}" style="width:62px" /></td>`).join('')}
        <td><input data-tf="area_privativa" data-num value="${t.area_privativa ?? ''}" style="width:90px" /></td>
        <td><input data-tf="valor" data-num value="${t.valor ?? ''}" style="width:120px" /></td>
        <td class="num">${t.valor && t.area_privativa ? brl(t.valor / t.area_privativa) : '—'}</td><td class="num">${r ? brl(r) : '—'}</td>
        <td><button class="btn xs danger" data-del="${i}">✕</button></td></tr>`;
      }).join('')}</tbody></table></div>
      <div class="row between" style="padding:12px 14px"><button class="btn sm" id="tip-add">+ Adicionar planta</button><span class="hint">* SAC, 20% de entrada, 420 meses, taxa de referência, 30% da renda.</span></div></div>`,
    lazer: () => `<div class="grid g2"><div class="card"><h3>Lazer (${(ex.lazer || []).length})</h3><div class="row wrap mt-s" id="lz">${chips(ex.lazer, 'lazer')}</div>
      <div class="row mt"><select id="lz-add"><option value="">+ adicionar item de lazer</option>${LAZER_DICT.map(([n]) => n).filter((n) => !(ex.lazer || []).includes(n)).map((n) => `<option>${esc(n)}</option>`).join('')}</select></div></div>
      <div class="card"><h3>Diferenciais (${(ex.diferenciais || []).length})</h3><div class="row wrap mt-s" id="df">${chips(ex.diferenciais, 'diferenciais')}</div>
      <div class="row mt"><select id="df-add"><option value="">+ adicionar diferencial</option>${DIFERENCIAIS_DICT.map(([n]) => n).filter((n) => !(ex.diferenciais || []).includes(n)).map((n) => `<option>${esc(n)}</option>`).join('')}</select></div></div></div>`,
    fin: () => {
      const sim = it.precoEntrada ? simular({ valor: it.precoEntrada, entrada: it.renda?.entrada || it.precoEntrada * 0.2, taxaAnual: it.renda?.taxa || PARAMS.sbpe }) : null;
      return `<div class="grid g2"><div class="card"><h3>Preços e condições</h3><div class="field-row mt-s">
        ${inputF('precos.valor_min', 'Valor mínimo', p.valor_min, { numF: true })}${inputF('precos.valor_max', 'Valor máximo', p.valor_max, { numF: true })}
        ${inputF('precos.valor_m2_medio', 'R$/m²', p.valor_m2_medio, { numF: true })}${inputF('precos.condominio', 'Condomínio', p.condominio, { numF: true, k: 'condominio' })}
        ${inputF('precos.iptu', 'IPTU', p.iptu, { numF: true })}${inputF('pagamento.entrada', 'Entrada (R$)', pg.entrada, { numF: true })}
        ${inputF('pagamento.entrada_pct', 'Entrada (%)', pg.entrada_pct, { numF: true })}${inputF('pagamento.parcelas_qtd', 'Parcelas (qtd)', pg.parcelas_qtd, { numF: true })}
        ${inputF('pagamento.parcela_valor', 'Valor parcela', pg.parcela_valor, { numF: true })}${inputF('pagamento.financiamento', 'Financiamento', pg.financiamento)}
        ${inputF('empreendimento.programa', 'Programa', e.programa)}${inputF('empreendimento.faixa_mcmv', 'Faixa MCMV', e.faixa_mcmv, { numF: true })}
      </div><label class="check"><input type="checkbox" data-path="empreendimento.aceita_fgts" ${e.aceita_fgts ? 'checked' : ''} /> Aceita FGTS</label></div>
      <div class="card"><h3>Quem consegue comprar</h3>
        ${it.renda ? `<div class="pill-num mt-s">${brl(it.renda.valor)}</div><div class="muted">renda familiar mínima para a unidade de entrada</div>
        <dl class="kv mt"><dt>Unidade de entrada</dt><dd>${brl(it.precoEntrada)}</dd><dt>Entrada considerada</dt><dd>${brl(it.renda.entrada)}</dd><dt>Taxa de referência</dt><dd>${num(it.renda.taxa, 2)}% a.a.</dd>
        <dt>1ª parcela (SAC)</dt><dd>${brl(sim.primeiraParcela)}</dd><dt>Última parcela</dt><dd>${brl(sim.ultimaParcela)}</dd>${it.renda.faixaMCMV ? `<dt>Enquadramento</dt><dd>MCMV Faixa ${it.renda.faixaMCMV}</dd>` : ''}
        ${it.m2 ? `<dt>Preço por m²</dt><dd>${brl(it.m2)}</dd>` : ''}${it.mercado ? `<dt>Média do ${it.mercado.escopo}</dt><dd>${brl(it.mercado.m2Mercado)} <span class="${it.mercado.gap < 0 ? 'up' : 'down'}">(${it.mercado.gap > 0 ? '+' : ''}${num(it.mercado.gap, 1)}%)</span></dd>` : ''}</dl>
        <a class="btn sm mt" href="#/credito">Abrir simulador completo →</a>` : '<div class="empty">Informe o preço para calcular a renda mínima.</div>'}</div></div>`;
    },
    intel: () => `<div class="grid g2">
      <div class="card"><h3>Público-alvo</h3><div class="list mt-s">${it.publico.map((x) => `<div class="list-item" style="padding:8px 0">◉ ${esc(x)}</div>`).join('') || '<div class="muted">—</div>'}</div>
        ${ex.inteligencia_ia?.publico_alvo ? `<div class="callout blue mt"><b>IA:</b> ${esc(ex.inteligencia_ia.publico_alvo)}</div>` : ''}</div>
      <div class="card"><div class="card-head"><h3>Pitch de 30 segundos</h3><button class="btn xs" data-copy="pitch">Copiar</button></div><p style="line-height:1.7">${esc(ex.inteligencia_ia?.pitch_30s || it.pitch)}</p></div>
      <div class="card"><div class="card-head"><h3>Argumentos de venda</h3><button class="btn xs" data-copy="args">Copiar</button></div>
        <div class="list">${uniqArgs(it, ex).map((a, i) => `<div class="list-item" style="padding:8px 0"><b style="color:var(--gold)">${i + 1}</b>${esc(a)}</div>`).join('')}</div></div>
      <div class="card"><h3>Objeções prováveis e respostas</h3><div class="col mt-s">${[...(ex.inteligencia_ia?.objecoes_provaveis || []), ...it.objecoes].slice(0, 8).map((o) => `<div class="lesson"><h4>"${esc(o.objecao)}"</h4><p class="muted">${esc(o.resposta)}</p></div>`).join('')}</div></div>
      <div class="card span2"><div class="card-head"><h3>Mensagem de WhatsApp</h3><button class="btn xs" data-copy="whats">Copiar</button></div><div class="code">${esc(ex.inteligencia_ia?.mensagem_whatsapp || it.whatsapp)}</div></div>
    </div>`,
    txt: () => `<div class="card"><div class="row between"><span class="muted">${num((S.text || '').length)} caracteres${S.paginas ? ` · ${S.paginas} páginas` : ''}</span><input id="txt-q" placeholder="Buscar no texto…" style="max-width:260px" /></div><pre class="code mt-s" id="txt-pre" style="max-height:520px;overflow:auto">${esc(S.text || '(texto não disponível)')}</pre></div>`,
  };

  const body = $('#tab-body', box);
  let tabAtual = 'geral';
  const show = (k) => { tabAtual = k; $$('#tabs button', box).forEach((b) => b.classList.toggle('on', b.dataset.tab === k)); body.innerHTML = tabs[k](); bindTab(); };
  $('#tabs', box).onclick = (ev) => { const b = ev.target.closest('[data-tab]'); if (b) show(b.dataset.tab); };

  const recompute = () => { const c = completude(S.ex); S.ex.confianca = c.confianca; S.ex.campos_faltando = c.faltando; S.intel = inteligencia(S.ex, { comparaveis: ctx.data.comparaveis }); };
  function bindTab() {
    $$('[data-path]', body).forEach((inp) => inp.addEventListener('change', () => {
      const [a, b] = inp.dataset.path.split('.');
      S.ex[a] = S.ex[a] || {};
      S.ex[a][b] = inp.type === 'checkbox' ? inp.checked : inp.dataset.num !== undefined ? parseNum(inp.value) : (inp.value.trim() || null);
      recompute();
    }));
    $$('#tip-table [data-tf]', body).forEach((inp) => inp.addEventListener('change', () => {
      const i = +inp.closest('tr').dataset.i;
      S.ex.tipologias[i][inp.dataset.tf] = inp.dataset.num !== undefined ? parseNum(inp.value) : inp.value.trim();
      recompute();
    }));
    $$('[data-del]', body).forEach((b) => b.onclick = () => { S.ex.tipologias.splice(+b.dataset.del, 1); recompute(); renderResult(ctx, el); setTimeout(() => show('tip'), 0); });
    const add = $('#tip-add', body); if (add) add.onclick = () => { S.ex.tipologias.push({ nome: 'Nova planta', quartos: 2, suites: 0, banheiros: 1, vagas: 1, area_privativa: null, valor: null }); show('tip'); };
    $$('[data-rm]', body).forEach((c) => c.onclick = () => { const [k, v] = c.dataset.rm.split('|'); S.ex[k] = (S.ex[k] || []).filter((x) => x !== v); recompute(); show('lazer'); });
    [['#lz-add', 'lazer'], ['#df-add', 'diferenciais']].forEach(([sel, k]) => { const s = $(sel, body); if (s) s.onchange = () => { if (s.value) { S.ex[k] = [...(S.ex[k] || []), s.value]; recompute(); show('lazer'); } }; });
    $$('[data-copy]', body).forEach((b) => b.onclick = () => copy({ pitch: S.ex.inteligencia_ia?.pitch_30s || S.intel.pitch, args: uniqArgs(S.intel, S.ex).map((a, i) => `${i + 1}. ${a}`).join('\n'), whats: S.ex.inteligencia_ia?.mensagem_whatsapp || S.intel.whatsapp }[b.dataset.copy]));
    const q = $('#txt-q', body); if (q) q.oninput = () => { const pre = $('#txt-pre', body); const t = esc(S.text || ''); pre.innerHTML = q.value.length > 1 ? t.replace(new RegExp(q.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => `<mark>${m}</mark>`) : t; };
  }
  show(tabAtual);

  $('#btn-json', box).onclick = () => { const blob = new Blob([JSON.stringify({ ...S.ex, inteligencia: S.intel }, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(e.nome || 'book').replace(/\W+/g, '-')}.json`; a.click(); };
  $('#btn-save', box).onclick = () => salvar(ctx);
  $('#btn-buyers', box).onclick = () => compradores(ctx);
  $('#btn-ads', box).onclick = () => { sessionStorage.setItem('mi_ads_from_book', JSON.stringify(toRecords(S.ex, S.intel))); ctx.go('marketing'); };
  const ask = $('#ask-dev', box); if (ask) ask.onclick = (ev) => {
    ev.preventDefault();
    const msg = `Olá! Estou com o book do ${e.nome || 'empreendimento'} e, para apresentar aos meus clientes com segurança, preciso confirmar algumas informações que não constam no material:\n\n${S.ex.campos_faltando.map((c) => `• ${c}`).join('\n')}\n\nVocês conseguem me enviar a tabela de vendas atualizada e o memorial descritivo? Obrigado!`;
    modal(`<h2>Mensagem para a construtora</h2><div class="code mt">${esc(msg)}</div><div class="row mt" style="justify-content:flex-end"><button class="btn" data-close>Fechar</button><button class="btn primary" id="cp">Copiar</button></div>`).el.querySelector('#cp').onclick = () => copy(msg);
  };
}

const chips = (arr = [], k) => (arr || []).map((x) => `<span class="chip on click" data-rm="${k}|${esc(x)}" title="Remover">${esc(x)} ✕</span>`).join('') || '<span class="muted">Nenhum identificado</span>';
const uniqArgs = (it, ex) => [...new Set([...(ex.inteligencia_ia?.argumentos_venda || []), ...it.argumentos])].slice(0, 12);

function pseudoUnidades() {
  const rec = toRecords(S.ex, S.intel);
  return rec.tipologias.map((t, i) => ({ id: 'p' + i, status: 'disponivel', valor: t.valor_base || rec.empreendimento.valor_min, emp: { ...rec.empreendimento, ativo: true }, tip: t, identificacao: t.nome }));
}

function compradores(ctx) {
  const unis = pseudoUnidades();
  const res = unis.map((u) => ({ u, leads: leadsParaUnidade(u, ctx.data.leads, 6) }));
  modal(`<h2>Compradores compatíveis</h2><p class="muted mt-s">Clientes da sua base ordenados por aderência (orçamento, capacidade de crédito, tipologia, bairro, lazer, objetivo).</p>
    ${res.map(({ u, leads }) => `<h3 class="mt">${esc(u.tip.nome)} · ${brl(u.valor)}</h3><div class="list">${leads.filter((x) => x.score >= 35).map((x) => `
      <div class="list-item"><div class="grow"><div class="li-title">${esc(x.lead.nome)} <span class="badge b-gold">${x.score} pts</span></div>
      <div class="li-sub">${esc([...(x.motivos || []).slice(0, 2), ...(x.bloqueios || []).slice(0, 1).map((b) => '⚠ ' + b)].join(' · '))}</div></div>
      <a class="btn xs" href="#/leads/${x.lead.id}" data-close>Abrir</a></div>`).join('') || '<div class="muted">Nenhum cliente aderente nesta planta.</div>'}</div>`).join('')}
    <div class="row mt" style="justify-content:flex-end"><button class="btn" data-close>Fechar</button></div>`, { wide: true });
}

async function salvar(ctx) {
  const rec = toRecords(S.ex, S.intel);
  const e = rec.empreendimento;
  const podeEspelho = e.torres && e.andares && e.unidades_por_andar && rec.tipologias.length;
  const total = podeEspelho ? e.torres * e.andares * e.unidades_por_andar : 0;
  const m = modal(`<h2>Salvar empreendimento</h2><p class="muted mt-s">${esc(e.nome)} · ${rec.tipologias.length} tipologias</p>
    <label class="check mt"><input type="checkbox" id="gen" ${podeEspelho ? 'checked' : 'disabled'} /> Gerar espelho de vendas ${podeEspelho ? `(${total} unidades: ${e.torres} torre(s) × ${e.andares} andares × ${e.unidades_por_andar} por andar)` : '(informe torres, andares e unidades por andar)'}</label>
    <div class="field mt"><label>Valorização por andar (%)</label><input id="premio" data-num value="0,4" /></div>
    <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="ok">Salvar</button></div>`);
  m.el.querySelector('#ok').onclick = async () => {
    const btn = m.el.querySelector('#ok'); btn.disabled = true; btn.textContent = 'Salvando…';
    try {
      const emp = await ctx.db.insert('empreendimentos', { ...e, created_by: ctx.db.user?.id });
      const tips = rec.tipologias.length ? await ctx.db.insert('tipologias', rec.tipologias.map((t) => ({ ...t, empreendimento_id: emp.id }))) : [];
      if (m.el.querySelector('#gen').checked && tips.length) {
        const premio = (parseNum(m.el.querySelector('#premio').value) || 0) / 100;
        const unis = [];
        for (let t = 1; t <= e.torres; t++) for (let a = 1; a <= e.andares; a++) for (let p = 1; p <= e.unidades_por_andar; p++) {
          const tp = tips[(p - 1) % tips.length];
          const base = tp.valor_base || e.valor_min;
          const v = base ? Math.round(base * (1 + (a - 1) * premio)) : null;
          unis.push({ empreendimento_id: emp.id, tipologia_id: tp.id, identificacao: `${e.torres > 1 ? `T${t}-` : ''}${a}${String(p).padStart(2, '0')}`, torre: `Torre ${t}`, andar: a, status: 'disponivel', valor: v, valor_tabela: v });
        }
        for (let i = 0; i < unis.length; i += 500) await ctx.db.insert('unidades', unis.slice(i, i + 500));
      }
      if (S.bookId) ctx.db.update('books', S.bookId, { empreendimento_id: emp.id, status: 'revisado', extracao: S.ex }).catch(() => {});
      await ctx.refresh();
      m.close();
      toast('Empreendimento salvo!', 'ok');
      ctx.go('imoveis/' + emp.id);
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Salvar'; }
  };
}
