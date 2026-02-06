"use client";

import { db } from "@/lib/db";
import { type AppSchema } from "@/instant.schema";
import { InstaQLEntity } from "@instantdb/react";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { CREDITS_PER_PACK, PACK_PRICE_CENTS } from "@/lib/stripe";

type Haiku = InstaQLEntity<AppSchema, "haikus">;
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
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isLoading || !code}
          className="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          autoFocus
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isLoading || !email}
        className="w-full py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? "Sending..." : "Send Sign In Code"}
      </button>
    </form>
  );
}

function PurchaseModal({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean;
  onClose: () => void;
  user: { id: string; refresh_token: string };
}) {
  const [isLoading, setIsLoading] = useState(false);

  async function handlePurchase() {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Get More Credits
        </h3>
        <p className="text-gray-600 mb-6">
          Purchase a credit pack to continue generating haikus.
        </p>

        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 mb-6 border border-indigo-100">
          <div className="text-center">
            <div className="text-4xl font-bold text-indigo-600 mb-1">
              {CREDITS_PER_PACK}
            </div>
            <div className="text-gray-600 mb-3">credits</div>
            <div className="text-2xl font-semibold text-gray-900">
              ${(PACK_PRICE_CENTS / 100).toFixed(2)}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePurchase}
            disabled={isLoading}
            className="flex-1 py-2 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Loading..." : "Purchase"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreditBadge({ credits }: { credits: number }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-100 to-yellow-100 rounded-full border border-amber-200">
      <span className="text-amber-600 text-sm">&#9679;</span>
      <span className="font-semibold text-amber-800">{credits}</span>
    </div>
  );
}

function HaikuCard({ haiku }: { haiku: Haiku }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-indigo-600">
          {haiku.topic}
        </span>
        <span className="text-xs text-gray-500">
          {new Date(haiku.createdAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
      <div className="text-gray-700 text-sm italic">
        {haiku.content.split("\n").map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function HaikuGenerator({
  user,
  userData,
  onNeedCredits,
}: {
  user: { id: string; refresh_token: string };
  userData: User | undefined;
  onNeedCredits: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHaiku, setGeneratedHaiku] = useState<{
    topic: string;
    content: string;
  } | null>(null);
  const [error, setError] = useState("");

  const credits = userData?.credits || 0;

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;

    if (credits < 1) {
      onNeedCredits();
      return;
    }

    setIsGenerating(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.refresh_token}`,
        },
        body: JSON.stringify({ topic: topic.trim() }),
      });

      const data = await res.json();

      if (data.needsCredits) {
        onNeedCredits();
        return;
      }

      if (data.error) throw new Error(data.error);

      setGeneratedHaiku(data.haiku);
      setTopic("");
    } catch (err) {
      console.error("Generate error:", err);
      setError("Failed to generate haiku. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 p-6">
          <h2 className="text-xl font-semibold text-white mb-1">
            Generate a Haiku
          </h2>
          <p className="text-indigo-100 text-sm">
            Enter any topic and receive a unique haiku
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleGenerate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Topic
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., autumn, ocean, love..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                disabled={isGenerating}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={isGenerating || !topic.trim()}
              className="w-full py-3 px-4 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? "Generating..." : "Generate Haiku (-1 credit)"}
            </button>
          </form>

          {generatedHaiku && (
            <div className="mt-6 pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-500 mb-4">
                &ldquo;{generatedHaiku.topic}&rdquo;
              </p>
              {generatedHaiku.content.split("\n").map((line, i) => (
                <p
                  key={i}
                  className="text-xl text-gray-800 italic leading-relaxed"
                >
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {credits <= 3 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-amber-800">
            {credits === 0 ? "No credits remaining" : "Running low on credits!"}
          </span>
          <button
            onClick={onNeedCredits}
            className="px-4 py-1.5 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Buy Credits
          </button>
        </div>
      )}
    </div>
  );
}

function HaikuHistory() {
  const { isLoading, data } = db.useQuery({
    haikus: { $: { order: { createdAt: "desc" } } },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-gray-100 rounded-lg h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const haikus = data?.haikus || [];

  if (haikus.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No haikus yet</p>
        <p className="text-sm">Generate your first haiku above!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {haikus.map((haiku) => (
        <HaikuCard key={haiku.id} haiku={haiku} />
      ))}
    </div>
  );
}

function MainContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const { isLoading: authLoading, user } = db.useAuth();
  const { isLoading: dataLoading, data } = db.useQuery(
    user ? { $users: { $: { where: { id: user.id } } } } : null
  );

  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const userData = data?.$users?.[0];

  // Clear URL params after showing toast
  useEffect(() => {
    if (success || canceled) {
      const timeout = setTimeout(() => {
        window.history.replaceState({}, "", "/");
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [success, canceled]);

  if (authLoading) {
    return (
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
          <div className="h-4 w-64 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-sm mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Sign in to get started
            </h2>
            <p className="text-gray-600 text-sm">
              Create haikus with credits. {CREDITS_PER_PACK} credits for $
              {(PACK_PRICE_CENTS / 100).toFixed(2)}.
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          Credits added to your account!
        </div>
      )}
      {canceled && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
          Purchase canceled. You can try again whenever you&apos;re ready.
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 font-medium">
              {user.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="font-medium text-gray-900">{user.email}</p>
            <button
              onClick={() => db.auth.signOut()}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dataLoading ? (
            <div className="h-8 w-16 bg-gray-200 rounded-full animate-pulse" />
          ) : (
            <CreditBadge credits={userData?.credits || 0} />
          )}
          <button
            onClick={() => setShowPurchaseModal(true)}
            className="px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            + Buy
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <HaikuGenerator
            user={user}
            userData={userData}
            onNeedCredits={() => setShowPurchaseModal(true)}
          />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Your Haikus
          </h3>
          <HaikuHistory />
        </div>
      </div>

      <PurchaseModal
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        user={user}
      />
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">Haiku Generator</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Suspense
          fallback={
            <div className="max-w-lg mx-auto">
              <div className="bg-white rounded-2xl border border-gray-200 p-8 animate-pulse">
                <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
                <div className="h-4 w-64 bg-gray-200 rounded" />
              </div>
            </div>
          }
        >
          <MainContent />
        </Suspense>
      </main>
    </div>
  );
}
