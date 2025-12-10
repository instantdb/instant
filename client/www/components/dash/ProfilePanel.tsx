import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import {
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import Link from 'next/link';
import { useReadyRouter } from '../clientOnlyPage';
import { UserSettingsIcon } from '../icons/UserSettingsIcon';
import {
  Button,
  cn,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useDialog,
} from '../ui';
import { useFetchedDash } from './MainDashLayout';
import { CreateOrgModal } from './org-management/CreateOrgModal';
import { useFlag } from '@/lib/hooks/useFlag';

export const ProfilePanel = () => {
  const dashResponse = useFetchedDash();
  const router = useReadyRouter();

  const email = dashResponse.data.user.email;

  const useCreateOrg = useFlag('createOrgs');

  const displayName =
    dashResponse.data.workspace.type === 'personal'
      ? email
      : dashResponse.data.workspace.org.title;

  const createOrgDialog = useDialog();

  const displayIcon =
    dashResponse.data.workspace.type === 'personal' ? (
      <UserIcon opacity={'40%'} width={16} />
    ) : (
      <BuildingOfficeIcon opacity={'40%'} width={16} />
    );

  return (
    <>
      <Popover className="relative">
        {({ close }) => (
          <>
            <PopoverButton>
              <div
                className={clsx(
                  'flex basis-[35%] items-center justify-between gap-9 truncate rounded-xs border border-gray-300 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-700/40 dark:data-focus:outline-neutral-400',
                  'px-2 text-sm/6',
                  'focus:outline-hidden data-focus:outline-2 data-focus:-outline-offset-2 data-focus:outline-white/25',
                )}
              >
                <div className="flex items-center gap-2">
                  {displayIcon}
                  <div className="">{displayName}</div>
                </div>
                <ChevronDownIcon width={15} />
              </div>
            </PopoverButton>
            <PopoverPanel className="absolute top-[calc(100%+5px)] left-2 z-50 min-w-[300px] rounded-xs border border-gray-300 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
              <div
                className={cn(
                  'flex w-full items-center justify-between gap-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700',
                  dashResponse.data.currentWorkspaceId === 'personal'
                    ? 'border-l-4 border-l-[#606AF4]'
                    : 'border-l-4 dark:border-l-neutral-700',
                )}
              >
                <button
                  onClick={async () => {
                    dashResponse.setWorkspace('personal');
                    router.push('/dash');
                    close();
                  }}
                  className="grow px-2 py-2 text-left"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <UserIcon className="ml-1 h-4 w-4" />
                    {email}
                  </div>
                </button>
                <Tooltip>
                  <TooltipTrigger onClick={() => {}}>
                    <Link href="/dash/user-settings" onClick={() => close()}>
                      <div className="p-3 transition-colors hover:bg-gray-200 dark:invert dark:hover:bg-neutral-500">
                        <UserSettingsIcon />
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">User Settings</TooltipContent>
                </Tooltip>
              </div>
              {dashResponse.data.orgs?.map((org) => (
                <div
                  className={cn(
                    'flex w-full items-center justify-between gap-2 text-left hover:bg-gray-100 dark:hover:bg-neutral-700',
                    dashResponse.data.currentWorkspaceId === org.id
                      ? 'border-l-4 border-l-[#606AF4]'
                      : 'border-l-4 dark:border-l-neutral-700',
                  )}
                  key={org.id}
                >
                  <button
                    onClick={() => {
                      dashResponse.setWorkspace(org.id);
                      router.push({
                        pathname: '/dash',
                        query: { org: org.id },
                      });
                      close();
                    }}
                    className="grow px-2 py-2 text-left"
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {org.paid ? (
                        <BuildingOffice2Icon className="ml-1 h-4 w-4" />
                      ) : (
                        <BuildingOfficeIcon className="ml-1 h-4 w-4" />
                      )}
                      {org.title}
                    </div>
                  </button>

                  {org.role !== 'app-member' && (
                    <Tooltip>
                      <TooltipTrigger onClick={() => {}}>
                        <Link
                          href="/dash/org"
                          onClick={() => {
                            dashResponse.setWorkspace(org.id);
                            close();
                          }}
                        >
                          <div className="p-3 transition-colors hover:bg-gray-200 dark:hover:bg-neutral-600">
                            <Cog6ToothIcon height={16} width={16} />
                          </div>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        Organization Settings
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}
              {useCreateOrg && (
                <div>
                  <Button
                    onClick={() => {
                      close();
                      createOrgDialog.onOpen();
                    }}
                    variant="secondary"
                    className="w-full px-2 text-left hover:bg-gray-200"
                  >
                    Create Org
                  </Button>
                </div>
              )}
            </PopoverPanel>
          </>
        )}
      </Popover>
      <CreateOrgModal dialog={createOrgDialog} />
    </>
  );
};
