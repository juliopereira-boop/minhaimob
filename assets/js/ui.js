// Helpers de UI, formatação e componentes
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- formatação ----------
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const BRL2 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const NUM = new Intl.NumberFormat('pt-BR');
export const brl = (n) => (n == null || isNaN(n) ? '—' : BRL.format(n));
export const brl2 = (n) => (n == null || isNaN(n) ? '—' : BRL2.format(n));
export const num = (n, d = 0) => (n == null || isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
export const pct = (n, d = 0) => (n == null || isNaN(n) ? '—' : `${num(n, d)}%`);
export const m2 = (n) => (n == null || isNaN(n) ? '—' : `${num(n, n % 1 ? 2 : 0)} m²`);
export function brlK(n) {
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `R$ ${num(n / 1e9, 1)} bi`;
  if (a >= 1e6) return `R$ ${num(n / 1e6, a >= 1e7 ? 1 : 2)} mi`;
  if (a >= 1e3) return `R$ ${num(n / 1e3, 0)} mil`;
  return brl(n);
}
export function date(d) {
  if (!d) return '—';
  const x = new Date(d);
  return isNaN(x) ? String(d) : x.toLocaleDateString('pt-BR');
}
export function dateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
export function rel(d) {
  if (!d) return 'nunca';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) { const f = -s; if (f < 3600) return `em ${Math.round(f / 60)} min`; if (f < 86400) return `em ${Math.round(f / 3600)} h`; return `em ${Math.round(f / 86400)} d`; }
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 86400 * 30) return `há ${Math.round(s / 86400)} d`;
  return date(d);
}
export const daysSince = (d) => (d ? (Date.now() - new Date(d).getTime()) / 86400000 : 999);
export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const parseNum = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[R$\s]/g, '');
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return isNaN(n) ? null : n;
};
export const onlyDigits = (s) => String(s || '').replace(/\D/g, '');
export const waLink = (tel, text) => `https://wa.me/55${onlyDigits(tel).replace(/^55/, '')}?text=${encodeURIComponent(text || '')}`;

// ---------- rótulos ----------
export const STAGES = [
  { id: 'novo', label: 'Novo lead', cor: '#7F8BA3' },
  { id: 'qualificacao', label: 'Qualificação', cor: '#5AA9FF' },
  { id: 'visita', label: 'Visita', cor: '#A08CFF' },
  { id: 'proposta', label: 'Proposta', cor: '#F2B544' },
  { id: 'analise_credito', label: 'Análise de crédito', cor: '#FF8A4C' },
  { id: 'contrato', label: 'Contrato', cor: '#D9A55B' },
  { id: 'repasse', label: 'Repasse', cor: '#EFC27E' },
  { id: 'assinatura', label: 'Assinatura', cor: '#39C98A' },
  { id: 'ganho', label: 'Vendido', cor: '#39C98A' },
  { id: 'perdido', label: 'Perdido', cor: '#F06B6B' },
];
export const stageLabel = (s) => STAGES.find((x) => x.id === s)?.label || s;
export const stageColor = (s) => STAGES.find((x) => x.id === s)?.cor || '#7F8BA3';
export const UNIT_STATUS = { disponivel: 'Disponível', reservado: 'Reservado', proposta: 'Em proposta', vendido: 'Vendido', bloqueado: 'Bloqueado', permuta: 'Permuta' };
export const TEMP_LABEL = { frio: 'Frio', morno: 'Morno', quente: 'Quente', fervendo: 'Fervendo' };
export const TEMP_ICON = { frio: '❄', morno: '◐', quente: '▲', fervendo: '🔥' };
export const tempBadge = (t) => `<span class="badge ${({ frio: 'b-blue', morno: 'b-amber', quente: 'b-gold', fervendo: 'b-red' })[t] || 'b-gray'}">${TEMP_ICON[t] || ''} ${TEMP_LABEL[t] || t || '—'}</span>`;
export const scoreBar = (s) => `<div class="score"><div class="bar"><i style="width:${clamp(s || 0, 0, 100)}%;background-position:${-(clamp(s || 0, 0, 100) * 2)}px 0"></i></div><b>${Math.round(s || 0)}</b></div>`;
export const healthColor = (hv) => (hv >= 75 ? 'var(--green)' : hv >= 50 ? 'var(--amber)' : 'var(--red)');

// ---------- toast ----------
export function toast(msg, type = 'info', ms = 3600) {
  let box = $('.toasts');
  if (!box) { box = h('<div class="toasts"></div>'); document.body.appendChild(box); }
  const icon = { ok: '✓', err: '✕', info: '◆' }[type] || '◆';
  const el = h(`<div class="toast ${type}"><span>${icon}</span><div>${esc(msg)}</div></div>`);
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = '.3s'; setTimeout(() => el.remove(), 300); }, ms);
}

// ---------- overlay helpers ----------
function mountOverlay(panel, onClose) {
  const ov = h('<div class="overlay"></div>');
  const close = () => { ov.remove(); panel.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(ov, panel);
  panel.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return close;
}
export function drawer(html, { onClose } = {}) {
  const panel = h(`<aside class="drawer">${html}</aside>`);
  const close = mountOverlay(panel, onClose);
  return { el: panel, close };
}
export function modal(html, { wide = false, onClose } = {}) {
  const panel = h(`<div class="modal ${wide ? 'wide' : ''}">${html}</div>`);
  const close = mountOverlay(panel, onClose);
  return { el: panel, close };
}
export function confirmBox(text, { ok = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(`<h2>Confirmar</h2><p class="mt-s muted">${esc(text)}</p>
      <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`, { onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('[data-ok]').onclick = () => { done = true; m.close(); resolve(true); };
  });
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado', 'ok', 1600); }
  catch { toast('Não foi possível copiar', 'err'); }
}

/** Serializa um form em objeto, convertendo números (data-num) e listas (data-list). */
export function formData(form) {
  const o = {};
  form.querySelectorAll('[name]').forEach((el) => {
    const k = el.name;
    if (el.type === 'checkbox') o[k] = el.checked;
    else if (el.dataset.num !== undefined) o[k] = parseNum(el.value);
    else if (el.dataset.list !== undefined) o[k] = el.value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    else o[k] = el.value.trim() === '' ? null : el.value.trim();
  });
  return o;
}

export function sparkline(values, { w = 90, hgt = 28, color = 'var(--gold)' } = {}) {
  if (!values?.length) return '';
  const max = Math.max(...values, 1), min = Math.min(...values, 0);
  const step = w / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(hgt - ((v - min) / (max - min || 1)) * (hgt - 4) - 2).toFixed(1)}`).join(' ');
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><polyline fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/></svg>`;
}

/** Markdown mínimo e seguro para respostas da IA. */
export function md(text) {
  let s = esc(text);
  s = s.replace(/^### (.*)$/gm, '<b>$1</b>').replace(/^## (.*)$/gm, '<b>$1</b>').replace(/^# (.*)$/gm, '<b>$1</b>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/^\s*[-•]\s+/gm, '• ');
  return s;
}
