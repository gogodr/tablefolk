import { SetupNotice } from "@/components/setup-notice";
import { JoinClient } from "./join-client";

export default function JoinPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <JoinClient />;
}
