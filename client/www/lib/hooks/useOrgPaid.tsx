import { useFetchedDash } from '@/components/dash/MainDashLayout';
import useSWR from 'swr';
import { localStorageProvider } from '../swrCache';
import config from '../config';
import { useContext } from 'react';
import { TokenContext } from '../contexts';

/* returns true if the current user is in a PAID ORG (not personal)
 * defaults to false if it's not loaded
 */
export const useOrgPaid = () => {
  const dash = useFetchedDash();
  const token = useContext(TokenContext);

  const result = useSWR(
    `${dash.data.currentWorkspaceId}-is-paid`,
    async () => {
      if (dash.data.currentWorkspaceId === 'personal') {
        return false;
      }
      const response = await fetch(
        `${config.apiURI}/dash/orgs/${dash.data.currentWorkspaceId}/billing`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!response.ok) {
        throw new Error('Failed to fetch billing information');
      }
      const data = await response.json();
      return data['subscription-name'] !== 'Free';
    },
    {
      provider: localStorageProvider,
    },
  );

  return result.data || false;
};
