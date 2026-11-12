import { SignUp } from "@clerk/nextjs";
import { SetupNotice } from "@/components/setup-notice";

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <SetupNotice />;
  return <div className="narrow-page auth-page"><SignUp /></div>;
}
