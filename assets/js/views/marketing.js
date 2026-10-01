import { $, $$, esc, copy, toast } from '../ui.js';
import { gerarAnuncios } from '../engine/copy.js';
import { agentById, buildContexto } from '../engine/agents.js';

export async function render(el, ctx, params) {
  const d = ctx.data;
  let fromBook = null;
  try { fromBook = JSON.parse(sessionStorage.getItem('mi_ads_from_book') || 'null'); } catch { /* */ }
  const sel = params?.[0] || (fromBook ? '__book' : d.empreendimentos[0]?.id || '');
  el.innerHTML = `
  <div class="page-head"><div><h1>Anúncios</h1><p>Copy pronta para Instagram, Stories, Reels, portais, Google Ads e WhatsApp.</p></div>
    <select id="m-emp" style="max-width:300px">${fromBook ? `<option value="__book" ${sel === '__book' ? 'selected' : ''}>✦ ${esc(fromBook.empreendimento.nome)} (book)</option>` : ''}${d.empreendimentos.map((e) => `<option value="${e.id}" ${sel === e.id ? 'selected' : ''}>${esc(e.nome)}</option>`).join('')}</select></div>
  <div id="ads"></div>`;
  const draw = (id) => {
    let emp, tips, intel;
    if (id === '__book') { emp = fromBook.empreendimento; tips = fromBook.tipologias; intel = emp.dados_extraidos?.inteligencia || {}; }
    else { emp = d.empreendimentos.find((e) => e.id === id); tips = d.tipologias.filter((t) => t.empreendimento_id === id); intel = emp?.dados_extraidos?.inteligencia || {}; }
    if (!emp) { $('#ads', el).innerHTML = '<div class="empty">Cadastre um empreendimento primeiro.</div>'; return; }
    const a = gerarAnuncios(emp, tips, intel);
    const card = (t, body, key, extra = '') => `<div class="card"><div class="card-head"><h3>${t}</h3><div class="row">${extra}<button class="btn xs" data-cp="${key}">Copiar</button></div></div>${body}</div>`;
    const texts = {
      ig: a.instagram, wa: a.whatsapp, portal: `${a.portal.titulo}\n\n${a.portal.descricao}`, stories: a.stories.map((s) => `Frame ${s.frame}: ${s.texto}\n(visual: ${s.visual})`).join('\n\n'),
      reels: a.reels.join('\n'), gads: `Títulos:\n${a.googleAds.headlines.join('\n')}\n\nDescrições:\n${a.googleAds.descricoes.join('\n')}`,
    };
    $('#ads', el).innerHTML = `<div class="grid g2">
      ${card('Instagram — feed', `<div class="code">${esc(a.instagram)}</div>`, 'ig', ctx.db.aiMode() ? '<button class="btn xs" id="ai-ig">✦ Melhorar com Diego (IA)</button>' : '')}
      ${card('WhatsApp — lista de transmissão', `<div class="code">${esc(a.whatsapp)}</div>`, 'wa')}
      ${card(`Portal (ZAP/OLX/VivaReal) — título ${a.portal.titulo.length}/60`, `<div style="font-weight:800">${esc(a.portal.titulo)}</div><div class="code mt-s">${esc(a.portal.descricao)}</div>`, 'portal')}
      <div class="col">${card('Stories (3 frames)', a.stories.map((s) => `<div class="lesson mt-s"><h4>Frame ${s.frame}</h4><div style="white-space:pre-wrap">${esc(s.texto)}</div><div class="hint">${esc(s.visual)}</div></div>`).join(''), 'stories')}
      ${card('Roteiro de Reels — 30s', `<div class="list">${a.reels.map((r) => `<div class="list-item" style="padding:7px 0">${esc(r)}</div>`).join('')}</div>`, 'reels')}
      ${card('Google Ads', `<div class="muted" style="font-size:12px">Títulos (≤30)</div>${a.googleAds.headlines.map((x) => `<div class="row between"><span>${esc(x)}</span><small class="muted">${x.length}</small></div>`).join('')}<div class="muted mt-s" style="font-size:12px">Descrições (≤90)</div>${a.googleAds.descricoes.map((x) => `<div class="row between"><span>${esc(x)}</span><small class="muted">${x.length}</small></div>`).join('')}`, 'gads')}</div>
    </div><div id="ai-out" class="mt"></div>`;
    $$('[data-cp]', el).forEach((b) => b.onclick = () => copy(texts[b.dataset.cp]));
    const ai = $('#ai-ig', el);
    if (ai) ai.onclick = async () => {
      const out = $('#ai-out', el);
      out.innerHTML = '<div class="card"><h3>Diego (IA)</h3><div class="code mt-s" id="ai-txt">…</div></div>';
      const diego = agentById('diego');
      try {
        await ctx.db.aiChat({ persona: diego, messages: [{ role: 'user', content: `Reescreva este post de Instagram para gerar mais leads, com gancho forte na 1ª linha, benefício antes de característica e CTA claro. Entregue 2 versões (uma sofisticada e uma direta) e 5 ideias de criativo.\n\nDados do empreendimento: ${JSON.stringify({ nome: emp.nome, bairro: emp.bairro, lazer: emp.lazer, diferenciais: emp.diferenciais, valor_min: emp.valor_min, programa: emp.programa })}\n\nPost atual:\n${a.instagram}` }], contexto: buildContexto(d, 'diego'), onDelta: (_, full) => ($('#ai-txt', el).textContent = full) });
      } catch (e) { $('#ai-txt', el).textContent = 'IA indisponível: ' + e.message; }
    };
  };
  $('#m-emp', el).onchange = (e) => draw(e.target.value);
  draw(sel);
}
