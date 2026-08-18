// OpenAI-compatible endpoint. Point OPENAI_BASE_URL at any compatible provider
// (e.g. https://api.deepseek.com); defaults to OpenAI.
const BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export const OPENAI_URL = `${BASE_URL.replace(/\/$/, "")}/chat/completions`;
export const OPENAI_TTS_URL = `${BASE_URL.replace(/\/$/, "")}/audio/speech`;
export const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
