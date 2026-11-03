import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCallback, CallbackFrame, CallbackLoading } from "@/components/auth/auth-callback";

export const metadata: Metadata = { title: "Signing in", robots: { index: false } };

export default function AuthCallbackPage() {
  return (
    <CallbackFrame>
      <Suspense fallback={<CallbackLoading />}>
        <AuthCallback />
      </Suspense>
    </CallbackFrame>
  );
}
