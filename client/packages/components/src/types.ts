export type RelationshipKinds =
  | `many-many`
  | 'one-one'
  | 'one-many'
  | 'many-one';

export const relationshipConstraints: Record<
  RelationshipKinds,
  { cardinality: 'one' | 'many'; 'unique?': boolean }
> = {
  /**
   * users has_many tags
   * tags has_many users
   */
  'many-many': {
    cardinality: 'many',
    'unique?': false,
  },
  /**
   * users has_one profile
   * profiles has_one owner
   */
  'one-one': {
    cardinality: 'one',
    'unique?': true,
  },
  /**
   *  users has_many posts
   *  posts has_one author
   *  [?users :users/posts ?posts]
   *          <--------------->  unique!
   */
  'many-one': {
    cardinality: 'many',
    'unique?': true,
  },

  /**
   *  posts has_one owner
   *  users has_many owned_posts
   *  [?posts :posts/user ?users]
   *   <--------------->  unique!
   */
  'one-many': {
    cardinality: 'one',
    'unique?': false,
  },
};

export const relationshipConstraintsInverse: Record<string, RelationshipKinds> =
  Object.fromEntries(
    Object.entries(relationshipConstraints).map(([k, v]) => [
      `${v.cardinality}-${v['unique?']}`,
      k as RelationshipKinds,
    ]),
  );
// COPIED FROM www/lib/types!!!!!!!!!!! LOOK OUT

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
  org: { id: string; title: string } | null;
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

export type HasDefault<T> = {
  user: T | undefined;
  parsed: T;
};

export type WithOptional<O extends object> = Expand<
  {
    [K in keyof O as O[K] extends HasDefault<any> ? never : K]: O[K];
  } & {
    [K in keyof O as O[K] extends HasDefault<any>
      ? K
      : never]?: O[K] extends HasDefault<infer B> ? B : never;
  }
>;

export type BuiltIn = Date | Function | Error | RegExp;

export type Primitive = string | number | boolean | symbol | null | undefined;

export type Expand<T> = T extends BuiltIn | Primitive
  ? T
  : T extends object
    ? T extends infer O
      ? { [K in keyof O]: Expand<O[K]> }
      : never
    : T;

export type WithDefaults<O extends Object> = Expand<{
  [K in keyof O]: O[K] extends HasDefault<infer B> ? B : O[K];
}>;
