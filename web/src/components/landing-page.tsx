import Link from "next/link";
import {
  ArrowRight,
  AudioLines,
  Clapperboard,
  Film,
  Image as ImageIcon,
  Layers,
  PenLine,
  Play,
  Sparkles,
  Star,
  Wand2,
  Youtube,
  Zap,
} from "lucide-react";

import { SITE_URL } from "@/lib/config";

// FAQ shown on the page AND emitted as FAQPage schema below. Answer engines (ChatGPT,
// Perplexity, Google AI Overviews) preferentially lift question-shaped content, and the
// visible copy must match the schema — so this single source feeds both.
const FAQS = [
  {
    q: "What is AI Video Agent?",
    a: "A web app where you chat with an AI agent that turns one idea into a finished video — it writes the script, generates the narration, illustrates every scene, and assembles the final cut.",
  },
  {
    q: "How does it work?",
    a: "Describe your video in the chat. The agent drafts a script, generates AI voiceover, creates an image for each scene, and stitches everything into a finished video you can review and export.",
  },
  {
    q: "Do I need video editing or design skills?",
    a: "No. The whole production runs from a single conversation — no editing software, microphone, or camera required.",
  },
  {
    q: "What kinds of videos can I create?",
    a: "Short explainers and social videos across niches like money and economics or health and lifestyle — or bring your own idea and the agent runs with it.",
  },
  {
    q: "Which AI voices and image models can I use?",
    a: "You can choose from a range of narration voices and pick the image model — local FLUX.1-schnell or Google Imagen 4 Fast.",
  },
  {
    q: "How much does it cost?",
    a: "You can sign up free and create your first video — no credit card required.",
  },
];

// Structured data (JSON-LD) for the public landing page. Crawlers hit "/" unauthenticated,
// so this is the markup they see. Describes the org, the site, the app (free web
// application), and the FAQ — no invented ratings/reviews (fabricated schema is penalized).
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "AI Video Agent",
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/apple-icon`,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "AI Video Agent",
      publisher: { "@id": `${SITE_URL}/#organization` },
      description:
        "Chat with an AI agent that writes the script, voices the narration, illustrates every scene, and assembles the final cut.",
    },
    {
      "@type": "SoftwareApplication",
      name: "AI Video Agent",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      url: `${SITE_URL}/`,
      description:
        "An AI agent that turns a single chat into a finished video — script, AI voiceover, generated scenes and automatic assembly.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

// Marketing landing page shown to signed-out visitors (modeled on creatify.ai,
// re-themed to this app's neutral grayscale palette). Every link routes to the
// Clerk auth pages; there is no other interactivity, so this stays a server
// component.
export function LandingPage() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-white text-[#171717]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Stats />
        <Framework />
        <Toolkit />
        <HowItWorks />
        <Faq />
        <CtaBand />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[#ededed] bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex cursor-pointer items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
            <Film className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Video Agent</span>
        </Link>

        <nav className="hidden items-center gap-7 text-[14px] text-[#525252] md:flex">
          <a href="#features" className="cursor-pointer hover:text-[#171717]">
            Features
          </a>
          <a href="#how" className="cursor-pointer hover:text-[#171717]">
            How it works
          </a>
          <a href="#toolkit" className="cursor-pointer hover:text-[#171717]">
            Toolkit
          </a>
          <a href="#faq" className="cursor-pointer hover:text-[#171717]">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className="cursor-pointer rounded-lg px-3 py-1.5 text-[14px] font-medium text-[#171717] hover:bg-[#f5f5f5]"
          >
            Log in
          </Link>
          <Link
            href="/sign-up"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-3.5 py-1.5 text-[14px] font-medium text-white hover:bg-black"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft radial wash behind the hero */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,#f3f3f3_0%,transparent_70%)]"
      />
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-5 py-24 text-center md:py-32">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ededed] bg-white px-3 py-1 text-[13px] text-[#525252] shadow-sm">
          <Sparkles className="h-3.5 w-3.5 text-[#171717]" />
          One chat. A finished video.
        </div>

        <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
          AI videos that
          <br />
          tell your story.
        </h1>

        <p className="mt-6 max-w-xl text-balance text-[17px] leading-relaxed text-[#525252]">
          Chat with an agent that writes the script, voices the narration, illustrates
          every scene, and assembles the final cut — from a single idea to a finished
          video.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/sign-up"
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#171717] px-6 py-3 text-[15px] font-medium text-white shadow-sm transition-colors hover:bg-black"
          >
            Create your first video
            <ArrowRight className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/sign-in"
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#ededed] bg-white px-6 py-3 text-[15px] font-medium text-[#171717] transition-colors hover:bg-[#f5f5f5]"
          >
            <Play className="h-[18px] w-[18px]" />
            Log in
          </Link>
        </div>

        <div className="mt-6 flex items-center gap-2 text-[13px] text-[#8f8f8f]">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4 fill-[#171717] text-[#171717]" />
            ))}
          </div>
          No credit card required
        </div>

        {/* Faux preview window */}
        <div className="mt-16 w-full max-w-4xl overflow-hidden rounded-2xl border border-[#ededed] bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-1.5 border-b border-[#ededed] bg-[#fafafa] px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-[#e5e5e5]" />
            <span className="h-3 w-3 rounded-full bg-[#e5e5e5]" />
            <span className="h-3 w-3 rounded-full bg-[#e5e5e5]" />
          </div>
          <div className="grid gap-px bg-[#ededed] md:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3 bg-white p-6 text-left">
              <div className="rounded-xl bg-[#f5f5f5] px-3.5 py-2.5 text-[13px] text-[#525252]">
                Make a 30-second video about our new coffee blend.
              </div>
              <div className="rounded-xl bg-[#171717] px-3.5 py-2.5 text-[13px] text-white">
                On it — writing the script, recording narration and generating scenes…
              </div>
              <div className="flex items-center gap-2 pt-1 text-[12px] text-[#8f8f8f]">
                <PenLine className="h-3.5 w-3.5" /> Script
                <AudioLines className="ml-2 h-3.5 w-3.5" /> Voice
                <ImageIcon className="ml-2 h-3.5 w-3.5" /> Scenes
              </div>
            </div>
            <div className="flex items-center justify-center bg-[#fafafa] p-6">
              <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-gradient-to-br from-[#efefef] to-[#e2e2e2]">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 shadow-md">
                  <Play className="h-6 w-6 translate-x-0.5 fill-[#171717] text-[#171717]" />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATS = [
  { value: "4×", label: "Faster than editing by hand" },
  { value: "90%", label: "Lower production cost" },
  { value: "1", label: "Chat from idea to final cut" },
  { value: "∞", label: "Iterations, no re-shoots" },
];

function Stats() {
  return (
    <section className="border-y border-[#ededed] bg-[#fafafa]">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-14 md:grid-cols-4">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <div className="text-4xl font-semibold tracking-tight">{s.value}</div>
            <div className="mt-1.5 text-[13px] text-[#8f8f8f]">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const FRAMEWORK = [
  {
    icon: PenLine,
    title: "Write",
    body: "Describe your idea in plain language. The agent drafts a tight, on-brand script and storyboard for you to tweak.",
  },
  {
    icon: AudioLines,
    title: "Voice",
    body: "Natural narration is generated scene by scene — pick a voice and tone, no microphone or recording booth needed.",
  },
  {
    icon: Clapperboard,
    title: "Assemble",
    body: "Illustrations, voiceover and timing are stitched into a finished video, ready to download and publish.",
  },
];

function Framework() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          From prompt to premiere
        </h2>
        <p className="mt-4 text-[16px] text-[#525252]">
          The agent handles every step of production so you can stay focused on the idea.
        </p>
      </div>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {FRAMEWORK.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-[#ededed] bg-white p-7 transition-shadow hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.18)]"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#171717] text-white">
              <f.icon className="h-5 w-5" />
            </span>
            <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#525252]">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const TOOLKIT = [
  { icon: Wand2, title: "Idea to video", body: "Turn a one-line prompt into a full production." },
  { icon: PenLine, title: "Script writer", body: "On-brand scripts and scene breakdowns." },
  { icon: AudioLines, title: "AI voiceover", body: "Lifelike narration in a range of voices." },
  { icon: ImageIcon, title: "Scene generator", body: "Custom illustrations for every beat." },
  { icon: Layers, title: "Auto assembly", body: "Timing, transitions and cuts, done for you." },
  { icon: Youtube, title: "YouTube metadata", body: "Titles, descriptions and tags on tap." },
];

function Toolkit() {
  return (
    <section id="toolkit" className="border-y border-[#ededed] bg-[#fafafa]">
      <div className="mx-auto max-w-6xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            One agent, a full studio
          </h2>
          <p className="mt-4 text-[16px] text-[#525252]">
            Every tool you need to go from concept to publish — in a single conversation.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLKIT.map((t) => (
            <div
              key={t.title}
              className="flex items-start gap-4 rounded-2xl border border-[#ededed] bg-white p-6"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#f5f5f5] text-[#171717]">
                <t.icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">{t.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[#8f8f8f]">{t.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { n: "01", title: "Describe it", body: "Tell the agent what you want — a topic, a length, a vibe." },
  { n: "02", title: "Watch it build", body: "Script, voiceover and scenes are generated live as you chat." },
  { n: "03", title: "Publish it", body: "Review the cut, refine anything, and export the finished video." },
];

function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Three steps to a finished video
        </h2>
      </div>

      <div className="mt-14 grid gap-10 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="relative">
            <div className="text-[13px] font-semibold tracking-widest text-[#bdbdbd]">
              {s.n}
            </div>
            <h3 className="mt-3 flex items-center gap-2 text-lg font-semibold">
              <Zap className="h-4 w-4 text-[#171717]" />
              {s.title}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-[#525252]">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="border-t border-[#ededed] bg-[#fafafa]">
      <div className="mx-auto max-w-3xl px-5 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <div className="mt-12 divide-y divide-[#ededed] rounded-2xl border border-[#ededed] bg-white">
          {FAQS.map((f) => (
            <details key={f.q} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold text-[#171717]">
                {f.q}
                <ArrowRight className="h-4 w-4 shrink-0 text-[#8f8f8f] transition-transform group-open:rotate-90" />
              </summary>
              <p className="mt-3 text-[14px] leading-relaxed text-[#525252]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24">
      <div className="relative overflow-hidden rounded-3xl bg-[#171717] px-8 py-16 text-center text-white md:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,0.12)_0%,transparent_70%)]"
        />
        <h2 className="relative text-balance text-3xl font-semibold tracking-tight md:text-5xl">
          Your first video is one chat away.
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-[16px] text-white/70">
          Sign up free and turn your next idea into a finished video today.
        </p>
        <Link
          href="/sign-up"
          className="relative mt-8 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-6 py-3 text-[15px] font-medium text-[#171717] transition-colors hover:bg-[#f0f0f0]"
        >
          Create your first video
          <ArrowRight className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-[#ededed] bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-[13px] text-[#8f8f8f] sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#171717] text-white">
            <Film className="h-3.5 w-3.5" />
          </span>
          <span className="font-medium text-[#171717]">Video Agent</span>
        </div>
        <p>© 2026 Video Agent. All rights reserved.</p>
        <div className="flex items-center gap-5">
          <Link href="/sign-in" className="cursor-pointer hover:text-[#171717]">
            Log in
          </Link>
          <Link href="/sign-up" className="cursor-pointer hover:text-[#171717]">
            Get started
          </Link>
        </div>
      </div>
    </footer>
  );
}
