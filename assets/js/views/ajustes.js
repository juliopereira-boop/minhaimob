import { $, $$, esc, toast, confirmBox, formData, copy } from '../ui.js';
import { CONFIG, saveConfig } from '../config.js';

/** Remove todos os dados fictícios e passa a usar só dados reais. */
export async function usarDadosReais(ctx) {
  const ok = await confirmBox('Remover TODOS os dados de demonstração (empreendimentos, clientes, negócios e comparáveis fictícios)? Seus dados reais são mantidos e a demonstração não volta mais.', { ok: 'Usar dados reais', danger: true });
  if (!ok) return false;
  try {
    const r = await ctx.db.rpc('fn_limpar_demo', { p_org: ctx.db.orgId });
    if (ctx.db.mode === 'supabase') ctx.db.org = { ...ctx.db.org, config: { ...(ctx.db.org?.config || {}), dados_reais: true } };
    await ctx.refresh();
    toast(`Pronto: ${r?.leads ?? 0} clientes, ${r?.empreendimentos ?? 0} empreendimentos e ${r?.comparaveis ?? 0} comparáveis fictícios removidos.`, 'ok', 6000);
    return true;
  } catch (e) { toast(e.message, 'err'); return false; }
}

export async function render(el, ctx) {
  const db = ctx.db;
  const gestor = db.mode === 'local' || ['owner', 'admin', 'gestor'].includes(db.role);
  const semBackend = !CONFIG.SUPABASE_URL;                 // instalação local de desenvolvimento
  const demoVisitante = db.mode === 'local' && !semBackend;  // visitante no modo demonstração do site
  let membros = [];
  if (db.mode === 'supabase') {
    try { membros = await db.list('org_members', { select: 'user_id, role, active, profiles(nome, email)', eq: { org_id: db.orgId } }); } catch { /* */ }
  }
  const ia = db.aiMode();
  const iaPlano = db.mode !== 'supabase' || db.isSuperadmin || db.conta?.org?.ia !== false;
  el.innerHTML = `
  <div class="page-head"><div><h1>Configurações</h1><p>${esc(db.org?.nome || '')}</p></div></div>
  <div class="grid g2">
    <form class="card" id="f-prof"><h3>Seu perfil</h3><div class="field-row mt-s">
      <div class="field"><label>Nome</label><input name="nome" value="${esc(db.profile?.nome || '')}" /></div>
      <div class="field"><label>Meta mensal de VGV</label><input name="meta_mensal" data-num value="${db.profile?.meta_mensal ?? 2000000}" /></div>
      ${db.mode === 'supabase' ? `<div class="field"><label>CRECI</label><input name="creci" value="${esc(db.profile?.creci || '')}" /></div><div class="field"><label>Telefone</label><input name="telefone" value="${esc(db.profile?.telefone || '')}" /></div>` : ''}</div>
      <button class="btn primary sm">Salvar perfil</button>${db.mode === 'supabase' ? ' <button type="button" class="btn sm ghost" id="b-out">Sair</button>' : ''}</form>

    <div class="card"><h3>Inteligência artificial</h3>
      ${db.mode === 'supabase' ? `
        <div class="row mt-s"><span class="badge ${ia ? 'b-green' : iaPlano ? 'b-gray' : 'b-amber'}">${ia ? '● Ativa' : iaPlano ? '○ Desligada' : 'Não incluída no plano'}</span></div>
        <p class="muted mt-s" style="font-size:12.5px">${iaPlano ? 'Os corretores virtuais e o destrinchador de book usam a IA da plataforma, já configurada.' : 'Seu plano usa os motores inteligentes da plataforma sem IA generativa. Fale com o suporte para fazer upgrade.'}</p>
        ${iaPlano ? `<div class="row wrap mt"><button class="btn sm" id="b-test">Testar IA</button><label class="check"><input type="checkbox" id="ai-off" ${localStorage.getItem('mi_ai_off') === '1' ? 'checked' : ''} /> Usar só motores offline neste navegador</label></div><div id="test-r" class="mt-s"></div>` : ''}
        ${db.isSuperadmin ? '<div class="callout mt">Configurações técnicas (provedor, chaves e modelo) ficam no <a href="admin.html">Console do superadmin → Integrações</a>.</div>' : ''}`
      : semBackend ? `<p class="muted mt-s" style="font-size:12.5px">Teste local com sua própria chave. Ela fica só neste navegador e vai direto para a API. Em produção, a chave fica no servidor (Edge Functions).</p>
        <form id="f-ai" class="mt-s"><div class="field"><label>Provedor</label><select name="AI_PROVIDER_LOCAL"><option value="openai" ${CONFIG.AI_PROVIDER_LOCAL !== 'anthropic' ? 'selected' : ''}>OpenAI</option><option value="anthropic" ${CONFIG.AI_PROVIDER_LOCAL === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option></select></div>
        <div class="field-row"><div class="field"><label>Chave OpenAI</label><input name="OPENAI_KEY_LOCAL" type="password" value="${esc(CONFIG.OPENAI_KEY_LOCAL)}" placeholder="sk-..." /></div><div class="field"><label>Modelo OpenAI</label><input name="OPENAI_MODEL" value="${esc(CONFIG.OPENAI_MODEL)}" /></div></div>
        <div class="field-row"><div class="field"><label>Chave Anthropic</label><input name="ANTHROPIC_KEY_LOCAL" type="password" value="${esc(CONFIG.ANTHROPIC_KEY_LOCAL)}" placeholder="sk-ant-..." /></div><div class="field"><label>Modelo Claude</label><input name="ANTHROPIC_MODEL" value="${esc(CONFIG.ANTHROPIC_MODEL)}" /></div></div>
        <button class="btn primary sm">Salvar</button></form>`
      : '<p class="muted mt-s" style="font-size:12.5px">No modo demonstração os corretores usam os motores offline. Entre com sua conta para usar a IA.</p>'}
    </div>

    ${semBackend ? `<form class="card" id="f-sb"><h3>Conexão com o banco</h3><p class="muted mt-s" style="font-size:12.5px">Instalação local sem Supabase. Informe o projeto para usar com equipe (na Vercel, prefira as variáveis de ambiente <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code>).</p>
      <div class="field mt-s"><label>Project URL</label><input name="SUPABASE_URL" placeholder="https://xxxx.supabase.co" /></div>
      <div class="field"><label>Anon / publishable key</label><input name="SUPABASE_ANON_KEY" /></div><button class="btn primary sm">Conectar</button></form>` : ''}
    ${demoVisitante ? `<div class="card"><h3>Modo demonstração</h3><p class="muted mt-s" style="font-size:12.5px">Os dados ficam só neste navegador.</p><button class="btn primary sm mt" id="b-conta">Entrar com minha conta</button></div>` : ''}

    <div class="card"><h3>Dados</h3><div class="col mt-s">
      ${gestor && db.temDemo(ctx.data) ? '<button class="btn primary sm" id="b-real">✓ Usar dados reais (remover fictícios)</button><div class="hint">Remove só o que é de demonstração. Seus cadastros reais ficam.</div>' : ''}
      ${db.dadosReais() ? '<div class="callout green">✓ Usando dados reais. A demonstração está desativada.</div>' : gestor && !db.temDemo(ctx.data) ? '<button class="btn sm" id="b-demo">Carregar dados de demonstração</button>' : ''}
      <button class="btn sm" id="b-recalc">Recalcular scores e saúde dos negócios</button>
      ${db.mode === 'local' ? '<button class="btn sm" id="b-exp">Exportar backup (JSON)</button><label class="btn sm" style="cursor:pointer">Importar backup<input type="file" id="b-imp" accept=".json" hidden /></label><button class="btn sm danger" id="b-reset">Apagar dados locais</button>' : ''}
    </div></div>

    ${db.mode === 'supabase' ? `<div class="card span2"><div class="card-head"><h3>Equipe</h3><span class="badge b-gold">seu papel: ${esc(db.role)}</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th></tr></thead><tbody>${membros.map((m) => `<tr><td>${esc(m.profiles?.nome || '—')}</td><td>${esc(m.profiles?.email || '')}</td><td>${esc(m.role)}</td><td>${m.active ? '✓' : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${gestor ? `<form id="f-inv" class="row wrap mt"><input name="email" type="email" required placeholder="email@corretor.com" style="max-width:280px" /><select name="role" style="max-width:160px"><option value="corretor">Corretor</option><option value="assistente">Assistente</option><option value="gestor">Gestor</option><option value="admin">Admin</option></select><button class="btn primary sm">Adicionar à equipe</button></form><div class="hint">Sem conta ainda? Um convite é criado e o link é copiado para você enviar.</div>` : ''}</div>` : ''}
  </div>`;

  $('#f-prof', el).onsubmit = async (e) => { e.preventDefault(); try { await db.updateProfile(formData(e.target)); toast('Perfil salvo', 'ok'); document.getElementById('me-name').textContent = db.profile.nome; } catch (err) { toast(err.message, 'err'); } };
  const fsb = $('#f-sb', el); if (fsb) fsb.onsubmit = (e) => { e.preventDefault(); const f = formData(e.target); saveConfig({ SUPABASE_URL: (f.SUPABASE_URL || '').replace(/\/$/, ''), SUPABASE_ANON_KEY: f.SUPABASE_ANON_KEY }); localStorage.removeItem('mi_force_local'); setTimeout(() => (location.href = 'index.html'), 400); };
  const bc = $('#b-conta', el); if (bc) bc.onclick = () => { localStorage.removeItem('mi_force_local'); location.href = 'index.html'; };
  const bo = $('#b-out', el); if (bo) bo.onclick = () => db.signOut();
  const fa = $('#f-ai', el); if (fa) fa.onsubmit = (e) => { e.preventDefault(); saveConfig(formData(e.target)); toast('IA configurada', 'ok'); setTimeout(() => location.reload(), 500); };
  const ao = $('#ai-off', el); if (ao) ao.onchange = () => { localStorage.setItem('mi_ai_off', ao.checked ? '1' : '0'); toast(ao.checked ? 'IA desligada neste navegador' : 'IA ligada', 'ok'); };
  const bt = $('#b-test', el); if (bt) bt.onclick = async () => {
    const r = $('#test-r', el); r.innerHTML = '<span class="muted">Testando…</span>';
    try { const t = await db.ai({ mode: 'chat', persona: { system_prompt: 'Responda apenas: OK, IA funcionando.' }, messages: [{ role: 'user', content: 'teste' }] }); r.innerHTML = `<div class="callout green">${esc(t.slice(0, 80))}</div>`; }
    catch (err) { r.innerHTML = `<div class="callout red">A IA não respondeu: ${esc(err.message)}</div>`; }
  };
  const brl_ = $('#b-real', el); if (brl_) brl_.onclick = async () => { if (await usarDadosReais(ctx)) render(el, ctx); };
  const bd = $('#b-demo', el); if (bd) bd.onclick = async () => { try { const r = await db.rpc('fn_seed_demo', { p_org: db.orgId }); await ctx.refresh(); toast(r?.aviso || 'Demonstração carregada', r?.aviso ? 'info' : 'ok'); render(el, ctx); } catch (err) { toast(err.message, 'err'); } };
  $('#b-recalc', el).onclick = async () => { await db.rpc('fn_recalcular_tudo', { p_org: db.orgId }); await ctx.refresh(); toast('Recalculado', 'ok'); };
  const be = $('#b-exp', el); if (be) be.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db.store.data)], { type: 'application/json' })); a.download = `minhaimob-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  const bi = $('#b-imp', el); if (bi) bi.onchange = async () => { try { const j = JSON.parse(await bi.files[0].text()); db.store.data = j; db.store.save(); toast('Backup importado', 'ok'); setTimeout(() => location.reload(), 500); } catch { toast('Arquivo inválido', 'err'); } };
  const br = $('#b-reset', el); if (br) br.onclick = async () => { if (await confirmBox('Apagar todos os dados locais deste navegador?', { danger: true, ok: 'Apagar' })) { db.store.reset(); localStorage.removeItem('mi_seeded'); location.reload(); } };
  const fi = $('#f-inv', el); if (fi) fi.onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    try {
      const r = await db.rpc('fn_convidar', { p_org: db.orgId, p_email: f.email, p_role: f.role });
      if (r === 'convite') {
        const link = `${location.origin}${location.pathname.replace(/app\.html$/, '')}index.html?convite=1&email=${encodeURIComponent(f.email)}`;
        copy(`Você foi convidado para a equipe ${db.org?.nome || ''} na MinhaImob. Crie sua senha com o e-mail ${f.email}: ${link}`);
        toast('Convite criado. A mensagem com o link foi copiada.', 'ok', 6000);
      } else toast('Corretor adicionado à equipe', 'ok');
      render(el, ctx);
    } catch (err) { toast(err.message, 'err'); }
  };
}
