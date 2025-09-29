import { PlusIcon } from '@heroicons/react/24/solid';
import { Button } from '../ui';
import { ProfilePanel } from './ProfilePanel';
import Link from 'next/link';
import {
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { useFetchedDash } from './MainDashLayout';
import { DarkModeToggle } from './DarkModeToggle';

export const TopBar: React.FC<{}> = () => {
  // get from app query param
  const app = new URLSearchParams(window.location.search).get('org');
  const docsUrl = app ? `/docs?app=${app}` : '/docs';
  const dash = useFetchedDash();

  const hasInvites = (dash.data.invites || []).length > 0;

  return (
    <div className="flex flex-col flex-wrap justify-between gap-2 border-b border-b-gray-300 px-2 py-2 dark:border-b-neutral-700 dark:bg-neutral-800 dark:text-white md:flex-row md:px-4">
      <div className="flex flex-row items-center justify-between gap-2 md:justify-start">
        <ProfilePanel />
        <div id="left-top-bar"></div>
      </div>
      <div className="flex items-center justify-end gap-6 md:justify-start">
        {hasInvites && (
          <Link className="ml-3" href={'/dash/user-settings?tab=invites'}>
            <div className="flex animate-bounce gap-2 text-sm">
              <EnvelopeIcon width={14} />
              Pending Invites ({(dash.data.invites || []).length})
            </div>
          </Link>
        )}
        <Link
          target="_blank"
          className="flex items-center gap-1 text-sm opacity-50 hover:underline"
          href={docsUrl}
        >
          Docs
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </Link>
        <DarkModeToggle />
        <Link href={'/dash/new'}>
          <Button size="mini" variant="primary">
            <PlusIcon height={14} /> New app
          </Button>
        </Link>
      </div>
    </div>
  );
};
