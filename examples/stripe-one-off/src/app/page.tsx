"use client";

import Link from "next/link";
import { db } from "@/lib/db";
import { WallpaperGrid } from "@/components/WallpaperGrid";
import { BuyButton } from "@/components/BuyButton";
import { Spinner, CheckIcon } from "@/components/icons";
import { usePurchaseToken } from "@/hooks/usePurchaseToken";

export default function Home() {
  const { token, isLoading: tokenLoading } = usePurchaseToken();

  // Query wallpapers with token - only returns fullResUrl if token is valid
  const { data, isLoading: queryLoading } = db.useQuery(
    { wallpapers: { $: { order: { order: "asc" } } } },
    token ? { ruleParams: { token } } : undefined
  );

  const wallpapers = data?.wallpapers || [];
  // Check if any wallpaper has fullResUrl - that's the real proof of purchase
  const hasPurchase = wallpapers.some((w) => !!w.fullResUrl);

  const isLoading = tokenLoading || queryLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <header className="text-center mb-10">
          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            Premium Wallpaper Pack
          </h1>
          <p className="text-xl text-violet-200/70 max-w-2xl mx-auto mb-8">
            9 stunning high-resolution wallpapers to transform your desktop
          </p>

          {isLoading ? (
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-white/5 rounded-xl text-violet-200/70">
              <Spinner className="h-5 w-5" />
              Loading...
            </div>
          ) : hasPurchase ? (
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
              <div className="w-8 h-8 rounded-full bg-emerald-500/30 flex items-center justify-center">
                <CheckIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-emerald-300 font-medium">
                You own this pack! Hover over any wallpaper to download.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              <BuyButton />
              <p className="text-violet-200/50 text-sm">
                One-time purchase. Instant download access.
              </p>
              <p className="text-violet-200/40 text-sm">
                Already purchased?{" "}
                <Link href="/recover" className="text-violet-400 hover:text-violet-300 underline">
                  Recover your purchase
                </Link>
              </p>
            </div>
          )}
        </header>

        <WallpaperGrid wallpapers={wallpapers} isLoading={queryLoading} />
      </div>
    </div>
  );
}
