import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/config";

// Served at /robots.txt. Crawl the public marketing site; block only the API routes.
// The auth screens (/sign-in, /sign-up) are intentionally left crawlable so bots can read
// their `noindex` meta tag — disallowing them here would hide that signal.
//
// AI crawlers are explicitly welcomed (both citation/search bots and training bots) so the
// product can be discovered and cited by answer engines (ChatGPT, Perplexity, Claude,
// Gemini). To opt out of training later, move a bot's user-agent to a Disallow rule.
const AI_CRAWLERS = [
  "GPTBot", // OpenAI (training)
  "OAI-SearchBot", // OpenAI (search/citation)
  "ChatGPT-User", // OpenAI (user-triggered browsing)
  "ClaudeBot", // Anthropic
  "anthropic-ai",
  "Claude-Web",
  "PerplexityBot", // Perplexity (index)
  "Perplexity-User", // Perplexity (user-triggered)
  "Google-Extended", // Gemini/Vertex (training)
  "Applebot-Extended", // Apple Intelligence
  "CCBot", // Common Crawl (feeds many models)
  "Bytespider", // ByteDance
  "meta-externalagent", // Meta AI
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: "/api/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
