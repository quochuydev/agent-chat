import { getChannel } from "@/lib/channels";

import { MODEL, OPENAI_API_KEY, OPENAI_URL } from "./config";
import { tools } from "./tools";
import type { OpenAiMessage, OpenAiResponse } from "./types";

// One chat-completions call. `withTools` toggles whether the model may call tools
// (off for focused single-shot generations like draftScript and the final summary).
export async function callOpenAi(messages: OpenAiMessage[], withTools: boolean): Promise<OpenAiMessage> {
  const apiKey = OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages,
      ...(withTools ? { tools, tool_choice: "auto" } : {}),
      temperature: 0.5,
    }),
  });

  const data = (await res.json()) as OpenAiResponse;
  if (!res.ok) throw new Error(data.error?.message ?? `OpenAI responded ${res.status}`);
  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error("OpenAI returned no message");
  return choice;
}

// Quick follow-up chips shown under the composer. The model reads the conversation so
// far and proposes short next messages the *user* might send — phrased in first person,
// grounded in where the video pipeline currently is. Best-effort: any failure or malformed
// output yields no chips rather than breaking the turn.
const SUGGESTIONS_SYSTEM = `You suggest the next messages a USER might send in a chat with an AI video-creation agent. Read the conversation and propose 3-4 short, natural follow-ups the user could tap to continue.

Rules:
- Write from the user's point of view (imperatives or questions the user would send), e.g. "Make the script shorter", "Build the video now", "How do I download it?".
- Keep each under ~6 words. Make them specific to what just happened, not generic.
- Offer a useful mix: refine the current step, advance to the next step, or ask a question.
- Return ONLY a compact JSON array of strings. No prose, no code fences.`;

export async function suggestFollowUps(messages: OpenAiMessage[]): Promise<string[]> {
  try {
    // Flatten to a clean user/assistant text transcript: drop system/tool turns and any
    // tool_calls so the summarizing call has no dangling tool references to choke on.
    const transcript = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    const reply = await callOpenAi(
      [
        { role: "system", content: SUGGESTIONS_SYSTEM },
        ...transcript,
        { role: "user", content: "Suggest my next messages as a JSON array of strings." },
      ],
      false,
    );
    const raw = (reply.content ?? "").trim().replace(/^```(?:json)?|```$/g, "").trim();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  }
}

// write_script: a focused LLM call (keeps the rule "only the agent talks to the LLM").
// The channel's scriptDNA sets the voice, evidence rules and structure for the niche.
export async function draftScript(
  topic: string,
  duration: number,
  channelId?: string | null,
): Promise<string> {
  const words = Math.max(20, Math.round(duration * 2.5));
  const channel = getChannel(channelId);
  const reply = await callOpenAi(
    [
      {
        role: "system",
        content: `You are a punchy short-form video scriptwriter. Write ONLY the narration text — no headings, no stage directions, no timestamps. Roughly ${words} words for a ${duration}s video. Strong hook, 3-4 tight beats, memorable close.\n\n${channel.scriptDNA}`,
      },
      { role: "user", content: `Topic: ${topic}` },
    ],
    false,
  );
  return (reply.content ?? "").trim();
}

// suggest_youtube_metadata: a focused LLM call that turns a finished video's narration
// transcript into a copy-paste YouTube upload package. Everything must be grounded in
// the transcript — never invent facts, names, or claims that aren't in the source.
const YOUTUBE_METADATA_SYSTEM = `You generate a complete, copy-paste YouTube upload package from a video's narration transcript. Ground EVERY title, claim, name and date in the transcript — never invent anything not in the source. When unsure, leave it out.

The transcript may be timestamped (\`[MM:SS] text\` lines, or SRT cues) or plain narration. If it has no timestamps, omit the Chapters block.

Output exactly this Markdown structure and nothing else:

### Title (3 options)
- Three distinct angles: one clean/broad, one curiosity-gap hook (mark **recommended**), one specific/listicle. Each under ~60 characters. No clickbait the script doesn't deliver.

### Description
A pasteable code block containing:
- A 2–3 sentence hook paragraph drawn from the opening.
- A body paragraph teasing the concrete content without spoiling the ending.
- A \`Chapters:\` block (only if the transcript is timestamped) — one \`MM:SS Label\` per line, starting at \`00:00\`, 5–9 short concrete labels.
- A \`Sources & people mentioned:\` line listing the real names/studies/places from the script.
- 3 hashtags on the last line.

### Tags
A comma-separated code block, ~15–20 lowercase tags (no \`#\`): topic, subtopics, named entities, broad discovery terms.

### Other fields
- **Category** (infer: Education / Science & Technology / etc.)
- **Hashtags** — the 3 from above
- **Thumbnail text idea** — 2–4 punchy words + a visual suggestion
- **Visibility/extras** — kids setting, language, end-screen note

Rules: titles under ~60 chars; description leads with the hook (first ~120 chars show in search); chapters must start at \`00:00\` or YouTube won't render them.`;

export async function draftYoutubeMetadata(transcript: string): Promise<string> {
  const reply = await callOpenAi(
    [
      { role: "system", content: YOUTUBE_METADATA_SYSTEM },
      { role: "user", content: `Transcript:\n\n${transcript}` },
    ],
    false,
  );
  return (reply.content ?? "").trim();
}
