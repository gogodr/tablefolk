import { SetupNotice } from "@/components/setup-notice";
import { MembersClient } from "./members-client";

export default function MembersPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <MembersClient />;
}
