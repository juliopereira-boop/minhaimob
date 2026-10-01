// Console do superadmin: clientes (imobiliárias), planos, superadmins e configurações da plataforma.
import { db } from './db.js';
import { $, $$, esc, brl, brlK, num, date, rel, toast, modal, drawer, confirmBox, copy, formData, waLink, debounce } from './ui.js';

const root = $('#adm');
const ST = {
  trial: ['Trial', 'b-blue'], ativo: ['Ativo', 'b-green'], inadimplente: ['Inadimplente', 'b-amber'],
  suspenso: ['Suspenso', 'b-red'], cancelado: ['Cancelado', 'b-gray'],
};
const badge = (c) => {
  if (c.status === 'trial' && !c.liberada) return '<span class="badge b-red">Trial vencido</span>';
  const [l, k] = ST[c.status] || [c.status, 'b-gray'];
  return `<span class="badge ${k}">${l}</span>`;
};
let state = { tab: 'clientes', q: '', st: '', clientes: [], metricas: {}, planos: [], cfg: {} };

const ok = await db.init({ requireAuth: true });
if (ok) boot();

async function boot() {
  $('#b-out').onclick = () => db.signOut();
  if (db.mode !== 'supabase') {
    root.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto"><h2>Console indisponível no modo local</h2><p class="muted mt-s">A gestão de clientes da plataforma precisa do Supabase conectado. Configure em <a href="app.html#/ajustes">Configurações</a>.</p></div>`;
    return;
  }
  if (!db.isSuperadmin) {
    root.innerHTML = `<div class="card" style="max-width:640px;margin:40px auto"><h2>Acesso restrito</h2><p class="mt-s">Logado como <b>${esc(db.user?.email || '')}</b>.</p><p class="muted mt-s">Esta área é exclusiva do administrador da plataforma. Para se tornar o primeiro superadmin, rode no SQL Editor do Supabase (com o e-mail da sua conta):</p>
      <div class="code mt">insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = lower('${esc(db.user?.email || 'SEU_EMAIL')}')
on conflict do nothing;</div><a class="btn primary mt" href="admin.html">Já rodei, recarregar</a></div>`;
    return;
  }
  await load();
  render();
}

async function load() {
  const [c, m, p, cfg] = await Promise.all([
    db.rpc('fn_admin_clientes'), db.rpc('fn_admin_metricas'),
    db.sb.from('planos').select('*').order('ordem'), db.sb.from('platform_config').select('*').eq('id', 1).maybeSingle(),
  ]);
  state.clientes = c || []; state.metricas = m || {}; state.planos = p.data || []; state.cfg = cfg.data || {};
}

function render() {
  const m = state.metricas;
  root.innerHTML = `
  <div class="page-head"><div><h1>Clientes da plataforma</h1><p>${num(m.clientes)} imobiliárias · ${num(m.usuarios)} usuários · ${num(m.novos_30d)} novas em 30 dias</p></div>
    <button class="btn primary" id="b-new">+ Novo cliente</button></div>
  <div class="grid g4">
    <div class="card kpi glow"><div class="label">MRR (receita mensal)</div><div class="value">${brl(m.mrr)}</div><div class="delta muted">ARR ${brlK((m.mrr || 0) * 12)}</div></div>
    <div class="card kpi"><div class="label">Clientes ativos</div><div class="value" style="color:var(--green)">${num(m.ativos)}</div><div class="delta muted">${num(m.inadimplentes)} inadimplente(s)</div></div>
    <div class="card kpi"><div class="label">Em teste grátis</div><div class="value" style="color:var(--blue)">${num(m.trial)}</div><div class="delta ${m.trial_vencendo_7d ? 'down' : 'muted'}">${num(m.trial_vencendo_7d)} vencendo em 7 dias · potencial ${brl(m.mrr_potencial_trial)}</div></div>
    <div class="card kpi"><div class="label">Perdidos / bloqueados</div><div class="value" style="color:var(--red)">${num((m.suspensos || 0) + (m.cancelados || 0) + (m.trial_vencido || 0))}</div><div class="delta muted">${num(m.suspensos)} susp. · ${num(m.cancelados)} canc. · ${num(m.trial_vencido)} trial vencido</div></div>
  </div>
  <div class="tabs mt" id="tabs">${[['clientes', 'Clientes'], ['planos', 'Planos'], ['ia', 'Integrações (IA)'], ['supers', 'Superadmins'], ['config', 'Configurações']].map(([k, l]) => `<button data-t="${k}" class="${state.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  <div id="body"></div>`;
  $('#b-new').onclick = novoCliente;
  $('#tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) { state.tab = b.dataset.t; render(); } };
  ({ clientes: tabClientes, planos: tabPlanos, ia: tabIA, supers: tabSupers, config: tabConfig })[state.tab]($('#body'));
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------
function tabClientes(el) {
  const draw = () => {
    let list = state.clientes;
    if (state.q) { const q = state.q.toLowerCase(); list = list.filter((c) => [c.nome, c.cidade, c.contato_nome, c.contato_email, c.donos, c.cnpj].some((x) => String(x || '').toLowerCase().includes(q))); }
    if (state.st === 'trial_vencido') list = list.filter((c) => c.status === 'trial' && !c.liberada);
    else if (state.st) list = list.filter((c) => c.status === state.st);
    $('#tb', el).innerHTML = list.map((c) => `<tr class="click" data-id="${c.id}">
      <td><div style="font-weight:700">${esc(c.nome)}</div><div class="muted" style="font-size:12px">${esc([c.cidade && `${c.cidade}${c.uf ? '/' + c.uf : ''}`, c.contato_nome].filter(Boolean).join(' · ') || '—')}</div></td>
      <td>${esc(state.planos.find((p) => p.id === c.plano)?.nome || c.plano || '—')}</td><td>${badge(c)}</td><td class="num">${brl(c.valor_mensal)}</td>
      <td class="nowrap">${c.status === 'trial' ? date(c.trial_ate) : '—'}</td>
      <td class="num">${num(c.usuarios)}${c.limite_usuarios ? `/${c.limite_usuarios}` : ''}${c.convites_pendentes ? ` <span class="badge b-amber">+${c.convites_pendentes} conv.</span>` : ''}</td>
      <td class="muted" style="font-size:12px">${num(c.leads)} leads · ${num(c.empreendimentos)} emp. · ${num(c.unidades)} un.</td>
      <td class="num">${num(c.vendas)} · ${brlK(c.vgv_vendido)}</td><td class="num" title="${num(c.ia_tokens_30d)} tokens">${num(c.ia_chamadas_30d)}</td><td class="nowrap muted">${c.ultima_atividade ? rel(c.ultima_atividade) : 'nunca'}</td></tr>`).join('')
      || '<tr><td colspan="10"><div class="empty">Nenhum cliente. Clique em “Novo cliente”.</div></td></tr>';
    $$('tr[data-id]', el).forEach((tr) => tr.onclick = () => abrirCliente(tr.dataset.id));
  };
  const cnt = (s) => state.clientes.filter((c) => (s === 'trial_vencido' ? c.status === 'trial' && !c.liberada : c.status === s)).length;
  el.innerHTML = `<div class="card"><div class="row wrap"><input id="q" placeholder="Buscar por nome, cidade, contato, CNPJ…" value="${esc(state.q)}" style="max-width:320px" />
    ${[['', 'Todos'], ['ativo', 'Ativos'], ['trial', 'Trial'], ['trial_vencido', 'Trial vencido'], ['inadimplente', 'Inadimplentes'], ['suspenso', 'Suspensos'], ['cancelado', 'Cancelados']].map(([k, l]) => `<span class="chip click ${state.st === k ? 'on' : ''}" data-st="${k}">${l}${k ? ` (${cnt(k)})` : ''}</span>`).join('')}</div></div>
  <div class="card pad-0 mt"><div class="table-wrap"><table class="t"><thead><tr><th>Cliente</th><th>Plano</th><th>Status</th><th class="num">R$/mês</th><th>Trial até</th><th class="num">Usuários</th><th>Uso</th><th class="num">Vendas</th><th class="num">IA 30d</th><th>Última atividade</th></tr></thead><tbody id="tb"></tbody></table></div></div>
  <div class="hint mt">Por privacidade (LGPD), o console mostra apenas números agregados de cada cliente, nunca os dados dos leads.</div>`;
  $('#q', el).oninput = debounce((e) => { state.q = e.target.value; draw(); }, 200);
  $$('[data-st]', el).forEach((c) => c.onclick = () => { state.st = c.dataset.st; $$('[data-st]', el).forEach((x) => x.classList.toggle('on', x === c)); draw(); });
  draw();
}

const planoOpts = (sel) => state.planos.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.nome)} — ${brl(p.valor_mensal)}/mês</option>`).join('');
const linkConvite = (email) => `${location.origin}${location.pathname.replace(/admin\.html$/, '')}index.html?convite=1&email=${encodeURIComponent(email)}`;
const msgConvite = (nome, email) => `Olá! Sua imobiliária *${nome}* já está ativa na MinhaImob 🏡\n\nCrie sua senha com o e-mail ${email} neste link e comece a usar:\n${linkConvite(email)}\n\nQualquer dúvida, estou à disposição.`;

function novoCliente() {
  const cfg = state.cfg;
  const m = modal(`<h2>Novo cliente</h2><p class="muted mt-s">Cadastre a imobiliária e o e-mail do dono. Quando ele criar a conta com esse e-mail, entra direto como administrador.</p>
  <form id="nf" class="mt">
    <div class="field-row"><div class="field"><label>Nome da imobiliária *</label><input name="nome" required /></div><div class="field"><label>CNPJ</label><input name="cnpj" /></div></div>
    <div class="field-row"><div class="field"><label>Cidade</label><input name="cidade" /></div><div class="field"><label>UF</label><input name="uf" maxlength="2" /></div></div>
    <div class="field-row"><div class="field"><label>Responsável</label><input name="contato_nome" /></div><div class="field"><label>E-mail do dono (login) *</label><input name="owner_email" type="email" required /></div><div class="field"><label>WhatsApp</label><input name="contato_telefone" /></div></div>
    <div class="field-row"><div class="field"><label>Plano</label><select name="plano" id="nf-plano">${planoOpts(cfg.plano_padrao || 'starter')}</select></div>
      <div class="field"><label>Valor mensal (R$)</label><input name="valor_mensal" data-num id="nf-valor" /></div>
      <div class="field"><label>Limite de usuários</label><input name="limite_usuarios" data-num id="nf-lim" placeholder="do plano" /></div></div>
    <div class="field-row"><div class="field"><label>Status inicial</label><select name="status" id="nf-st"><option value="trial">Teste grátis</option><option value="ativo">Ativo (pagante)</option></select></div>
      <div class="field" id="nf-dias-f"><label>Dias de teste</label><input name="trial_dias" data-num value="${cfg.trial_dias || 14}" /></div></div>
    <div class="field"><label>Observações internas</label><textarea name="observacoes" placeholder="Como chegou, negociação, forma de pagamento…"></textarea></div>
    <div class="row mt" style="justify-content:flex-end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Cadastrar cliente</button></div>
  </form>`, { wide: true });
  const syncPlano = () => { const p = state.planos.find((x) => x.id === m.el.querySelector('#nf-plano').value); if (p) { m.el.querySelector('#nf-valor').value = p.valor_mensal; m.el.querySelector('#nf-lim').placeholder = p.limite_usuarios ? `${p.limite_usuarios} (do plano)` : 'ilimitado'; } };
  syncPlano();
  m.el.querySelector('#nf-plano').onchange = syncPlano;
  m.el.querySelector('#nf-st').onchange = (e) => m.el.querySelector('#nf-dias-f').classList.toggle('hide', e.target.value !== 'trial');
  m.el.querySelector('#nf').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = formData(ev.target);
    const btn = ev.target.querySelector('button.primary'); btn.disabled = true;
    try {
      const r = await db.rpc('fn_admin_criar_cliente', { p: { ...f, contato_email: f.owner_email } });
      m.close();
      await load(); render();
      const txt = msgConvite(f.nome, f.owner_email);
      const r2 = modal(`<h2>✓ Cliente cadastrado</h2>
        <p class="mt-s">${r.dono === 'ok' ? `<b>${esc(f.owner_email)}</b> já tinha conta e foi vinculado como dono.` : `Convite criado para <b>${esc(f.owner_email)}</b>. Envie o link abaixo: ao criar a conta com esse e-mail, ele entra direto na imobiliária.`}</p>
        <div class="field mt"><label>Link de acesso</label><input readonly value="${esc(linkConvite(f.owner_email))}" /></div>
        <div class="code">${esc(txt)}</div>
        <div class="row wrap mt" style="justify-content:flex-end"><button class="btn" data-close>Fechar</button><button class="btn" id="cp">Copiar mensagem</button>${f.contato_telefone ? '<a class="btn success" id="wa" target="_blank" rel="noopener">Enviar no WhatsApp</a>' : ''}</div>`);
      r2.el.querySelector('#cp').onclick = () => copy(txt);
      const wa = r2.el.querySelector('#wa'); if (wa) wa.href = waLink(f.contato_telefone, txt);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
}

async function abrirCliente(id) {
  const c = state.clientes.find((x) => x.id === id);
  if (!c) return;
  const [{ data: convites }, { data: membros }] = await Promise.all([
    db.sb.from('org_convites').select('*').eq('org_id', id).is('aceito_em', null).order('created_at', { ascending: false }),
    db.sb.from('org_members').select('user_id, role, active, created_at, profiles(nome, email)').eq('org_id', id),
  ]);
  const dr = drawer(`<div class="drawer-head"><div class="grow"><h2>${esc(c.nome)}</h2><div class="row mt-s">${badge(c)}<span class="muted" style="font-size:12px">cliente desde ${date(c.created_at)} · ${esc(c.slug)}</span></div></div><button class="btn ghost icon" data-close>✕</button></div>
  <div class="drawer-body">
    <div class="grid g4">
      <div class="card kpi"><div class="label">Usuários</div><div class="value">${num(c.usuarios)}</div></div>
      <div class="card kpi"><div class="label">Leads</div><div class="value">${num(c.leads)}</div></div>
      <div class="card kpi"><div class="label">Unidades</div><div class="value">${num(c.unidades)}</div></div>
      <div class="card kpi"><div class="label">VGV vendido</div><div class="value">${brlK(c.vgv_vendido)}</div></div>
    </div>
    <div class="card mt"><h3>Ações rápidas</h3><div class="row wrap mt-s">
      ${c.status !== 'ativo' ? '<button class="btn sm success" data-st="ativo">✓ Ativar (pagante)</button>' : ''}
      ${c.status === 'trial' ? '<button class="btn sm" data-trial="7">+7 dias de teste</button><button class="btn sm" data-trial="30">+30 dias</button>' : ''}
      ${c.status === 'ativo' ? '<button class="btn sm" data-st="inadimplente">Marcar inadimplente</button>' : ''}
      ${c.status !== 'suspenso' ? '<button class="btn sm danger" data-st="suspenso">Suspender acesso</button>' : ''}
      ${c.status !== 'cancelado' ? '<button class="btn sm ghost" data-st="cancelado">Cancelar assinatura</button>' : ''}
    </div><div class="hint mt-s">Suspenso, cancelado ou trial vencido: o cliente perde o acesso na hora, e os dados ficam preservados.</div></div>
    <form class="card mt" id="ef"><h3>Dados e assinatura</h3><div class="field-row mt-s">
      <div class="field"><label>Nome</label><input name="nome" value="${esc(c.nome)}" /></div><div class="field"><label>CNPJ</label><input name="cnpj" value="${esc(c.cnpj || '')}" /></div>
      <div class="field"><label>Cidade</label><input name="cidade" value="${esc(c.cidade || '')}" /></div><div class="field"><label>UF</label><input name="uf" maxlength="2" value="${esc(c.uf || '')}" /></div>
      <div class="field"><label>Responsável</label><input name="contato_nome" value="${esc(c.contato_nome || '')}" /></div><div class="field"><label>E-mail de contato</label><input name="contato_email" value="${esc(c.contato_email || '')}" /></div>
      <div class="field"><label>WhatsApp</label><input name="contato_telefone" value="${esc(c.contato_telefone || '')}" /></div>
      <div class="field"><label>Plano</label><select name="plano">${planoOpts(c.plano)}</select></div>
      <div class="field"><label>Valor mensal (R$)</label><input name="valor_mensal" data-num value="${c.valor_mensal ?? ''}" /></div>
      <div class="field"><label>Limite de usuários</label><input name="limite_usuarios" data-num value="${c.limite_usuarios ?? ''}" placeholder="ilimitado" /></div>
      <div class="field"><label>Status</label><select name="status">${Object.entries(ST).map(([k, [l]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Trial até</label><input type="date" name="trial_ate" value="${esc(c.trial_ate || '')}" /></div></div>
      <div class="field"><label>Observações internas</label><textarea name="observacoes">${esc(c.observacoes || '')}</textarea></div>
      <button class="btn primary sm">Salvar alterações</button></form>
    <div class="card mt"><h3>Usuários</h3><div class="list mt-s">${(membros || []).map((u) => `<div class="list-item"><div class="grow"><div class="li-title">${esc(u.profiles?.nome || '—')}</div><div class="li-sub">${esc(u.profiles?.email || '')}</div></div><span class="badge ${u.role === 'owner' ? 'b-gold' : 'b-gray'}">${esc(u.role)}</span>${u.active ? '' : '<span class="badge b-red">inativo</span>'}</div>`).join('') || '<div class="muted">Ninguém entrou ainda.</div>'}
      ${(convites || []).map((v) => `<div class="list-item"><div class="grow"><div class="li-title">${esc(v.email)}</div><div class="li-sub">convite pendente · ${esc(v.role)} · ${rel(v.created_at)}</div></div><button class="btn xs" data-cp="${esc(v.email)}">Copiar link</button><button class="btn xs danger" data-delc="${v.id}">✕</button></div>`).join('')}</div>
      <form id="inv" class="row wrap mt"><input name="email" type="email" required placeholder="email@imobiliaria.com" style="max-width:260px" /><select name="role" style="max-width:150px"><option value="owner">Dono</option><option value="admin">Admin</option><option value="gestor">Gestor</option><option value="corretor">Corretor</option></select><button class="btn sm">Convidar</button></form></div>
    <div class="card mt" style="border-color:color-mix(in srgb, var(--red) 40%, transparent)"><h3 style="color:var(--red)">Zona de perigo</h3><p class="muted mt-s" style="font-size:12.5px">Excluir apaga definitivamente a imobiliária e todos os dados dela (leads, imóveis, negócios). Prefira “Cancelar assinatura”.</p><button class="btn sm danger mt-s" id="del">Excluir cliente definitivamente</button></div>
  </div>`);
  const atualizar = async (patch, msg) => {
    try {
      const { error } = await db.sb.from('orgs').update(patch).eq('id', id);
      if (error) throw error;
      toast(msg || 'Cliente atualizado', 'ok'); dr.close(); await load(); render(); abrirCliente(id);
    } catch (e) { toast(e.message, 'err'); }
  };
  $$('[data-st]', dr.el).forEach((b) => b.onclick = async () => {
    const st = b.dataset.st;
    if (['suspenso', 'cancelado'].includes(st) && !(await confirmBox(`${st === 'suspenso' ? 'Suspender' : 'Cancelar'} ${c.nome}? O acesso será bloqueado imediatamente.`, { danger: true }))) return;
    atualizar({ status: st, ...(st === 'ativo' ? { trial_ate: null } : {}) }, `Status: ${ST[st][0]}`);
  });
  $$('[data-trial]', dr.el).forEach((b) => b.onclick = () => {
    const base = c.trial_ate && new Date(c.trial_ate) > new Date() ? new Date(c.trial_ate + 'T12:00') : new Date();
    base.setDate(base.getDate() + Number(b.dataset.trial));
    atualizar({ status: 'trial', trial_ate: base.toISOString().slice(0, 10) }, `Teste estendido até ${base.toLocaleDateString('pt-BR')}`);
  });
  $('#ef', dr.el).onsubmit = (e) => { e.preventDefault(); const f = formData(e.target); if (f.uf) f.uf = f.uf.toUpperCase(); if (f.status !== 'trial') f.trial_ate = f.trial_ate || null; atualizar(f); };
  $('#inv', dr.el).onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    try {
      const r = await db.rpc('fn_admin_convidar', { p_org: id, p_email: f.email, p_role: f.role });
      if (r === 'convite') { copy(msgConvite(c.nome, f.email)); toast('Convite criado. A mensagem com o link foi copiada.', 'ok', 5000); } else toast('Usuário já tinha conta e foi vinculado', 'ok');
      dr.close(); await load(); render(); abrirCliente(id);
    } catch (err) { toast(err.message, 'err'); }
  };
  $$('[data-cp]', dr.el).forEach((b) => b.onclick = () => copy(msgConvite(c.nome, b.dataset.cp)));
  $$('[data-delc]', dr.el).forEach((b) => b.onclick = async () => { await db.sb.from('org_convites').delete().eq('id', b.dataset.delc); dr.close(); await load(); render(); abrirCliente(id); });
  $('#del', dr.el).onclick = () => {
    const m = modal(`<h2 style="color:var(--red)">Excluir ${esc(c.nome)}</h2><p class="muted mt-s">Digite <b>${esc(c.slug)}</b> para confirmar. Não tem volta.</p><input id="cf" class="mt" /><div class="row mt" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" id="ok">Excluir</button></div>`);
    m.el.querySelector('#ok').onclick = async () => {
      try { await db.rpc('fn_admin_excluir_cliente', { p_org: id, p_confirmar_slug: m.el.querySelector('#cf').value.trim() }); m.close(); dr.close(); toast('Cliente excluído', 'ok'); await load(); render(); }
      catch (e) { toast(e.message, 'err'); }
    };
  };
}

// ---------------------------------------------------------------------------
// Planos
// ---------------------------------------------------------------------------
function tabPlanos(el) {
  el.innerHTML = `<div class="grid g3">${state.planos.map((p) => `<form class="card" data-p="${p.id}">
    <div class="row between"><span class="badge b-gold">${esc(p.id)}</span><label class="check"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''} /> ativo</label></div>
    <div class="field mt"><label>Nome</label><input name="nome" value="${esc(p.nome)}" /></div>
    <div class="field-row"><div class="field"><label>R$/mês</label><input name="valor_mensal" data-num value="${p.valor_mensal}" /></div><div class="field"><label>Usuários</label><input name="limite_usuarios" data-num value="${p.limite_usuarios ?? ''}" placeholder="∞" /></div><div class="field"><label>Unidades</label><input name="limite_unidades" data-num value="${p.limite_unidades ?? ''}" placeholder="∞" /></div></div>
    <label class="check"><input type="checkbox" name="ia_habilitada" ${p.ia_habilitada !== false ? 'checked' : ''} /> Inclui IA (corretores e book)</label>
    <div class="field mt-s"><label>Recursos (um por linha)</label><textarea name="recursos">${esc((p.recursos || []).join('\n'))}</textarea></div>
    <div class="row between"><button class="btn sm primary">Salvar</button><span class="muted" style="font-size:12px">${state.clientes.filter((c) => c.plano === p.id).length} cliente(s)</span></div></form>`).join('')}
    <form class="card" id="np"><h3>Novo plano</h3><div class="field mt-s"><label>Código (sem espaço)</label><input name="id" required pattern="[a-z0-9_-]+" /></div><div class="field"><label>Nome</label><input name="nome" required /></div><div class="field"><label>R$/mês</label><input name="valor_mensal" data-num required /></div><button class="btn sm">Criar plano</button></form></div>
    <div class="hint mt">Mudar o preço do plano não altera o valor de quem já é cliente. Ajuste cliente a cliente na ficha.</div>`;
  $$('[data-p]', el).forEach((f) => f.onsubmit = async (e) => {
    e.preventDefault(); const d = formData(f); d.recursos = String(f.recursos.value).split('\n').map((x) => x.trim()).filter(Boolean);
    const { error } = await db.sb.from('planos').update(d).eq('id', f.dataset.p);
    if (error) return toast(error.message, 'err'); toast('Plano salvo', 'ok'); await load(); render();
  });
  $('#np', el).onsubmit = async (e) => {
    e.preventDefault(); const d = formData(e.target);
    const { error } = await db.sb.from('planos').insert({ ...d, ordem: state.planos.length + 1 });
    if (error) return toast(error.message, 'err'); toast('Plano criado', 'ok'); await load(); render();
  };
}

// ---------------------------------------------------------------------------
// Integrações (IA)
// ---------------------------------------------------------------------------
async function tabIA(el) {
  el.innerHTML = '<div class="card"><div class="empty">Consultando servidor…</div></div>';
  let st = null;
  try { st = await db.aiStatus(); } catch (e) { st = { erro: e.message }; }
  const ok = st && !st.erro && st.provider;
  el.innerHTML = `<div class="grid g2">
    <div class="card"><h3>Status da IA</h3>
      <div class="row mt-s"><span class="badge ${ok ? 'b-green' : 'b-red'}">${ok ? '● funcionando' : '✕ não configurada'}</span></div>
      <dl class="kv mt"><dt>Provedor</dt><dd>${esc(st?.provider || '—')}</dd><dt>Modelo</dt><dd>${esc(st?.model || '—')}</dd>${st?.erro ? `<dt>Problema</dt><dd style="color:var(--red)">${esc(st.erro)}</dd>` : ''}</dl>
      <button class="btn sm mt" id="t-ia">Testar resposta</button><div id="t-r" class="mt-s"></div>
      <div class="hint mt">As chaves ficam só nos <i>secrets</i> do Supabase. Nunca aparecem para clientes nem no navegador.</div></div>
    <div class="card"><h3>Configurar provedor</h3><p class="muted mt-s" style="font-size:12.5px">No terminal, dentro da pasta do projeto:</p>
      <div class="code mt-s">supabase functions deploy ai-chat
supabase functions deploy parse-book

# OpenAI
supabase secrets set AI_PROVIDER=openai OPENAI_API_KEY=sk-... OPENAI_MODEL=gpt-4.1

# ou Claude (Anthropic)
supabase secrets set AI_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-ant-... ANTHROPIC_MODEL=claude-opus-5-5</div>
      <p class="muted mt" style="font-size:12.5px">Trocar de provedor = mudar <code>AI_PROVIDER</code>; não precisa publicar de novo. O consumo de cada cliente aparece na coluna “IA 30d” da aba Clientes, e o plano define quem tem IA.</p></div></div>`;
  $('#t-ia', el).onclick = async () => {
    const r = $('#t-r', el); r.innerHTML = '<span class="muted">Testando…</span>';
    try { const t = await db.ai({ mode: 'chat', persona: { system_prompt: 'Responda apenas: OK, IA funcionando.' }, messages: [{ role: 'user', content: 'teste' }] }); r.innerHTML = `<div class="callout green">${esc(t.slice(0, 100))}</div>`; }
    catch (e) { r.innerHTML = `<div class="callout red">${esc(e.message)}</div>`; }
  };
}

// ---------------------------------------------------------------------------
// Superadmins
// ---------------------------------------------------------------------------
async function tabSupers(el) {
  const list = (await db.rpc('fn_admin_superadmins')) || [];
  el.innerHTML = `<div class="card"><h3>Administradores da plataforma</h3><p class="muted mt-s" style="font-size:12.5px">Têm acesso total a este console: clientes, planos e cobranças. Adicione só pessoas de confiança.</p>
    <div class="list mt-s">${list.map((u) => `<div class="list-item"><div class="avatar">♛</div><div class="grow"><div class="li-title">${esc(u.nome || u.email)}</div><div class="li-sub">${esc(u.email)} · desde ${date(u.created_at)}</div></div>${u.user_id === db.user.id ? '<span class="badge b-gold">você</span>' : `<button class="btn xs danger" data-rm="${u.user_id}">Remover</button>`}</div>`).join('')}</div>
    <form id="as" class="row wrap mt"><input name="email" type="email" required placeholder="email da pessoa (já cadastrada)" style="max-width:300px" /><button class="btn sm primary">Adicionar superadmin</button></form></div>`;
  $('#as', el).onsubmit = async (e) => { e.preventDefault(); try { const r = await db.rpc('fn_admin_add_superadmin', { p_email: formData(e.target).email }); toast(r === 'ok' ? 'Superadmin adicionado' : r, r === 'ok' ? 'ok' : 'err', 5000); tabSupers(el); } catch (err) { toast(err.message, 'err'); } };
  $$('[data-rm]', el).forEach((b) => b.onclick = async () => { if (await confirmBox('Remover este superadmin?', { danger: true })) { try { await db.rpc('fn_admin_remove_superadmin', { p_user: b.dataset.rm }); tabSupers(el); } catch (err) { toast(err.message, 'err'); } } });
}

// ---------------------------------------------------------------------------
// Configurações da plataforma
// ---------------------------------------------------------------------------
function tabConfig(el) {
  const c = state.cfg;
  el.innerHTML = `<form class="card" id="cf" style="max-width:640px"><h3>Cadastro e teste grátis</h3>
    <label class="check mt"><input type="checkbox" name="permitir_auto_cadastro" ${c.permitir_auto_cadastro ? 'checked' : ''} /> Permitir que imobiliárias se cadastrem sozinhas (entram em teste grátis)</label>
    <div class="hint">Desligado: só entra quem você cadastrar ou convidar.</div>
    <div class="field-row mt"><div class="field"><label>Dias de teste grátis</label><input name="trial_dias" data-num value="${c.trial_dias ?? 14}" /></div>
    <div class="field"><label>Plano padrão</label><select name="plano_padrao">${planoOpts(c.plano_padrao)}</select></div></div>
    <div class="field"><label>Contato comercial/suporte (aparece para o cliente no trial e no bloqueio)</label><input name="contato_suporte" value="${esc(c.contato_suporte || '')}" placeholder="WhatsApp (98) 9 0000-0000 · comercial@minhaimob.com" /></div>
    <button class="btn primary sm">Salvar</button></form>`;
  $('#cf', el).onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await db.sb.from('platform_config').update({ ...formData(e.target), updated_at: new Date().toISOString() }).eq('id', 1);
    if (error) return toast(error.message, 'err'); toast('Configurações salvas', 'ok'); await load();
  };
}
