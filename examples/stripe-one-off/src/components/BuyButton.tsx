"use client";

import { useState } from "react";
import { TOKEN_KEY } from "@/lib/constants";

export function BuyButton() {
  const [isLoading, setIsLoading] = useState(false);

  const handleBuy = async () => {
    setIsLoading(true);
    try {
      // Generate token before checkout and save to localStorage
      const token = crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, token);

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleBuy}
      disabled={isLoading}
      className="px-8 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <svg
            className="animate-spin h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Processing...
        </span>
      ) : (
        "Buy Full Pack — $5"
      )}
    </button>
  );
}
