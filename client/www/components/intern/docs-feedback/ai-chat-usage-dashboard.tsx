'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import db from '@/lib/intern/docs-feedback/db';
import {
  ChatConversationsView,
  SingleConversationView,
} from './chat-conversations-view';

type Tab = 'usage' | 'conversations' | 'conversation';

const NOW = Date.now();
const ONE_DAY = 24 * 60 * 60 * 1000;
const ONE_WEEK = 7 * ONE_DAY;

// Rough cost estimate: ~$2.8 per 1M tokens (blended input/output for Sonnet)
const COST_PER_TOKEN = 2.8 / 1_000_000;

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return tokens.toString();
}

function formatCost(tokens: number): string {
  const cost = tokens * COST_PER_TOKEN;
  if (cost < 0.01) {
    return '<$0.01';
  }
  return `$${cost.toFixed(2)}`;
}

export function AIChatUsageDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatId = searchParams?.get('chat');
  const tabParam = searchParams?.get('tab');

  const activeTab: Tab =
    tabParam === 'conversations'
      ? 'conversations'
      : tabParam === 'conversation' || chatId
        ? 'conversation'
        : 'usage';

  const changeTab = (tab: Tab) => {
    if (tab === 'conversations') {
      router.replace('?tab=conversations', { scroll: false });
    } else if (tab === 'conversation') {
      router.replace('?tab=conversation', { scroll: false });
    } else {
      router.replace('?', { scroll: false });
    }
  };

  const { data, isLoading, error } = db.useQuery({
    llmUsage: {},
  });

  const handleSignOut = () => {
    db.auth.signOut();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-gray-200" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="text-red-600">Error loading data: {error.message}</div>
      </div>
    );
  }

  const allUsage = data?.llmUsage || [];

  if (activeTab === 'conversation') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <DashboardHeader
            activeTab={activeTab}
            setActiveTab={changeTab}
            handleSignOut={handleSignOut}
          />
          <SingleConversationView chatId={chatId ?? null} />
        </div>
      </div>
    );
  }

  if (activeTab === 'conversations') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <DashboardHeader
            activeTab={activeTab}
            setActiveTab={changeTab}
            handleSignOut={handleSignOut}
          />
          <ChatConversationsView />
        </div>
      </div>
    );
  }

  const todayUsage = allUsage.filter(
    (u) => new Date(u.usedAt).getTime() > NOW - ONE_DAY,
  );
  const weekUsage = allUsage.filter(
    (u) => new Date(u.usedAt).getTime() > NOW - ONE_WEEK,
  );

  const todayTokens = todayUsage.reduce((sum, u) => sum + u.tokens, 0);
  const weekTokens = weekUsage.reduce((sum, u) => sum + u.tokens, 0);
  const allTimeTokens = allUsage.reduce((sum, u) => sum + u.tokens, 0);

  const todayUsers = new Set(todayUsage.map((u) => u.userId)).size;
  const weekUsers = new Set(weekUsage.map((u) => u.userId)).size;

  const todayRequests = todayUsage.length;
  const weekRequests = weekUsage.length;

  // Top users (by tokens, this week)
  const userTokensMap = new Map<string, number>();
  weekUsage.forEach((u) => {
    const email = u.userEmail || u.userId; // fallback for old records
    userTokensMap.set(email, (userTokensMap.get(email) || 0) + u.tokens);
  });
  const topUsers = Array.from(userTokensMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Daily breakdown (last 7 days, UTC)
  const dailyBreakdown: { date: string; tokens: number; requests: number }[] =
    [];
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayUTC.getTime() - i * ONE_DAY);
    const dayEnd = new Date(dayStart.getTime() + ONE_DAY);
    const dayUsage = allUsage.filter((u) => {
      const time = new Date(u.usedAt).getTime();
      return time >= dayStart.getTime() && time < dayEnd.getTime();
    });
    const date = dayStart.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    dailyBreakdown.push({
      date,
      tokens: dayUsage.reduce((sum, u) => sum + u.tokens, 0),
      requests: dayUsage.length,
    });
  }

  const maxDailyTokens = Math.max(...dailyBreakdown.map((d) => d.tokens), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <DashboardHeader
          activeTab={activeTab}
          setActiveTab={changeTab}
          handleSignOut={handleSignOut}
        />

        {/* Summary Cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <MetricCard
            label="Today"
            value={formatTokens(todayTokens)}
            subvalue={formatCost(todayTokens)}
            detail={`${todayRequests} requests, ${todayUsers} users`}
            color="blue"
          />
          <MetricCard
            label="This Week"
            value={formatTokens(weekTokens)}
            subvalue={formatCost(weekTokens)}
            detail={`${weekRequests} requests, ${weekUsers} users`}
            color="green"
          />
          <MetricCard
            label="All Time"
            value={formatTokens(allTimeTokens)}
            subvalue={formatCost(allTimeTokens)}
            detail={`${allUsage.length} total requests`}
            color="purple"
          />
          <MetricCard
            label="Avg per Request"
            value={formatTokens(
              weekRequests > 0 ? Math.round(weekTokens / weekRequests) : 0,
            )}
            subvalue={formatCost(
              weekRequests > 0 ? Math.round(weekTokens / weekRequests) : 0,
            )}
            detail="This week average"
            color="yellow"
          />
        </div>

        {/* Daily Breakdown */}
        <div className="mb-8 rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Last 7 Days (UTC)
          </h2>
          <div className="space-y-3">
            {dailyBreakdown.map((day) => (
              <div key={day.date} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{day.date}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">
                      {day.requests} requests
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatTokens(day.tokens)}
                    </span>
                    <span className="text-green-600">
                      {formatCost(day.tokens)}
                    </span>
                  </div>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{
                      width: `${(day.tokens / maxDailyTokens) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Users */}
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Top Users (This Week)
          </h2>
          {topUsers.length === 0 ? (
            <p className="text-gray-500">No usage this week</p>
          ) : (
            <div className="space-y-2">
              {topUsers.map(([email, tokens], index) => (
                <div
                  key={email}
                  className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                      {index + 1}
                    </span>
                    <span className="text-sm text-gray-700">{email}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-gray-900">
                      {formatTokens(tokens)}
                    </span>
                    <span className="text-sm text-green-600">
                      {formatCost(tokens)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subvalue,
  detail,
  color,
}: {
  label: string;
  value: string;
  subvalue: string;
  detail: string;
  color: 'blue' | 'green' | 'purple' | 'yellow';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color]}`}>
      <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <span className="text-sm text-green-600">{subvalue}</span>
      </div>
      <div className="mt-1 text-xs text-gray-500">{detail}</div>
    </div>
  );
}

function DashboardHeader({
  activeTab,
  setActiveTab,
  handleSignOut,
}: {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  handleSignOut: () => void;
}) {
  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">AI Chat Usage</h1>
          <p className="mt-1 text-gray-600">
            Token usage and cost estimates for the docs AI chat
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Sign Out (Feedback App)
        </button>
      </div>
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('usage')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'usage'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Usage Overview
        </button>
        <button
          onClick={() => setActiveTab('conversations')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'conversations'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Conversations
        </button>
        <button
          onClick={() => setActiveTab('conversation')}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'conversation'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Conversation
        </button>
      </div>
    </div>
  );
}
