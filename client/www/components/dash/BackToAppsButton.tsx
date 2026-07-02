import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createPortal } from 'react-dom';

export const BackToAppsButton = () => {
  const router = useRouter();
  const org = router.query.org as string | undefined;
  const element = document.getElementById('left-top-bar')!;
  if (!element) {
    return null;
  }
  return createPortal(
    <Link
      className="ml-4 flex items-center gap-2 rounded-xs p-1 px-2 text-sm opacity-70 transition-colors hover:bg-gray-200/50 dark:hover:bg-neutral-700/60"
      href={org ? `/dash?org=${org}` : '/dash'}
    >
      <ArrowUturnLeftIcon width={12} />
      Back to Apps
    </Link>,
    element,
  );
};
