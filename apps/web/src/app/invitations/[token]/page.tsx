import { InvitationClient } from "./invitation-client";
import { SetupNotice } from "@/components/setup-notice";

export default function InvitationPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <InvitationClient />;
}
