// Destrinchador de book com IA na Vercel (OpenAI). Recebe o texto extraído no navegador.
const L = require('./_lib');
const { BOOK_SCHEMA, BOOK_SYSTEM } = require('./_book-schema');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return L.enviar(res, 405, { error: 'method not allowed' });
  const st = L.status();
  if (!st.configured) return L.enviar(res, 503, { error: st.erro });
  let body;
  try { body = await L.lerBody(req); } catch { return L.enviar(res, 400, { error: 'JSON inválido' }); }
  const auth = await L.autenticar(req).catch((e) => ({ erro: e.message, code: 502 }));
  if (auth.erro) return L.enviar(res, auth.code, { error: auth.erro });
  const text = String(body.text || '').trim();
  if (!text) return L.enviar(res, 400, { error: 'Texto do book vazio.' });
  if (text.length > 1500000) return L.enviar(res, 413, { error: 'Book grande demais para uma análise. Divida em partes.' });
  try {
    const r = await L.jsonOut(BOOK_SYSTEM, `<book arquivo="${String(body.filename || 'book').replace(/"/g, '')}">\n${text}\n</book>\n\nDestrinche este book no formato JSON solicitado.`, BOOK_SCHEMA, 'book');
    await L.logUso(auth, 'book', r.usage);
    return L.enviar(res, 200, { ok: true, metodo: 'ia-openai-texto', extracao: r.data, provider: 'openai', model: L.MODEL });
  } catch (e) { return L.enviar(res, 502, { error: e.message }); }
};
