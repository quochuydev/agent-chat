export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

// --- video agent job types (doc 07 /jobs/{id}) ------------------------------
export type JobStatus = "queued" | "running" | "done" | "failed" | "canceled";

// One image of an images job (GET /api/jobs/{id}/images).
export type JobImage = {
  index: number;
  name: string;
  ts: string;
  prompt: string | null;
  versions: string[]; // archived prior renders, newest last
};

export type JobImages = {
  total: number; // expected count (prompts)
  ready: number; // rendered so far
  images: JobImage[];
};

export type JobProgress = {
  stage: string;
  current: number;
  total: number;
};

// Full job state, as returned by GET /api/jobs/{id} (proxied to FastAPI :3333).
export type Job = {
  id: string;
  tool: string;
  status: JobStatus;
  progress: JobProgress;
  result: Record<string, unknown> | null;
  error: string | null;
};

// Lightweight reference the agent attaches to an assistant message; the UI then
// polls /api/jobs/{id} to hydrate it into a full Job (doc 10 [1]/[3]).
export type JobRef = {
  id: string;
  tool: string;
  status: JobStatus;
};

export type ChatResponse = {
  message: string;
  jobs: JobRef[];
  // Model-generated quick follow-up chips for the user's next turn.
  suggestions?: string[];
};

export type DisplayMessage = ChatMessage & {
  jobs?: JobRef[];
  suggestions?: string[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: DisplayMessage[];
  updatedAt: number;
  // The channel/niche this conversation makes videos for (see lib/channels.ts).
  channel: string;
};

// Conversation without its messages — the shape the sidebar list needs.
export type ConversationMeta = Omit<Conversation, "messages">;
