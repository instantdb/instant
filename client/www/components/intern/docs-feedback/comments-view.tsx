'use client';

import { useState, useMemo } from 'react';
import { useAllComments, Rating } from '@/lib/intern/docs-feedback/analytics';

interface CommentsViewProps {
  onBack?: () => void;
}

type FilterType = 'all' | 'helpful' | 'unhelpful';

export function CommentsView({ onBack }: CommentsViewProps) {
  const { comments, isLoading, error } = useAllComments();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredComments = useMemo(() => {
    let filtered = comments;

    // Filter by helpful/unhelpful
    if (filter === 'helpful') {
      filtered = filtered.filter((comment) => comment.wasHelpful);
    } else if (filter === 'unhelpful') {
      filtered = filtered.filter((comment) => !comment.wasHelpful);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (comment) =>
          comment.extraComment
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          comment.pageId.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    return filtered.sort((a, b) => {
      // Sort by pageId, then by helpful status
      const pageCompare = a.pageId.localeCompare(b.pageId);
      if (pageCompare !== 0) return pageCompare;
      return a.wasHelpful === b.wasHelpful ? 0 : a.wasHelpful ? -1 : 1;
    });
  }, [comments, filter, searchTerm]);

  const helpfulCount = comments.filter((c) => c.wasHelpful).length;
  const unhelpfulCount = comments.filter((c) => !c.wasHelpful).length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">All Comments</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-gray-200 h-24 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">All Comments</h2>
          {onBack && (
            <button
              onClick={onBack}
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
        <div className="text-red-600">
          Error loading comments: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">All Comments</h2>
          <p className="text-sm text-gray-600 mt-1">
            {comments.length} total comments from user feedback
          </p>
        </div>
        {onBack && (
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              filter === 'all'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({comments.length})
          </button>
          <button
            onClick={() => setFilter('helpful')}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              filter === 'helpful'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Helpful ({helpfulCount})
          </button>
          <button
            onClick={() => setFilter('unhelpful')}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              filter === 'unhelpful'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Unhelpful ({unhelpfulCount})
          </button>
        </div>

        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search comments or page IDs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Comments List */}
      {filteredComments.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          {searchTerm
            ? 'No comments found matching your search.'
            : 'No comments found.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-h-96 md:max-h-[600px] lg:max-h-[800px] overflow-y-auto">
          {filteredComments.map((comment) => (
            <CommentCard key={comment.id} comment={comment} />
          ))}
        </div>
      )}
    </div>
  );
}

function CommentCard({ comment }: { comment: Rating }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${
              comment.wasHelpful
                ? 'bg-green-100 text-green-600'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {comment.wasHelpful ? '👍' : '👎'}
          </span>
          <div>
            <div className="font-medium text-gray-900 text-sm">
              {comment.pageId}
            </div>
            {comment.createdAt && (
              <span className="text-xs text-gray-500">
                {new Date(comment.createdAt).toLocaleDateString('en-US', {
                  month: '2-digit',
                  day: '2-digit',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium ${
            comment.wasHelpful
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
          }`}
        >
          {comment.wasHelpful ? 'Helpful' : 'Not Helpful'}
        </span>
      </div>

      <div className="text-sm text-gray-700 bg-gray-50 p-3 rounded border-l-4 border-l-gray-300">
        "{comment.extraComment}"
      </div>
    </div>
  );
}
