import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { workspaceQuery } from '@/lib/dashRoute';
import { useFetchedDash } from './MainDashLayout';

export const BackToAppsButton = () => {
  const dash = useFetchedDash();
  const element = document.getElementById('left-top-bar')!;
  if (!element) {
    return null;
  }
  const href = {
    pathname: '/dash',
    query: workspaceQuery(dash.data.currentWorkspaceId),
  };
  return createPortal(
    <Link
      className="ml-4 flex items-center gap-2 rounded-xs p-1 px-2 text-sm opacity-70 transition-colors hover:bg-gray-200/50 dark:hover:bg-neutral-700/60"
      href={href}
    >
      <ArrowUturnLeftIcon width={12} />
      Back to Apps
    </Link>,
    element,
  );
};
