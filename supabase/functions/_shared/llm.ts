// Camada de IA plugável: OpenAI ou Anthropic (Claude), escolhida por secret.
//   AI_PROVIDER=openai|anthropic  (padrão: openai se só OPENAI_API_KEY existir)
//   OPENAI_API_KEY, OPENAI_MODEL (padrão gpt-4.1)
//   ANTHROPIC_API_KEY, ANTHROPIC_MODEL (padrão claude-opus-5-5)
import Anthropic from "npm:@anthropic-ai/sdk";
import OpenAI from "npm:openai";

const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
export const PROVIDER = (Deno.env.get("AI_PROVIDER") ?? (OPENAI_KEY && !ANTHROPIC_KEY ? "openai" : "anthropic")).toLowerCase();
export const MODEL = PROVIDER === "openai"
  ? (Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1")
  : (Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5");
/** Modelo barato para as falas da sociedade de agentes (muitas chamadas curtas). */
export const MODEL_LEVE = PROVIDER === "openai"
  ? (Deno.env.get("OPENAI_MODEL_LEVE") ?? "gpt-4.1-mini")
  : (Deno.env.get("ANTHROPIC_MODEL_LEVE") ?? "claude-haiku-4-5");

export type Msg = { role: "user" | "assistant"; content: string };
export type Tool = { name: string; description: string; parameters: Record<string, unknown> };
export type Usage = { in: number; out: number };

export function configured(): string | null {
  if (PROVIDER === "openai" && !OPENAI_KEY) return "OPENAI_API_KEY não configurada";
  if (PROVIDER === "anthropic" && !ANTHROPIC_KEY) return "ANTHROPIC_API_KEY não configurada";
  if (!["openai", "anthropic"].includes(PROVIDER)) return `AI_PROVIDER inválido: ${PROVIDER}`;
  return null;
}

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const claude = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
// deno-lint-ignore no-explicit-any
const claudeBase = (extra: any) => ({ model: MODEL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", ...extra });

/** Texto em streaming. */
export async function* streamText(system: string, messages: Msg[], effort = "low"): AsyncGenerator<string, Usage> {
  if (PROVIDER === "openai") {
    const s = await openai!.chat.completions.create({
      model: MODEL, stream: true, stream_options: { include_usage: true }, max_completion_tokens: 8000,
      messages: [{ role: "system", content: system }, ...messages],
    });
    let usage: Usage = { in: 0, out: 0 };
    for await (const ch of s) {
      const t = ch.choices?.[0]?.delta?.content;
      if (t) yield t;
      if (ch.usage) usage = { in: ch.usage.prompt_tokens, out: ch.usage.completion_tokens };
    }
    return usage;
  }
  // deno-lint-ignore no-explicit-any
  const s = claude!.beta.messages.stream(claudeBase({
    max_tokens: 64000, output_config: { effort },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages,
  }) as any);
  for await (const ev of s) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
  const fin = await s.finalMessage();
  if (fin.stop_reason === "refusal") throw new Error("O modelo recusou esta solicitação.");
  return { in: fin.usage.input_tokens, out: fin.usage.output_tokens };
}

/** Resposta única com ferramentas (o cliente executa as ações). */
export async function complete(system: string, messages: Msg[], tools: Tool[] = [], effort = "low") {
  if (PROVIDER === "openai") {
    const r = await openai!.chat.completions.create({
      model: MODEL, max_completion_tokens: 8000,
      messages: [{ role: "system", content: system }, ...messages],
      ...(tools.length ? { tools: tools.map((t) => ({ type: "function" as const, function: t })), tool_choice: "auto" as const } : {}),
    });
    const m = r.choices[0].message;
    return {
      text: m.content ?? "",
      tool_calls: (m.tool_calls ?? []).filter((c) => c.type === "function").map((c) => {
        let args = {}; try { args = JSON.parse(c.function.arguments || "{}"); } catch { /* argumento inválido: ignora */ }
        return { name: c.function.name, args };
      }),
      usage: { in: r.usage?.prompt_tokens ?? 0, out: r.usage?.completion_tokens ?? 0 },
    };
  }
  // deno-lint-ignore no-explicit-any
  const fin = await claude!.beta.messages.stream(claudeBase({
    max_tokens: 16000, output_config: { effort },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }], messages,
    ...(tools.length ? { tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
  }) as any).finalMessage();
  if (fin.stop_reason === "refusal") throw new Error("O modelo recusou esta solicitação.");
  // deno-lint-ignore no-explicit-any
  const blocks = fin.content as any[];
  return {
    text: blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
    tool_calls: blocks.filter((b) => b.type === "tool_use").map((b) => ({ name: b.name, args: b.input ?? {} })),
    usage: { in: fin.usage.input_tokens, out: fin.usage.output_tokens },
  };
}

/** Saída JSON validada por schema. `pdfBase64` só é usado no Claude (OpenAI recebe o texto). */
export async function jsonOut(system: string, userText: string, schema: Record<string, unknown>, name = "saida", effort = "medium", pdfBase64?: string, opts: { model?: string; max?: number } = {}) {
  if (PROVIDER === "openai") {
    const r = await openai!.chat.completions.create({
      model: opts.model ?? MODEL, max_completion_tokens: opts.max ?? 16000,
      messages: [{ role: "system", content: system }, { role: "user", content: userText }],
      response_format: { type: "json_schema", json_schema: { name, schema, strict: true } },
    });
    const c = r.choices[0];
    if (c.finish_reason === "length") throw new Error("Resposta excedeu o limite de tamanho.");
    if (c.message.refusal) throw new Error("O modelo recusou: " + c.message.refusal);
    return { data: JSON.parse(c.message.content ?? "{}"), usage: { in: r.usage?.prompt_tokens ?? 0, out: r.usage?.completion_tokens ?? 0 } };
  }
  // deno-lint-ignore no-explicit-any
  const content: any[] = [];
  if (pdfBase64) content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } });
  content.push({ type: "text", text: userText });
  // deno-lint-ignore no-explicit-any
  const leve = !!opts.model && opts.model !== MODEL;
  const fin = await claude!.beta.messages.stream({
    ...claudeBase({ max_tokens: opts.max ?? 32000, system, messages: [{ role: "user", content }] }),
    ...(opts.model ? { model: opts.model } : {}),
    // modelos leves podem não aceitar "effort": só o formato JSON
    output_config: leve ? { format: { type: "json_schema", schema } } : { effort, format: { type: "json_schema", schema } },
  // deno-lint-ignore no-explicit-any
  } as any).finalMessage();
  if (fin.stop_reason === "refusal") throw new Error("O modelo recusou esta solicitação.");
  if (fin.stop_reason === "max_tokens") throw new Error("Resposta excedeu o limite de tamanho.");
  // deno-lint-ignore no-explicit-any
  const tb = (fin.content as any[]).find((b) => b.type === "text");
  return { data: JSON.parse(tb?.text ?? "{}"), usage: { in: fin.usage.input_tokens, out: fin.usage.output_tokens } };
}
