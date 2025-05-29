import { InstantIssue } from '@instantdb/core';

export type InstantApp = {
  id: string;
  pro: boolean;
  title: string;
  created_at: string;
  admin_token: string;
  rules: object | null;
  user_app_role: 'owner' | 'admin' | 'collaborator';
  members: InstantMember[] | null;
  invites: InstantAppInvite | null;
  magic_code_email_template: {
    id: string;
    name: string;
    email?: string;
    body: string;
    subject: string;
  } | null;
};

export type InstantMember = {
  id: string;
  email: string;
  role: 'admin' | 'collaborator';
};

export type InstantMemberInvite = {
  id: string;
  app_id: string;
  app_title: string;
  invitee_role: 'admin' | 'collaborator';
  inviter_email: string;
};

export type InstantAppInvite = {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked';
  role: 'admin' | 'collaborator';
  sent_at: string;
  expired: boolean;
}[];

export type InstantIndexingJobInvalidTriple = {
  entity_id: string;
  value: any;
  json_type:
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'object'
    | 'array'
    | 'date';
};
export type InstantIndexingJob = {
  id: string;
  app_id: string;
  attr_id: string;
  job_type:
    | 'remove-data-type'
    | 'check-data-type'
    | 'index'
    | 'remove-index'
    | 'unique'
    | 'remove-unique'
    | 'required'
    | 'remove-required'
    | string;
  job_status: 'completed' | 'waiting' | 'processing' | 'errored' | string;
  job_stage: string;
  work_estimate: number | null | undefined;
  work_completed: number | null | undefined;
  error:
    | 'invalid-triple-error'
    | 'invalid-attr-state-error'
    | 'triple-not-unique-error'
    | 'triple-too-large-error'
    | 'missing-required-error'
    | 'unexpected-error'
    | string
    | null
    | undefined;
  error_data?: {
    count: number;
    'entity-ids': number[];
  };
  checked_data_type: CheckedDataType | null | undefined;
  created_at: string;
  updated_at: string;
  done_at: string;
  invalid_unique_value: any;
  invalid_triples_sample: InstantIndexingJobInvalidTriple[] | null | undefined;
};

export type DashResponse = {
  apps?: InstantApp[];
  invites?: InstantMemberInvite[];
  user: {
    email: string;
    id: string;
  };
};

export type AppError = { body: { message: string } | undefined };

export type AuthorizedOriginService =
  | 'generic'
  | 'vercel'
  | 'netlify'
  | 'custom-scheme';

export type AuthorizedOrigin = {
  id: string;
  service: AuthorizedOriginService;
  params: string[];
};

export type OAuthServiceProvider = {
  id: string;
  provider_name: string;
};

export type OAuthClient = {
  id: string;
  client_name: string;
  client_id?: string;
  provider_id: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  discovery_url?: string;
  meta?: any;
};

export type AppsAuthResponse = {
  authorized_redirect_origins: AuthorizedOrigin[] | null | undefined;
  oauth_service_providers: OAuthServiceProvider[] | null | undefined;
  oauth_clients: OAuthClient[] | null | undefined;
};

export type SubscriptionName = 'Free' | 'Pro';

export type AppsSubscriptionResponse = {
  'subscription-name': SubscriptionName;
  'total-app-bytes': number;
  'total-storage-bytes': number;
};

export type DBIdent =
  | [string, string, string]
  | [string, string, string, boolean];

export type CheckedDataType = 'string' | 'number' | 'boolean' | 'date';

export interface DBAttr {
  id: string;
  'forward-identity': DBIdent;
  'reverse-identity'?: DBIdent;
  'index?': boolean;
  'unique?': boolean;
  'required?'?: boolean;
  'primary?'?: boolean | undefined;
  cardinality: 'one' | 'many';
  'value-type': 'ref' | 'blob';
  'inferred-types'?: Array<'string' | 'number' | 'boolean' | 'json'>;
  catalog?: 'user' | 'system';
  'checked-data-type'?: CheckedDataType;
  'on-delete'?: 'cascade';
  'on-delete-reverse'?: 'cascade';
}

export interface SchemaNamespace {
  id: string;
  name: string;
  attrs: SchemaAttr[];
}

export interface SchemaNamespaceMap {
  id: string;
  name: string;
  attrs: Record<string, SchemaAttr>;
}

export interface SchemaAttr {
  id: string;
  isForward: boolean;
  namespace: string;
  name: string;
  type: 'ref' | 'blob';
  isIndex: boolean;
  isUniq: boolean;
  isRequired?: boolean;
  isPrimary?: boolean | undefined;
  cardinality: 'one' | 'many';
  linkConfig: {
    forward: {
      id: string;
      namespace: string;
      attr: string;
      nsMap: SchemaNamespaceMap;
    };
    reverse:
      | {
          id: string;
          namespace: string;
          attr: string;
          nsMap: SchemaNamespaceMap;
        }
      | undefined;
  };
  inferredTypes?: Array<'string' | 'number' | 'boolean' | 'json'>;
  catalog?: 'user' | 'system';
  checkedDataType?: CheckedDataType;
  sortable: boolean;
  onDelete?: 'cascade';
  onDeleteReverse?: 'cascade';
}

export type OAuthAppClientSecret = {
  id: string;
  clientId: string;
  firstFour: string;
  createdAt: string;
};

export type OAuthAppClient = {
  clientId: string;
  oauthAppId: string;
  clientName: string;
  authorizedRedirectUrls: string[] | null;
  clientSecrets: OAuthAppClientSecret[] | null;
  createdAt: string;
  updatedAt: string;
};

export type OAuthApp = {
  id: string;
  appId: string;
  appName: string;
  grantedScopes: string[];
  isPublic: boolean;
  supportEmail: string | null;
  appHomePage: string | null;
  appPrivacyPolicyLink: string | null;
  appTosLink: string | null;
  appLogo: string | null;
  clients: OAuthAppClient[] | null;
  createdAt: string;
  updatedAt: string;
};

export type OAuthAppsResponse = {
  apps: OAuthApp[];
};

// re-export InstantIssue from the core library
export { type InstantIssue };
