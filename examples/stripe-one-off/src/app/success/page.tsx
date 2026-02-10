"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/db";
import { TOKEN_KEY } from "@/lib/constants";
import { WallpaperGrid } from "@/components/WallpaperGrid";
import { Spinner, CheckIcon } from "@/components/icons";

export default function SuccessPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  useEffect(() => {
    // Token was saved to localStorage before checkout
    const savedToken = localStorage.getItem(TOKEN_KEY);
    setToken(savedToken);
    setTokenLoading(false);
  }, []);

  // Query wallpapers with token
  const { data, isLoading: queryLoading } = db.useQuery(
    { wallpapers: { $: { order: { order: "asc" } } } },
    token ? { ruleParams: { token } } : undefined
  );

  const wallpapers = data?.wallpapers || [];
  const isLoading = tokenLoading || queryLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center">
        <Spinner className="h-12 w-12 text-violet-400" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-3xl">!</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">No purchase found</h1>
          <p className="text-violet-200/70 mb-6">
            We couldn&apos;t find your purchase token. Please contact support if you believe this is an error.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <header className="text-center mb-12">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
            <CheckIcon className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Thank you for your purchase!
          </h1>
          <p className="text-xl text-violet-200/70">
            Your wallpapers are ready to download
          </p>
        </header>

        <WallpaperGrid wallpapers={wallpapers} isLoading={false} />

        <div className="mt-12 text-center">
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-medium rounded-xl transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
