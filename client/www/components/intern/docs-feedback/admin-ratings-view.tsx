'use client';

import { useState, useEffect } from 'react';
import { Rating } from '@/lib/intern/docs-feedback/analytics';
import db from '@/lib/intern/docs-feedback/db';

interface AdminRatingsViewProps {
  onBack: () => void;
}

const ITEMS_PER_PAGE = 50;

export function AdminRatingsView({ onBack }: AdminRatingsViewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRatings, setSelectedRatings] = useState<Set<string>>(
    new Set(),
  );
  const [showArchived, setShowArchived] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch all ratings
  const { data, isLoading, error } = db.useQuery({
    ratings: {
      $: {
        order: { serverCreatedAt: 'desc' },
      },
    },
  });

  const ratings = data?.ratings || [];

  // Filter based on archive status
  const filteredRatings = ratings.filter((rating) => {
    const isArchived = rating.isArchived === true;
    return showArchived ? isArchived : !isArchived;
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredRatings.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRatings = filteredRatings.slice(startIndex, endIndex);

  // Reset page when switching between archived/active
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRatings(new Set());
  }, [showArchived]);

  const handleSelectAll = () => {
    if (selectedRatings.size === paginatedRatings.length) {
      setSelectedRatings(new Set());
    } else {
      setSelectedRatings(new Set(paginatedRatings.map((r) => r.id)));
    }
  };

  const handleSelectRating = (ratingId: string) => {
    const newSelected = new Set(selectedRatings);
    if (newSelected.has(ratingId)) {
      newSelected.delete(ratingId);
    } else {
      newSelected.add(ratingId);
    }
    setSelectedRatings(newSelected);
  };

  const toggleRowExpansion = (ratingId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(ratingId)) {
      newExpanded.delete(ratingId);
    } else {
      newExpanded.add(ratingId);
    }
    setExpandedRows(newExpanded);
  };

  const handleArchiveSelected = async () => {
    if (selectedRatings.size === 0) return;

    setIsUpdating(true);
    try {
      const updates = Array.from(selectedRatings).map((id) => ({
        id,
        isArchived: !showArchived,
      }));

      await db.transact(
        updates.map((update) =>
          db.tx.ratings[update.id].update({ isArchived: update.isArchived }),
        ),
      );

      setSelectedRatings(new Set());
    } catch (error) {
      console.error('Failed to update ratings:', error);
    } finally {
      setIsUpdating(false);
    }
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
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Admin View</h2>
        <div className="animate-pulse">
          <div className="bg-gray-200 h-96 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Admin View</h2>
        <div className="text-red-600">
          Error loading ratings: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Admin View</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage all feedback ratings
          </p>
        </div>
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Back to Overview
        </button>
      </div>

      {/* Archive toggle and action buttons */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowArchived(false)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                !showArchived
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Active ({ratings.filter((r) => !r.isArchived).length})
            </button>
            <button
              onClick={() => setShowArchived(true)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                showArchived
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Archived ({ratings.filter((r) => r.isArchived === true).length})
            </button>
          </div>
        </div>

        {selectedRatings.size > 0 && (
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">
              {selectedRatings.size} selected
            </span>
            <button
              onClick={handleArchiveSelected}
              disabled={isUpdating}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                isUpdating
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : showArchived
                    ? 'bg-green-600 text-white hover:bg-green-700'
                    : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {isUpdating
                ? 'Updating...'
                : showArchived
                  ? 'Unarchive Selected'
                  : 'Archive Selected'}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 w-12">
                <input
                  type="checkbox"
                  checked={
                    paginatedRatings.length > 0 &&
                    selectedRatings.size === paginatedRatings.length
                  }
                  onChange={handleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 w-44">
                Date
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 w-64">
                Page
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 w-36">
                Rating
              </th>
              <th className="text-left py-3 px-4 font-medium text-gray-900 max-w-xs">
                Comment
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedRatings.map((rating) => (
              <tr
                key={rating.id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="py-3 px-4">
                  <input
                    type="checkbox"
                    checked={selectedRatings.has(rating.id)}
                    onChange={() => handleSelectRating(rating.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="py-3 px-4">
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    {formatDate(rating.createdAt)}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div
                    className="text-sm font-medium text-gray-900 truncate"
                    title={rating.pageId}
                  >
                    {rating.pageId}
                  </div>
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rating.wasHelpful
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {rating.wasHelpful ? '👍 Helpful' : '👎 Not Helpful'}
                  </span>
                </td>
                <td className="py-3 px-4">
                  {rating.extraComment ? (
                    <div className="text-sm text-gray-700 max-w-xs">
                      <div
                        className={
                          expandedRows.has(rating.id)
                            ? 'whitespace-pre-wrap break-words'
                            : 'line-clamp-2'
                        }
                      >
                        {rating.extraComment}
                      </div>
                      {rating.extraComment.length > 100 && (
                        <button
                          onClick={() => toggleRowExpansion(rating.id)}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium mt-1"
                        >
                          {expandedRows.has(rating.id)
                            ? 'Show less'
                            : 'Show more'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-600">
            Showing {startIndex + 1} to{' '}
            {Math.min(endIndex, filteredRatings.length)} of{' '}
            {filteredRatings.length} ratings
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                currentPage === 1
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`px-3 py-1 text-sm font-medium rounded-md ${
                currentPage === totalPages
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
