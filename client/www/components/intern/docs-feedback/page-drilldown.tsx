'use client';

import { useMemo } from 'react';
import { usePageFeedback, Rating } from '@/lib/intern/docs-feedback/analytics';

interface PageDrilldownProps {
  pageId: string;
  onBack?: () => void;
}

export function PageDrilldown({ pageId, onBack }: PageDrilldownProps) {
  const { pageFeedback, isLoading, error } = usePageFeedback(pageId);

  const groupedFeedback = useMemo(() => {
    if (!pageFeedback.length) return { helpful: [], unhelpful: [] };

    return {
      helpful: pageFeedback.filter((f) => f.wasHelpful),
      unhelpful: pageFeedback.filter((f) => !f.wasHelpful),
    };
  }, [pageFeedback]);

  if (isLoading) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="font-medium text-gray-600 hover:text-gray-900"
            >
              ← Back to overview
            </button>
          )}
        </div>
        <div className="animate-pulse">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 rounded-sm bg-gray-200"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="font-medium text-gray-600 hover:text-gray-900"
            >
              ← Back to overview
            </button>
          )}
        </div>
        <div className="text-red-600">
          Error loading page feedback: {error.message}
        </div>
      </div>
    );
  }

  const totalFeedback = pageFeedback.length;
  const satisfactionRate =
    totalFeedback > 0
      ? (groupedFeedback.helpful.length / totalFeedback) * 100
      : 0;

  return (
    <div className="rounded-lg bg-white p-6 shadow-md">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          <p className="mt-1 text-sm text-gray-600" title={pageId}>
            {pageId}
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="font-medium text-gray-600 hover:text-gray-900"
          >
            ← Back to overview
          </button>
        )}
      </div>

      {totalFeedback === 0 ? (
        <div className="py-8 text-center text-gray-500">
          No feedback found for this page
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="text-2xl font-bold text-blue-700">
                {totalFeedback}
              </div>
              <div className="text-sm text-blue-600">Total Feedback</div>
            </div>
            <div
              className={`rounded-lg border p-4 ${satisfactionRate >= 70 ? 'border-green-200 bg-green-50' : satisfactionRate >= 50 ? 'border-yellow-200 bg-yellow-50' : 'border-red-200 bg-red-50'}`}
            >
              <div
                className={`text-2xl font-bold ${satisfactionRate >= 70 ? 'text-green-700' : satisfactionRate >= 50 ? 'text-yellow-700' : 'text-red-700'}`}
              >
                {satisfactionRate.toFixed(1)}%
              </div>
              <div
                className={`text-sm ${satisfactionRate >= 70 ? 'text-green-600' : satisfactionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}
              >
                Satisfaction Rate
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-2xl font-bold text-gray-700">
                {groupedFeedback.helpful.length}/
                {groupedFeedback.unhelpful.length}
              </div>
              <div className="text-sm text-gray-600">Helpful/Unhelpful</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <FeedbackSection
              title="Helpful Feedback"
              feedback={groupedFeedback.helpful}
              color="green"
            />
            <FeedbackSection
              title="Unhelpful Feedback"
              feedback={groupedFeedback.unhelpful}
              color="red"
            />
          </div>
        </>
      )}
    </div>
  );
}

function FeedbackSection({
  title,
  feedback,
  color,
}: {
  title: string;
  feedback: Rating[];
  color: 'green' | 'red';
}) {
  const colorClasses = {
    green: 'border-green-200 bg-green-50',
    red: 'border-red-200 bg-red-50',
  };

  const headerColorClasses = {
    green: 'text-green-700',
    red: 'text-red-700',
  };

  return (
    <div className={`rounded-lg border-2 p-4 ${colorClasses[color]}`}>
      <h3 className={`mb-4 text-lg font-semibold ${headerColorClasses[color]}`}>
        {title} ({feedback.length})
      </h3>

      {feedback.length === 0 ? (
        <div className="py-4 text-center text-gray-500">
          No {title.toLowerCase()} yet
        </div>
      ) : (
        <div className="max-h-96 space-y-3 overflow-y-auto">
          {feedback.map((item) => (
            <FeedbackItem key={item.id} feedback={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackItem({ feedback }: { feedback: Rating }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span
            className={`h-3 w-3 rounded-full ${feedback.wasHelpful ? 'bg-green-500' : 'bg-red-500'}`}
          ></span>
          <span className="text-sm font-medium">
            {feedback.wasHelpful ? '👍 Helpful' : '👎 Not Helpful'}
          </span>
        </div>
        {feedback.createdAt && (
          <span className="text-xs text-gray-500">
            {new Date(feedback.createdAt).toLocaleDateString('en-US', {
              month: '2-digit',
              day: '2-digit',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      {feedback.extraComment && (
        <div className="rounded-sm bg-gray-50 p-2 text-sm text-gray-700">
          {feedback.extraComment}
        </div>
      )}
    </div>
  );
}
