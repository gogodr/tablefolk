import { SetupNotice } from "@/components/setup-notice";
import { GroupsClient } from "./groups-client";

export default function GroupsPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <GroupsClient />;
}
