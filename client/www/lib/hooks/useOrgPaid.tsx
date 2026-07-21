import { useFetchedDash } from '@/components/dash/MainDashLayout';
import config from '../config';
import { useAuthedFetch } from '../auth';

/* returns true if the current user is in a PAID ORG (not personal)
 * defaults to false if it's not loaded
 */
export const useOrgPaid = () => {
  const dash = useFetchedDash();
  const isPersonalWorkspace = dash.data.currentWorkspaceId === 'personal';
  const result = useAuthedFetch<{ 'subscription-name': string }>(
    isPersonalWorkspace
      ? ''
      : `${config.apiURI}/dash/orgs/${dash.data.currentWorkspaceId}/billing`,
  );

  return (
    !isPersonalWorkspace &&
    !!result.data &&
    result.data['subscription-name'] !== 'Free'
  );
};
