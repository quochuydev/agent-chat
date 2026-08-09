import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";

import { SITE_URL } from "@/lib/config";

import "./globals.css";

const TITLE = "AI Video Agent — From a single chat to a finished video";
const DESCRIPTION =
  "Chat with an AI agent that writes the script, voices the narration, illustrates every scene, and assembles the final cut — turning one idea into a finished video.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · AI Video Agent",
  },
  description: DESCRIPTION,
  applicationName: "AI Video Agent",
  keywords: [
    "AI video agent",
    "AI video generator",
    "text to video",
    "AI voiceover",
    "AI script writer",
    "AI scene generator",
    "automated video creation",
    "AI video maker",
  ],
  authors: [{ name: "AI Video Agent" }],
  creator: "AI Video Agent",
  publisher: "AI Video Agent",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    siteName: "AI Video Agent",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#171717",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <html lang="en">
        <body className="h-full bg-white text-[#050505] antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
