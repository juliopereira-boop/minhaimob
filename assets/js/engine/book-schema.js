// Schema de extração estruturada de book (cópia do usado na Edge Function parse-book).
const S = { type: ["string", "null"] };
const N = { type: ["number", "null"] };
const I = { type: ["integer", "null"] };
const B = { type: ["boolean", "null"] };
const STR_ARR = { type: "array", items: { type: "string" } };
const obj = (props) => ({
  type: "object", additionalProperties: false, properties: props, required: Object.keys(props),
});

export const BOOK_SCHEMA = obj({
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

export const BOOK_SYSTEM = `Você é um analista sênior de lançamentos imobiliários no Brasil. Recebe o "book" de um empreendimento
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
