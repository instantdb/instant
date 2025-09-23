import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { createPortal } from 'react-dom';

export const BackToAppsButton = () => {
  const element = document.getElementById('left-top-bar')!;
  if (!element) {
    return null;
  }
  return createPortal(
    <Link
      className="text-sm flex p-1 rounded-sm hover:bg-gray-200/50 px-2 transition-colors dark:hover:bg-neutral-700/60 gap-2 items-center ml-4 opacity-70"
      href="/dash"
    >
      <ArrowUturnLeftIcon width={12} />
      Back to Apps
    </Link>,
    element,
  );
};
