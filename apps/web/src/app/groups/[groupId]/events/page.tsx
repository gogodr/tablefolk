import { SetupNotice } from "@/components/setup-notice";
import { EventsClient } from "./events-client";

export default function GroupEventsPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <EventsClient />;
}
