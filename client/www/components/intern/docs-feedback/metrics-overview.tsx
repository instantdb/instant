'use client';

import { useOverallMetrics } from '@/lib/intern/docs-feedback/analytics';

export function MetricsOverview() {
  const { totalFeedback, overallSatisfactionRate, isLoading, error } =
    useOverallMetrics();

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Overall Metrics
        </h2>
        <div className="animate-pulse">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="h-20 rounded-sm bg-gray-200"></div>
            <div className="h-20 rounded-sm bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-md">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Overall Metrics
        </h2>
        <div className="text-red-600">
          Error loading metrics: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Overall Metrics
      </h2>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <MetricCard
          title="Total Feedback"
          value={totalFeedback.toString()}
          description="Total feedback submissions"
          color="blue"
        />

        <MetricCard
          title="Satisfaction Rate"
          value={`${overallSatisfactionRate.toFixed(1)}%`}
          description="Overall satisfaction percentage"
          color={
            overallSatisfactionRate >= 70
              ? 'green'
              : overallSatisfactionRate >= 50
                ? 'yellow'
                : 'red'
          }
        />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  color,
}: {
  title: string;
  value: string;
  description: string;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color]}`}>
      <div className="mb-1 text-2xl font-bold">{value}</div>
      <div className="mb-1 text-sm font-medium">{title}</div>
      <div className="text-xs opacity-80">{description}</div>
    </div>
  );
}
