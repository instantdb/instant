"use client";

import { db } from "@/lib/db";
import { type AppSchema } from "@/instant.schema";
import { InstaQLEntity } from "@instantdb/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";

type User = InstaQLEntity<AppSchema, "$users">;

function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await db.auth.sendMagicCode({ email });
      setSentTo(email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await db.auth.signInWithMagicCode({ email: sentTo, code });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setIsLoading(false);
    }
  }

  if (sentTo) {
    return (
      <form onSubmit={handleVerifyCode} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Enter the code sent to {sentTo}
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isLoading || !code}
          className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "Verifying..." : "Sign In"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSentTo("");
            setCode("");
            setError("");
          }}
          className="w-full py-2 px-4 text-gray-600 hover:text-gray-900"
        >
          Use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendCode} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Email address
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isLoading || !email}
        className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "Sending..." : "Send Sign In Code"}
      </button>
    </form>
  );
}

function SubscriptionCard({
  user,
  userData,
}: {
  user: { id: string; refresh_token: string };
  userData: User | undefined;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const isSubscribed = userData?.subscriptionStatus === "active";

  async function handleSubscribe() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.refresh_token}`,
        },
      });

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleManageBilling() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.refresh_token}`,
        },
      });

      const { url, error } = await res.json();
      if (error) throw new Error(error);
      if (url) window.location.href = url;
    } catch (err) {
      console.error("Portal error:", err);
      alert("Failed to open billing portal. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  const isCanceling = isSubscribed && userData?.cancelAt;
  const cancelDate = userData?.cancelAt
    ? new Date(userData.cancelAt * 1000)
    : null;

  if (isCanceling && cancelDate) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          <span className="font-medium text-yellow-800">Subscription Ending</span>
        </div>
        <p className="text-yellow-700 mb-4">
          Your subscription is canceled and will end on{" "}
          <span className="font-medium">
            {cancelDate.toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          . You have access until then.
        </p>
        <button
          onClick={handleManageBilling}
          disabled={isLoading}
          className="px-4 py-2 bg-yellow-500 text-white font-medium rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Loading..." : "Renew Subscription"}
        </button>
      </div>
    );
  }

  if (isSubscribed) {
    return (
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="font-medium text-green-800">Active Subscription</span>
        </div>
        <p className="text-green-700 mb-4">
          You have full access to all premium content.
        </p>
        <button
          onClick={handleManageBilling}
          disabled={isLoading}
          className="px-4 py-2 bg-white border border-green-300 text-green-700 font-medium rounded-lg hover:bg-green-50 disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Loading..." : "Manage Billing"}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 bg-amber-50 border border-amber-200 rounded-lg">
      <h3 className="text-lg font-semibold text-amber-900 mb-2">
        Unlock Premium Content
      </h3>
      <p className="text-amber-800 mb-4">
        Subscribe for <span className="font-semibold">$5/month</span> to access
        all premium articles and exclusive insights.
      </p>
      <button
        onClick={handleSubscribe}
        disabled={isLoading}
        className="px-6 py-2 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {isLoading ? "Loading..." : "Subscribe Now"}
      </button>
    </div>
  );
}

function AccountContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const { isLoading: authLoading, user } = db.useAuth();
  const { isLoading: dataLoading, data } = db.useQuery(
    user ? { $users: { $: { where: { id: user.id } } } } : null
  );

  const userData = data?.$users?.[0];

  // Sync with Stripe on success to avoid race condition with webhook
  useEffect(() => {
    if (success && user) {
      fetch("/api/stripe/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.refresh_token}`,
        },
      }).catch(console.error);
    }
  }, [success, user]);

  if (authLoading) {
    return (
      <div className="p-6 bg-white border border-gray-200 rounded-lg animate-pulse">
        <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
        <div className="h-4 w-48 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Sign In</h2>
        <p className="text-gray-600 mb-6">
          Sign in to subscribe and access premium content.
        </p>
        <LoginForm />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          Welcome! Your subscription is now active.
        </div>
      )}
      {canceled && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
          Checkout was canceled. You can try again when you&apos;re ready.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Your Account
        </h2>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-blue-600 font-medium">
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">{user.email}</p>
            <p className="text-sm text-gray-500">Member</p>
          </div>
        </div>

        {dataLoading ? (
          <div className="h-32 bg-gray-100 rounded-lg animate-pulse" />
        ) : (
          <SubscriptionCard user={user} userData={userData} />
        )}
      </div>

      <button
        onClick={() => db.auth.signOut()}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        Sign Out
      </button>
    </div>
  );
}

export default function AccountPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            The Weekly Dispatch
          </Link>
          <Link
            href="/"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Back to Posts
          </Link>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-8">
        <Suspense
          fallback={
            <div className="p-6 bg-white border border-gray-200 rounded-lg animate-pulse">
              <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
              <div className="h-4 w-48 bg-gray-200 rounded" />
            </div>
          }
        >
          <AccountContent />
        </Suspense>
      </main>
    </div>
  );
}
