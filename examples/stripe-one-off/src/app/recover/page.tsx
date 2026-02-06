"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { TOKEN_KEY } from "@/lib/constants";
import { Spinner, CheckIcon } from "@/components/icons";

type Step = "email" | "code" | "recovering" | "success" | "not-found";

export default function RecoverPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = db.useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Once authenticated, look up purchases by email
  const { data, isLoading: queryLoading } = db.useQuery(
    user ? { purchases: {} } : null
  );

  // If user is already authenticated, skip to recovery
  useEffect(() => {
    if (user && step === "email") {
      setStep("recovering");
    }
  }, [user, step]);

  // Handle purchase recovery once we have data
  useEffect(() => {
    if (step !== "recovering") return;
    if (queryLoading) return;

    if (data?.purchases && data.purchases.length > 0) {
      // Found a purchase - save the token
      const purchase = data.purchases[0];
      localStorage.setItem(TOKEN_KEY, purchase.token);
      // Sign out - we only needed auth to verify email ownership
      db.auth.signOut();
      setStep("success");
    } else if (!queryLoading) {
      // No purchases found for this email - sign out
      db.auth.signOut();
      setStep("not-found");
    }
  }, [data, queryLoading, step]);

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await db.auth.sendMagicCode({ email });
      setStep("code");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send code";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await db.auth.signInWithMagicCode({ email, code });
      setStep("recovering");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid code";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center">
        <Spinner className="h-12 w-12 text-violet-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6">
        {step === "email" && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-3">
              Recover Your Purchase
            </h1>
            <p className="text-violet-200/70 mb-8">
              Enter the email you used when purchasing to recover your wallpapers.
            </p>

            <form onSubmit={handleSendCode} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="h-5 w-5" />
                    Sending...
                  </span>
                ) : (
                  "Send Recovery Code"
                )}
              </button>
            </form>

            <button
              onClick={() => router.push("/")}
              className="mt-6 text-violet-300/70 hover:text-violet-300 text-sm transition-colors"
            >
              Back to Home
            </button>
          </div>
        )}

        {step === "code" && (
          <div className="text-center">
            <h1 className="text-3xl font-bold text-white mb-3">
              Check Your Email
            </h1>
            <p className="text-violet-200/70 mb-8">
              We sent a code to <span className="text-white">{email}</span>
            </p>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter code"
                required
                autoFocus
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-center text-2xl tracking-widest"
              />

              {error && (
                <p className="text-red-400 text-sm">{error}</p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner className="h-5 w-5" />
                    Verifying...
                  </span>
                ) : (
                  "Verify Code"
                )}
              </button>
            </form>

            <button
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className="mt-6 text-violet-300/70 hover:text-violet-300 text-sm transition-colors"
            >
              Use a different email
            </button>
          </div>
        )}

        {step === "recovering" && (
          <div className="text-center">
            <Spinner className="h-12 w-12 mx-auto mb-4 text-violet-400" />
            <p className="text-violet-200/70 text-lg">Looking up your purchase...</p>
          </div>
        )}

        {step === "success" && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
              <CheckIcon className="w-10 h-10 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-3">
              Purchase Recovered!
            </h1>
            <p className="text-violet-200/70 mb-8">
              Your wallpapers are ready to download.
            </p>

            <button
              onClick={() => router.push("/")}
              className="px-8 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
            >
              View Wallpapers
            </button>
          </div>
        )}

        {step === "not-found" && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
              <span className="text-amber-400 text-3xl">?</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              No Purchase Found
            </h1>
            <p className="text-violet-200/70 mb-6">
              We couldn&apos;t find a purchase associated with <span className="text-white">{email}</span>.
              <br />
              Try a different email or make a new purchase.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setStep("email");
                  setEmail("");
                  setCode("");
                  setError("");
                }}
                className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
              >
                Try Different Email
              </button>
              <button
                onClick={() => router.push("/")}
                className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
              >
                Go to Home
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
