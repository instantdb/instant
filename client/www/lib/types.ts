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

export type InstantIndexingJob = {
  id: string;
  app_id: string;
  attr_id: string;
  job_type: 'remove-data-type' | 'check-data-type' | string;
  job_status:
    | 'completed'
    | 'waiting'
    | 'processing'
    | 'canceled'
    | 'errored'
    | string;
  job_stage: 'string';
  work_estimate: number | null | undefined;
  work_completed: number | null | undefined;
  error:
    | 'invalid-triple-error'
    | 'invalid-attr-state-error'
    | 'unexpected-error'
    | string
    | null
    | undefined;
  checked_data_type: CheckedDataType | null | undefined;
  created_at: string;
  updated_at: string;
  done_at: string;
  invalid_triples_sample:
    | { entity_id: string; value: any }[]
    | null
    | undefined;
};

export type DashResponse = {
  apps?: InstantApp[];
  invites?: InstantMemberInvite[];
  user: {
    email: string;
    id: string;
  };
  flags: {
    storage_enabled_apps?: string[];
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
  'primary?'?: boolean | undefined;
  cardinality: 'one' | 'many';
  'value-type': 'ref' | 'blob';
  'inferred-types'?: Array<'string' | 'number' | 'boolean' | 'json'>;
  catalog?: 'user' | 'system';
  'checked-data-type'?: CheckedDataType;
}

export interface SchemaNamespace {
  id: string;
  name: string;
  attrs: SchemaAttr[];
}

export interface SchemaAttr {
  id: string;
  isForward: boolean;
  namespace: string;
  name: string;
  type: 'ref' | 'blob';
  isIndex: boolean;
  isUniq: boolean;
  isPrimary?: boolean | undefined;
  cardinality: 'one' | 'many';
  linkConfig: {
    forward: { id: string; namespace: string; attr: string };
    reverse: { id: string; namespace: string; attr: string } | undefined;
  };
  inferredTypes?: Array<'string' | 'number' | 'boolean' | 'json'>;
  catalog?: 'user' | 'system';
  checkedDataType?: CheckedDataType;
}

export type InstantError = {
  body:
    | { type: 'param-missing'; message: string; hint: { in: string[] } }
    | { type: 'param-malformed'; message: string; hint: { in: string[] } }
    | {
        type: 'record-not-found';
        message: string;
        hint: { 'record-type': string };
      }
    | {
        type: 'record-not-unique';
        message: string;
        hint: { 'record-type': string };
      }
    | {
        type: 'validation-failed';
        message: string;
        hint: { 'data-type': 'string'; errors: any[] };
      }
    | {
        type: 'record-expired';
        message: string;
        hint: { 'record-type': string };
      }
    | { type: undefined; [k: string]: any }
    | undefined;
  status: number;
};
