import { SetupNotice } from "@/components/setup-notice";
import { CollectionClient } from "./collection-client";
import "./collection.css";

export default function CollectionPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <CollectionClient />;
}
