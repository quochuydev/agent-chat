import { Coins, HeartPulse, Lightbulb, Rocket, type LucideIcon } from "lucide-react";

// Channel presets — the "ideas" the app can produce. A channel bundles the DNA that
// shapes a video: the script voice (scriptDNA → prepended to the script system prompt),
// the visual style (imageStyle → appended to every image prompt), a default narration
// voice, and starter prompts for an empty chat. Adding a niche = adding an entry here;
// nothing else in the pipeline is niche-specific.

export type Channel = {
  id: string;
  name: string;
  icon: LucideIcon;
  tagline: string;
  scriptDNA: string;
  imageStyle: string;
  defaultVoice: string;
  starters: string[];
};

export const CHANNELS: Channel[] = [
  {
    id: "custom",
    name: "Your Own Idea",
    icon: Lightbulb,
    tagline: "Bring any idea — describe the video you want and the agent runs with it.",
    scriptDNA:
      "This is a short video about whatever topic the viewer describes — follow their idea faithfully and don't force it into a fixed niche. " +
      "Narrate in a clear, engaging, natural voice, and adapt the tone to the subject (playful, dramatic or calm as it fits). " +
      "Open with a strong hook, keep every line vivid and concise, ground any claims in real facts (never invent names or statistics), and close with one memorable takeaway.",
    imageStyle:
      "clean, visually striking illustration that fits the topic; a single consistent style across every shot, clear composition, vivid but tasteful color, no text or watermarks",
    defaultVoice: "af_sky",
    starters: [
      "A 60-second explainer on how black holes work",
      "The history of coffee, in 60 seconds",
      "Why the sky is blue, explained simply",
    ],
  },
  {
    id: "money",
    name: "Money & Everyday Economics",
    icon: Coins,
    tagline: "Where money comes from, inflation, debt, scams — the money you use every day, explained.",
    scriptDNA:
      "This is a viral educational explainer about money and everyday economics — where money comes from, why inflation happens, how banks, debt, saving and scams actually work. " +
      "Narrate in calm, intelligent 2nd person (\"your money\", \"your paycheck\") — never \"we\" or \"I\". " +
      "Open with a striking money fact or a relatable money moment, then reframe it. Weave in at least one real economist, study or historical example (never invent names). " +
      "Decode every economic term in plain English the moment you use it. Include one counterintuitive twist (e.g. \"saving can lose you money\"). Close by reflecting the idea back onto a choice the viewer makes with their own money.",
    imageStyle:
      "flat hand-drawn 2D doodle cartoon, bold black hand-drawn outlines, flat solid colors, slightly wobbly marker lines, ZERO gradients, ZERO shadows; money motifs — coins, banknotes, piggy banks, wallets, simple bar/line charts, stick-figure people",
    defaultVoice: "am_michael",
    starters: [
      "Why your money is worth less every year",
      "How banks actually create money out of nothing",
      "The weirdest things ever used as money",
    ],
  },
  {
    id: "health",
    name: "Body, Health & Lifestyle",
    icon: HeartPulse,
    tagline: "Sleep, hunger, sex, beauty, healthy living — how your body actually works.",
    scriptDNA:
      "This is a viral educational explainer about the human body and healthy living — physiological needs like sleep, hunger and thirst, plus sex, beauty, and everyday health. " +
      "Narrate in calm, intelligent 2nd person (\"your body\", \"your brain\") — never \"we\" or \"I\". " +
      "Open by dropping the viewer inside a bodily sensation, then reframe it with a striking statistic. Weave in at least one real researcher or study (never invent names). " +
      "Decode every scientific term in plain English immediately. Treat bodily and taboo topics honestly and tastefully, never crudely. Include one counterintuitive twist, and close by reflecting the science back onto something the viewer feels or does today.",
    imageStyle:
      "flat hand-drawn 2D doodle cartoon, bold black hand-drawn outlines, flat solid colors, slightly wobbly marker lines, ZERO gradients, ZERO shadows; body & health motifs — stick-figure people, heart, brain, food, water, bed/sleep, simple anatomy",
    defaultVoice: "af_sky",
    starters: [
      "What happens to your body when you don't sleep",
      "Why you crave sugar even when you're full",
      "The science of what makes a face attractive",
    ],
  },
  {
    id: "warbeasts",
    name: "Beasts, Plants & War Machines",
    icon: Rocket,
    tagline: "Animals and plants fused with tanks, rockets and missiles — surreal war machines at war.",
    scriptDNA:
      "This is a viral, cinematic battle short about surreal war machines — real animals, plants and forces of nature fused with military hardware (tanks, rockets, missiles, artillery, jet engines) locked in an epic war. " +
      "Narrate like a dramatic wildlife-meets-war documentary: tense, vivid, present tense, describing the hybrid combatants on the battlefield — never \"I\". " +
      "Open mid-battle with a striking image, then name each hybrid clearly (e.g. \"the rhino-tank\", \"the wasp-missile swarm\", \"the oak-tree fortress\"). Give every combatant one clear strength and one weakness, build to a single turning point, and close on who prevails and why. " +
      "Keep every line something you can SEE. Keep the action stylized and awe-driven — spectacle and scale, never gore or realistic violence.",
    imageStyle:
      "cinematic hyper-detailed 3D render, dramatic volumetric lighting, epic wide battlefield shot; biomechanical hybrids — animals and plants fused with tank armor, rocket pods, missile launchers, exhaust vents and gears; smoke, sparks and dust, gritty military color palette with vivid highlights, strong sense of scale and motion",
    defaultVoice: "am_eric",
    starters: [
      "A rhino fused with a battle tank charges the front line",
      "Wasp-missile swarm versus an armored oak-tree fortress",
      "The crocodile submarine ambushes the eagle fighter squadron",
    ],
  },
];

export const DEFAULT_CHANNEL_ID = CHANNELS[0].id;

export function getChannel(id?: string | null): Channel {
  return CHANNELS.find((c) => c.id === id) ?? CHANNELS[0];
}
