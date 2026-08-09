import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

// Auth screens carry no marketing content — keep them out of search results.
export const metadata: Metadata = {
  title: "Log in",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-[#f0f4f9]">
      <SignIn />
    </main>
  );
}
