// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const WHATSAPP_VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const WHATSAPP_ACCESS_TOKEN = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const categoryMap: Record<string, string[]> = {
  alimentacao: ["mercado", "padaria", "lanche", "pizza", "restaurante", "ifood", "rappi", "comida"],
  transporte: ["uber", "99", "combustivel", "gasolina", "onibus", "metro", "pedagio", "estacionamento"],
  moradia: ["aluguel", "condominio", "agua", "luz", "energia", "internet", "iptu", "gas"],
  saude: ["farmacia", "medico", "consulta", "exame", "plano de saude", "hospital"],
  lazer: ["cinema", "netflix", "spotify", "show", "viagem", "jogo", "bar"],
  educacao: ["curso", "faculdade", "escola", "livro"],
  outros: [],
};

interface ParsedMessage {
  valor: number | null;
  tipo: "despesa" | "receita";
  categoria: string;
  data: string;
  descricao: string;
  isCartao: boolean;
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const toE164 = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const shiftDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const parseDate = (text: string): string => {
  const lower = text.toLowerCase();
  if (lower.includes("hoje")) return todayIso();
  if (lower.includes("ontem")) return shiftDate(-1);
  if (lower.includes("amanha") || lower.includes("amanhã")) return shiftDate(1);

  const m = lower.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (!m) return todayIso();

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (year < 100) year += 2000;

  if (Number.isNaN(day) || Number.isNaN(month) || day < 1 || day > 31 || month < 1 || month > 12) {
    return todayIso();
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10);
};

const parseAmount = (text: string): number | null => {
  const withoutDate = text.replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/, " ");
  const match = withoutDate.match(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[\.,]\d{1,2})?/);
  if (!match) return null;

  let token = match[0].replace(/\s/g, "");
  if (token.includes(",")) {
    token = token.replace(/\./g, "").replace(",", ".");
  }
  const parsed = Number(token);
  return Number.isFinite(parsed) ? parsed : null;
};

const detectTipo = (text: string): "despesa" | "receita" => {
  const lower = text.toLowerCase();
  const receitaHints = ["receita", "ganhei", "recebi", "salario", "salário", "pix recebido", "entrada"];
  return receitaHints.some((k) => lower.includes(k)) ? "receita" : "despesa";
};

const detectCategoria = (text: string): string => {
  const lower = text.toLowerCase();
  for (const [categoria, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((k) => lower.includes(k))) return categoria;
  }
  return "outros";
};

const detectDescricaoDespesa = (text: string, loja: string | null): string => {
  const lower = text.toLowerCase();

  const actionSlice = lower.match(
    /\b(?:comprei|paguei|gastei|saida|despesa)\s+(.*)$/i,
  )?.[1] ?? lower;

  const withoutLeadingArticle = actionSlice.replace(/^\s*(?:um|uma|uns|umas|o|a|os|as)\s+/i, "");

  let candidate = withoutLeadingArticle
    .replace(/\b(?:na|no|em)\s+[a-z0-9][a-z0-9\s\-\.]{1,40}/i, " ")
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, " ")
    .replace(/\b(?:valor\s+de|valor|de|por)\b/gi, " ")
    .replace(/\b(?:com|usando)\s+o?\s*cart[aã]o\b.*$/i, " ")
    .replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g, " ")
    .replace(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[\.,]\d{1,2})?/g, " ")
    .replace(/\b(?:cart[aã]o|cr[eé]dito|fatura)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (loja) {
    const lojaNorm = normalize(loja);
    const parts = candidate.split(" ").filter(Boolean);
    const filtered = parts.filter((p) => normalize(p) !== lojaNorm);
    candidate = filtered.join(" ").trim();
  }

  if (!candidate) return "Lançamento via WhatsApp";
  return candidate.length > 120 ? `${candidate.slice(0, 117)}...` : candidate;
};

const detectDescricaoReceita = (text: string, loja: string | null): string => {
  const lower = text.toLowerCase();

  const actionSlice = lower.match(
    /\b(?:recebi|ganhei|entrada|receita)\s+(.*)$/i,
  )?.[1] ?? lower;

  let candidate = actionSlice
    .replace(/\b(?:na|no|em)\s+[a-z0-9][a-z0-9\s\-\.]{1,40}/i, " ")
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, " ")
    .replace(/\b(?:valor\s+de|valor|de|por)\b/gi, " ")
    .replace(/\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?/g, " ")
    .replace(/\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[\.,]\d{1,2})?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Prioriza termos comuns de receita quando presentes na frase.
  const receitaHints = ["salario", "salário", "bico", "extra"];
  const normalizedCandidate = normalize(candidate);
  const matchedHint = receitaHints.find((hint) => normalizedCandidate.includes(normalize(hint)));
  if (matchedHint) {
    const normalizedHint = normalize(matchedHint);
    candidate = normalizedHint === "salario" ? "salario" : normalizedHint;
  }

  if (loja) {
    const lojaNorm = normalize(loja);
    const parts = candidate.split(" ").filter(Boolean);
    const filtered = parts.filter((p) => normalize(p) !== lojaNorm);
    candidate = filtered.join(" ").trim();
  }

  if (!candidate) return "Receita via WhatsApp";
  return candidate.length > 120 ? `${candidate.slice(0, 117)}...` : candidate;
};

const detectDescricao = (text: string, loja: string | null, tipo: "despesa" | "receita"): string => {
  if (tipo === "receita") {
    return detectDescricaoReceita(text, loja);
  }
  return detectDescricaoDespesa(text, loja);
};

const detectIsCartao = (text: string): boolean => {
  const lower = normalize(text);
  return ["cartao", "credito", "crédito", "fatura"].some((k) => lower.includes(normalize(k)));
};

const detectLoja = (text: string): string | null => {
  const lower = text.toLowerCase();
  const m = lower.match(
    /\b(?:na|no|em)\s+([a-z0-9][a-z0-9\s\-\.]{1,40}?)(?=\s+(?:hoje|ontem|amanha|amanhã|valor|de|por|com|usando|cart[aã]o|cr[eé]dito|fatura)\b|$)/i,
  );
  if (!m?.[1]) return null;

  const candidate = m[1]
    .replace(/\b(hoje|ontem|amanha|amanhã|cartao|cartão|credito|crédito)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!candidate) return null;
  return candidate.length > 80 ? candidate.slice(0, 80) : candidate;
};

const detectCardId = async (usuarioId: string, text: string): Promise<string | null> => {
  const normalizedText = normalize(text);
  const { data: cards, error } = await supabase
    .from("cartoes")
    .select("id, nome")
    .eq("usuario_id", usuarioId);

  if (error || !cards?.length) return null;

  const byFullName = cards.find((c) => normalizedText.includes(normalize(c.nome)));
  if (byFullName) return byFullName.id;

  for (const card of cards) {
    const tokens = normalize(card.nome)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 4);

    if (tokens.some((t) => normalizedText.includes(t))) {
      return card.id;
    }
  }

  return null;
};

const parseMessage = (text: string): ParsedMessage => {
  const valor = parseAmount(text);
  const loja = detectLoja(text);
  const tipo = detectTipo(text);
  return {
    valor,
    tipo,
    categoria: detectCategoria(text),
    data: parseDate(text),
    descricao: detectDescricao(text, loja, tipo),
    isCartao: detectIsCartao(text),
  };
};

const sendWhatsAppText = async (to: string, body: string): Promise<void> => {
  if (!WHATSAPP_ACCESS_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) return;

  await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
};

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode === "subscribe" && token && challenge && token === WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 });
      }
      return jsonResponse({ error: "Webhook verification failed" }, 403);
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const payload = await req.json();
    const messages = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ ok: true, ignored: true });
    }

    for (const message of messages) {
      if (message?.type !== "text") continue;

      const fromRaw = message?.from as string | undefined;
      const fromE164 = toE164(fromRaw);
      const textBody = String(message?.text?.body ?? "").trim();
      const providerMessageId = String(message?.id ?? "");

      if (!fromE164 || !textBody) continue;

      const { data: linkedUser } = await supabase
        .from("whatsapp_user_links")
        .select("usuario_id, ativo")
        .eq("phone_e164", fromE164)
        .maybeSingle();

      if (!linkedUser?.usuario_id || linkedUser.ativo !== true) {
        await supabase.from("whatsapp_inbound_logs").insert({
          provider_message_id: providerMessageId || null,
          phone_e164: fromE164,
          text_body: textBody,
          processing_status: "unlinked",
          error_message: "Telefone nao vinculado a um usuario ativo",
          raw_payload: payload,
        });

        await sendWhatsAppText(
          fromRaw ?? "",
          "Numero nao vinculado. Abra o app, va em Perfil > WhatsApp e salve este telefone para ativar a sincronizacao.",
        );
        continue;
      }

      const parsed = parseMessage(textBody);
      if (!parsed.valor || parsed.valor <= 0) {
        await supabase.from("whatsapp_inbound_logs").insert({
          provider_message_id: providerMessageId || null,
          phone_e164: fromE164,
          text_body: textBody,
          processing_status: "invalid",
          error_message: "Nao foi possivel identificar valor na mensagem",
          raw_payload: payload,
        });

        await sendWhatsAppText(
          fromRaw ?? "",
          "Nao consegui identificar o valor. Exemplo: 'mercado 45,90 hoje alimentacao'.",
        );
        continue;
      }

      const cardId = parsed.tipo === "despesa" && parsed.isCartao
        ? await detectCardId(linkedUser.usuario_id, textBody)
        : null;

      const lojaDetectada = detectLoja(textBody);

      const { data: lancamento, error: insertError } = await supabase
        .from("lancamentos")
        .insert({
          usuario_id: linkedUser.usuario_id,
          descricao: parsed.descricao,
          valor: parsed.valor,
          data: parsed.data,
          data_compra: parsed.data,
          tipo: parsed.tipo,
          categoria: parsed.categoria,
          fixa: false,
          cartao_id: cardId,
          loja: lojaDetectada ?? parsed.descricao,
        })
        .select("id")
        .single();

      if (insertError) {
        await supabase.from("whatsapp_inbound_logs").insert({
          provider_message_id: providerMessageId || null,
          phone_e164: fromE164,
          text_body: textBody,
          parsed_valor: parsed.valor,
          parsed_categoria: parsed.categoria,
          parsed_data: parsed.data,
          processing_status: "error",
          error_message: insertError.message,
          raw_payload: payload,
        });

        await sendWhatsAppText(
          fromRaw ?? "",
          "Recebi sua mensagem, mas nao consegui lancar agora. Tente novamente em instantes.",
        );
        continue;
      }

      await supabase.from("whatsapp_inbound_logs").insert({
        provider_message_id: providerMessageId || null,
        phone_e164: fromE164,
        text_body: textBody,
        parsed_valor: parsed.valor,
        parsed_categoria: parsed.categoria,
        parsed_data: parsed.data,
        lancamento_id: lancamento?.id ?? null,
        processing_status: "processed",
        raw_payload: payload,
      });

      await sendWhatsAppText(
        fromRaw ?? "",
        `Lancamento criado com sucesso: ${parsed.tipo} de R$ ${parsed.valor.toFixed(2).replace(".", ",")} em ${parsed.categoria}${cardId ? " no cartao" : ""}.`,
      );
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
