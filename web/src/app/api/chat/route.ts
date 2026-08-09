import { NextResponse } from "next/server";

import { OPENAI_API_KEY } from "@/lib/chat/config";
import { callOpenAi, suggestFollowUps } from "@/lib/chat/openai";
import { buildSystemPrompt } from "@/lib/chat/prompt";
import { runTool } from "@/lib/chat/run-tool";
import type { OpenAiMessage } from "@/lib/chat/types";
import type { ChatMessage, JobRef } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { message: "Chat is unavailable: OPENAI_API_KEY is not configured on the server.", jobs: [] },
        { status: 503 },
      );
    }

    const body = (await req.json()) as {
      messages?: ChatMessage[];
      channelId?: string;
      imageProvider?: string;
    };
    const history = body.messages ?? [];
    const channelId = body.channelId;
    const imageProvider = body.imageProvider;
    if (history.length === 0) {
      return NextResponse.json({ message: "No messages provided.", jobs: [] });
    }

    const conversation: OpenAiMessage[] = [
      { role: "system", content: buildSystemPrompt(channelId) },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const createdJobs: JobRef[] = [];

    // Tool-calling loop (doc 04): keep going while the model wants tools.
    for (let step = 0; step < 6; step++) {
      const reply = await callOpenAi(conversation, true);
      conversation.push(reply);

      if (!reply.tool_calls || reply.tool_calls.length === 0) {
        const suggestions = await suggestFollowUps(conversation);
        return NextResponse.json({ message: reply.content ?? "", jobs: createdJobs, suggestions });
      }

      for (const call of reply.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments) as Record<string, unknown>;
        } catch {
          args = {};
        }

        const { result, job } = await runTool(call.function.name, args, channelId, imageProvider);
        if (job) createdJobs.push(job);

        conversation.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
    }

    // Ran out of steps with tools still pending — summarize without tools.
    const summary = await callOpenAi(conversation, false);
    conversation.push(summary);
    const suggestions = await suggestFollowUps(conversation);
    return NextResponse.json({ message: summary.content ?? "", jobs: createdJobs, suggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ message, jobs: [] }, { status: 500 });
  }
}
