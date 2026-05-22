import { PlusIcon } from '@heroicons/react/24/solid';
import { Button } from '../ui';
import { ProfilePanel } from './ProfilePanel';
import Link from 'next/link';
import {
  ArrowTopRightOnSquareIcon,
  EnvelopeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useFetchedDash } from './MainDashLayout';
import { DarkModeToggle } from './DarkModeToggle';
import { useReadyRouter } from '../clientOnlyPage';
import { isSelfHosted } from '@/lib/config';
import useLocalStorage from '@/lib/hooks/useLocalStorage';
import { getRole, isMinRole } from '@/pages/dash';

export const TopBar: React.FC<{}> = () => {
  const dash = useFetchedDash();
  const router = useReadyRouter();
  const appId = router.query.app as string | undefined;
  const app = appId ? dash.data.apps.find((a) => a.id === appId) : undefined;
  // Use the workspace from the dash context
  const orgId =
    dash.data?.currentWorkspaceId !== 'personal'
      ? dash.data?.currentWorkspaceId
      : null;
  const docsUrl = isSelfHosted
    ? 'https://instantdb.com/docs'
    : orgId
      ? `/docs?org=${orgId}`
      : '/docs';

  const hasInvites = (dash.data.invites || []).length > 0;

  return (
    <div className="relative flex flex-col gap-2 border-b border-b-gray-300 px-2 py-2 md:px-4 dark:border-b-neutral-700 dark:bg-neutral-800 dark:text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-row items-center gap-2">
          <ProfilePanel />
          <div id="left-top-bar"></div>
        </div>
        <div className="flex items-center gap-4 md:gap-6">
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
    </div>
  );
};
