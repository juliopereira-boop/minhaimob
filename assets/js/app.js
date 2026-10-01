import { db } from './db.js';
import { $, $$, esc, h, toast, modal, initials, debounce, brl } from './ui.js';

const ROUTES = {
  dashboard: () => import('./views/dashboard.js'),
  pipeline: () => import('./views/pipeline.js'),
  leads: () => import('./views/leads.js'),
  imoveis: () => import('./views/imoveis.js'),
  book: () => import('./views/book.js'),
  ia: () => import('./views/ia.js'),
  credito: () => import('./views/credito.js'),
  mercado: () => import('./views/mercado.js'),
  marketing: () => import('./views/marketing.js'),
  academia: () => import('./views/academia.js'),
  ajustes: () => import('./views/ajustes.js'),
};

export const ctx = {
  db,
  data: null,
  async refresh() { ctx.data = await db.loadAll(); return ctx.data; },
  go(route) { location.hash = '#/' + route; },
};
window.__mi = ctx;

let current = null;
async function route() {
  const [name, ...rest] = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('/');
  const r = ROUTES[name] ? name : 'dashboard';
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
  $('#sidebar').classList.remove('open');
  const el = $('#view');
  el.innerHTML = '<div class="empty"><div class="typing"><span></span><span></span><span></span></div></div>';
  try {
    const mod = await ROUTES[r]();
    if (current?.destroy) current.destroy();
    current = mod;
    el.innerHTML = '';
    await mod.render(el, ctx, rest);
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="callout red"><b>Erro ao abrir a tela.</b><br>${esc(e.message || e)}</div>`;
  }
}

function header() {
  $('#me-name').textContent = db.profile?.nome || db.user?.email || '—';
  $('#me-org').textContent = db.org?.nome || '—';
  $('#me-avatar').textContent = initials(db.profile?.nome || db.user?.email);
  const b = $('#mode-banner');
  if (db.mode === 'local') {
    b.innerHTML = `<div class="mode-banner">◆ Modo local (dados no seu navegador). Conecte o Supabase em <a href="#/ajustes" style="color:inherit;text-decoration:underline">Configurações</a> para usar com a equipe.</div>`;
  } else b.innerHTML = '';
}

function onboarding() {
  return new Promise((resolve) => {
    const m = modal(`
      <h2>Bem-vindo à MinhaImob</h2>
      <p class="muted mt-s">Crie sua imobiliária para começar. Você será o administrador.</p>
      <form id="f-onb" class="mt">
        <div class="field"><label>Nome da imobiliária / equipe</label><input name="nome" required placeholder="Ex.: Imobiliária Ilha" /></div>
        <div class="field-row"><div class="field"><label>Cidade</label><input name="cidade" value="São Luís" /></div>
        <div class="field"><label>UF</label><input name="uf" value="MA" maxlength="2" /></div></div>
        <label class="check mt-s"><input type="checkbox" name="demo" checked /> Carregar dados de demonstração para explorar</label>
        <div class="row mt" style="justify-content:flex-end"><button class="btn primary" type="submit">Criar e entrar</button></div>
      </form>`);
    m.el.querySelector('#f-onb').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Criando…';
      try {
        await db.onboard(f.nome.value.trim(), f.cidade.value.trim(), f.uf.value.trim());
        if (f.demo.checked) await db.rpc('fn_seed_demo', { p_org: db.orgId });
        m.close(); resolve();
      } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Criar e entrar'; }
    };
  });
}

function globalSearch() {
  const inp = $('#gsearch'), res = $('#gsearch-res');
  const run = debounce(() => {
    const q = inp.value.trim().toLowerCase();
    if (q.length < 2 || !ctx.data) { res.classList.add('hide'); return; }
    const d = ctx.data;
    const leads = d.leads.filter((l) => [l.nome, l.telefone, l.email].some((x) => String(x || '').toLowerCase().includes(q))).slice(0, 6);
    const emps = d.empreendimentos.filter((e) => [e.nome, e.bairro, e.construtora].some((x) => String(x || '').toLowerCase().includes(q))).slice(0, 5);
    const unis = d.unidades.filter((u) => String(u.identificacao || '').toLowerCase().includes(q)).slice(0, 5);
    const items = [
      ...leads.map((l) => `<div class="list-item click" data-go="leads/${l.id}"><span class="avatar">${esc(initials(l.nome))}</span><div><div class="li-title">${esc(l.nome)}</div><div class="li-sub">Cliente · ${esc(l.telefone || '')}</div></div></div>`),
      ...emps.map((e) => `<div class="list-item click" data-go="imoveis/${e.id}"><span class="avatar">⌂</span><div><div class="li-title">${esc(e.nome)}</div><div class="li-sub">${esc(e.bairro || '')} · a partir de ${brl(e.valor_min)}</div></div></div>`),
      ...unis.map((u) => `<div class="list-item click" data-go="imoveis/${u.empreendimento_id}"><span class="avatar">▦</span><div><div class="li-title">${esc(u.identificacao)}</div><div class="li-sub">Unidade · ${brl(u.valor)}</div></div></div>`),
    ];
    res.innerHTML = items.length ? items.join('') : '<div class="empty" style="padding:16px">Nada encontrado</div>';
    res.classList.remove('hide');
  }, 160);
  inp.addEventListener('input', run);
  inp.addEventListener('focus', run);
  res.addEventListener('click', (e) => { const it = e.target.closest('[data-go]'); if (it) { ctx.go(it.dataset.go); res.classList.add('hide'); inp.value = ''; } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) res.classList.add('hide'); });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.focus(); } });
}

async function boot() {
  const ok = await db.init({ requireAuth: true });
  if (!ok) return;
  if (db.mode === 'supabase' && !db.orgId) await onboarding();
  if (db.mode === 'local' && !db.store.t('empreendimentos').length && !localStorage.getItem('mi_seeded')) {
    await db.rpc('fn_seed_demo'); localStorage.setItem('mi_seeded', '1');
  }
  header();
  await ctx.refresh();
  db.realtime();
  db.on(debounce(async (t) => {
    await ctx.refresh();
    if (current?.onData) current.onData(t);
  }, 400));
  globalSearch();
  $('#btn-menu').onclick = () => $('#sidebar').classList.toggle('open');
  $('#btn-theme').onclick = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('mi_theme', next); } catch { /* */ }
  };
  $('#btn-new-lead').onclick = async () => { const m = await import('./views/leads.js'); m.leadForm(ctx); };
  window.addEventListener('hashchange', route);
  route();
}
boot().catch((e) => { console.error(e); $('#view').innerHTML = `<div class="callout red"><b>Falha ao iniciar.</b><br>${esc(e.message)}</div>`; });
