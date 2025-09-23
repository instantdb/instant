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
    <div className="py-2 dark:text-white dark:bg-neutral-800 md:px-4 px-2 flex-col flex-wrap md:flex-row flex gap-2 border-b justify-between border-b-gray-300 dark:border-b-neutral-700">
      <div className="flex justify-between flex-row md:justify-start gap-2 items-center">
        <ProfilePanel />
        <div id="left-top-bar"></div>
      </div>
      <div className="flex gap-6 justify-end md:justify-start items-center">
        {hasInvites && (
          <Link className="ml-3" href={'/dash/user-settings?tab=invites'}>
            <div className="text-sm animate-bounce flex gap-2">
              <EnvelopeIcon width={14} />
              Pending Invites ({(dash.data.invites || []).length})
            </div>
          </Link>
        )}
        <Link
          className="flex hover:underline opacity-50 gap-1 items-center text-sm"
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
