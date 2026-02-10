"use client";

import { WallpaperCard } from "./WallpaperCard";
import type { InstaQLEntity } from "@instantdb/react";
import type { AppSchema } from "@/instant.schema";

type Wallpaper = InstaQLEntity<AppSchema, "wallpapers">;

interface WallpaperGridProps {
  wallpapers: Wallpaper[];
  isLoading: boolean;
}

export function WallpaperGrid({ wallpapers, isLoading }: WallpaperGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="aspect-[16/10] rounded-2xl bg-gray-200 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (wallpapers.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No wallpapers found. Run the seed script to add wallpapers.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {wallpapers.map((wallpaper) => (
        <WallpaperCard key={wallpaper.id} wallpaper={wallpaper} />
      ))}
    </div>
  );
}
