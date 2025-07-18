'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MetricsOverview } from './metrics-overview';
import { ProblemPages } from './problem-pages';
import { PageDrilldown } from './page-drilldown';
import { CommentsView } from './comments-view';
import db from '@/lib/intern/docs-feedback/db';

type View = 'overview' | 'drilldown' | 'comments';

export function AnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params
  const viewParam = (searchParams.get('view') as View) || 'overview';
  const pageIdParam = searchParams.get('pageId') || '';

  const [currentView, setCurrentView] = useState<View>(viewParam);
  const [selectedPageId, setSelectedPageId] = useState<string>(pageIdParam);

  const updateURL = (view: View, pageId?: string) => {
    const params = new URLSearchParams();
    params.set('view', view);
    if (pageId) {
      params.set('pageId', pageId);
    }
    router.push(`?${params.toString()}`);
  };

  const handlePageClick = (pageId: string) => {
    setSelectedPageId(pageId);
    setCurrentView('drilldown');
    updateURL('drilldown', pageId);
  };

  const handleBackToOverview = () => {
    setCurrentView('overview');
    setSelectedPageId('');
    updateURL('overview');
  };

  const handleViewComments = () => {
    setCurrentView('comments');
    updateURL('comments');
  };

  const handleSignOut = () => {
    db.auth.signOut();
  };

  // Sync URL changes with component state
  useEffect(() => {
    const view = (searchParams.get('view') as View) || 'overview';
    const pageId = searchParams.get('pageId') || '';

    setCurrentView(view);
    setSelectedPageId(pageId);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Instant Docs Feedback Dashboard
            </h1>
            <p className="text-gray-600 mt-2">
              Monitor documentation feedback and identify areas for improvement
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {currentView === 'overview' && (
              <button
                onClick={handleViewComments}
                className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                View All Comments
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {currentView === 'overview' && (
            <>
              <MetricsOverview />
              <ProblemPages onPageClick={handlePageClick} />
            </>
          )}

          {currentView === 'drilldown' && selectedPageId && (
            <PageDrilldown
              pageId={selectedPageId}
              onBack={handleBackToOverview}
            />
          )}

          {currentView === 'comments' && (
            <CommentsView onBack={handleBackToOverview} />
          )}
        </div>
      </div>
    </div>
  );
}
