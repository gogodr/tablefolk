import { SetupNotice } from "@/components/setup-notice";
import { EventsCalendarClient } from "./events-calendar-client";

export default function EventsPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <EventsCalendarClient />;
}
