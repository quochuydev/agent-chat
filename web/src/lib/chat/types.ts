// Wire shapes for the OpenAI-compatible chat-completions API used by the agent loop.

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
};

export type OpenAiResponse = {
  choices: Array<{ message: OpenAiMessage; finish_reason: string }>;
  error?: { message: string };
};

// Result of a call to the video connector (video/ :3333).
export type ConnectorResult = { ok: boolean; data: unknown; status: number };
