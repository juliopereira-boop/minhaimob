import { $, $$, esc, toast, modal, confirmBox, formData, brl, parseNum } from '../ui.js';
import { CONFIG, saveConfig } from '../config.js';

export async function render(el, ctx) {
  const db = ctx.db;
  let membros = [];
  if (db.mode === 'supabase') {
    try { membros = await db.list('org_members', { select: 'user_id, role, active, profiles(nome, email)', eq: { org_id: db.orgId } }); } catch { /* */ }
  }
  el.innerHTML = `
  <div class="page-head"><div><h1>Configurações</h1><p>Modo atual: <b>${db.mode === 'supabase' ? 'Supabase (produção)' : 'Local (navegador)'}</b> · IA: <b>${db.aiMode() === 'edge' ? 'Edge Function (Claude)' : db.aiMode() === 'browser' ? 'Chave local (teste)' : 'desligada'}</b></p></div></div>
  <div class="grid g2">
    <form class="card" id="f-prof"><h3>Seu perfil</h3><div class="field-row mt-s">
      <div class="field"><label>Nome</label><input name="nome" value="${esc(db.profile?.nome || '')}" /></div>
      <div class="field"><label>Meta mensal de VGV</label><input name="meta_mensal" data-num value="${db.profile?.meta_mensal ?? 2000000}" /></div>
      ${db.mode === 'supabase' ? `<div class="field"><label>CRECI</label><input name="creci" value="${esc(db.profile?.creci || '')}" /></div><div class="field"><label>Telefone</label><input name="telefone" value="${esc(db.profile?.telefone || '')}" /></div>` : ''}</div>
      <button class="btn primary sm">Salvar perfil</button>${db.mode === 'supabase' ? ' <button type="button" class="btn sm ghost" id="b-out">Sair</button>' : ''}</form>

    <form class="card" id="f-sb"><h3>Conexão Supabase</h3><p class="muted mt-s" style="font-size:12.5px">Rode <code>supabase/schema.sql</code> no SQL Editor do seu projeto e cole aqui a URL e a chave <b>anon/publishable</b> (Project Settings → API). Na Vercel você também pode definir <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code> como variáveis de ambiente.</p>
      <div class="field mt-s"><label>Project URL</label><input name="SUPABASE_URL" value="${esc(CONFIG.SUPABASE_URL)}" placeholder="https://xxxx.supabase.co" /></div>
      <div class="field"><label>Anon / publishable key</label><input name="SUPABASE_ANON_KEY" value="${esc(CONFIG.SUPABASE_ANON_KEY)}" /></div>
      <div class="row wrap"><button class="btn primary sm">Salvar e reconectar</button>${db.mode === 'supabase' ? '<button type="button" class="btn sm" id="b-local">Usar modo local neste navegador</button>' : localStorage.getItem('mi_force_local') === '1' ? '<button type="button" class="btn sm" id="b-unlocal">Voltar ao Supabase</button>' : ''}</div></form>

    <div class="card"><h3>Inteligência artificial (Claude)</h3>
      ${db.mode === 'supabase' ? `<p class="muted mt-s" style="font-size:12.5px">A IA roda nas Edge Functions <code>ai-chat</code> e <code>parse-book</code> — a chave fica só no servidor.</p>
        <div class="code mt-s">supabase functions deploy ai-chat
supabase functions deploy parse-book
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...</div>
        <div class="row wrap mt"><button class="btn sm" id="b-test">Testar conexão da IA</button><label class="check"><input type="checkbox" id="ai-off" ${localStorage.getItem('mi_ai_off') === '1' ? 'checked' : ''} /> Desligar IA (usar só motores offline)</label></div><div id="test-r" class="mt-s"></div>`
      : `<p class="muted mt-s" style="font-size:12.5px">No modo local, você pode testar a IA com sua própria chave da Anthropic. Ela fica salva <b>apenas neste navegador</b> e é enviada direto para a API. Para uso em equipe, use o Supabase (chave no servidor).</p>
        <form id="f-ai" class="mt-s"><div class="field"><label>Chave da API Anthropic</label><input name="ANTHROPIC_KEY_LOCAL" type="password" value="${esc(CONFIG.ANTHROPIC_KEY_LOCAL)}" placeholder="sk-ant-..." /></div>
        <div class="field"><label>Modelo</label><input name="ANTHROPIC_MODEL" value="${esc(CONFIG.ANTHROPIC_MODEL)}" /></div><button class="btn primary sm">Salvar</button></form>`}
    </div>

    <div class="card"><h3>Dados</h3><div class="col mt-s">
      <button class="btn sm" id="b-demo">Carregar dados de demonstração</button>
      <button class="btn sm" id="b-recalc">Recalcular scores e saúde dos negócios</button>
      ${db.mode === 'local' ? '<button class="btn sm" id="b-exp">Exportar backup (JSON)</button><label class="btn sm" style="cursor:pointer">Importar backup<input type="file" id="b-imp" accept=".json" hidden /></label><button class="btn sm danger" id="b-reset">Apagar dados locais</button>' : ''}
    </div></div>

    ${db.mode === 'supabase' ? `<div class="card span2"><div class="card-head"><h3>Equipe · ${esc(db.org?.nome || '')}</h3><span class="badge b-gold">seu papel: ${esc(db.role)}</span></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Ativo</th></tr></thead><tbody>${membros.map((m) => `<tr><td>${esc(m.profiles?.nome || '—')}</td><td>${esc(m.profiles?.email || '')}</td><td>${esc(m.role)}</td><td>${m.active ? '✓' : '—'}</td></tr>`).join('')}</tbody></table></div>
      ${['owner', 'admin', 'gestor'].includes(db.role) ? `<form id="f-inv" class="row wrap mt"><input name="email" type="email" required placeholder="email@corretor.com" style="max-width:280px" /><select name="role" style="max-width:160px"><option value="corretor">Corretor</option><option value="assistente">Assistente</option><option value="gestor">Gestor</option><option value="admin">Admin</option></select><button class="btn primary sm">Adicionar à equipe</button></form><div class="hint">O usuário precisa ter criado a conta na tela de login antes.</div>` : ''}</div>` : ''}
  </div>`;

  $('#f-prof', el).onsubmit = async (e) => { e.preventDefault(); try { await db.updateProfile(formData(e.target)); toast('Perfil salvo', 'ok'); document.getElementById('me-name').textContent = db.profile.nome; } catch (err) { toast(err.message, 'err'); } };
  $('#f-sb', el).onsubmit = (e) => { e.preventDefault(); const f = formData(e.target); saveConfig({ SUPABASE_URL: (f.SUPABASE_URL || '').replace(/\/$/, ''), SUPABASE_ANON_KEY: f.SUPABASE_ANON_KEY }); localStorage.removeItem('mi_force_local'); toast('Reconectando…', 'info'); setTimeout(() => (location.href = f.SUPABASE_URL ? 'index.html' : 'app.html'), 600); };
  const bl = $('#b-local', el); if (bl) bl.onclick = () => { localStorage.setItem('mi_force_local', '1'); location.reload(); };
  const bu = $('#b-unlocal', el); if (bu) bu.onclick = () => { localStorage.removeItem('mi_force_local'); location.href = 'index.html'; };
  const bo = $('#b-out', el); if (bo) bo.onclick = () => db.signOut();
  const fa = $('#f-ai', el); if (fa) fa.onsubmit = (e) => { e.preventDefault(); saveConfig(formData(e.target)); toast('IA configurada', 'ok'); setTimeout(() => location.reload(), 500); };
  const ao = $('#ai-off', el); if (ao) ao.onchange = () => { localStorage.setItem('mi_ai_off', ao.checked ? '1' : '0'); toast(ao.checked ? 'IA desligada' : 'IA ligada', 'ok'); };
  const bt = $('#b-test', el); if (bt) bt.onclick = async () => {
    const r = $('#test-r', el); r.innerHTML = '<span class="muted">Testando…</span>';
    try { const t = await db.aiChat({ persona: { nome: 'Teste', papel: 'recepcao', system_prompt: 'Responda apenas: OK' }, messages: [{ role: 'user', content: 'ping' }] }); r.innerHTML = `<div class="callout green">IA respondendo: ${esc(t.slice(0, 80))}</div>`; }
    catch (err) { r.innerHTML = `<div class="callout red">Falhou: ${esc(err.message)}. Verifique se as funções foram publicadas e o secret ANTHROPIC_API_KEY existe.</div>`; }
  };
  $('#b-demo', el).onclick = async () => { try { const r = await db.rpc('fn_seed_demo', { p_org: db.orgId }); await ctx.refresh(); toast(r?.aviso || 'Demonstração carregada', 'ok'); } catch (err) { toast(err.message, 'err'); } };
  $('#b-recalc', el).onclick = async () => { await db.rpc('fn_recalcular_tudo', { p_org: db.orgId }); await ctx.refresh(); toast('Recalculado', 'ok'); };
  const be = $('#b-exp', el); if (be) be.onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(db.store.data)], { type: 'application/json' })); a.download = `minhaimob-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); };
  const bi = $('#b-imp', el); if (bi) bi.onchange = async () => { try { const j = JSON.parse(await bi.files[0].text()); db.store.data = j; db.store.save(); toast('Backup importado', 'ok'); setTimeout(() => location.reload(), 500); } catch { toast('Arquivo inválido', 'err'); } };
  const br = $('#b-reset', el); if (br) br.onclick = async () => { if (await confirmBox('Apagar todos os dados locais deste navegador?', { danger: true, ok: 'Apagar' })) { db.store.reset(); localStorage.removeItem('mi_seeded'); location.reload(); } };
  const fi = $('#f-inv', el); if (fi) fi.onsubmit = async (e) => { e.preventDefault(); const f = formData(e.target); try { const r = await db.rpc('fn_convidar', { p_org: db.orgId, p_email: f.email, p_role: f.role }); toast(r === 'ok' ? 'Corretor adicionado' : r, r === 'ok' ? 'ok' : 'err', 6000); if (r === 'ok') render(el, ctx); } catch (err) { toast(err.message, 'err'); } };
}
