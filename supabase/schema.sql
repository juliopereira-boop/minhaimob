-- ============================================================================
-- MinhaImob — Plataforma Inteligente de Venda de Imóveis
-- Schema completo para Supabase (Postgres 15+)
-- Rode este arquivo inteiro no SQL Editor do Supabase. É idempotente.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ============================================================================
-- 1. TIPOS
-- ============================================================================
do $$ begin
  create type user_role as enum ('owner','admin','gestor','corretor','assistente');
exception when duplicate_object then null; end $$;

do $$ begin
  create type unit_status as enum ('disponivel','reservado','proposta','vendido','bloqueado','permuta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type deal_stage as enum ('novo','qualificacao','visita','proposta','analise_credito','contrato','repasse','assinatura','ganho','perdido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_temp as enum ('frio','morno','quente','fervendo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_kind as enum ('ligacao','whatsapp','email','visita','reuniao','proposta','documento','nota','tarefa','simulacao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type agent_role as enum ('prospector','closer','credito','marketing','trainer','analista','recepcao');
exception when duplicate_object then null; end $$;

do $$ begin
  create type book_status as enum ('pendente','processando','extraido','revisado','erro');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. MULTI-TENANCY
-- ============================================================================
create table if not exists public.orgs (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text unique not null,
  cnpj          text,
  logo_url      text,
  cor_primaria  text default '#D4A056',
  cidade        text,
  uf            char(2),
  plano         text default 'pro',
  config        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text,
  email         text,
  telefone      text,
  avatar_url    text,
  creci         text,
  meta_mensal   numeric(14,2) default 0,
  preferencias  jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id        uuid not null references public.orgs(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          user_role not null default 'corretor',
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index if not exists idx_org_members_user on public.org_members(user_id) where active;

-- perfis para usuários pré-existentes + FK que permite embed org_members→profiles no PostgREST
insert into public.profiles (id, email, nome)
  select id, email, split_part(email, '@', 1) from auth.users on conflict (id) do nothing;
do $$ begin
  alter table public.org_members add constraint org_members_profile_fk
    foreign key (user_id) references public.profiles(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- Helper SECURITY DEFINER: evita recursão de RLS em org_members
create or replace function public.fn_my_orgs()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.org_members where user_id = auth.uid() and active;
$$;

create or replace function public.fn_is_manager(p_org uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.org_members
    where org_id = p_org and user_id = auth.uid() and active
      and role in ('owner','admin','gestor')
  );
$$;

-- ============================================================================
-- 3. CATÁLOGO: EMPREENDIMENTOS / TIPOLOGIAS / UNIDADES
-- ============================================================================
create table if not exists public.empreendimentos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  nome            text not null,
  construtora     text,
  incorporadora   text,
  tipo            text default 'residencial',          -- residencial | comercial | loteamento | casa
  padrao          text,                                 -- economico | medio | alto | luxo
  status_obra     text default 'lancamento',            -- lancamento | em_obra | pronto | usado
  previsao_entrega date,
  -- Localização
  endereco        text,
  numero          text,
  bairro          text,
  cidade          text,
  uf              char(2),
  cep             text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  -- Estrutura
  torres          int,
  andares         int,
  unidades_por_andar int,
  total_unidades  int,
  elevadores      int,
  vagas_visitante int,
  -- Comercial
  valor_min       numeric(14,2),
  valor_max       numeric(14,2),
  condominio_estimado numeric(12,2),
  iptu_estimado   numeric(12,2),
  aceita_fgts     boolean default true,
  aceita_financiamento boolean default true,
  programa        text,                                  -- MCMV | SBPE | Pro-Cotista | Permuta
  faixa_mcmv      int,
  -- Conteúdo
  descricao       text,
  diferenciais    text[],
  lazer           text[],
  midias          jsonb not null default '[]'::jsonb,
  documentos      jsonb not null default '[]'::jsonb,
  ri_matricula    text,
  -- Inteligência
  score_produto   numeric(5,2),
  dados_extraidos jsonb not null default '{}'::jsonb,
  tags            text[],
  ativo           boolean not null default true,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_emp_org on public.empreendimentos(org_id);
create index if not exists idx_emp_bairro on public.empreendimentos(cidade, bairro);

create table if not exists public.tipologias (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  nome            text not null,                        -- "Tipo A - 2 quartos"
  quartos         int default 0,
  suites          int default 0,
  banheiros       int default 0,
  vagas           int default 0,
  area_privativa  numeric(10,2),
  area_total      numeric(10,2),
  area_terreno    numeric(10,2),
  varanda         boolean default false,
  varanda_gourmet boolean default false,
  planta_url      text,
  valor_base      numeric(14,2),
  valor_m2        numeric(12,2) generated always as (
                    case when area_privativa > 0 then round(valor_base / area_privativa, 2) end
                  ) stored,
  caracteristicas text[],
  quantidade      int default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_tip_emp on public.tipologias(empreendimento_id);
create index if not exists idx_tip_org on public.tipologias(org_id);

create table if not exists public.unidades (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  tipologia_id    uuid references public.tipologias(id) on delete set null,
  identificacao   text not null,                        -- "Torre A - 1203"
  torre           text,
  andar           int,
  posicao         text,                                 -- frente | fundos | lateral
  face_solar      text,                                 -- norte | sul | leste | oeste
  status          unit_status not null default 'disponivel',
  valor           numeric(14,2),
  valor_tabela    numeric(14,2),
  desconto_max_pct numeric(5,2) default 0,
  entrada_minima  numeric(14,2),
  observacoes     text,
  reservado_ate   timestamptz,
  reservado_por   uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (empreendimento_id, identificacao)
);
create index if not exists idx_uni_emp on public.unidades(empreendimento_id);
create index if not exists idx_uni_org_status on public.unidades(org_id, status);

-- ============================================================================
-- 4. BOOKS — upload e extração inteligente
-- ============================================================================
create table if not exists public.books (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  nome_arquivo    text not null,
  storage_path    text,
  mime            text,
  tamanho_bytes   bigint,
  paginas         int,
  status          book_status not null default 'pendente',
  metodo          text,                                  -- pdfjs | ocr | ia | manual
  texto_bruto     text,
  extracao        jsonb not null default '{}'::jsonb,   -- payload estruturado do parser
  confianca       numeric(5,2),                          -- 0-100
  campos_faltando text[],
  erro            text,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_books_org on public.books(org_id, status);

-- ============================================================================
-- 5. LEADS / CLIENTES
-- ============================================================================
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  nome            text not null,
  email           text,
  telefone        text,
  cpf             text,
  nascimento      date,
  estado_civil    text,
  dependentes     int default 0,
  profissao       text,
  -- Financeiro (crítico pro repasse CEF)
  renda_bruta     numeric(14,2),
  renda_composta  numeric(14,2),
  fgts            numeric(14,2) default 0,
  entrada_disponivel numeric(14,2) default 0,
  subsidio        numeric(14,2) default 0,                -- subsídio MCMV estimado/aprovado
  comprometimento_mensal numeric(14,2) default 0,
  score_credito   int,
  possui_imovel   boolean default false,
  tres_anos_fgts  boolean default false,
  servidor_publico boolean default false,
  -- Preferências
  objetivo        text default 'moradia',                -- moradia | investimento | permuta
  quartos_min     int,
  vagas_min       int,
  area_min        numeric(10,2),
  orcamento_min   numeric(14,2),
  orcamento_max   numeric(14,2),
  bairros_interesse text[],
  cidade_interesse  text,
  amenidades_desejadas text[],
  prazo_decisao   text,                                   -- imediato | 30d | 90d | 6m | indefinido
  -- CRM
  origem          text,                                   -- instagram | indicacao | plantao | portal | trafego
  campanha        text,
  temperatura     lead_temp not null default 'morno',
  score           numeric(5,2) default 0,
  score_detalhe   jsonb not null default '{}'::jsonb,
  proximo_contato timestamptz,
  ultimo_contato  timestamptz,
  responsavel_id  uuid references auth.users(id),
  tags            text[],
  observacoes     text,
  consentimento_lgpd boolean default false,
  arquivado       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.leads add column if not exists subsidio numeric(14,2) default 0;
create index if not exists idx_leads_org on public.leads(org_id) where not arquivado;
create index if not exists idx_leads_resp on public.leads(responsavel_id);
create index if not exists idx_leads_score on public.leads(org_id, score desc);

-- ============================================================================
-- 6. NEGÓCIOS / PIPELINE
-- ============================================================================
create table if not exists public.deals (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  lead_id         uuid not null references public.leads(id) on delete cascade,
  unidade_id      uuid references public.unidades(id) on delete set null,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  titulo          text,
  stage           deal_stage not null default 'novo',
  valor           numeric(14,2),
  valor_proposta  numeric(14,2),
  comissao_pct    numeric(5,2) default 5,
  probabilidade   numeric(5,2) default 10,
  previsao_fechamento date,
  motivo_perda    text,
  responsavel_id  uuid references auth.users(id),
  dias_no_stage   int default 0,
  health          numeric(5,2),
  health_detalhe  jsonb not null default '{}'::jsonb,
  proxima_acao    text,
  fechado_em      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_deals_org_stage on public.deals(org_id, stage);
create index if not exists idx_deals_lead on public.deals(lead_id);

create table if not exists public.deal_stage_history (
  id          bigserial primary key,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  deal_id     uuid not null references public.deals(id) on delete cascade,
  de_stage    deal_stage,
  para_stage  deal_stage not null,
  dias        int,
  user_id     uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_dsh_deal on public.deal_stage_history(deal_id);

create table if not exists public.activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  lead_id     uuid references public.leads(id) on delete cascade,
  deal_id     uuid references public.deals(id) on delete cascade,
  tipo        activity_kind not null default 'nota',
  titulo      text,
  conteudo    text,
  resultado   text,                                       -- positivo | neutro | negativo | sem_resposta
  duracao_min int,
  agendado_para timestamptz,
  concluido   boolean not null default true,
  user_id     uuid references auth.users(id),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_act_lead on public.activities(lead_id, created_at desc);
create index if not exists idx_act_org_agenda on public.activities(org_id, agendado_para) where not concluido;

-- ============================================================================
-- 7. MATCHING INTELIGENTE
-- ============================================================================
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  unidade_id  uuid not null references public.unidades(id) on delete cascade,
  score       numeric(5,2) not null,
  motivos     jsonb not null default '[]'::jsonb,
  bloqueios   jsonb not null default '[]'::jsonb,
  apresentado boolean not null default false,
  feedback    text,
  created_at  timestamptz not null default now(),
  unique (lead_id, unidade_id)
);
create index if not exists idx_match_lead on public.matches(lead_id, score desc);

-- ============================================================================
-- 8. SIMULAÇÕES DE CRÉDITO (CEF / SBPE / MCMV)
-- ============================================================================
create table if not exists public.simulacoes (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  lead_id         uuid references public.leads(id) on delete cascade,
  unidade_id      uuid references public.unidades(id) on delete set null,
  valor_imovel    numeric(14,2) not null,
  entrada         numeric(14,2) default 0,
  fgts            numeric(14,2) default 0,
  subsidio        numeric(14,2) default 0,
  valor_financiado numeric(14,2),
  prazo_meses     int default 420,
  taxa_anual      numeric(6,3) default 10.5,
  sistema         text default 'SAC',                    -- SAC | PRICE
  primeira_parcela numeric(12,2),
  ultima_parcela  numeric(12,2),
  total_pago      numeric(14,2),
  renda_exigida   numeric(12,2),
  comprometimento_pct numeric(5,2),
  aprovado_estimado boolean,
  programa        text,
  faixa_mcmv      int,
  detalhe         jsonb not null default '{}'::jsonb,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_sim_lead on public.simulacoes(lead_id, created_at desc);

-- ============================================================================
-- 9. AGENTES DE IA (escritório virtual)
-- ============================================================================
create table if not exists public.ai_agents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  nome          text not null,
  papel         agent_role not null,
  avatar_cor    text default '#D4A056',
  especialidade text,
  system_prompt text not null,
  temperatura   numeric(3,2) default 0.6,
  modelo        text default 'claude-sonnet-5-5',
  mesa_x        numeric(6,2) default 0,
  mesa_z        numeric(6,2) default 0,
  ativo         boolean not null default true,
  stats         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_agents_org on public.ai_agents(org_id) where ativo;

create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  agent_id    uuid not null references public.ai_agents(id) on delete cascade,
  user_id     uuid references auth.users(id),
  lead_id     uuid references public.leads(id) on delete set null,
  titulo      text,
  contexto    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_conv_user on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id              bigserial primary key,
  org_id          uuid not null references public.orgs(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system')),
  content         text not null,
  tokens          int,
  created_at      timestamptz not null default now()
);
create index if not exists idx_msg_conv on public.ai_messages(conversation_id, id);

-- ============================================================================
-- 10. ACADEMIA DE VENDAS
-- ============================================================================
create table if not exists public.scripts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  categoria   text not null,                             -- abordagem | qualificacao | visita | objecao | fechamento | followup
  titulo      text not null,
  canal       text default 'whatsapp',
  corpo       text not null,
  variaveis   text[],
  tags        text[],
  usos        int default 0,
  taxa_sucesso numeric(5,2),
  created_at  timestamptz not null default now()
);
create index if not exists idx_scripts_org on public.scripts(org_id, categoria);

create table if not exists public.objecoes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  objecao     text not null,
  categoria   text,                                      -- preco | prazo | confianca | concorrencia | conjuge | credito
  gatilho     text,
  resposta    text not null,
  tecnica     text,                                      -- espelhamento | reframe | prova_social | ancoragem | escassez
  follow_up   text,
  eficacia    numeric(5,2) default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_obj_org on public.objecoes(org_id, categoria);

create table if not exists public.treinamentos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id),
  modulo      text not null,
  cenario     text,
  transcricao jsonb not null default '[]'::jsonb,
  nota        numeric(5,2),
  pontos_fortes text[],
  pontos_melhoria text[],
  duracao_min int,
  created_at  timestamptz not null default now()
);
create index if not exists idx_trein_user on public.treinamentos(user_id, created_at desc);

-- ============================================================================
-- 11. MERCADO / COMPARÁVEIS
-- ============================================================================
create table if not exists public.comparaveis (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  fonte       text,
  titulo      text,
  cidade      text,
  bairro      text,
  quartos     int,
  vagas       int,
  area        numeric(10,2),
  valor       numeric(14,2),
  valor_m2    numeric(12,2),
  dias_anunciado int,
  lat         numeric(10,7),
  lng         numeric(10,7),
  coletado_em date default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists idx_comp_loc on public.comparaveis(cidade, bairro, quartos);

-- ============================================================================
-- 12. METAS, NOTIFICAÇÕES, AUDITORIA
-- ============================================================================
create table if not exists public.metas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id),
  competencia date not null,
  vgv_meta    numeric(14,2) default 0,
  unidades_meta int default 0,
  leads_meta  int default 0,
  visitas_meta int default 0,
  created_at  timestamptz not null default now(),
  unique (org_id, user_id, competencia)
);

create table if not exists public.notificacoes (
  id          bigserial primary key,
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  tipo        text,
  titulo      text not null,
  corpo       text,
  link        text,
  prioridade  int default 2,
  lida        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notif_user on public.notificacoes(user_id, lida, created_at desc);

create table if not exists public.audit_log (
  id          bigserial primary key,
  org_id      uuid,
  user_id     uuid,
  tabela      text,
  registro_id uuid,
  acao        text,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 13. FUNÇÕES UTILITÁRIAS
-- ============================================================================
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['orgs','profiles','empreendimentos','tipologias','unidades','books','leads','deals','ai_conversations']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.fn_touch_updated_at()', t);
  end loop;
end $$;

create or replace function public.fn_haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric language sql immutable as $$
  select case when lat1 is null or lat2 is null then null else
    round((6371 * 2 * asin(sqrt(
      power(sin(radians((lat2 - lat1) / 2)), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lng2 - lng1) / 2)), 2)
    )))::numeric, 2) end;
$$;

create or replace function public.fn_norm(p text)
returns text language sql immutable as $$
  select translate(lower(trim(coalesce(p, ''))),
    'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
$$;

-- ============================================================================
-- 14. MOTOR DE CRÉDITO (SAC / CEF)
--     Capacidade de compra baseada na 1ª parcela SAC ≤ % da renda.
--     PV_max = (parcela_max - taxa_adm) / (1/n + i_mensal + encargos_seguro)
--     Imóvel_max = min(PV_max + recursos, recursos / (1 - LTV))
-- ============================================================================
create or replace function public.fn_mcmv_faixa(p_renda numeric)
returns int language sql immutable as $$
  -- Valores de referência (2025/2026). Ajuste conforme normativo vigente.
  select case
    when p_renda is null then null
    when p_renda <= 2850  then 1
    when p_renda <= 4700  then 2
    when p_renda <= 8600  then 3
    when p_renda <= 12000 then 4
    else null end;
$$;

create or replace function public.fn_taxa_referencia(p_renda numeric, p_cotista boolean default false)
returns numeric language sql immutable as $$
  -- Taxa efetiva anual de referência (%). Ajuste conforme tabela vigente.
  select case public.fn_mcmv_faixa(p_renda)
    when 1 then 4.50
    when 2 then case when p_cotista then 6.00 else 6.50 end
    when 3 then case when p_cotista then 7.66 else 8.16 end
    when 4 then 10.00
    else 11.49 end;
$$;

create or replace function public.fn_capacidade_compra(
  p_renda           numeric,
  p_comprometimento numeric default 0,
  p_recursos        numeric default 0,
  p_taxa_anual      numeric default null,
  p_prazo_meses     int     default 420,
  p_pct_renda       numeric default 0.30,
  p_ltv             numeric default 0.80
) returns jsonb language plpgsql immutable as $$
declare
  v_taxa      numeric := coalesce(p_taxa_anual, public.fn_taxa_referencia(p_renda));
  v_i         numeric;
  v_n         int := greatest(coalesce(p_prazo_meses, 420), 12);
  v_seguro    numeric := 0.00035;  -- MIP+DFI aproximado sobre saldo
  v_taxa_adm  numeric := 25;
  v_parcela   numeric;
  v_pv        numeric;
  v_imovel    numeric;
  v_rec       numeric := greatest(coalesce(p_recursos, 0), 0);
begin
  if coalesce(p_renda, 0) <= 0 then
    return jsonb_build_object('erro', 'renda não informada');
  end if;
  v_i := power(1 + v_taxa / 100, 1.0 / 12) - 1;
  v_parcela := greatest(p_renda * p_pct_renda - coalesce(p_comprometimento, 0), 0);
  v_pv := greatest((v_parcela - v_taxa_adm) / (1.0 / v_n + v_i + v_seguro), 0);
  v_imovel := least(v_pv + v_rec, case when p_ltv < 1 then v_rec / (1 - p_ltv) else v_pv + v_rec end);
  -- Se recursos cobrem a entrada mínima, o teto é PV + recursos; senão, LTV limita
  return jsonb_build_object(
    'taxa_anual',         v_taxa,
    'taxa_mensal',        round(v_i * 100, 4),
    'prazo_meses',        v_n,
    'parcela_max',        round(v_parcela, 2),
    'financiamento_max',  round(v_pv, 2),
    'imovel_max',         round(v_imovel, 2),
    'imovel_max_sem_ltv', round(v_pv + v_rec, 2),
    'entrada_necessaria', round(greatest(v_pv / p_ltv * (1 - p_ltv) - v_rec, 0), 2),
    'faixa_mcmv',         public.fn_mcmv_faixa(p_renda),
    'limitado_por',       case when v_rec / nullif(1 - p_ltv, 0) < v_pv + v_rec then 'entrada' else 'renda' end
  );
end $$;

create or replace function public.fn_simular_sac(
  p_valor_imovel numeric, p_entrada numeric, p_taxa_anual numeric, p_prazo int default 420
) returns jsonb language plpgsql immutable as $$
declare
  v_pv numeric := greatest(p_valor_imovel - coalesce(p_entrada, 0), 0);
  v_i  numeric := power(1 + p_taxa_anual / 100, 1.0 / 12) - 1;
  v_amort numeric := v_pv / greatest(p_prazo, 1);
  v_p1 numeric; v_pn numeric; v_total numeric;
begin
  v_p1 := v_amort + v_pv * v_i + v_pv * 0.00035 + 25;
  v_pn := v_amort + v_amort * v_i + 25;
  v_total := v_pv + v_i * v_amort * p_prazo * (p_prazo + 1) / 2.0 + 25 * p_prazo;
  return jsonb_build_object(
    'valor_financiado', round(v_pv, 2),
    'primeira_parcela', round(v_p1, 2),
    'ultima_parcela',   round(v_pn, 2),
    'total_pago',       round(v_total, 2),
    'juros_totais',     round(v_total - v_pv, 2),
    'renda_minima',     round(v_p1 / 0.30, 2),
    'ltv_pct',          round(v_pv / nullif(p_valor_imovel, 0) * 100, 2)
  );
end $$;

-- ============================================================================
-- 15. LEAD SCORING (0-100) — explicável
--     Fit financeiro 30 · Engajamento 25 · Recência 15 · Urgência 15 · Dados 10 · Origem 5
-- ============================================================================
create or replace function public.fn_lead_score(p_lead uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.leads%rowtype;
  v_cap jsonb; v_cap_imovel numeric;
  v_fit numeric := 0; v_eng numeric := 0; v_rec numeric := 0;
  v_urg numeric := 0; v_dados numeric := 0; v_orig numeric := 0;
  v_acts int; v_pos int; v_dias numeric; v_total numeric; v_temp lead_temp;
  v_oferta numeric;
begin
  select * into l from public.leads where id = p_lead;
  if not found then return null; end if;
  if auth.uid() is not null and l.org_id not in (select public.fn_my_orgs()) then return null; end if;

  -- Fit financeiro
  if coalesce(l.renda_bruta, 0) + coalesce(l.renda_composta, 0) > 0 then
    v_cap := public.fn_capacidade_compra(
      coalesce(l.renda_bruta, 0) + coalesce(l.renda_composta, 0),
      l.comprometimento_mensal,
      coalesce(l.entrada_disponivel, 0) + coalesce(l.fgts, 0) + coalesce(l.subsidio, 0));
    v_cap_imovel := (v_cap->>'imovel_max_sem_ltv')::numeric
                    * case when v_cap->>'limitado_por' = 'entrada' then 0.8 else 1 end;
    select percentile_cont(0.25) within group (order by valor) into v_oferta
      from public.unidades where org_id = l.org_id and status = 'disponivel' and valor > 0;
    if v_oferta is null then v_fit := 18;
    else v_fit := least(30, 30 * v_cap_imovel / nullif(v_oferta, 0));
    end if;
    if l.score_credito is not null then
      v_fit := v_fit * case when l.score_credito >= 700 then 1.0 when l.score_credito >= 500 then 0.85 else 0.55 end;
    end if;
  elsif l.orcamento_max is not null then
    v_fit := 10;
  end if;

  -- Engajamento (últimos 21 dias)
  select count(*), count(*) filter (where resultado = 'positivo')
    into v_acts, v_pos
    from public.activities where lead_id = p_lead and created_at > now() - interval '21 days';
  v_eng := least(25, v_acts * 3 + v_pos * 4);

  -- Recência: decaimento exponencial (meia-vida ~5 dias)
  v_dias := extract(epoch from (now() - coalesce(l.ultimo_contato, l.created_at))) / 86400.0;
  v_rec := round(15 * exp(-v_dias / 7.2), 2);

  -- Urgência
  v_urg := case l.prazo_decisao
    when 'imediato' then 15 when '30d' then 12 when '90d' then 8 when '6m' then 4 else 2 end;

  -- Completude
  v_dados := (case when l.telefone is not null then 2 else 0 end)
           + (case when l.renda_bruta is not null then 3 else 0 end)
           + (case when l.fgts is not null and l.fgts > 0 then 1 else 0 end)
           + (case when l.cpf is not null then 2 else 0 end)
           + (case when l.quartos_min is not null or l.bairros_interesse is not null then 2 else 0 end);

  -- Origem
  v_orig := case lower(coalesce(l.origem, ''))
    when 'indicacao' then 5 when 'plantao' then 4.5 when 'retorno' then 4.5
    when 'portal' then 3 when 'instagram' then 2.5 when 'trafego' then 2 else 1.5 end;

  v_total := round(least(100, coalesce(v_fit,0) + v_eng + v_rec + v_urg + v_dados + v_orig), 2);
  v_temp := case when v_total >= 80 then 'fervendo' when v_total >= 60 then 'quente'
                 when v_total >= 35 then 'morno' else 'frio' end;

  update public.leads set
    score = v_total, temperatura = v_temp,
    score_detalhe = jsonb_build_object(
      'fit', round(v_fit,2), 'engajamento', v_eng, 'recencia', v_rec,
      'urgencia', v_urg, 'dados', v_dados, 'origem', v_orig,
      'capacidade', v_cap, 'calculado_em', now())
  where id = p_lead;

  return jsonb_build_object('score', v_total, 'temperatura', v_temp);
end $$;

-- ============================================================================
-- 16. MATCHING LEAD × UNIDADE (0-100) com motivos e bloqueios
--     Orçamento 35 · Tipologia 25 · Localização 20 · Lazer 10 · Objetivo 10
-- ============================================================================
create or replace function public.fn_match_unidades(p_lead uuid, p_limit int default 10)
returns table (
  unidade_id uuid, empreendimento_id uuid, empreendimento text, identificacao text,
  bairro text, quartos int, vagas int, area numeric, valor numeric,
  score numeric, motivos jsonb, bloqueios jsonb
) language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  l public.leads%rowtype;
  v_limite numeric; v_cap jsonb;
begin
  select * into l from public.leads where id = p_lead and org_id in (select public.fn_my_orgs());
  if not found then return; end if;

  if coalesce(l.renda_bruta, 0) + coalesce(l.renda_composta, 0) > 0 then
    v_cap := public.fn_capacidade_compra(coalesce(l.renda_bruta,0) + coalesce(l.renda_composta,0),
              l.comprometimento_mensal, coalesce(l.entrada_disponivel,0) + coalesce(l.fgts,0) + coalesce(l.subsidio,0));
    v_limite := (v_cap->>'imovel_max_sem_ltv')::numeric;
  end if;
  if l.orcamento_max is not null then
    v_limite := case when v_limite is null then l.orcamento_max else least(v_limite, l.orcamento_max * 1.05) end;
  end if;

  return query
  with base as (
    select u.id uid, e.id eid, e.nome enome, u.identificacao ident, e.bairro ebairro, e.cidade ecidade,
           coalesce(t.quartos,0) q, coalesce(t.vagas,0) vg, t.area_privativa ar,
           coalesce(u.valor, t.valor_base) val, coalesce(e.lazer, '{}') lz, e.status_obra st, e.previsao_entrega pe
    from public.unidades u
    join public.empreendimentos e on e.id = u.empreendimento_id
    left join public.tipologias t on t.id = u.tipologia_id
    where u.org_id = l.org_id and u.status = 'disponivel' and e.ativo
  ), sc as (
    select b.*,
      -- Orçamento
      case
        when v_limite is null or b.val is null then 17.5
        when b.val <= v_limite then 35 - greatest(0, (0.6 - b.val / v_limite)) * 25
        when b.val <= v_limite * 1.15 then 35 * (1 - (b.val / v_limite - 1) / 0.15) * 0.6
        else -least(30, (b.val / v_limite - 1.15) * 40) end as s_orc,
      -- Tipologia
      (case when l.quartos_min is null then 9 when b.q >= l.quartos_min then 15 when b.q = l.quartos_min - 1 then 5 else 0 end)
      + (case when l.vagas_min is null then 3 when b.vg >= l.vagas_min then 5 else 0 end)
      + (case when l.area_min is null then 3 when coalesce(b.ar,0) >= l.area_min then 5 when coalesce(b.ar,0) >= l.area_min * 0.9 then 2 else 0 end) as s_tip,
      -- Localização
      case
        when l.bairros_interesse is not null and exists (
          select 1 from unnest(l.bairros_interesse) bi where public.fn_norm(bi) = public.fn_norm(b.ebairro)) then 20
        when l.cidade_interesse is not null and public.fn_norm(l.cidade_interesse) = public.fn_norm(b.ecidade) then 8
        when l.bairros_interesse is null and l.cidade_interesse is null then 10
        else 0 end as s_loc,
      -- Lazer
      case when l.amenidades_desejadas is null or cardinality(l.amenidades_desejadas) = 0 then 5
        else 10.0 * (select count(*) from unnest(l.amenidades_desejadas) a
                     where exists (select 1 from unnest(b.lz) z where public.fn_norm(z) like '%' || public.fn_norm(a) || '%'))
             / cardinality(l.amenidades_desejadas) end as s_laz,
      -- Objetivo
      case l.objetivo
        when 'investimento' then case when b.st in ('lancamento','em_obra') then 10 else 5 end
        else case when b.st = 'pronto' then 10 when b.pe is not null and b.pe <= current_date + 365 then 8 else 5 end
      end as s_obj
    from base b
  )
  select sc.uid, sc.eid, sc.enome, sc.ident, sc.ebairro, sc.q, sc.vg, sc.ar, sc.val,
    round(greatest(0, least(100, sc.s_orc + sc.s_tip + sc.s_loc + sc.s_laz + sc.s_obj))::numeric, 1) as score,
    (select coalesce(jsonb_agg(m), '[]'::jsonb) from (
       select 'Cabe no orçamento (' || round(sc.val / v_limite * 100) || '% da capacidade)' m where v_limite is not null and sc.val <= v_limite
       union all select 'Bairro de interesse: ' || sc.ebairro where sc.s_loc = 20
       union all select sc.q || ' quartos atende o mínimo de ' || l.quartos_min where l.quartos_min is not null and sc.q >= l.quartos_min
       union all select 'Lazer alinhado ao desejo do cliente' where sc.s_laz >= 7
       union all select case when l.objetivo = 'investimento' then 'Fase de obra favorece valorização' else 'Entrega próxima / pronto para morar' end where sc.s_obj >= 8
    ) x) as motivos,
    (select coalesce(jsonb_agg(m), '[]'::jsonb) from (
       select 'Acima do orçamento em ' || round((sc.val / v_limite - 1) * 100) || '%' m where v_limite is not null and sc.val > v_limite
       union all select 'Menos quartos que o desejado' where l.quartos_min is not null and sc.q < l.quartos_min
       union all select 'Fora dos bairros de interesse' where l.bairros_interesse is not null and sc.s_loc < 20
    ) y) as bloqueios
  from sc
  order by score desc, sc.val asc nulls last
  limit p_limit;
end $$;

-- ============================================================================
-- 17. DEAL HEALTH / PROBABILIDADE
-- ============================================================================
create or replace function public.fn_stage_prob(p deal_stage)
returns numeric language sql immutable as $$
  select case p
    when 'novo' then 5 when 'qualificacao' then 12 when 'visita' then 25
    when 'proposta' then 45 when 'analise_credito' then 60 when 'contrato' then 78
    when 'repasse' then 88 when 'assinatura' then 95 when 'ganho' then 100 else 0 end;
$$;

create or replace function public.fn_stage_sla_dias(p deal_stage)
returns int language sql immutable as $$
  select case p
    when 'novo' then 1 when 'qualificacao' then 3 when 'visita' then 5
    when 'proposta' then 4 when 'analise_credito' then 10 when 'contrato' then 7
    when 'repasse' then 25 when 'assinatura' then 5 else 999 end;
$$;

create or replace function public.fn_deal_health(p_deal uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d public.deals%rowtype; l public.leads%rowtype;
  v_dias int; v_sla int; v_ult numeric; v_h numeric; v_acao text; v_logit numeric; v_prob numeric;
begin
  select * into d from public.deals where id = p_deal;
  if not found then return null; end if;
  if auth.uid() is not null and d.org_id not in (select public.fn_my_orgs()) then return null; end if;
  select * into l from public.leads where id = d.lead_id;

  select coalesce(extract(day from now() - max(created_at)), 99) into v_dias
    from public.deal_stage_history where deal_id = p_deal;
  if v_dias = 99 then v_dias := extract(day from now() - d.created_at); end if;
  v_sla := public.fn_stage_sla_dias(d.stage);
  v_ult := extract(epoch from now() - coalesce(l.ultimo_contato, d.created_at)) / 86400.0;

  -- Regressão logística com pesos calibrados de mercado (sem treino; explicável)
  v_logit := -2.2
    + 0.045 * public.fn_stage_prob(d.stage)
    + 0.025 * coalesce(l.score, 30)
    - 0.9   * greatest(0, v_dias::numeric / v_sla - 1)
    - 0.12  * least(v_ult, 20)
    + case when d.unidade_id is not null then 0.4 else 0 end;
  v_prob := case when d.stage = 'ganho' then 100 when d.stage = 'perdido' then 0
                 else round(100 / (1 + exp(-v_logit)), 1) end;
  v_h := round(least(100, greatest(0, 100 - greatest(0, v_dias - v_sla) * 8 - least(v_ult, 15) * 3)), 1);

  v_acao := case
    when d.stage in ('ganho','perdido') then null
    when v_ult > 5 then 'Retomar contato hoje: ' || round(v_ult) || ' dias sem falar com o cliente'
    when d.stage = 'novo' then 'Ligar em até 5 minutos e qualificar renda/FGTS'
    when d.stage = 'qualificacao' then 'Rodar simulação de crédito e agendar visita'
    when d.stage = 'visita' then 'Confirmar visita D-1 e levar 2 opções + 1 âncora'
    when d.stage = 'proposta' then 'Fechar condição: prazo de validade da proposta em 48h'
    when d.stage = 'analise_credito' then 'Cobrar pendências de documentação e acompanhar avaliação'
    when d.stage = 'contrato' then 'Agendar assinatura e conferir minuta'
    when d.stage = 'repasse' then 'Acompanhar conformidade CEF e laudo de engenharia'
    when d.stage = 'assinatura' then 'Enviar envelope DocuSign e monitorar assinaturas'
    end;

  update public.deals set
    dias_no_stage = v_dias, health = v_h, probabilidade = v_prob, proxima_acao = v_acao,
    health_detalhe = jsonb_build_object('dias_no_stage', v_dias, 'sla', v_sla,
      'dias_sem_contato', round(v_ult, 1), 'estourou_sla', v_dias > v_sla, 'calculado_em', now())
  where id = p_deal;

  return jsonb_build_object('health', v_h, 'probabilidade', v_prob, 'proxima_acao', v_acao);
end $$;

-- ============================================================================
-- 18. TRIGGERS DE INTELIGÊNCIA
-- ============================================================================
create or replace function public.trg_activity_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lead_id is not null and new.concluido then
    update public.leads set ultimo_contato = greatest(coalesce(ultimo_contato, new.created_at), new.created_at)
      where id = new.lead_id;
    perform public.fn_lead_score(new.lead_id);
  end if;
  if new.deal_id is not null then perform public.fn_deal_health(new.deal_id); end if;
  return new;
end $$;
drop trigger if exists trg_activity_after on public.activities;
create trigger trg_activity_after after insert on public.activities
  for each row execute function public.trg_activity_after();

create or replace function public.trg_lead_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.fn_lead_score(new.id);
  return new;
end $$;
drop trigger if exists trg_lead_after on public.leads;
create trigger trg_lead_after after insert or update of renda_bruta, renda_composta, fgts, entrada_disponivel, subsidio,
  prazo_decisao, origem, telefone, cpf, score_credito, comprometimento_mensal on public.leads
  for each row execute function public.trg_lead_after();

create or replace function public.trg_deal_before()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_last timestamptz;
begin
  if tg_op = 'INSERT' then
    new.probabilidade := public.fn_stage_prob(new.stage);
    return new;
  end if;
  if new.stage is distinct from old.stage then
    select max(created_at) into v_last from public.deal_stage_history where deal_id = new.id;
    insert into public.deal_stage_history(org_id, deal_id, de_stage, para_stage, dias, user_id)
      values (new.org_id, new.id, old.stage, new.stage,
              coalesce(extract(day from now() - v_last)::int, 0), auth.uid());
    new.probabilidade := public.fn_stage_prob(new.stage);
    new.dias_no_stage := 0;
    if new.stage in ('ganho','perdido') then new.fechado_em := now(); end if;
    if new.stage = 'ganho' and new.unidade_id is not null then
      update public.unidades set status = 'vendido' where id = new.unidade_id;
    elsif new.stage in ('proposta','analise_credito','contrato','repasse','assinatura') and new.unidade_id is not null then
      update public.unidades set status = 'reservado' where id = new.unidade_id and status in ('disponivel','proposta');
    elsif new.stage = 'perdido' and new.unidade_id is not null then
      update public.unidades set status = 'disponivel' where id = new.unidade_id and status in ('reservado','proposta');
    end if;
  end if;
  return new;
end $$;

create or replace function public.trg_deal_after_ins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.deal_stage_history(org_id, deal_id, de_stage, para_stage, dias, user_id)
    values (new.org_id, new.id, null, new.stage, 0, auth.uid());
  return new;
end $$;

drop trigger if exists trg_deal_stage_ins on public.deals;
drop trigger if exists trg_deal_stage_upd on public.deals;
drop trigger if exists trg_deal_before on public.deals;
create trigger trg_deal_before before insert or update of stage on public.deals
  for each row execute function public.trg_deal_before();
drop trigger if exists trg_deal_after_ins on public.deals;
create trigger trg_deal_after_ins after insert on public.deals
  for each row execute function public.trg_deal_after_ins();

create or replace function public.trg_deal_after_stage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then perform public.fn_deal_health(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_deal_after_stage on public.deals;
create trigger trg_deal_after_stage after update of stage on public.deals
  for each row execute function public.trg_deal_after_stage();

-- Recalcula health de todos os negócios abertos (agende via pg_cron se quiser)
create or replace function public.fn_recalcular_tudo(p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if auth.uid() is not null and (p_org is null or p_org not in (select public.fn_my_orgs())) then
    raise exception 'sem acesso';
  end if;
  for r in select id from public.leads where (p_org is null or org_id = p_org) and not arquivado loop
    perform public.fn_lead_score(r.id); n := n + 1;
  end loop;
  for r in select id from public.deals where (p_org is null or org_id = p_org) and stage not in ('ganho','perdido') loop
    perform public.fn_deal_health(r.id); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.trg_audit_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (org_id, user_id, tabela, registro_id, acao, diff)
  values (old.org_id, auth.uid(), tg_table_name, old.id, 'delete', to_jsonb(old));
  return old;
end $$;
do $$
declare t text;
begin
  foreach t in array array['leads','deals','unidades','empreendimentos'] loop
    execute format('drop trigger if exists trg_audit_del_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_del_%1$s after delete on public.%1$s for each row execute function public.trg_audit_delete()', t);
  end loop;
end $$;

-- ============================================================================
-- 19. AUTH: perfil automático + onboarding de imobiliária
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cria a imobiliária do usuário logado (chamado pelo app no 1º login)
create or replace function public.fn_onboard(p_nome text, p_cidade text default null, p_uf text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_slug text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  select org_id into v_org from public.org_members where user_id = auth.uid() and active limit 1;
  if v_org is not null then return v_org; end if;

  insert into public.profiles (id, email) select auth.uid(), email from auth.users where id = auth.uid()
    on conflict (id) do nothing;

  v_slug := regexp_replace(public.fn_norm(p_nome), '[^a-z0-9]+', '-', 'g') || '-' || substr(md5(random()::text), 1, 5);
  insert into public.orgs (nome, slug, cidade, uf) values (p_nome, v_slug, p_cidade, upper(p_uf)) returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into public.metas (org_id, user_id, competencia, vgv_meta, unidades_meta, leads_meta, visitas_meta)
    values (v_org, auth.uid(), date_trunc('month', current_date)::date, 2000000, 8, 120, 30)
    on conflict do nothing;
  return v_org;
end $$;

-- Adiciona um usuário já cadastrado à imobiliária
create or replace function public.fn_convidar(p_org uuid, p_email text, p_role user_role default 'corretor')
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.fn_is_manager(p_org) then raise exception 'apenas gestores podem convidar'; end if;
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then return 'Usuário não encontrado. Peça para criar a conta em /index.html e convide novamente.'; end if;
  insert into public.profiles (id, email, nome) values (v_uid, p_email, split_part(p_email, '@', 1)) on conflict (id) do nothing;
  insert into public.org_members (org_id, user_id, role) values (p_org, v_uid, p_role)
    on conflict (org_id, user_id) do update set role = excluded.role, active = true;
  return 'ok';
end $$;

-- ============================================================================
-- 20. DADOS DE DEMONSTRAÇÃO (São Luís/MA) — rode pelo botão no app
-- ============================================================================
create or replace function public.fn_seed_demo(p_org uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e1 uuid; e2 uuid; e3 uuid; e4 uuid;
  t record; i int; v_uid uuid := auth.uid(); n_u int := 0; n_l int := 0;
begin
  if p_org not in (select public.fn_my_orgs()) then raise exception 'sem acesso'; end if;
  if exists (select 1 from public.empreendimentos where org_id = p_org and nome = 'Residencial Maré Alta') then
    return jsonb_build_object('aviso', 'dados de demonstração já carregados');
  end if;

  insert into public.empreendimentos (org_id, nome, construtora, padrao, status_obra, previsao_entrega, bairro, cidade, uf, lat, lng,
    torres, andares, unidades_por_andar, total_unidades, elevadores, valor_min, valor_max, condominio_estimado, programa, lazer, diferenciais, descricao, created_by)
  values
   (p_org, 'Residencial Maré Alta', 'Construtora Demo', 'medio', 'em_obra', current_date + 420, 'Ponta d''Areia', 'São Luís', 'MA', -2.4925, -44.2920,
    2, 18, 4, 144, 2, 489000, 812000, 650, 'SBPE',
    array['piscina adulto','piscina infantil','academia','espaço gourmet','salão de festas','playground','coworking','pet place','quadra de areia'],
    array['vista mar','varanda gourmet','fechadura digital','infra para ar-condicionado'],
    'Torres com vista para a Baía de São Marcos, a 300 m da praia.', v_uid)
  returning id into e1;

  insert into public.empreendimentos (org_id, nome, construtora, padrao, status_obra, previsao_entrega, bairro, cidade, uf, lat, lng,
    torres, andares, unidades_por_andar, total_unidades, elevadores, valor_min, valor_max, condominio_estimado, programa, faixa_mcmv, lazer, diferenciais, descricao, created_by)
  values
   (p_org, 'Parque das Palmeiras', 'Construtora Demo', 'economico', 'lancamento', current_date + 900, 'Turu', 'São Luís', 'MA', -2.5240, -44.2180,
    6, 5, 8, 240, 0, 199000, 264000, 280, 'MCMV', 3,
    array['piscina','churrasqueira','playground','quadra poliesportiva','salão de festas','portaria 24h'],
    array['aceita FGTS','subsídio MCMV','ITBI e registro grátis'],
    'Condomínio clube MCMV com financiamento direto pela Caixa.', v_uid)
  returning id into e2;

  insert into public.empreendimentos (org_id, nome, construtora, padrao, status_obra, previsao_entrega, bairro, cidade, uf, lat, lng,
    torres, andares, unidades_por_andar, total_unidades, elevadores, valor_min, valor_max, condominio_estimado, programa, lazer, diferenciais, descricao, created_by)
  values
   (p_org, 'Atlântico Prime', 'Construtora Demo', 'alto', 'pronto', current_date - 60, 'Calhau', 'São Luís', 'MA', -2.4870, -44.2560,
    1, 24, 2, 48, 3, 1150000, 1890000, 1400, 'SBPE',
    array['piscina com borda infinita','spa','sauna','academia','cinema','adega','brinquedoteca','espaço gourmet','heliponto'],
    array['frente mar','4 suítes','automação residencial','gerador full'],
    'Alto padrão frente mar no Calhau, 2 apartamentos por andar.', v_uid)
  returning id into e3;

  insert into public.empreendimentos (org_id, nome, construtora, padrao, status_obra, previsao_entrega, bairro, cidade, uf, lat, lng,
    torres, andares, unidades_por_andar, total_unidades, elevadores, valor_min, valor_max, condominio_estimado, programa, lazer, diferenciais, descricao, created_by)
  values
   (p_org, 'Vila Cohama Life', 'Construtora Demo', 'medio', 'em_obra', current_date + 210, 'Cohama', 'São Luís', 'MA', -2.5080, -44.2440,
    3, 12, 6, 216, 2, 329000, 455000, 420, 'SBPE',
    array['piscina','academia','espaço gourmet','playground','pet place','bicicletário','mini mercado'],
    array['ao lado de shopping','varanda','2 vagas'],
    'Localização central, próximo a shopping, escolas e hospitais.', v_uid)
  returning id into e4;

  -- Tipologias
  insert into public.tipologias (org_id, empreendimento_id, nome, quartos, suites, banheiros, vagas, area_privativa, varanda, varanda_gourmet, valor_base, quantidade) values
    (p_org, e1, 'Tipo A — 2 suítes', 2, 2, 3, 1, 68.40, true, true, 489000, 72),
    (p_org, e1, 'Tipo B — 3 quartos', 3, 1, 3, 2, 92.15, true, true, 690000, 54),
    (p_org, e1, 'Cobertura', 3, 3, 4, 3, 148.00, true, true, 812000, 18),
    (p_org, e2, 'Tipo 1 — 2 quartos', 2, 0, 1, 1, 42.30, false, false, 199000, 160),
    (p_org, e2, 'Tipo 2 — 2 quartos c/ suíte', 2, 1, 2, 1, 48.90, true, false, 239000, 80),
    (p_org, e3, 'Planta Única — 4 suítes', 4, 4, 6, 4, 248.00, true, true, 1450000, 44),
    (p_org, e3, 'Cobertura Duplex', 4, 4, 6, 5, 412.00, true, true, 1890000, 4),
    (p_org, e4, 'Tipo A — 2 quartos', 2, 1, 2, 1, 57.80, true, false, 329000, 108),
    (p_org, e4, 'Tipo B — 3 quartos', 3, 1, 2, 2, 74.60, true, true, 455000, 108);

  -- Unidades (amostra por tipologia)
  for t in select id, empreendimento_id, valor_base, nome from public.tipologias where org_id = p_org loop
    for i in 1..4 loop
      insert into public.unidades (org_id, empreendimento_id, tipologia_id, identificacao, torre, andar, posicao, status, valor, valor_tabela, desconto_max_pct, entrada_minima)
      values (p_org, t.empreendimento_id, t.id,
              'T' || ((i % 2) + 1) || ' - ' || (i * 3 + 1) || lpad(i::text, 2, '0') || ' ' || left(t.nome, 6),
              'Torre ' || ((i % 2) + 1), i * 3 + 1,
              case when i % 2 = 0 then 'frente' else 'fundos' end,
              case when i = 4 then 'reservado'::unit_status else 'disponivel'::unit_status end,
              round(t.valor_base * (1 + (i * 3 + 1) * 0.004)), round(t.valor_base * (1 + (i * 3 + 1) * 0.004)), 4,
              round(t.valor_base * 0.1))
      on conflict do nothing;
      n_u := n_u + 1;
    end loop;
  end loop;

  -- Leads com perfis diversos
  insert into public.leads (org_id, nome, telefone, email, renda_bruta, renda_composta, fgts, entrada_disponivel, score_credito,
    objetivo, quartos_min, vagas_min, orcamento_max, bairros_interesse, cidade_interesse, amenidades_desejadas, prazo_decisao, origem,
    estado_civil, dependentes, profissao, responsavel_id, ultimo_contato, consentimento_lgpd)
  values
   (p_org, 'Mariana Costa', '(98) 98111-2201', 'mariana@exemplo.com', 7800, 4200, 38000, 60000, 760, 'moradia', 2, 1, 520000,
    array['Ponta d''Areia','Calhau'], 'São Luís', array['piscina','academia','pet place'], '30d', 'instagram', 'casada', 1, 'Engenheira', v_uid, now() - interval '1 day', true),
   (p_org, 'Rafael Mendes', '(98) 98222-3302', 'rafael@exemplo.com', 3900, 0, 21000, 8000, 640, 'moradia', 2, 1, 260000,
    array['Turu','Cohama'], 'São Luís', array['playground','piscina'], 'imediato', 'plantao', 'solteiro', 0, 'Técnico de enfermagem', v_uid, now() - interval '3 hours', true),
   (p_org, 'Dr. Henrique Sales', '(98) 98333-4403', 'henrique@exemplo.com', 42000, 0, 180000, 900000, 820, 'moradia', 4, 3, 1900000,
    array['Calhau','Ponta d''Areia'], 'São Luís', array['spa','academia','cinema'], '90d', 'indicacao', 'casado', 2, 'Médico', v_uid, now() - interval '6 days', true),
   (p_org, 'Juliana Ferreira', '(98) 98444-5504', 'juliana@exemplo.com', 9500, 0, 15000, 120000, 710, 'investimento', 2, 1, 600000,
    array['Ponta d''Areia','Cohama'], 'São Luís', array['coworking'], '30d', 'portal', 'solteira', 0, 'Advogada', v_uid, now() - interval '2 days', true),
   (p_org, 'Carlos & Ana Ribeiro', '(98) 98555-6605', 'ribeiro@exemplo.com', 6100, 3500, 52000, 30000, 680, 'moradia', 3, 2, 470000,
    array['Cohama','Turu'], 'São Luís', array['piscina','playground','academia'], '90d', 'trafego', 'casado', 2, 'Servidor público', v_uid, now() - interval '12 days', true),
   (p_org, 'Pedro Henrique Lima', '(98) 98666-7706', null, 2600, 0, 9000, 0, null, 'moradia', 2, null, 210000,
    array['Turu'], 'São Luís', null, '6m', 'trafego', 'solteiro', 0, 'Vendedor', v_uid, now() - interval '20 days', true);
  get diagnostics n_l = row_count;

  insert into public.deals (org_id, lead_id, empreendimento_id, titulo, stage, valor, responsavel_id, previsao_fechamento)
  select p_org, l.id,
         case when l.orcamento_max > 1000000 then e3 when l.orcamento_max > 480000 then e1 when l.orcamento_max > 300000 then e4 else e2 end,
         l.nome || ' — ' || case when l.orcamento_max > 1000000 then 'Atlântico Prime' when l.orcamento_max > 480000 then 'Maré Alta'
                                 when l.orcamento_max > 300000 then 'Vila Cohama' else 'Parque das Palmeiras' end,
         (array['qualificacao','visita','proposta','analise_credito','novo','novo']::deal_stage[])[row_number() over (order by l.created_at, l.nome)],
         l.orcamento_max * 0.95, v_uid, current_date + 30
  from public.leads l where l.org_id = p_org and l.responsavel_id is not distinct from v_uid
    and not exists (select 1 from public.deals d where d.lead_id = l.id);

  insert into public.comparaveis (org_id, fonte, titulo, cidade, bairro, quartos, vagas, area, valor, valor_m2, dias_anunciado) values
    (p_org, 'portal', 'Apto 2q vista mar', 'São Luís', 'Ponta d''Areia', 2, 1, 70, 545000, 7786, 41),
    (p_org, 'portal', 'Apto 3q varanda gourmet', 'São Luís', 'Ponta d''Areia', 3, 2, 95, 720000, 7579, 63),
    (p_org, 'portal', 'Apto 2q condomínio clube', 'São Luís', 'Turu', 2, 1, 45, 215000, 4778, 28),
    (p_org, 'portal', 'Apto 4 suítes frente mar', 'São Luís', 'Calhau', 4, 4, 260, 1650000, 6346, 120),
    (p_org, 'portal', 'Apto 2q próximo shopping', 'São Luís', 'Cohama', 2, 1, 60, 349000, 5817, 35),
    (p_org, 'portal', 'Apto 3q nascente', 'São Luís', 'Cohama', 3, 2, 78, 470000, 6026, 52),
    (p_org, 'portal', 'Apto 3q Renascença', 'São Luís', 'Renascença', 3, 2, 105, 690000, 6571, 47);

  perform public.fn_recalcular_tudo(p_org);
  return jsonb_build_object('unidades', n_u, 'leads', n_l);
end $$;

-- ============================================================================
-- 21. VIEWS DE DASHBOARD (security_invoker respeita RLS)
-- ============================================================================
create or replace view public.vw_funil with (security_invoker = true) as
select org_id, stage, count(*) as qtd, coalesce(sum(valor), 0) as vgv,
       coalesce(sum(valor * probabilidade / 100), 0) as vgv_ponderado,
       round(avg(dias_no_stage), 1) as dias_medio
from public.deals group by org_id, stage;

create or replace view public.vw_dashboard with (security_invoker = true) as
select o.id as org_id,
  (select count(*) from public.leads l where l.org_id = o.id and not l.arquivado) as leads_total,
  (select count(*) from public.leads l where l.org_id = o.id and not l.arquivado and l.temperatura in ('quente','fervendo')) as leads_quentes,
  (select count(*) from public.leads l where l.org_id = o.id and l.created_at >= date_trunc('month', now())) as leads_mes,
  (select count(*) from public.deals d where d.org_id = o.id and d.stage not in ('ganho','perdido')) as deals_abertos,
  (select coalesce(sum(valor), 0) from public.deals d where d.org_id = o.id and d.stage not in ('ganho','perdido')) as vgv_pipeline,
  (select coalesce(sum(valor * probabilidade / 100), 0) from public.deals d where d.org_id = o.id and d.stage not in ('ganho','perdido')) as vgv_ponderado,
  (select count(*) from public.deals d where d.org_id = o.id and d.stage = 'ganho' and d.fechado_em >= date_trunc('month', now())) as vendas_mes,
  (select coalesce(sum(coalesce(valor_proposta, valor)), 0) from public.deals d where d.org_id = o.id and d.stage = 'ganho' and d.fechado_em >= date_trunc('month', now())) as vgv_mes,
  (select count(*) from public.unidades u where u.org_id = o.id and u.status = 'disponivel') as unidades_disponiveis,
  (select round(avg(extract(epoch from fechado_em - created_at) / 86400)) from public.deals d where d.org_id = o.id and d.stage = 'ganho') as ciclo_medio_dias,
  (select count(*) from public.activities a where a.org_id = o.id and a.created_at >= date_trunc('day', now())) as atividades_hoje
from public.orgs o;

create or replace view public.vw_ranking with (security_invoker = true) as
select d.org_id, d.responsavel_id, p.nome,
  count(*) filter (where d.stage = 'ganho' and d.fechado_em >= date_trunc('month', now())) as vendas_mes,
  coalesce(sum(coalesce(d.valor_proposta, d.valor)) filter (where d.stage = 'ganho' and d.fechado_em >= date_trunc('month', now())), 0) as vgv_mes,
  count(*) filter (where d.stage not in ('ganho','perdido')) as abertos,
  round(100.0 * count(*) filter (where d.stage = 'ganho') / nullif(count(*) filter (where d.stage in ('ganho','perdido')), 0), 1) as conversao_pct
from public.deals d left join public.profiles p on p.id = d.responsavel_id
group by d.org_id, d.responsavel_id, p.nome;

-- ============================================================================
-- 22. ROW LEVEL SECURITY
-- ============================================================================
alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists orgs_sel on public.orgs;
create policy orgs_sel on public.orgs for select using (id in (select public.fn_my_orgs()));
drop policy if exists orgs_upd on public.orgs;
create policy orgs_upd on public.orgs for update using (public.fn_is_manager(id)) with check (public.fn_is_manager(id));

drop policy if exists prof_sel on public.profiles;
create policy prof_sel on public.profiles for select using (
  id = auth.uid() or id in (select m.user_id from public.org_members m where m.org_id in (select public.fn_my_orgs())));
drop policy if exists prof_ins on public.profiles;
create policy prof_ins on public.profiles for insert with check (id = auth.uid());
drop policy if exists prof_upd on public.profiles;
create policy prof_upd on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists mem_sel on public.org_members;
create policy mem_sel on public.org_members for select using (org_id in (select public.fn_my_orgs()));
drop policy if exists mem_mng on public.org_members;
create policy mem_mng on public.org_members for all using (public.fn_is_manager(org_id)) with check (public.fn_is_manager(org_id));

drop policy if exists audit_sel on public.audit_log;
create policy audit_sel on public.audit_log for select using (public.fn_is_manager(org_id));

do $$
declare
  t text;
  tenant_tables text[] := array['empreendimentos','tipologias','unidades','books','leads','deals','deal_stage_history',
    'activities','matches','simulacoes','ai_agents','ai_conversations','ai_messages','scripts','objecoes',
    'treinamentos','comparaveis','metas','notificacoes'];
  manager_delete text[] := array['empreendimentos','tipologias','unidades','ai_agents','metas'];
begin
  foreach t in array tenant_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %1$s_sel on public.%1$I', t);
    execute format('drop policy if exists %1$s_ins on public.%1$I', t);
    execute format('drop policy if exists %1$s_upd on public.%1$I', t);
    execute format('drop policy if exists %1$s_del on public.%1$I', t);
    execute format('create policy %1$s_sel on public.%1$I for select using (org_id in (select public.fn_my_orgs()))', t);
    execute format('create policy %1$s_ins on public.%1$I for insert with check (org_id in (select public.fn_my_orgs()))', t);
    execute format('create policy %1$s_upd on public.%1$I for update using (org_id in (select public.fn_my_orgs())) with check (org_id in (select public.fn_my_orgs()))', t);
    if t = any(manager_delete) then
      execute format('create policy %1$s_del on public.%1$I for delete using (public.fn_is_manager(org_id))', t);
    else
      execute format('create policy %1$s_del on public.%1$I for delete using (org_id in (select public.fn_my_orgs()))', t);
    end if;
  end loop;
end $$;

-- Notificações: cada um vê só as suas (ou as gerais da org)
drop policy if exists notificacoes_sel on public.notificacoes;
create policy notificacoes_sel on public.notificacoes for select using (
  org_id in (select public.fn_my_orgs()) and (user_id is null or user_id = auth.uid()));

-- ============================================================================
-- 23. STORAGE (books, mídias, documentos) — path: {org_id}/arquivo
-- ============================================================================
insert into storage.buckets (id, name, public) values
  ('books', 'books', false), ('midias', 'midias', true), ('documentos', 'documentos', false)
on conflict (id) do nothing;

do $$
declare b text;
begin
  foreach b in array array['books','midias','documentos'] loop
    execute format('drop policy if exists %1$s_sel on storage.objects', b);
    execute format('drop policy if exists %1$s_ins on storage.objects', b);
    execute format('drop policy if exists %1$s_upd on storage.objects', b);
    execute format('drop policy if exists %1$s_del on storage.objects', b);
    execute format($p$create policy %1$s_sel on storage.objects for select to authenticated using (bucket_id = %1$L and (storage.foldername(name))[1] in (select public.fn_my_orgs()::text))$p$, b);
    execute format($p$create policy %1$s_ins on storage.objects for insert to authenticated with check (bucket_id = %1$L and (storage.foldername(name))[1] in (select public.fn_my_orgs()::text))$p$, b);
    execute format($p$create policy %1$s_upd on storage.objects for update to authenticated using (bucket_id = %1$L and (storage.foldername(name))[1] in (select public.fn_my_orgs()::text))$p$, b);
    execute format($p$create policy %1$s_del on storage.objects for delete to authenticated using (bucket_id = %1$L and (storage.foldername(name))[1] in (select public.fn_my_orgs()::text))$p$, b);
  end loop;
end $$;

-- ============================================================================
-- 24. ÍNDICES DE BUSCA (trigram, tolerante ao schema da extensão)
-- ============================================================================
do $$ begin
  execute 'create index if not exists idx_emp_nome_trgm on public.empreendimentos using gin (nome gin_trgm_ops)';
  execute 'create index if not exists idx_leads_nome_trgm on public.leads using gin (nome gin_trgm_ops)';
exception when others then
  begin
    execute 'create index if not exists idx_emp_nome_trgm on public.empreendimentos using gin (nome extensions.gin_trgm_ops)';
    execute 'create index if not exists idx_leads_nome_trgm on public.leads using gin (nome extensions.gin_trgm_ops)';
  exception when others then raise notice 'pg_trgm indisponível: índices de busca ignorados';
  end;
end $$;

-- ============================================================================
-- 25. REALTIME
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array['deals','activities','leads','ai_messages','notificacoes','unidades'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null;
    end;
  end loop;
end $$;

-- ============================================================================
-- 26. PERMISSÕES DAS RPCs
-- ============================================================================
grant execute on function public.fn_capacidade_compra(numeric, numeric, numeric, numeric, int, numeric, numeric) to authenticated, anon;
grant execute on function public.fn_simular_sac(numeric, numeric, numeric, int) to authenticated, anon;
grant execute on function public.fn_mcmv_faixa(numeric) to authenticated, anon;
grant execute on function public.fn_lead_score(uuid) to authenticated;
grant execute on function public.fn_match_unidades(uuid, int) to authenticated;
grant execute on function public.fn_deal_health(uuid) to authenticated;
grant execute on function public.fn_onboard(text, text, text) to authenticated;
grant execute on function public.fn_convidar(uuid, text, user_role) to authenticated;
grant execute on function public.fn_seed_demo(uuid) to authenticated;
grant execute on function public.fn_recalcular_tudo(uuid) to authenticated;

-- Opcional (pg_cron): recálculo automático a cada hora
-- select cron.schedule('minhaimob-recalc', '0 * * * *', $$select public.fn_recalcular_tudo()$$);

-- FIM
