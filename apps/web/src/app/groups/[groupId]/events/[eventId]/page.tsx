import { SetupNotice } from "@/components/setup-notice";
import { EventClient } from "./event-client";

export default function EventRoomPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <EventClient />;
}
