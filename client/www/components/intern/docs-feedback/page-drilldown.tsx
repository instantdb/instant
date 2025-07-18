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
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to Problem Pages
            </button>
          )}
        </div>
        <div className="animate-pulse">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-24 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to Problem Pages
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
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Page Feedback</h2>
          <p className="text-sm text-gray-600 mt-1" title={pageId}>
            {pageId}
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Back to Problem Pages
          </button>
        )}
      </div>

      {totalFeedback === 0 ? (
        <div className="text-gray-500 text-center py-8">
          No feedback found for this page
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="text-2xl font-bold text-blue-700">
                {totalFeedback}
              </div>
              <div className="text-sm text-blue-600">Total Feedback</div>
            </div>
            <div
              className={`p-4 rounded-lg border ${satisfactionRate >= 70 ? 'bg-green-50 border-green-200' : satisfactionRate >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}
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
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="text-2xl font-bold text-gray-700">
                {groupedFeedback.helpful.length}/
                {groupedFeedback.unhelpful.length}
              </div>
              <div className="text-sm text-gray-600">Helpful/Unhelpful</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    <div className={`border-2 rounded-lg p-4 ${colorClasses[color]}`}>
      <h3 className={`font-semibold text-lg mb-4 ${headerColorClasses[color]}`}>
        {title} ({feedback.length})
      </h3>

      {feedback.length === 0 ? (
        <div className="text-gray-500 text-center py-4">
          No {title.toLowerCase()} yet
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
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
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${feedback.wasHelpful ? 'bg-green-500' : 'bg-red-500'}`}
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
        <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
          {feedback.extraComment}
        </div>
      )}
    </div>
  );
}
