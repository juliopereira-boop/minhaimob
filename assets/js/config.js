// Configuração. Ordem de prioridade: localStorage (tela Configurações) > /api/config (env da Vercel) > valores abaixo.
const DEFAULTS = {
  SUPABASE_URL: '',        // ex.: https://abcd1234.supabase.co
  SUPABASE_ANON_KEY: '',   // chave anon/publishable do projeto
  // Apenas para testes no modo local (a chave fica só no seu navegador). Em produção use as Edge Functions.
  AI_PROVIDER_LOCAL: 'openai',   // openai | anthropic
  OPENAI_KEY_LOCAL: '',
  OPENAI_MODEL: 'gpt-4.1',
  ANTHROPIC_KEY_LOCAL: '',
  ANTHROPIC_MODEL: 'claude-opus-5-5',
};

function readLocal() {
  try { return JSON.parse(localStorage.getItem('mi_config') || '{}'); } catch { return {}; }
}

export const CONFIG = { ...DEFAULTS, ...(window.MINHAIMOB_CONFIG || {}), ...readLocal() };

export async function loadRemoteConfig() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) return CONFIG;
  try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      if (j.SUPABASE_URL && !CONFIG.SUPABASE_URL) CONFIG.SUPABASE_URL = j.SUPABASE_URL;
      if (j.SUPABASE_ANON_KEY && !CONFIG.SUPABASE_ANON_KEY) CONFIG.SUPABASE_ANON_KEY = j.SUPABASE_ANON_KEY;
    }
  } catch { /* sem /api local: segue */ }
  return CONFIG;
}

export const hasSupabase = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) && localStorage.getItem('mi_force_local') !== '1';

export function saveConfig(patch) {
  const cur = readLocal();
  const next = { ...cur, ...patch };
  Object.keys(next).forEach((k) => { if (next[k] === '' || next[k] == null) delete next[k]; });
  localStorage.setItem('mi_config', JSON.stringify(next));
  Object.assign(CONFIG, DEFAULTS, window.MINHAIMOB_CONFIG || {}, next);
}
