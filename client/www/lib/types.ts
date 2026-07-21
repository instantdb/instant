import { InstantIssue } from '@instantdb/core';

export type AppStatus = 'active' | 'read-only' | 'disabled';

export type InstantApp = {
  id: string;
  pro: boolean;
  title: string;
  created_at: string;
  admin_token: string;
  status?: AppStatus;
  rules: object | null;
  rules_version: number | null;
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
  magic_code_expiry_minutes: number | null;
  org: { id: string; title: string } | null;
  webhooks: InstantWebhook[];
};

export type InstantWebhookAction = 'create' | 'update' | 'delete';
export type InstantWebhookStatus = 'active' | 'disabled';

export type InstantWebhook = {
  id: string;
  sink: { url: string };
  namespaces: string[] | null;
  actions: InstantWebhookAction[];
  status: InstantWebhookStatus;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type InstantWebhookEventStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'error'
  | 'failed';

export type InstantWebhookAttempt = {
  'attempt-at': string | null;
  'duration-ms': number | null;
  'success?': boolean | null;
  'status-code': number | null;
  'response-text': string | null;
  'error-type': string | null;
  'error-message': string | null;
};

export type InstantWebhookEvent = {
  isn: string;
  status: InstantWebhookEventStatus;
  attempts: InstantWebhookAttempt[] | null;
  next_attempt_after: string | null;
  created_at: string;
  updated_at: string;
};

export type InstantWebhookEventsPage = {
  events: InstantWebhookEvent[];
  pageInfo: {
    endCursor: string | null;
    hasNextPage: boolean;
  };
};

export type InstantWebhookPayloadAction = 'create' | 'update' | 'delete';

export type InstantWebhookPayloadRecord = {
  namespace: string;
  id: string;
  action: InstantWebhookPayloadAction;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  idempotencyKey: string;
};

export type InstantWebhookPayload = {
  data: InstantWebhookPayloadRecord[] | null;
  idempotencyKey: string;
};

export type InstantMember = {
  id: string;
  email: string;
  role: 'admin' | 'collaborator';
};

type InstantMemberInvite = {
  id: string;
  type: 'app' | 'org';
  foreign_key: string;
  title: string;
  invitee_role: 'admin' | 'collaborator' | 'owner';
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

export type OrgSummary = {
  id: string;
  title: string;
  created_at: string;
  role: 'owner' | 'admin' | 'collaborator' | 'app-member';
  paid: boolean;
};

export type DashResponse = {
  apps: InstantApp[];
  invites?: InstantMemberInvite[];
  user: {
    email: string;
    id: string;
  };
  orgs?: OrgSummary[];
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
  discovery_endpoint?: string;
  redirect_to?: string;
  meta?: any;
  use_shared_credentials?: boolean;
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
  metadata?: any;
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
