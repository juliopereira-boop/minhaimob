// MinhaImob — Destrinchador de Book com IA (PDF nativo ou texto extraído)
// Secrets: ANTHROPIC_API_KEY (obrigatório), ANTHROPIC_MODEL (opcional), AI_EFFORT_BOOK (opcional)
import Anthropic from "npm:@anthropic-ai/sdk";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";
import { corsHeaders, json } from "../_shared/cors.ts";
import { userClient } from "../_shared/auth.ts";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";
const EFFORT = Deno.env.get("AI_EFFORT_BOOK") ?? "medium";
const MAX_PDF_BYTES = 30 * 1024 * 1024; // limite de request da API é 32 MB
const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

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
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

  let body: { book_id?: string; storage_path?: string; text?: string; filename?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  let metodo = "ia-texto";

  if (body.storage_path && body.storage_path.toLowerCase().endsWith(".pdf")) {
    const { data: file, error } = await ctx.sb.storage.from("books").download(body.storage_path);
    if (!error && file && file.size <= MAX_PDF_BYTES) {
      const b64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
      metodo = "ia-pdf";
    }
  }
  if (content.length === 0) {
    const text = (body.text ?? "").trim();
    if (!text) return json({ error: "Envie storage_path de um PDF (≤30 MB) ou o texto extraído do book." }, 400);
    if (text.length > 2_500_000) {
      return json({ error: "Texto grande demais para uma análise. Divida o book em partes." }, 413);
    }
    content.push({ type: "text", text: `<book arquivo="${body.filename ?? "book"}">\n${text}\n</book>` });
  }
  content.push({ type: "text", text: "Destrinche este book no formato JSON solicitado." });

  if (body.book_id) await ctx.sb.from("books").update({ status: "processando" }).eq("id", body.book_id);

  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: EFFORT, format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    };
    const final = await client.beta.messages.stream(params).finalMessage();

    if (final.stop_reason === "refusal") throw new Error("A IA recusou processar este material.");
    if (final.stop_reason === "max_tokens") throw new Error("Resposta excedeu o limite. Tente um book menor.");
    const textBlock = final.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!textBlock) throw new Error("Resposta sem conteúdo.");
    const extracao = JSON.parse(textBlock.text);

    if (body.book_id) {
      await ctx.sb.from("books").update({
        status: "extraido", metodo, extracao, confianca: extracao.confianca,
        campos_faltando: extracao.campos_faltando, erro: null,
      }).eq("id", body.book_id);
    }
    return json({ ok: true, metodo, extracao, usage: final.usage, model: final.model });
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `Erro da IA (${err.status}): ${err.message}` : String(err instanceof Error ? err.message : err);
    if (body.book_id) await ctx.sb.from("books").update({ status: "erro", erro: msg }).eq("id", body.book_id);
    return json({ error: msg }, 502);
  }
});
