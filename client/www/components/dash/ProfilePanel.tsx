import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import {
  BuildingOfficeIcon,
  ChevronDownIcon,
  Cog6ToothIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { Button, cn, Tooltip, TooltipContent, TooltipTrigger } from '../ui';
import { useFetchedDash } from './MainDashLayout';
import Link from 'next/link';
import { useReadyRouter } from '../clientOnlyPage';
import { CreateOrgModal } from './org-management/CreateOrgModal';

export const ProfilePanel = () => {
  const dashResponse = useFetchedDash();
  const router = useReadyRouter();

  const email = dashResponse.data.user.email;

  const displayName =
    dashResponse.data.workspace.type === 'personal'
      ? email
      : dashResponse.data.workspace.org.title;

  const displayIcon =
    dashResponse.data.workspace.type === 'personal' ? (
      <UserIcon opacity={'40%'} width={16} />
    ) : (
      <BuildingOfficeIcon opacity={'40%'} width={16} />
    );

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton>
            <button
              className={clsx(
                'flex gap-9 items-center justify-between basis-[35%] truncate text-sm rounded-sm border border-gray-300 py-1',
                'px-2 text-sm/6',
                'focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-white/25',
              )}
            >
              <div className="flex items-center gap-2">
                {displayIcon}
                <div className="">{displayName}</div>
              </div>
              <ChevronDownIcon width={15} />
            </button>
          </PopoverButton>
          <PopoverPanel className="absolute shadow bg-white top-[calc(100%+5px)] left-2 z-50 border border-gray-300 rounded-sm min-w-[300px]">
            <div
              className={cn(
                'hover:bg-gray-100 flex items-center gap-2 justify-between text-left w-full',
                dashResponse.data.currentWorkspaceId === 'personal'
                  ? 'border-l-4 border-l-[#606AF4]'
                  : 'border-l-4',
              )}
            >
              <button
                onClick={() => {
                  dashResponse.setWorkspace('personal');
                  router.push('/dash/', undefined, { shallow: true });
                  close();
                }}
                className="py-2 text-left grow px-2"
              >
                <div className="flex gap-2 text-sm font-[500] items-center">
                  <UserIcon className="w-4 h-4 ml-1" />
                  {email}
                </div>
              </button>
              <Tooltip>
                <TooltipTrigger onClick={() => {}}>
                  <Link href="/dash/user-settings" onClick={() => close()}>
                    <button className="p-3 hover:bg-gray-200 transition-colors">
                      <Cog6ToothIcon height={16} width={16} />
                    </button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">User Settings</TooltipContent>
              </Tooltip>
            </div>
            {dashResponse.data.orgs?.map((org) => (
              <div
                className={cn(
                  'hover:bg-gray-100 flex items-center gap-2 justify-between text-left w-full',
                  dashResponse.data.currentWorkspaceId === org.id
                    ? 'border-l-4 border-l-[#606AF4]'
                    : 'border-l-4',
                )}
                key={org.id}
              >
                <button
                  onClick={() => {
                    dashResponse.setWorkspace(org.id);
                    router.push('/dash/', undefined, { shallow: true });
                    close();
                  }}
                  className="py-2 text-left grow px-2"
                >
                  <div className="flex gap-2 text-sm items-center">
                    <BuildingOfficeIcon className="w-4 h-4 ml-1" />
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
                        <button className="p-3 hover:bg-gray-200 transition-colors">
                          <Cog6ToothIcon height={16} width={16} />
                        </button>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      Organization Settings
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
            <div className="pt-2">
              <CreateOrgModal />
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
};
