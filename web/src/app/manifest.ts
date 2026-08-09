import type { MetadataRoute } from "next";

// Served at /manifest.webmanifest. Enables installable/PWA behavior and richer mobile
// presentation. Icons reference the app-router icon conventions (icon.svg, apple-icon).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Video Agent",
    short_name: "Video Agent",
    description:
      "Chat with an AI agent that writes, voices, illustrates and assembles videos — from one idea to a finished cut.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#171717",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon", type: "image/png", sizes: "180x180" },
    ],
  };
}
