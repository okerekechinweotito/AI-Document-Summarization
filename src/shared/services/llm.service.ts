import { customLogger } from "../utils/logger.ts";
import { analyzeResponseSchema } from "../../modules/documents/document.schema.ts";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL =
  process.env.OPENROUTER_URL || "https://api.openrouter.ai/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "gpt-4o-mini"; 
//google/gemini-2.5-flash-image

export const analyzeTextWithLLM = async (text: string) => {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const systemPrompt = `You are a Document Analysis assistant. Given a document's extracted text, respond with a compact JSON containing:\n- summary: a concise summary of the document (max 200 words)\n- document_type: one of ['invoice','resume','cv','report','letter','other']\n- attributes: a JSON object with extracted fields like date, sender, recipient, total_amount, invoice_number, etc., if present; otherwise empty object.\nReturn only valid JSON with no explanation or text outside the JSON.`;

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Analyze the following document text:\n\n${text}`,
    },
  ];

  try {
    // Use the OpenRouter SDK if available
    try {
      const sdk = await import("@openrouter/sdk");
      if (sdk && typeof sdk.OpenRouter === "function") {
        const { OpenRouter } = sdk as any;
        const client = new OpenRouter({ apiKey: OPENROUTER_API_KEY });
        const res = await client.chat.send({ messages, model: MODEL });
        // Collect content from streaming or non-streaming result
        let content = "";
        if (res && Symbol.asyncIterator in Object(res)) {
          for await (const chunk of res as any) {
            const chunkContent =
              chunk?.choices?.[0]?.delta?.content ||
              chunk?.choices?.[0]?.message?.content ||
              chunk?.choices?.[0]?.text ||
              "";
            content += chunkContent;
          }
        } else {
          content =
            res?.choices?.[0]?.message?.content ||
            res?.choices?.[0]?.text ||
            "";
        }
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch
          ? JSON.parse(jsonMatch[0])
          : JSON.parse(content);
        const safe = analyzeResponseSchema.safeParse(parsed as any);
        if (!safe.success) {
          throw new Error("LLM returned invalid JSON structure");
        }
        return safe.data;
      }
    } catch (sdkErr) {
      customLogger(sdkErr, "analyzeTextWithLLM:sdkErr");
      // SDK not available; fall back to HTTP
    }
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${body}`);
    }
    const payload = await response.json();
    // Attempt to extract content - depending on the API spec
    const content =
      payload?.choices?.[0]?.message?.content ||
      payload?.choices?.[0]?.text ||
      "";
    // Attempt to parse JSON out of the model content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
    const safe = analyzeResponseSchema.safeParse(parsed as any);
    if (!safe.success) {
      throw new Error("LLM returned invalid JSON structure");
    }
    return safe.data;
  } catch (error) {
    customLogger(error, "analyzeTextWithLLM");
    throw error;
  }
};
