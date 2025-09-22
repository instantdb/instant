import useSWR from 'swr';
import { APIResponse, optimisticUpdate, useAuthToken } from '../auth';
import config from '../config';
import { InstantApp } from '../types';
import { useDashFetch } from './useDashFetch';
import { Role } from '@/pages/dash';

export type OrgInvite = {
  id: string;
  email: string;
  role: string;
  status: string;
  sent_at: string;
  expired: boolean;
};

type ApiOrgResponse = {
  id: string;
  apps: InstantApp[];
  org: {
    title: string;
    created_at: string;
    updated_at: string;
    role: string;
    paid: boolean;
  };
  members: {
    id: string;
    email: string;
    role: Role;
  }[];
  invites: OrgInvite[];
};

export type OrgWorkspace = {
  type: 'org';
} & ApiOrgResponse;

type Workspace = { type: 'personal'; apps: InstantApp[] } | OrgWorkspace;

const getOrgDetails = async (params: {
  orgId: string;
  token: string;
  onUnauthorized?: () => void;
}): Promise<Workspace> => {
  const res = await fetch(`${config.apiURI}/dash/orgs/${params.orgId}`, {
    headers: {
      authorization: `Bearer ${params.token}`,
      'Content-Type': 'application/json',
    },
  });
  const jsonRes = await res.json();
  if (!res.ok) {
    if (res.status === 401 && params.onUnauthorized) {
      params.onUnauthorized();
    }
    throw new Error(jsonRes?.message);
  }

  return {
    id: jsonRes.org.id,
    apps: jsonRes.apps,
    org: jsonRes.org,
    members: jsonRes.members,
    invites: jsonRes.invites,
    type: 'org',
  };
};

export const useWorkspace = (
  dashResult: ReturnType<typeof useDashFetch>,
  workspaceId: string,
): APIResponse<Workspace> => {
  const token = useAuthToken();

  const result = useSWR(
    workspaceId === 'personal' ? null : workspaceId,
    async () => {
      if (!token) {
        throw new Error('Unauthorized');
      }
      return getOrgDetails({
        orgId: workspaceId,
        token: token,
      });
    },
  );

  const optimistic: APIResponse<Workspace>['optimisticUpdate'] = (
    mutationPromiseToWaitFor,
    optimisticDataProducer,
  ) => {
    return optimisticUpdate(
      result,
      mutationPromiseToWaitFor,
      optimisticDataProducer,
    ) as any;
  };

  if (!token) {
    return {
      optimisticUpdate: optimistic,
      ...result,
      data: undefined,
      error: new Error('Unauthorized'),
      isLoading: false,
    };
  }

  if (workspaceId === 'personal')
    if (dashResult.data) {
      return {
        ...result,
        optimisticUpdate: optimistic,
        data: { apps: dashResult.data.apps, type: 'personal' },
        error: null,
        isLoading: false,
      };
    } else {
      {
        return {
          ...result,
          optimisticUpdate: optimistic,
          data: undefined,
          error: null,
          isLoading: true,
        };
      }
    }
  return {
    ...result,
    optimisticUpdate: optimistic,
  };
};
