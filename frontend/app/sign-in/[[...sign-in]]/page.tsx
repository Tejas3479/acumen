import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <SignIn fallbackRedirectUrl="/dashboard" />
    </div>
  );
}
