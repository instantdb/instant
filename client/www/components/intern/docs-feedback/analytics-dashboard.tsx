'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { MetricsOverview } from './metrics-overview';
import { FeedbackPages } from './feedback-pages';
import { PageDrilldown } from './page-drilldown';
import { AdminRatingsSection } from './admin-ratings-section';
import db from '@/lib/intern/docs-feedback/db';

type View = 'overview' | 'drilldown';

export function AnalyticsDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from URL params
  const viewParam = (searchParams?.get('view') as View) || 'overview';
  const pageIdParam = searchParams?.get('pageId') || '';

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

  const handleSignOut = () => {
    db.auth.signOut();
  };

  // Sync URL changes with component state
  useEffect(() => {
    const view = (searchParams?.get('view') as View) || 'overview';
    const pageId = searchParams?.get('pageId') || '';

    setCurrentView(view);
    setSelectedPageId(pageId);
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Instant Docs Feedback Dashboard
            </h1>
            <p className="mt-2 text-gray-600">
              Monitor documentation feedback and identify areas for improvement
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleSignOut}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-hidden"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {currentView === 'overview' && (
            <>
              <MetricsOverview />
              <AdminRatingsSection />
              <FeedbackPages onPageClick={handlePageClick} />
            </>
          )}

          {currentView === 'drilldown' && selectedPageId && (
            <PageDrilldown
              pageId={selectedPageId}
              onBack={handleBackToOverview}
            />
          )}
        </div>
      </div>
    </div>
  );
}
