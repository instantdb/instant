'use client';

import { useState } from 'react';
import { useRecentRatings, Rating } from '@/lib/intern/docs-feedback/analytics';

interface RecentRatingsProps {
  onPageClick?: (pageId: string) => void;
}

export function RecentRatings({ onPageClick }: RecentRatingsProps) {
  const { recentRatings, isLoading, error } = useRecentRatings(10);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  const toggleComment = (commentId: string) => {
    setExpandedComments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const formatDate = (date: string | number | undefined) => {
    if (!date) return 'Unknown date';
    const dateObj = typeof date === 'string' ? new Date(date) : new Date(date);
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Ratings (Last 10 Days)
        </h2>
        <div className="animate-pulse">
          <div className="space-y-3">
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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Ratings (Last 10 Days)
        </h2>
        <div className="text-red-600">
          Error loading recent ratings: {error.message}
        </div>
      </div>
    );
  }

  if (!recentRatings.length) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Recent Ratings (Last 10 Days)
        </h2>
        <div className="text-gray-500 text-center py-8">
          No ratings in the last 10 days
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          Recent Ratings (Last 10 Days)
        </h2>
        <span className="text-sm text-gray-600">
          {recentRatings.length} rating{recentRatings.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-4">
        {recentRatings.map((rating) => (
          <RatingCard
            key={rating.id}
            rating={rating}
            isExpanded={expandedComments.has(rating.id)}
            onToggle={() => toggleComment(rating.id)}
            onPageClick={onPageClick}
            formatDate={formatDate}
          />
        ))}
      </div>
    </div>
  );
}

function RatingCard({
  rating,
  isExpanded,
  onToggle,
  onPageClick,
  formatDate,
}: {
  rating: Rating;
  isExpanded: boolean;
  onToggle: () => void;
  onPageClick?: (pageId: string) => void;
  formatDate: (date: string | number | undefined) => string;
}) {
  const isClickable = !!onPageClick;
  const comment = rating.extraComment || '';
  const isLongComment = comment.length > 150;
  const displayComment = isLongComment && !isExpanded
    ? comment.substring(0, 150) + '...'
    : comment;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-1">
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rating.wasHelpful
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
                }`}
            >
              {rating.wasHelpful ? '👍 Helpful' : '👎 Not Helpful'}
            </span>
            <span className="text-sm text-gray-500">
              {formatDate(rating.createdAt)}
            </span>
          </div>
          <div
            className={`text-sm font-medium text-gray-900 ${isClickable ? 'cursor-pointer hover:text-blue-600' : ''}`}
            onClick={() => onPageClick?.(rating.pageId)}
            title={rating.pageId}
          >
            {rating.pageId}
          </div>
        </div>
      </div>

      {comment && (
        <div className="mt-3">
          <p className="text-gray-700 text-sm whitespace-pre-wrap">{displayComment}</p>
          {isLongComment && (
            <button
              onClick={onToggle}
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
