'use client';

import { useState } from 'react';
import {
  usePageMetrics,
  PageMetrics,
} from '@/lib/intern/docs-feedback/analytics';

type SortField =
  | 'pageId'
  | 'satisfactionRate'
  | 'totalFeedback'
  | 'helpfulCount'
  | 'unhelpfulCount';
type SortDirection = 'asc' | 'desc';

interface ProblemPagesProps {
  onPageClick?: (pageId: string) => void;
}

export function ProblemPages({ onPageClick }: ProblemPagesProps) {
  const { pageMetrics, isLoading, error } = usePageMetrics();
  const [sortField, setSortField] = useState<SortField>('satisfactionRate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedPageMetrics = [...pageMetrics].sort((a, b) => {
    let aValue: string | number;
    let bValue: string | number;

    switch (sortField) {
      case 'pageId':
        aValue = a.pageId;
        bValue = b.pageId;
        break;
      case 'satisfactionRate':
        aValue = a.satisfactionRate;
        bValue = b.satisfactionRate;
        break;
      case 'totalFeedback':
        aValue = a.totalFeedback;
        bValue = b.totalFeedback;
        break;
      case 'helpfulCount':
        aValue = a.helpfulCount;
        bValue = b.helpfulCount;
        break;
      case 'unhelpfulCount':
        aValue = a.unhelpfulCount;
        bValue = b.unhelpfulCount;
        break;
      default:
        return 0;
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortDirection === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    } else {
      return sortDirection === 'asc'
        ? (aValue as number) - (bValue as number)
        : (bValue as number) - (aValue as number);
    }
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Problem Pages
        </h2>
        <div className="animate-pulse">
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-gray-200 h-16 rounded"></div>
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
          Problem Pages
        </h2>
        <div className="text-red-600">
          Error loading page metrics: {error.message}
        </div>
      </div>
    );
  }

  if (!pageMetrics.length) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          Problem Pages
        </h2>
        <div className="text-gray-500 text-center py-8">
          No feedback data available yet
        </div>
      </div>
    );
  }

  // Separate pages into categories
  const needsAttentionPages = pageMetrics
    .filter((page) => page.satisfactionRate < 70 && page.totalFeedback >= 3)
    .slice(0, 5);

  const bestPages = pageMetrics
    .filter((page) => page.satisfactionRate >= 80 && page.totalFeedback >= 3)
    .sort((a, b) => b.satisfactionRate - a.satisfactionRate)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Side by side sections */}
      {(needsAttentionPages.length > 0 || bestPages.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Needs Attention Section */}
          {needsAttentionPages.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-3"></div>
                  <h3 className="text-lg font-semibold text-red-800">
                    Pages Needing Attention
                  </h3>
                  <span className="text-sm text-red-700 ml-2">
                    ({needsAttentionPages.length})
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {needsAttentionPages.map((page) => (
                  <PageCard
                    key={page.pageId}
                    page={page}
                    onClick={onPageClick}
                    variant="warning"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Best Performing Section */}
          {bestPages.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <h3 className="text-lg font-semibold text-green-800">
                    Best Performing Pages
                  </h3>
                  <span className="text-sm text-green-700 ml-2">
                    ({bestPages.length})
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {bestPages.map((page) => (
                  <PageCard
                    key={page.pageId}
                    page={page}
                    onClick={onPageClick}
                    variant="success"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Pages Table */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">All Pages</h2>
        <div className="text-sm text-gray-600 mb-4">
          Pages ranked by priority (low satisfaction + high volume)
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <SortableHeader
                  field="pageId"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Page ID
                </SortableHeader>
                <SortableHeader
                  field="satisfactionRate"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Satisfaction Rate
                </SortableHeader>
                <SortableHeader
                  field="totalFeedback"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Total Feedback
                </SortableHeader>
                <SortableHeader
                  field="helpfulCount"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Helpful
                </SortableHeader>
                <SortableHeader
                  field="unhelpfulCount"
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                >
                  Unhelpful
                </SortableHeader>
              </tr>
            </thead>
            <tbody>
              {sortedPageMetrics.map((page) => (
                <PageRow key={page.pageId} page={page} onClick={onPageClick} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PageRow({
  page,
  onClick,
}: {
  page: PageMetrics;
  onClick?: (pageId: string) => void;
}) {
  const isClickable = !!onClick;

  const getSatisfactionColor = (rate: number) => {
    if (rate < 50) return 'text-red-600';
    if (rate < 70) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <tr
      className={`border-b border-gray-100 ${isClickable ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
      onClick={() => onClick?.(page.pageId)}
    >
      <td className="py-3 px-4">
        <div
          className="font-medium text-gray-900 truncate max-w-xs"
          title={page.pageId}
        >
          {page.pageId}
        </div>
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center space-x-2">
          <span
            className={`font-medium ${getSatisfactionColor(page.satisfactionRate)}`}
          >
            {page.satisfactionRate.toFixed(1)}%
          </span>
          {page.commentsCount > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {page.commentsCount} 💬
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <span className="text-gray-900 font-medium">{page.totalFeedback}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-green-600">{page.helpfulCount}</span>
      </td>
      <td className="py-3 px-4">
        <span className="text-red-600">{page.unhelpfulCount}</span>
      </td>
    </tr>
  );
}

function PageCard({
  page,
  onClick,
  variant,
}: {
  page: PageMetrics;
  onClick?: (pageId: string) => void;
  variant: 'success' | 'warning';
}) {
  const isClickable = !!onClick;

  const variantStyles = {
    success: 'bg-white border-green-300 hover:border-green-400',
    warning: 'bg-white border-red-300 hover:border-red-400',
  };

  const statusStyles = {
    success: 'text-green-600 bg-green-100',
    warning: 'text-red-600 bg-red-100',
  };

  return (
    <div
      className={`border-2 rounded-lg p-3 transition-colors ${variantStyles[variant]} ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={() => onClick?.(page.pageId)}
    >
      <div className="flex justify-between items-start mb-2">
        <div
          className="font-medium text-gray-900 truncate text-sm pr-2"
          title={page.pageId}
        >
          {page.pageId}
        </div>
        <span
          className={`px-2 py-1 rounded-full text-xs font-medium flex-shrink-0 ${statusStyles[variant]}`}
        >
          {page.satisfactionRate.toFixed(1)}%
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
        <div className="text-center">
          <div className="font-medium text-gray-900">{page.totalFeedback}</div>
          <div>Total</div>
        </div>
        <div className="text-center">
          <div className="font-medium text-green-600">{page.helpfulCount}</div>
          <div>Helpful</div>
        </div>
        <div className="text-center">
          <div className="font-medium text-red-600">{page.unhelpfulCount}</div>
          <div>Unhelpful</div>
        </div>
      </div>
    </div>
  );
}

function SortableHeader({
  field,
  sortField,
  sortDirection,
  onSort,
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}) {
  const isActive = sortField === field;

  return (
    <th
      className="text-left py-3 px-4 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{children}</span>
        <div className="flex flex-col">
          <svg
            className={`w-3 h-3 ${isActive && sortDirection === 'asc' ? 'text-gray-900' : 'text-gray-400'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          <svg
            className={`w-3 h-3 -mt-1 ${isActive && sortDirection === 'desc' ? 'text-gray-900' : 'text-gray-400'}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </th>
  );
}
