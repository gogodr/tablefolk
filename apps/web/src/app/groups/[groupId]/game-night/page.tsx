import { SetupNotice } from "@/components/setup-notice";
import { GameNightClient } from "./game-night-client";

export default function GameNightPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <GameNightClient />;
}
