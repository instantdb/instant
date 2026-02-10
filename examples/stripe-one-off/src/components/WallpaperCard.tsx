"use client";

import { LockIcon, DownloadIcon } from "./icons";

interface WallpaperCardProps {
  wallpaper: {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl: string;
    fullResUrl?: string;
  };
}

export function WallpaperCard({ wallpaper }: WallpaperCardProps) {
  const isUnlocked = !!wallpaper.fullResUrl;

  return (
    <div className="relative aspect-[16/10] rounded-2xl overflow-hidden group shadow-lg">
      <img
        src={wallpaper.thumbnailUrl}
        alt={wallpaper.name}
        className={`w-full h-full object-cover transition-transform duration-200 ${
          isUnlocked ? "group-hover:scale-105" : "blur-xl scale-110"
        }`}
      />

      {!isUnlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center mb-3 border border-white/30">
            <LockIcon className="w-7 h-7 text-white" />
          </div>
          <p className="text-white/90 font-medium text-sm">{wallpaper.name}</p>
        </div>
      )}

      {isUnlocked && (
        <div className="absolute inset-0 flex flex-col justify-end p-4 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-white font-semibold mb-1">{wallpaper.name}</p>
          {wallpaper.description && (
            <p className="text-white/70 text-sm mb-3">{wallpaper.description}</p>
          )}
          <a
            href={wallpaper.fullResUrl}
            download={`${wallpaper.name}.jpg`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition-colors duration-150 text-sm w-fit"
          >
            <DownloadIcon className="w-4 h-4" />
            Download
          </a>
        </div>
      )}
    </div>
  );
}
