// MinhaImob — Destrinchador de Book com IA (OpenAI ou Claude)
// Claude lê o PDF nativo (≤30 MB); OpenAI recebe o texto extraído no navegador.
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { corsHeaders, json } from "../_shared/cors.ts";
import { userClient, logUso } from "../_shared/auth.ts";
import { PROVIDER, MODEL, configured, jsonOut } from "../_shared/llm.ts";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

const S = { type: ["string", "null"] };
const N = { type: ["number", "null"] };
const I = { type: ["integer", "null"] };
const B = { type: ["boolean", "null"] };
const STR_ARR = { type: "array", items: { type: "string" } };
const obj = (props: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties: props, required: Object.keys(props),
});

const SCHEMA = obj({
  empreendimento: obj({
    nome: S, construtora: S, incorporadora: S, tipo: S, padrao: S, status_obra: S,
    previsao_entrega: { ...S, description: "AAAA-MM quando houver mês, AAAA se só ano" },
    endereco: S, bairro: S, cidade: S, uf: S, cep: S,
    torres: I, andares: I, unidades_por_andar: I, total_unidades: I, elevadores: I,
    programa: { ...S, description: "MCMV, SBPE, Pro-Cotista ou null" }, faixa_mcmv: I,
    aceita_fgts: B, ri_matricula: S, descricao: S,
  }),
  tipologias: {
    type: "array",
    items: obj({
      nome: S, quartos: I, suites: I, banheiros: I, vagas: I,
      area_privativa: N, area_total: N, varanda: B, varanda_gourmet: B, valor: N, observacoes: S,
    }),
  },
  precos: obj({ valor_min: N, valor_max: N, valor_m2_medio: N, condominio: N, iptu: N }),
  pagamento: obj({
    entrada: N, entrada_pct: N, parcelas_qtd: I, parcela_valor: N, intermediarias: S, chaves: N,
    financiamento: S, observacoes: S,
  }),
  lazer: STR_ARR,
  diferenciais: STR_ARR,
  proximidades: STR_ARR,
  contatos: obj({ telefones: STR_ARR, sites: STR_ARR, instagram: STR_ARR }),
  inteligencia: obj({
    publico_alvo: S,
    argumentos_venda: STR_ARR,
    objecoes_provaveis: { type: "array", items: obj({ objecao: { type: "string" }, resposta: { type: "string" } }) },
    pitch_30s: S,
    mensagem_whatsapp: S,
  }),
  campos_faltando: STR_ARR,
  confianca: { type: "number", description: "0 a 100: quão completo e confiável ficou o resultado" },
});

const SYSTEM = `Você é um analista sênior de lançamentos imobiliários no Brasil. Recebe o "book" de um empreendimento
(material de vendas da construtora) e devolve TODOS os dados estruturados para o time comercial.
Regras:
- Extraia apenas o que está no material. Campo ausente = null (nunca invente número, preço ou data).
- Liste cada tipologia/planta separadamente (quartos, suítes, banheiros, vagas, área privativa em m²).
  Se o book disser "2 e 3 quartos" sem detalhar, crie uma tipologia para cada opção com o que for possível.
- Valores monetários em reais como número (ex.: 389900). Áreas em m² como número (ex.: 58.4).
- "lazer" = itens de área comum. "diferenciais" = atributos do produto/unidade (vista, varanda gourmet, tecnologia).
- Em "inteligencia", escreva como um gerente comercial: público-alvo provável, 6-10 argumentos de venda baseados
  nos dados do book, objeções prováveis com resposta pronta, pitch de 30 segundos e uma mensagem de WhatsApp curta.
- "campos_faltando" lista dados críticos para vender que o book não traz (ex.: preço, metragem, prazo de entrega).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const ctx = await userClient(req);
  if (!ctx) return json({ error: "não autenticado" }, 401);
  const cfgErr = configured();
  if (cfgErr) return json({ error: cfgErr }, 500);
  if (!ctx.iaPermitida) return json({ error: "O plano desta imobiliária não inclui IA." }, 403);

  let body: { book_id?: string; storage_path?: string; text?: string; filename?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  let pdf: string | undefined;
  let metodo = `ia-${PROVIDER}-texto`;
  if (PROVIDER === "anthropic" && body.storage_path?.toLowerCase().endsWith(".pdf")) {
    const { data: file, error } = await ctx.sb.storage.from("books").download(body.storage_path);
    if (!error && file && file.size <= MAX_PDF_BYTES) { pdf = encodeBase64(new Uint8Array(await file.arrayBuffer())); metodo = "ia-anthropic-pdf"; }
  }
  const text = (body.text ?? "").trim();
  if (!pdf && !text) return json({ error: "Envie o texto extraído do book (ou um PDF no storage, com Claude)." }, 400);
  if (text.length > 2_500_000) return json({ error: "Texto grande demais para uma análise. Divida o book em partes." }, 413);
  const prompt = pdf ? "Destrinche este book no formato JSON solicitado." : `<book arquivo="${body.filename ?? "book"}">\n${text}\n</book>\n\nDestrinche este book no formato JSON solicitado.`;

  if (body.book_id) await ctx.sb.from("books").update({ status: "processando" }).eq("id", body.book_id);
  try {
    const r = await jsonOut(SYSTEM, prompt, SCHEMA, "book", "medium", pdf);
    const extracao = r.data;
    await logUso(ctx.sb, ctx.orgId, ctx.userId, "book", PROVIDER, MODEL, r.usage);
    if (body.book_id) {
      await ctx.sb.from("books").update({ status: "extraido", metodo, extracao, confianca: extracao.confianca, campos_faltando: extracao.campos_faltando, erro: null }).eq("id", body.book_id);
    }
    return json({ ok: true, metodo, extracao, provider: PROVIDER, model: MODEL });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (body.book_id) await ctx.sb.from("books").update({ status: "erro", erro: msg }).eq("id", body.book_id);
    return json({ error: `Erro da IA (${PROVIDER}): ${msg}` }, 502);
  }
});
