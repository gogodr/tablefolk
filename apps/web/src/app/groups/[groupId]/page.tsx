import { SetupNotice } from "@/components/setup-notice";
import { GroupClient } from "./group-client";

export default function GroupPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <GroupClient />;
}
