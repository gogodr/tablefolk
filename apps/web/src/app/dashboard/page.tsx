import type { Metadata } from "next";
import { SetupNotice } from "@/components/setup-notice";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard · Tablefolk",
  description: "Tu mesa de juegos, próximas partidas, grupos y colección.",
};

export default function DashboardPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <DashboardClient />;
}
