import { SITE_URL } from "@/lib/config";

// Served at /llms.txt — the emerging convention (llmstxt.org) that gives LLMs a concise,
// curated markdown overview of the product instead of scraping the rendered DOM.
export const dynamic = "force-static";

export function GET() {
  const body = `# AI Video Agent

> Chat with an AI agent that turns a single idea into a finished video — it writes the script, generates AI voiceover, illustrates every scene, and assembles the final cut.

AI Video Agent (${SITE_URL}) is a web app for creating short videos from a conversation. You describe the video you want in chat, and an AI agent runs the whole production pipeline for you — no editing software, microphone, or camera required.

## How it works
1. Describe your idea in plain language (a topic, a length, a vibe).
2. The agent drafts a script, then generates narration, one image per scene, and captions.
3. It assembles everything into a finished video project you can review, refine, and export.

## Features
- Script writing: on-brand scripts and scene breakdowns from a one-line prompt.
- AI voiceover: lifelike narration in a range of selectable voices.
- Scene generation: an image per beat, using Google Imagen 4 Fast.
- Auto assembly: timing, transitions, and captions stitched into a finished cut.
- YouTube metadata: suggested titles, descriptions, and tags.
- Channels: pick a content niche (e.g. money & economics, health & lifestyle) or bring your own idea.

## Pricing
- Sign up free and create your first video — no credit card required.

## Links
- [Home](${SITE_URL}/)
- [Sign up](${SITE_URL}/sign-up)
- [Log in](${SITE_URL}/sign-in)
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
