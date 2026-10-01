// Gráfico de linha SVG: eixo único, linhas 2px, rótulo direto no fim, crosshair + tooltip.
import { esc } from './ui.js';

export function lineChart(container, { series, xLabel = (x) => x, yFmt = (v) => v, height = 240, title = '' }) {
  const W = Math.max(container.clientWidth || 600, 320), H = height;
  const pad = { l: 64, r: 92, t: 12, b: 28 };
  const xs = series[0].values.map((p) => p.x);
  const allY = series.flatMap((s) => s.values.map((p) => p.y));
  const yMax = niceMax(Math.max(...allY, 1));
  const X = (i) => pad.l + (i / Math.max(xs.length - 1, 1)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / yMax) * (H - pad.t - pad.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const xt = xs.length > 8 ? xs.map((x, i) => i).filter((i) => i % Math.ceil(xs.length / 7) === 0 || i === xs.length - 1) : xs.map((x, i) => i);
  // rótulos diretos sem colisão
  const ends = series.map((s) => ({ s, y: Y(s.values[s.values.length - 1].y) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  container.classList.add('chart');
  container.innerHTML = `
    ${series.length > 1 ? `<div class="legend" style="margin-bottom:8px">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : ''}
    <svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(title)}">
      ${ticks.map((t) => `<line class="grid-l" x1="${pad.l}" x2="${W - pad.r}" y1="${Y(t)}" y2="${Y(t)}"/><text class="axis-t" x="${pad.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yFmt(t))}</text>`).join('')}
      ${xt.map((i) => `<text class="axis-t" x="${X(i)}" y="${H - 8}" text-anchor="middle">${esc(xLabel(xs[i]))}</text>`).join('')}
      ${series.map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${s.values.map((p, i) => `${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}"/>`).join('')}
      ${ends.map((e) => `<text class="lbl-t" x="${W - pad.r + 8}" y="${e.y + 4}">${esc(e.s.name)}</text>`).join('')}
      <line class="xhair" id="xh" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" style="display:none"/>
      ${series.map((s, k) => `<circle id="dot${k}" r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2" style="display:none"/>`).join('')}
      <rect x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent" id="hit"/>
    </svg><div class="chart-tip" style="display:none"></div>`;
  const svg = container.querySelector('svg'), tip = container.querySelector('.chart-tip'), xh = svg.querySelector('#xh');
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(xs.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (xs.length - 1))));
    xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.style.display = '';
    series.forEach((s, k) => { const d = svg.querySelector('#dot' + k); d.setAttribute('cx', X(i)); d.setAttribute('cy', Y(s.values[i].y)); d.style.display = ''; });
    tip.innerHTML = `<b>${esc(xLabel(xs[i]))}</b>${series.map((s) => `<div class="r"><span class="sw" style="background:${s.color}"></span>${esc(s.name)}: <b>${esc(yFmt(s.values[i].y))}</b></div>`).join('')}`;
    tip.style.display = '';
    const left = (X(i) / W) * r.width;
    tip.style.left = `${Math.min(left + 12, r.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${series.length > 1 ? 30 : 4}px`;
  };
  const leave = () => { xh.style.display = 'none'; tip.style.display = 'none'; series.forEach((s, k) => (svg.querySelector('#dot' + k).style.display = 'none')); };
  const hit = svg.querySelector('#hit');
  hit.addEventListener('mousemove', move); hit.addEventListener('touchmove', move, { passive: true });
  hit.addEventListener('mouseleave', leave); hit.addEventListener('touchend', leave);
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
