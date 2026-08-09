import { auth } from "@clerk/nextjs/server";

import { ChatShell } from "@/components/chat-shell";
import { LandingPage } from "@/components/landing-page";

export default async function Page() {
  const { userId } = await auth();

  // Signed-out visitors see the marketing landing page; signed-in users go
  // straight into the workspace.
  if (!userId) {
    return <LandingPage />;
  }

  return (
    <main className="flex h-screen w-screen flex-col bg-white">
      <ChatShell />
    </main>
  );
}
