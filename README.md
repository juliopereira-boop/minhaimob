# MinhaImob — plataforma inteligente de venda de imóveis

Envie o book da construtora e receba tudo destrinchado. Seis corretores de IA trabalham num escritório 3D. Os clientes ganham score, o estoque é casado com cada comprador e o crédito CEF é calculado na hora.

**Stack:** HTML + JS vanilla (ES modules, sem build) · Supabase (Auth, Postgres, RLS, Storage, Realtime, Edge Functions) · Vercel · Three.js · pdf.js/Tesseract · Claude (Anthropic).

---

## Funcionalidades

| Módulo | O que faz |
|---|---|
| **Destrinchar Book** | PDF com texto ou escaneado (OCR), imagem ou texto colado → nome, construtora, endereço/bairro/CEP, tipologias (quartos, suítes, banheiros, vagas, m²), preços, R$/m², condomínio, IPTU, entrada/parcelas, MCMV/FGTS, torres/andares/unidades, entrega, RI, lazer (40+ itens), diferenciais (30+), proximidades e contatos. Cada campo vem com nível de confiança e o trecho de onde saiu. Com a IA ligada, o Claude lê o PDF inteiro, inclusive imagens. |
| **Inteligência de venda** | Padrão do produto, renda mínima para a unidade de entrada, comparação com o m² do bairro, público-alvo, argumentos, objeções prováveis com resposta, pitch de 30s, WhatsApp, score do produto e mensagem para a construtora pedindo o que faltou no book. |
| **Salvar → espelho de vendas** | Gera empreendimento, tipologias e todas as unidades (torre × andar × posição, com valorização por andar). |
| **Escritório 3D** | Ana (SDR), Bruno (closer), Carla (crédito/repasse CEF), Diego (marketing), Elisa (treinadora) e Fábio (mercado) andam, sentam, tomam café e conversam entre si. Clique num deles para conversar e delegar tarefas. A **Daily de vendas** reúne todos na sala de fechamento, e cada um reporta com os dados reais do CRM. |
| **Clientes** | Score 0–100 explicável (fit financeiro, engajamento, recência, urgência, dados, origem), temperatura, capacidade de compra, imóveis ideais com motivos e bloqueios, documentação CEF e timeline. |
| **Pipeline** | Kanban com drag & drop, probabilidade por regressão logística, saúde do negócio, SLA por etapa, próxima melhor ação, playbook e objeções por etapa, motivo de perda. A unidade é reservada ou vendida automaticamente. |
| **Painel** | Radar do dia (prioriza por VGV × probabilidade × urgência), forecast pessimista/ponderado/otimista, meta, funil e alertas automáticos. |
| **Simulador de crédito** | Capacidade de compra (1ª parcela SAC ≤ 30% da renda), MCMV por faixa, LTV 80%, prazo por idade, SAC × PRICE com gráficos, unidades que cabem no bolso e texto pronto para WhatsApp. |
| **Mercado & preço** | Avaliação por comparáveis (kNN ponderado), liquidez estimada, preço para vender rápido e diagnóstico do estoque (acima do mercado ou oportunidade). |
| **Anúncios** | Instagram, Stories, Reels, portal (≤60 caracteres), Google Ads (≤30/90) e WhatsApp. |
| **Academia** | Sete trilhas com quiz, funil reverso (meta → leads/dia), 15 objeções no método A.C.R., scripts com variáveis e roleplay com nota de 0 a 10. |

Sem IA configurada, tudo funciona com os motores determinísticos da plataforma. A IA aprofunda a leitura de books e permite conversa livre com os agentes.

---

## Deploy (≈10 min)

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** → cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**. O script é idempotente (pode rodar de novo).
3. Em **Authentication → URL Configuration**, coloque a URL da Vercel em *Site URL* e adicione `https://SEU-APP.vercel.app/**` em *Redirect URLs*.
4. Copie a **Project URL** e a chave **anon/publishable** (Project Settings → API).

### 2. Vercel
1. **Add New → Project** → importe `minhaimob`.
2. Framework Preset: **Other**. Sem build command. Output: raiz.
3. Environment Variables: `SUPABASE_URL` e `SUPABASE_ANON_KEY`. Elas são lidas por `api/config.js`.
4. Deploy. Crie a conta em `/index.html`; o app pede o nome da imobiliária e pode carregar os dados de demonstração.

> Alternativa sem variáveis de ambiente: preencha `assets/js/config.js` ou cole URL e chave em **Configurações** dentro do app.

### 3. IA (Claude) — opcional
```bash
npm i -g supabase
supabase login
supabase link --project-ref SEU_REF
supabase functions deploy ai-chat
supabase functions deploy parse-book
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# opcionais:
supabase secrets set ANTHROPIC_MODEL=claude-opus-5-5 AI_EFFORT_CHAT=low AI_EFFORT_BOOK=medium
```
A chave fica só no servidor. Teste em **Configurações → Testar conexão da IA**.

### 4. Equipe
**Configurações → Equipe:** adicione corretores por e-mail. Eles precisam criar a conta antes. Os papéis são owner, admin, gestor, corretor e assistente. A RLS isola cada imobiliária.

---

## Modo demonstração (sem Supabase)
Abra `index.html` → **Entrar no modo demonstração**. Os dados ficam no `localStorage`, com a mesma API do Supabase (gatilhos de score/saúde emulados). Para testar a IA nesse modo, informe sua chave em Configurações. Ela fica só no seu navegador, então não use em produção.

Rodando localmente: `python3 -m http.server 8080` na raiz e acesse `http://localhost:8080`.

---

## Estrutura
```
index.html              Landing + login/cadastro
app.html                Plataforma (SPA com rotas por hash)
office.html             Escritório 3D
api/config.js           Vercel: expõe SUPABASE_URL/ANON_KEY
assets/css/app.css      Design system (dark/light)
assets/js/
  config.js db.js ui.js chart.js app.js office.js
  engine/  parser.js (book) · credito.js · scoring.js · match.js · pricing.js
           agents.js · playbook.js · copy.js · seed.js · book-schema.js
  views/   dashboard · pipeline · leads · imoveis · book · ia · credito
           mercado · marketing · academia · ajustes
supabase/
  schema.sql            Schema completo + RLS + funções + seed demo
  functions/ai-chat     Chat dos agentes (streaming SSE)
  functions/parse-book  Extração estruturada de book (PDF nativo/JSON schema)
```

## Inteligência no banco (RPCs)
| Função | Uso |
|---|---|
| `fn_capacidade_compra(renda, comprometimento, recursos, taxa, prazo, pct, ltv)` | Teto de imóvel e de financiamento, parcela máxima, faixa MCMV |
| `fn_simular_sac(valor, entrada, taxa, prazo)` | 1ª/última parcela, total, juros, renda mínima |
| `fn_lead_score(lead)` | Score + temperatura + detalhamento (gatilho em leads/atividades) |
| `fn_match_unidades(lead, limit)` | Ranking de unidades com motivos e bloqueios |
| `fn_deal_health(deal)` | Probabilidade, saúde, próxima ação (gatilho na troca de etapa) |
| `fn_recalcular_tudo(org)` | Recalcula a org inteira (agende com pg_cron) |
| `fn_onboard`, `fn_convidar`, `fn_seed_demo` | Onboarding, equipe, dados demo |

Views: `vw_dashboard`, `vw_funil`, `vw_ranking` (com `security_invoker`, respeitam a RLS).

## Parâmetros para revisar
As faixas e taxas do MCMV/SBPE são **valores de referência**. Ajuste conforme o normativo vigente em:
- `assets/js/engine/credito.js` → `PARAMS`
- `supabase/schema.sql` → `fn_mcmv_faixa` e `fn_taxa_referencia`
