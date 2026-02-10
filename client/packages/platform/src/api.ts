import {
  InstantAPIError,
  version as coreVersion,
  InstantRules,
  InstantSchemaDef,
  EntitiesDef,
  LinksDef,
  RoomsDef,
  InstantDBAttr,
  InstantDBIdent,
  InstantDBCheckedDataType,
  i,
  InstantDBInferredType,
  DataAttrDef,
} from '@instantdb/core';
import version from './version.ts';
import {
  attrFwdLabel,
  attrFwdName,
  attrRevName,
  collectSystemCatalogIdentNames,
  identName,
  InstantAPIPlatformSchema,
  InstantAPISchemaPlanStep,
  InstantAPISchemaPushStep,
  validateSchema,
} from './schema.ts';
import { ProgressPromise } from './ProgressPromise.ts';
import {
  capitalizeFirstLetter,
  deriveClientType,
  rels,
  sortedEntries,
} from './util.ts';
import { exchangeRefreshToken } from './serverOAuth.ts';
import {
  buildAutoRenameSelector,
  convertTxSteps,
  diffSchemas,
  RenameCommand,
} from './migrations.ts';

type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

type AppDataOpts = {
  includePerms?: boolean | null | undefined;
  includeSchema?: boolean | null | undefined;
};

type AppResponseJSON<Opts extends AppDataOpts | undefined> = Simplify<
  {
    id: string;
    title: string;
    created_at: Date;
    org_id: string | null;
    'admin-token'?: string;
  } & (NonNullable<Opts>['includePerms'] extends true
    ? { perms: InstantRules }
    : {}) &
    (NonNullable<Opts>['includeSchema'] extends true
      ? {
          schema: InstantAPIPlatformSchema;
        }
      : {})
>;

type OrgResponseJSON = {
  id: string;
  title: string;
  created_at: Date;
};

export type InstantAPIAppDetails<Opts extends AppDataOpts | undefined> =
  Simplify<
    {
      id: string;
      title: string;
      createdAt: Date;
      orgId: string | null;
    } & (NonNullable<Opts>['includePerms'] extends true
      ? { perms: InstantRules }
      : {}) &
      (NonNullable<Opts>['includeSchema'] extends true
        ? {
            schema: InstantSchemaDef<
              EntitiesDef,
              LinksDef<EntitiesDef>,
              RoomsDef
            >;
          }
        : {})
  >;

export type InstantAPIOrgDetails = {
  id: string;
  title: string;
  createdAt: Date;
};

export type InstantAPIGetAppResponse<Opts extends AppDataOpts> = Simplify<{
  app: InstantAPIAppDetails<Opts>;
}>;

export type InstantAPIListAppsResponse<Opts extends AppDataOpts | undefined> =
  Simplify<{
    apps: InstantAPIAppDetails<Opts>[];
  }>;

export type InstantAPIListOrgsResponse = {
  orgs: InstantAPIOrgDetails[];
};

export type InstantAPIGetAppSchemaResponse = {
  schema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
};

export type InstantAPIGetAppPermsResponse = { perms: InstantRules };

export type InstantAPICreateAppBody = {
  title: string;
  schema?:
    | InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>
    | null
    | undefined;
  perms?: InstantRules | null | undefined;
  orgId?: string | null | undefined;
};

export type InstantAPICreateTemporaryAppBody = {
  title: string;
  schema?:
    | InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>
    | null
    | undefined;
  rules?: {
    code: InstantRules;
  } | null;
};

export type InstantAPICreateTemporaryAppResponse = {
  app: Simplify<
    InstantAPIAppDetails<{ includePerms: false; includeSchema: false }> & {
      adminToken: string;
    }
  >;
  expiresMs: number;
};

export type InstantAPICreateAppResponse = Simplify<{
  app: InstantAPIAppDetails<{ includePerms: true; includeSchema: true }> & {
    adminToken: string;
  };
}>;

export type InstantAPIUpdateAppBody = { title: string };

export type InstantAPIUpdateAppResponse = Simplify<{
  app: InstantAPIAppDetails<{}>;
}>;

export type InstantAPIDeleteAppResponse = Simplify<{
  app: InstantAPIAppDetails<{}>;
}>;

export type InstantAPISchemaPushBody =
  | {
      schema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
      overwrite?: false;
    }
  | {
      schema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
      overwrite: true;
      renames?: RenameCommand[];
    };

export type InstantAPIPushPermsBody = {
  perms: InstantRules;
};

export type InstantAPIPushPermsResponse = {
  perms: InstantRules;
};

export type InstantAPITokenInfoResponse = {
  expiresAt: Date;
  scopes: string;
  tokenType: 'Bearer';
};

export type PlanStep =
  | ['add-attr', InstantDBAttr]
  | ['update-attr', Partial<InstantDBAttr>]
  | ['index', { 'attr-id': string; 'forward-identity': InstantDBIdent }]
  | ['remove-index', { 'attr-id': string; 'forward-identity': InstantDBIdent }]
  | ['unique', { 'attr-id': string; 'forward-identity': InstantDBIdent }]
  | ['remove-unique', { 'attr-id': string; 'forward-identity': InstantDBIdent }]
  | ['required', { 'attr-id': string; 'forward-identity': InstantDBIdent }]
  | [
      'remove-required',
      { 'attr-id': string; 'forward-identity': InstantDBIdent },
    ]
  | [
      'check-data-type',
      {
        'attr-id': string;
        'forward-identity': InstantDBIdent;
        'checked-data-type': InstantDBCheckedDataType;
      },
    ]
  | [
      'remove-data-type',
      { 'attr-id': string; 'forward-identity': InstantDBIdent },
    ]
  | ['delete-attr', string];

type PlanReponseJSON = {
  'new-schema': InstantAPIPlatformSchema;
  'current-schema': InstantAPIPlatformSchema;
  'current-attrs': InstantDBAttr[];
  steps: PlanStep[];
};

// Same as PlanStep, but some background steps get a job-id
type StepWithJobId<T> = T extends ['add-attr', infer P]
  ? ['add-attr', P]
  : T extends ['update-attr', infer P]
    ? ['update-attr', P]
    : T extends [infer K, infer P]
      ? [K, P & { 'job-id': string }]
      : never;

type PushStep = StepWithJobId<PlanStep>;

type IndexingJobJSON = {
  id: string;
  app_id: string;
  group_id: string;
  attr_id: string;
  attr_name: string;
  job_type:
    | 'check-data-type'
    | 'remove-data-type'
    | 'index'
    | 'remove-index'
    | 'unique'
    | 'remove-unique'
    | 'required'
    | 'remove-required';
  job_status: 'waiting' | 'processing' | 'completed' | 'errored';
  work_estimate: number | null;
  work_completed: number | null;
  error:
    | 'invalid-triple-error'
    | 'invalid-attr-state-error'
    | 'triple-not-unique-error'
    | 'triple-too-large-error'
    | 'missing-required-error'
    | 'unexpected-error';
  checked_data_type?: InstantDBCheckedDataType;
  created_at: string;
  updated_at: string;
  done_at: string;
  invalid_unique_value: any;
  invalid_triples_sample: {
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
  }[];
  error_data: any;
};

type SchemaPushResponseJSON = {
  'indexing-jobs'?: {
    'group-id': string;
    jobs: IndexingJobJSON[];
  } | null;
  steps: PushStep[];
};

export type InstantAPIPlanSchemaPushResponse = {
  newSchema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
  currentSchema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
  steps: InstantAPISchemaPlanStep[];
};

type InProgressStepsSummary = {
  friendlyDescription: string;
  totalCount: number;
  inProgressCount: number;
  completedCount: number;
  errorCount: number;
  steps: InstantAPISchemaPushStep[];
  inProgressSteps: InstantAPISchemaPushStep[];
  completedSteps: InstantAPISchemaPushStep[];
  erroredSteps: InstantAPISchemaPushStep[];
};

export type InstantAPISchemaPushResponse = {
  newSchema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
  steps: InstantAPISchemaPushStep[];
  summary: InProgressStepsSummary;
};

async function jsonFetch<T>(
  input: RequestInfo,
  init: RequestInit | undefined,
): Promise<T> {
  const headers = {
    ...(init?.headers || {}),
    'Instant-Platform-Version': version,
    'Instant-Core-Version': coreVersion,
    'X-Instant-Source': 'platform-sdk',
    'X-Instant-Version': version,
  };
  const res = await fetch(input, { ...init, headers });
  if (res.status === 200) {
    const json = await res.json();
    return Promise.resolve(json);
  }
  const body = await res.text();
  try {
    const json = JSON.parse(body);
    return Promise.reject(
      new InstantAPIError({ status: res.status, body: json }),
    );
  } catch (_e) {
    return Promise.reject(
      new InstantAPIError({
        status: res.status,
        body: { type: undefined, message: body },
      }),
    );
  }
}

function attrDefForType(
  type: InstantDBCheckedDataType | InstantDBInferredType | 'any',
) {
  switch (type) {
    case 'string':
      return i.string();
    case 'any':
      return i.any();
    case 'json':
      return i.json();
    case 'boolean':
      return i.boolean();
    case 'date':
      return i.date();
    case 'number':
      return i.number();
    default: {
      const neverType: never = type;
      throw new Error(`Unknown type ${neverType}.`);
    }
  }
}

type APISchemaConversionOpts = {
  disableTypeInference: boolean;
};

function apiSchemaAttrToDataAttrDef(
  attr: InstantDBAttr,
  opts?: APISchemaConversionOpts,
) {
  const derivedType = deriveClientType(attr, opts?.disableTypeInference);
  let i: DataAttrDef<string, boolean, boolean> = attrDefForType(
    derivedType.type,
  );
  if (attr['unique?']) {
    i = i.unique();
  }
  if (attr['index?']) {
    i = i.indexed();
  }
  if (!attr['required?']) {
    i = i.optional();
  }
  i.metadata.derivedType = derivedType;
  return i;
}

function apiSchemaBlobToEntityDef(
  attrs: InstantAPIPlatformSchema['blobs'][string],
  opts?: APISchemaConversionOpts,
) {
  const defs: Record<string, DataAttrDef<string, boolean, boolean>> = {};
  for (const [label, attr] of sortedEntries(attrs)) {
    if (label === 'id') {
      continue;
    }
    defs[label] = apiSchemaAttrToDataAttrDef(attr, opts);
  }
  return i.entity(defs);
}

function apiSchemaAttrToLinkName(attr: InstantDBAttr): string {
  const [, fe, flabel] = attr['forward-identity'];
  return `${fe}${capitalizeFirstLetter(flabel)}`;
}

function apiSchemaAttrToLinkDef(attr: InstantDBAttr) {
  const [, fe, flabel] = attr['forward-identity'];
  const [, re, rlabel] = attr['reverse-identity']!;
  const [fhas, rhas] = rels[`${attr.cardinality}-${attr['unique?']}`];
  return {
    forward: {
      on: fe,
      has: fhas,
      label: flabel,
      required: attr['required?'] || undefined,
      onDelete:
        attr['on-delete'] === 'cascade' ? ('cascade' as 'cascade') : undefined,
    },
    reverse: {
      on: re,
      has: rhas,
      label: rlabel,
      onDelete:
        attr['on-delete-reverse'] === 'cascade'
          ? ('cascade' as 'cascade')
          : undefined,
    },
  };
}

export function apiSchemaToAttrs(
  apiSchema: InstantAPIPlatformSchema,
): InstantDBAttr[] {
  let res: InstantDBAttr[] = [];
  for (const [_, attrs] of sortedEntries(apiSchema.blobs)) {
    Object.values(attrs).forEach((a) => {
      res.push(a);
    });
  }
  for (const [_, a] of sortedEntries(apiSchema.refs)) {
    res.push(a);
  }
  return res;
}

export function apiSchemaToInstantSchemaDef(
  apiSchema: InstantAPIPlatformSchema,
  opts?: { disableTypeInference: boolean },
): InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef> {
  const entities: EntitiesDef = {};
  for (const [etype, attrs] of sortedEntries(apiSchema.blobs)) {
    entities[etype] = apiSchemaBlobToEntityDef(attrs, opts);
  }
  const links: LinksDef<EntitiesDef> = {};
  for (const [_name, attr] of sortedEntries(apiSchema.refs)) {
    const link = apiSchemaAttrToLinkDef(attr);
    const linkName = apiSchemaAttrToLinkName(attr);
    links[linkName] = link;
  }

  return i.schema({ entities, links });
}

function coerceApp<Opts extends AppDataOpts>(
  app: AppResponseJSON<Opts>,
): InstantAPIAppDetails<Opts> {
  const base = {
    id: app.id,
    title: app.title,
    createdAt: new Date(app.created_at),
    orgId: app.org_id,
    ...(app['admin-token'] ? { adminToken: app['admin-token'] } : {}),
  };

  // `in` narrows the union, so it’s safe to read `perms` / `schema`
  // when the property exists. :contentReference[oaicite:0]{index=0}
  const permsPart = (
    'perms' in app ? { perms: app.perms } : {}
  ) as InstantAPIAppDetails<Opts>;

  const schemaPart = (
    'schema' in app
      ? {
          schema: apiSchemaToInstantSchemaDef(
            app.schema as InstantAPIPlatformSchema,
          ),
        }
      : {}
  ) as InstantAPIAppDetails<Opts>;

  return { ...base, ...permsPart, ...schemaPart };
}

function coerceOrg(org: OrgResponseJSON): InstantAPIOrgDetails {
  return {
    id: org.id,
    title: org.title,
    createdAt: new Date(org.created_at),
  };
}

async function getApps<Opts extends AppDataOpts>(
  apiURI: string,
  token: string,
  opts?: Opts,
): Promise<InstantAPIListAppsResponse<Opts>> {
  const url = new URL(`${apiURI}/superadmin/apps`);
  const include = [];
  if (opts?.includePerms) {
    include.push('perms');
  }
  if (opts?.includeSchema) {
    include.push('schema');
  }

  if (include.length) {
    url.searchParams.set('include', include.join(','));
  }
  const resp = await jsonFetch<{ apps: AppResponseJSON<typeof opts>[] }>(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return { apps: resp.apps.map(coerceApp) };
}

async function getOrgs(
  apiURI: string,
  token: string,
): Promise<InstantAPIListOrgsResponse> {
  const url = new URL(`${apiURI}/superadmin/orgs`);

  const resp = await jsonFetch<{ orgs: OrgResponseJSON[] }>(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return { orgs: resp.orgs.map(coerceOrg) };
}

async function getAppsForOrg<Opts extends AppDataOpts>(
  apiURI: string,
  token: string,
  orgId: string,
  opts?: Opts,
): Promise<InstantAPIListAppsResponse<Opts>> {
  const url = new URL(`${apiURI}/superadmin/orgs/${orgId}/apps`);
  const include = [];
  if (opts?.includePerms) {
    include.push('perms');
  }
  if (opts?.includeSchema) {
    include.push('schema');
  }

  if (include.length) {
    url.searchParams.set('include', include.join(','));
  }
  const resp = await jsonFetch<{ apps: AppResponseJSON<typeof opts>[] }>(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  return { apps: resp.apps.map(coerceApp) };
}

async function getAppAPISchema(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIPlatformSchema> {
  const { schema: apiSchema } = await jsonFetch<{
    schema: InstantAPIPlatformSchema;
  }>(`${apiURI}/superadmin/apps/${appId}/schema`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return apiSchema;
}

async function getAppSchema(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIGetAppSchemaResponse> {
  const apiSchema = await getAppAPISchema(apiURI, token, appId);
  return { schema: apiSchemaToInstantSchemaDef(apiSchema) };
}

async function getAppPerms(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIGetAppPermsResponse> {
  return await jsonFetch<InstantAPIGetAppPermsResponse>(
    `${apiURI}/superadmin/apps/${appId}/perms`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

async function getApp<Opts extends AppDataOpts>(
  apiURI: string,
  token: string,
  appId: string,
  opts?: Opts,
): Promise<Simplify<InstantAPIGetAppResponse<Opts>>> {
  let permsPromise: null | Promise<InstantAPIGetAppPermsResponse> = null;
  let schemaPromise: null | Promise<InstantAPIGetAppSchemaResponse> = null;
  if (opts?.includePerms) {
    permsPromise = getAppPerms(apiURI, token, appId);
  }
  if (opts?.includeSchema) {
    schemaPromise = getAppSchema(apiURI, token, appId);
  }

  const { app: apiApp } = await jsonFetch<{ app: AppResponseJSON<{}> }>(
    `${apiURI}/superadmin/apps/${appId}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );

  if (!permsPromise && !schemaPromise) {
    const app = coerceApp(apiApp) as InstantAPIAppDetails<{}>;
    return { app } as Simplify<InstantAPIGetAppResponse<Opts>>;
  }

  const app = {
    ...(coerceApp(apiApp) as unknown as Simplify<InstantAPIGetAppResponse<{}>>),
    ...(permsPromise ? { perms: (await permsPromise).perms } : {}),
    ...(schemaPromise ? { schema: (await schemaPromise).schema } : {}),
  } as unknown as InstantAPIAppDetails<Opts>;

  return {
    app,
  };
}

async function createApp(
  apiURI: string,
  token: string,
  fields: InstantAPICreateAppBody,
): Promise<InstantAPICreateAppResponse> {
  const apiFields: any = fields;
  apiFields.org_id = fields.orgId;

  const { app } = await jsonFetch<{
    app: AppResponseJSON<{ includePerms: true; includeSchema: true }> & {
      'admin-token': string;
    };
  }>(`${apiURI}/superadmin/apps`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(apiFields),
  });
  const withAdminToken = {
    ...coerceApp<{ includePerms: true; includeSchema: true }>(app),
    adminToken: app['admin-token'],
  };
  return {
    app: withAdminToken,
  };
}

async function createTemporaryApp(
  apiURI: string,
  fields: InstantAPICreateTemporaryAppBody,
): Promise<InstantAPICreateTemporaryAppResponse> {
  const response = await jsonFetch<{ app: any; expires_ms: number }>(
    `${apiURI}/dash/apps/ephemeral`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fields),
    },
  );
  const withAdminToken = {
    ...coerceApp<{ includePerms: true; includeSchema: true }>(response.app),
    adminToken: response.app['admin-token'],
  };
  return {
    app: withAdminToken,
    expiresMs: response.expires_ms,
  };
}

async function updateApp(
  apiURI: string,
  token: string,
  appId: string,
  fields: InstantAPIUpdateAppBody,
): Promise<InstantAPIUpdateAppResponse> {
  const { app } = await jsonFetch<{ app: AppResponseJSON<{}> }>(
    `${apiURI}/superadmin/apps/${appId}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(fields),
    },
  );

  return { app: coerceApp(app) };
}

async function deleteApp(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIDeleteAppResponse> {
  const { app } = await jsonFetch<{ app: AppResponseJSON<{}> }>(
    `${apiURI}/superadmin/apps/${appId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
  return { app: coerceApp(app) };
}

function translatePlanStep(
  apiStep: PlanStep,
  currentAttrs: InstantDBAttr[],
): InstantAPISchemaPlanStep {
  const [stepType, stepParams] = apiStep;

  switch (stepType) {
    case 'add-attr': {
      const attr = stepParams;
      const attrName = attrFwdName(attr);
      const friendlyDescription =
        attr['value-type'] === 'blob'
          ? attrFwdLabel(attr) === 'id'
            ? `Create new entity ${attrName}.`
            : `Add attribute ${attrName}.`
          : `Link ${attrName} to ${attrRevName(attr)}.`;
      return { type: 'add-attr', friendlyDescription, attr };
    }
    case 'update-attr': {
      const attr = stepParams as InstantDBAttr;
      return {
        type: 'update-attr',
        friendlyDescription: `Update attribute ${attrFwdName(attr)}.`,
        attr,
      };
    }
    case 'index': {
      return {
        type: 'index',
        friendlyDescription: `Add index to ${identName(stepParams['forward-identity'])}.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'remove-index': {
      return {
        type: 'remove-index',
        friendlyDescription: `Remove index from ${identName(stepParams['forward-identity'])}.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'unique': {
      return {
        type: 'unique',
        friendlyDescription: `Ensure that ${identName(stepParams['forward-identity'])} is unique.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'remove-unique': {
      return {
        type: 'remove-unique',
        friendlyDescription: `Remove uniqueness constarint from ${identName(stepParams['forward-identity'])}.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'required': {
      return {
        type: 'required',
        friendlyDescription: `Make ${identName(stepParams['forward-identity'])} a required attribute.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'remove-required': {
      return {
        type: 'remove-required',
        friendlyDescription: `Allow ${identName(stepParams['forward-identity'])} to be missing or null.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'check-data-type': {
      const forwardIdentity = stepParams['forward-identity'];
      const dataType = stepParams['checked-data-type'];
      return {
        type: 'check-data-type',
        friendlyDescription: `Enforce data type of ${identName(forwardIdentity)} as type ${dataType}.`,
        attrId: stepParams['attr-id'],
        forwardIdentity,
        checkedDataType: dataType,
      };
    }
    case 'remove-data-type': {
      const forwardIdentity = stepParams['forward-identity'];
      return {
        type: 'remove-data-type',
        friendlyDescription: `Stop enforcing data type of ${identName(forwardIdentity)}.`,
        attrId: stepParams['attr-id'],
        forwardIdentity: stepParams['forward-identity'],
      };
    }
    case 'delete-attr': {
      const attrId = stepParams;
      const attr = currentAttrs.find((a) => a.id === attrId);
      const friendlyName = attr ? identName(attr['forward-identity']) : attrId;
      return {
        type: 'delete-attr',
        attrId: stepParams,
        friendlyDescription: `Delete attribute ${friendlyName}.`,
      };
    }
    default: {
      // Get a type error if we ignore a case
      const unknownType: never = stepType;
      throw new Error(`Uknown schema operation ${unknownType}.`);
    }
  }
}

export function translatePlanSteps(
  apiSteps: PlanStep[],
  currentAttrs: InstantDBAttr[],
): InstantAPISchemaPlanStep[] {
  return apiSteps.map((step) => translatePlanStep(step, currentAttrs));
}

type PushObjOf<S extends PushStep> =
  // grab from the union the member whose discriminant matches S[0]
  Extract<InstantAPISchemaPushStep, { type: S[0] }>;

function translatePushStep<S extends PushStep>(
  apiStep: S,
  jobs: IndexingJobJSON[],
  currentAttrs: InstantDBAttr[],
): PushObjOf<S> {
  const [stepType, stepParams] = apiStep;
  if (
    stepType === 'add-attr' ||
    stepType === 'update-attr' ||
    stepType === 'delete-attr'
  ) {
    const planStep = translatePlanStep(apiStep, currentAttrs);
    if (
      planStep.type !== 'add-attr' &&
      planStep.type !== 'update-attr' &&
      planStep.type !== 'delete-attr'
    ) {
      // This is just here for typescript
      throw new Error('Invalid step.');
    }
    return planStep as PushObjOf<S>;
  }
  const jobId = stepParams['job-id'];
  const job = jobs.find((j) => j.id === jobId)!;
  const planStep = translatePlanStep(apiStep, currentAttrs);
  const backgroundJob = formatJob(job);

  if (planStep.type !== backgroundJob.type) {
    throw new Error('Invalid type');
  }

  return { ...planStep, backgroundJob } as PushObjOf<S>;
}

function translatePushSteps(
  apiSteps: PushStep[],
  jobs: IndexingJobJSON[],
  currentAttrs: InstantDBAttr[],
): InstantAPISchemaPushStep[] {
  return apiSteps.map((step) => translatePushStep(step, jobs, currentAttrs));
}

function shouldOverwrite(body: InstantAPISchemaPushBody) {
  if ('renames' in body && !body.overwrite) {
    throw new Error(
      'If you pass in `renames`, you _must_ pass in `overwrite: true`',
    );
  }
  return !!body.overwrite;
}

async function planSchemaPush(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPISchemaPushBody,
): Promise<InstantAPIPlanSchemaPushResponse> {
  const resp = await jsonFetch<PlanReponseJSON>(
    `${apiURI}/superadmin/apps/${appId}/schema/push/plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...body,
        check_types: true,
        supports_background_updates: true,
      }),
    },
  );
  const currentAttrs = resp['current-attrs'];
  return {
    newSchema: apiSchemaToInstantSchemaDef(resp['new-schema']),
    currentSchema: apiSchemaToInstantSchemaDef(resp['current-schema']),
    steps: translatePlanSteps(resp['steps'], currentAttrs),
  };
}

async function planSchemaPushOverwriteInternal(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPISchemaPushBody,
) {
  const apiSchema = await getAppAPISchema(apiURI, token, appId);

  const currentSchema = apiSchemaToInstantSchemaDef(apiSchema, {
    disableTypeInference: true,
  });
  const currentAttrs = apiSchemaToAttrs(apiSchema);

  const systemCatalogIdentNames = collectSystemCatalogIdentNames(currentAttrs);

  const newSchema = body.schema;

  validateSchema(newSchema, systemCatalogIdentNames);

  const renames = ('renames' in body ? body.renames : null) || [];

  const renameSelector = buildAutoRenameSelector(renames);

  const diffResult = await diffSchemas(
    currentSchema,
    newSchema,
    renameSelector,
    systemCatalogIdentNames,
  );

  const txSteps = convertTxSteps(diffResult, currentAttrs);

  return {
    currentSchema,
    currentAttrs,
    txSteps: txSteps,
    steps: translatePlanSteps(txSteps, currentAttrs),
  };
}

async function planSchemaPushOverwrite(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPISchemaPushBody,
): Promise<InstantAPIPlanSchemaPushResponse> {
  const { currentSchema, steps } = await planSchemaPushOverwriteInternal(
    apiURI,
    token,
    appId,
    body,
  );

  return {
    newSchema: body.schema,
    currentSchema: currentSchema,
    steps: steps,
  };
}

function allJobsComplete(jobs: IndexingJobJSON[]): boolean {
  return !!jobs.find(
    (j) => j.job_status === 'completed' || j.job_status === 'errored',
  );
}

function latestJobUpdate(jobs: IndexingJobJSON[]): Date | null {
  const res = jobs.reduce((acc: Date | null, job) => {
    if (job.updated_at) {
      const d = new Date(job.updated_at);
      if (!acc || d > acc) {
        return d;
      }
    }
    return acc;
  }, null);
  return res;
}

async function jobFetchLoop(
  apiURI: string,
  token: string,
  appId: string,
  groupId: string,
  startingJobs: IndexingJobJSON[],
  onFetch: (jobs: IndexingJobJSON[]) => void,
): Promise<IndexingJobJSON[]> {
  let interval = 100;
  let lastJobs = startingJobs;
  let errorCount = 0;

  while (!allJobsComplete(lastJobs)) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    try {
      const nextJobs = (
        await jsonFetch<{ jobs: IndexingJobJSON[] }>(
          `${apiURI}/dash/apps/${appId}/indexing-jobs/group/${groupId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        )
      ).jobs;
      onFetch(nextJobs);
      if (allJobsComplete(nextJobs)) {
        return nextJobs;
      }
      errorCount = 0;
      const lastUpdate = latestJobUpdate(lastJobs);
      const thisUpdate = latestJobUpdate(nextJobs);
      interval =
        thisUpdate === null || (lastUpdate && lastUpdate >= thisUpdate)
          ? Math.min(interval * 2, 10000)
          : 100;
    } catch (e) {
      if (errorCount > 3) {
        throw e;
      } else {
        errorCount++;
        interval = Math.min(interval * 2, 10000);
      }
    }
  }

  return lastJobs;
}

type InstantBackgroundSchemaBaseJob = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'completed' | 'waiting' | 'processing' | 'errored';
  workEstimate: number | null;
  workCompleted: number | null;
  error?:
    | 'invalid-triple-error'
    | 'invalid-attr-state-error'
    | 'triple-not-unique-error'
    | 'triple-too-large-error'
    | 'missing-required-error'
    | 'unexpected-error';
  invalidTriplesSample?: {
    entityId: string;
    value: any;
    jsonType:
      | 'string'
      | 'number'
      | 'boolean'
      | 'null'
      | 'object'
      | 'array'
      | 'date';
  }[];
};

export interface InstantBackgroundSchemaRemoveDataTypeJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-data-type';
}

export interface InstantBackgroundSchemaCheckDataTypeJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'check-data-type';
  checkedDataType: InstantDBCheckedDataType;
}

export interface InstantBackgroundSchemaAddIndexJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'index';
}

export interface InstantBackgroundSchemaRemoveIndexJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-index';
}

export interface InstantBackgroundSchemaAddUniqueJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'unique';
  invalidUniqueValue?: any;
}

export interface InstantBackgroundSchemaRemoveUniqueJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-unique';
}

export interface InstantBackgroundSchemaAddRequiredJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'required';
}

export interface InstantBackgroundSchemaRemoveRequiredJob
  extends InstantBackgroundSchemaBaseJob {
  type: 'remove-required';
}

export type InstantBackgroundSchemaJob =
  | InstantBackgroundSchemaRemoveDataTypeJob
  | InstantBackgroundSchemaCheckDataTypeJob
  | InstantBackgroundSchemaAddIndexJob
  | InstantBackgroundSchemaRemoveIndexJob
  | InstantBackgroundSchemaAddUniqueJob
  | InstantBackgroundSchemaRemoveUniqueJob
  | InstantBackgroundSchemaAddRequiredJob
  | InstantBackgroundSchemaRemoveRequiredJob;

function formatJob(job: IndexingJobJSON): InstantBackgroundSchemaJob {
  const baseJob: InstantBackgroundSchemaBaseJob = {
    id: job.id,
    createdAt: new Date(job.created_at),
    updatedAt: new Date(job.updated_at),
    status: job.job_status,
    workEstimate: job.work_estimate,
    workCompleted: job.work_completed,
    error: job.error,
    invalidTriplesSample: job.invalid_triples_sample?.map((s) => {
      return { entityId: s.entity_id, value: s.value, jsonType: s.json_type };
    }),
  };
  switch (job.job_type) {
    case 'remove-data-type':
    case 'index':
    case 'remove-index':
    case 'required':
    case 'remove-required':
    case 'remove-unique': {
      return { ...baseJob, type: job.job_type };
    }
    case 'check-data-type': {
      return {
        ...baseJob,
        type: job.job_type,
        checkedDataType: job.checked_data_type!,
      };
    }
    case 'unique': {
      return {
        ...baseJob,
        type: job.job_type,
        invalidUniqueValue: job.invalid_unique_value,
      };
    }
    default: {
      const neverType: never = job.job_type;
      throw new Error(`Unknown job type: ${neverType}.`);
    }
  }
}

function stepSummary(
  steps: InstantAPISchemaPushStep[],
): InProgressStepsSummary {
  const inProgress = steps.filter(
    (s) =>
      'backgroundJob' in s &&
      (s.backgroundJob.status === 'processing' ||
        s.backgroundJob.status === 'waiting'),
  );
  const completed = steps.filter(
    (s) => !('backgroundJob' in s) || s.backgroundJob.status === 'completed',
  );
  const errored = steps.filter(
    (s) => 'backgroundJob' in s && s.backgroundJob.status === 'errored',
  );
  return {
    friendlyDescription: inProgress.length
      ? `Completing ${inProgress.length} of ${steps.length} schema operations.`
      : `Finished ${steps.length} schema operation${steps.length === 1 ? '' : 's'}${
          errored.length
            ? `, with ${errored.length} error${errored.length > 1 ? 's' : ''}`
            : '.'
        }`,
    totalCount: steps.length,
    inProgressCount: inProgress.length,
    completedCount: completed.length,
    errorCount: errored.length,
    steps,
    inProgressSteps: inProgress,
    completedSteps: completed,
    erroredSteps: errored,
  };
}

function schemaPush(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPISchemaPushBody,
): ProgressPromise<InProgressStepsSummary, InstantAPISchemaPushResponse> {
  return new ProgressPromise(async (progress, resolve, reject) => {
    try {
      const currentAPISchema = await getAppAPISchema(apiURI, token, appId);
      const currentAttrs = apiSchemaToAttrs(currentAPISchema);

      const resp = await jsonFetch<SchemaPushResponseJSON>(
        `${apiURI}/superadmin/apps/${appId}/schema/push/apply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...body,
            check_types: true,
            supports_background_updates: true,
          }),
        },
      );

      const indexingJobs = resp['indexing-jobs'];

      const jobs = !indexingJobs
        ? []
        : await jobFetchLoop(
            apiURI,
            token,
            appId,
            indexingJobs['group-id'],
            indexingJobs['jobs'],
            (jobs) => {
              progress(
                stepSummary(translatePushSteps(resp.steps, jobs, currentAttrs)),
              );
            },
          );

      const schemaRes = await getAppSchema(apiURI, token, appId);
      resolve({
        newSchema: schemaRes.schema,
        steps: translatePushSteps(resp.steps, jobs, currentAttrs),
        summary: stepSummary(
          translatePushSteps(resp.steps, jobs, currentAttrs),
        ),
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

function schemaPushOverwrite(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPISchemaPushBody,
): ProgressPromise<InProgressStepsSummary, InstantAPISchemaPushResponse> {
  return new ProgressPromise(async (progress, resolve, reject) => {
    try {
      const { currentAttrs, txSteps } = await planSchemaPushOverwriteInternal(
        apiURI,
        token,
        appId,
        body,
      );

      const resp = await jsonFetch<SchemaPushResponseJSON>(
        `${apiURI}/dash/apps/${appId}/schema/steps/apply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            steps: txSteps,
          }),
        },
      );

      const indexingJobs = resp['indexing-jobs'];

      const jobs = !indexingJobs
        ? []
        : await jobFetchLoop(
            apiURI,
            token,
            appId,
            indexingJobs['group-id'],
            indexingJobs['jobs'],
            (jobs) => {
              progress(
                stepSummary(translatePushSteps(resp.steps, jobs, currentAttrs)),
              );
            },
          );

      const schemaRes = await getAppSchema(apiURI, token, appId);
      resolve({
        newSchema: schemaRes.schema,
        steps: translatePushSteps(resp.steps, jobs, currentAttrs),
        summary: stepSummary(
          translatePushSteps(resp.steps, jobs, currentAttrs),
        ),
      });
    } catch (e) {
      reject(e as Error);
    }
  });
}

async function pushPerms(
  apiURI: string,
  token: string,
  appId: string,
  body: InstantAPIPushPermsBody,
): Promise<InstantAPIPushPermsResponse> {
  const result = await jsonFetch<{ rules: { code: InstantRules } }>(
    `${apiURI}/superadmin/apps/${appId}/perms`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code: body.perms }),
    },
  );

  return { perms: result.rules.code };
}

async function tokenInfo(
  apiURI: string,
  token: string,
): Promise<InstantAPITokenInfoResponse> {
  const result = await jsonFetch<{
    expires_in: number;
    scopes: string;
    token_type: 'Bearer';
  }>(`${apiURI}/platform/oauth/token-info?access_token=${token}`, {
    method: 'GET',
  });

  return {
    tokenType: result.token_type,
    scopes: result.scopes,
    expiresAt: new Date(Date.now() + (result.expires_in - 60) * 1000),
  };
}

export type PlatformApiAuth =
  | {
      token: string;
    }
  | {
      accessToken: string;
      refreshToken: string;
      clientId: string;
      clientSecret: string;
      onRefresh?: (tokenInfo: {
        accessToken: string;
        expiresAt: Date;
      }) => Promise<void>;
    };

export type PlatformApiConfig = {
  auth?: PlatformApiAuth;
  apiURI?: string;
};

export class PlatformApiMissingAuthError extends Error {
  constructor() {
    super('PlatformApi was not provided auth.');
  }
}

/**
 * API methods for the Platform API
 *
 * Usage:
 *
 * ```ts
 * import { PlatformApi } from '@instantdb/platform';
 *
 * const api = new PlatformApi({ auth: { token: 'oauth-access-token' } });
 * const { apps } = await api.getApps({
 *   includeSchema: true,
 *   includePerms: true,
 * });
 * ```
 */
export class PlatformApi {
  #auth: PlatformApiAuth | undefined;
  #apiURI: string;

  /**
   * @param config – Runtime configuration.
   * @param config.auth.token – OAuth access-token obtained via the oauth flow
   *   or a personal access token.
   * @throws {Error} When `token` is missing.
   */
  constructor(config?: PlatformApiConfig) {
    this.#auth = config?.auth;
    this.#apiURI = config?.apiURI || 'https://api.instantdb.com';
  }

  token(): string {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    if ('token' in this.#auth) {
      return this.#auth.token;
    }
    return this.#auth.accessToken;
  }

  canRefreshToken(): boolean {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    return (
      'refreshToken' in this.#auth &&
      'clientId' in this.#auth &&
      'clientSecret' in this.#auth &&
      this.#auth.refreshToken != null &&
      this.#auth.clientId != null &&
      this.#auth.clientSecret != null
    );
  }

  async refreshToken(): Promise<null | {
    accessToken: string;
    expiresAt: Date;
  }> {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    if (
      !this.canRefreshToken() ||
      // Checked in canRefreshToken, but this lets
      // typescript refine this.#auth here
      !('clientId' in this.#auth)
    ) {
      return null;
    }
    const token = await exchangeRefreshToken({
      apiURI: this.#apiURI,
      clientId: this.#auth.clientId,
      clientSecret: this.#auth.clientSecret,
      refreshToken: this.#auth.refreshToken,
    });
    this.#auth.accessToken = token.accessToken;
    if (this.#auth.onRefresh) {
      await this.#auth.onRefresh(token);
    }
    return token;
  }

  async withRetry<F extends (...args: any[]) => any>(
    f: F,
    args: Parameters<F>,
  ) {
    let attempt = 0;
    const [apiURI, tokenInArg, ...restArgs] = args;
    let token = tokenInArg;
    while (attempt < 2) {
      try {
        return await f(apiURI, token, ...restArgs);
      } catch (e) {
        if (
          e instanceof InstantAPIError &&
          (e.status === 401 ||
            e.body?.type === 'record-expired' ||
            (e.body?.type === 'record-not-found' &&
              e.body.hint['record-type'].match(/token/i))) &&
          this.canRefreshToken()
        ) {
          const refreshedToken = await this.refreshToken();
          if (refreshedToken) {
            token = refreshedToken.accessToken;
            attempt++;
            continue;
          }
        }
        throw e;
      }
    }
  }

  /**
   * Fetch a single app by its id.
   *
   * ```ts
   * const { app } = await api.getApp('MY_APP_ID', {
   *   includeSchema: true,
   *   includePerms: true,
   * });
   * ```
   *
   * @template Opts – Narrow the shape of the response via the
   *   {@link AppDataOpts} flags.
   * @param appId – UUID of the app.
   * @param opts – `{ includeSchema?: boolean; includePerms?: boolean }`
   * @returns A typed wrapper containing the app, whose shape is expanded
   *   according to `Opts`.
   */
  async getApp<Opts extends AppDataOpts>(
    appId: string,
    opts?: Opts,
  ): Promise<InstantAPIGetAppResponse<Opts>> {
    return this.withRetry(getApp, [this.#apiURI, this.token(), appId, opts]);
  }

  /**
   * List **all apps** owned by the auth owner.
   *
   * ```ts
   * const { apps } = await api.getApps({
   *   includeSchema: true,
   *   includePerms: true,
   * });
   * ```
   *
   * @template Opts – Same as {@link getApp}.
   * @param opts – `{ includeSchema?: boolean; includePerms?: boolean }`
   * @returns An array wrapper; each element’s shape follows `Opts`.
   */
  async getApps<Opts extends AppDataOpts>(
    opts?: Opts,
  ): Promise<InstantAPIListAppsResponse<Opts>> {
    return this.withRetry(getApps, [this.#apiURI, this.token(), opts]);
  }

  /**
   * List **all orgs** that the auth owner is a member of.
   *
   * ```ts
   * const { orgs } = await api.getOrgs();
   * ```
   *
   * @returns An array of orgs
   */
  async getOrgs(): Promise<InstantAPIListOrgsResponse> {
    return this.withRetry(getOrgs, [this.#apiURI, this.token()]);
  }

  /**
   * List **all apps** owned by the auth owner.
   *
   * ```ts
   * const { apps } = await api.getApps({
   *   includeSchema: true,
   *   includePerms: true,
   * });
   * ```
   *
   * @template Opts – Same as {@link getApp}.
   * @param opts – `{ includeSchema?: boolean; includePerms?: boolean }`
   * @returns An array wrapper; each element’s shape follows `Opts`.
   */
  async getAppsForOrg<Opts extends AppDataOpts>(
    orgId: string,
    opts?: Opts,
  ): Promise<InstantAPIListAppsResponse<Opts>> {
    return this.withRetry(getAppsForOrg, [
      this.#apiURI,
      this.token(),
      orgId,
      opts,
    ]);
  }

  /**
   * Gets the schema for an app by its id.
   *
   * ```ts
   * const { schema } = await api.getSchema('MY_APP_ID');
   * ```
   *
   * @param appId -- UUID of the app
   */
  async getSchema(appId: string): Promise<InstantAPIGetAppSchemaResponse> {
    return this.withRetry(getAppSchema, [this.#apiURI, this.token(), appId]);
  }

  /**
   * Gets the permissions for an app by its id.
   *
   * ```ts
   * const { perms } = await api.getPerms('MY_APP_ID');
   * ```
   *
   * @param appId -- UUID of the app
   */
  async getPerms(appId: string): Promise<InstantAPIGetAppPermsResponse> {
    return this.withRetry(getAppPerms, [this.#apiURI, this.token(), appId]);
  }

  /**
   * Create a new app.
   *
   * The app will be placed in the authenticated user's account
   * if no orgId is provided.
   *
   * Optionally set permissions and schema.
   *
   * ```ts
   * const { app } = await api.createApp({
   *   title: 'My new app',
   *   // Optional permissions
   *   perms: { $default: { allow: { $default: 'false' } } },
   *   // Optional schema
   *   schema: i.schema({
   *     entities: { books: i.entity({ title: i.string() }) },
   *   }),
   * });
   * ```
   *
   * @param fields
   * @param fields.title -- Title for app
   * @param fields.schema -- Optional schema for the app
   * @param fields.perms -- Optional permissions for the app
   * @param fields.orgId -- Optional id of the org that the app will be placed in
   */
  async createApp(
    fields: InstantAPICreateAppBody,
  ): Promise<InstantAPICreateAppResponse> {
    return this.withRetry(createApp, [this.#apiURI, this.token(), fields]);
  }

  /**
   * Create a new temporary app.
   *
   * Optionally set permissions and schema.
   *
   * ```ts
   * const { app } = await api.createTemporaryApp({
   *   title: 'My new app',
   *   // Optional permissions
   *   perms: { $default: { allow: { $default: 'false' } } },
   *   // Optional schema
   *   schema: i.schema({
   *     entities: { books: i.entity({ title: i.string() }) },
   *   }),
   * });
   * ```
   *
   * @param fields
   * @param fields.title -- Title for app
   * @param fields.schema -- Optional schema for the app
   * @param fields.perms -- Optional permissions for the app
   */
  async createTemporaryApp(fields: InstantAPICreateTemporaryAppBody) {
    return createTemporaryApp(this.#apiURI, fields);
  }

  /**
   * Update the title of an app by its id.
   *
   * ```ts
   * const { app } = await api.updateApp('MY_APP_ID', {
   *   title: 'New title',
   * });
   * ```
   *
   * @param appId -- UUID of the app
   * @param fields.title -- New title for the app
   */
  async updateApp(
    appId: string,
    fields: InstantAPIUpdateAppBody,
  ): Promise<InstantAPIUpdateAppResponse> {
    return this.withRetry(updateApp, [
      this.#apiURI,
      this.token(),
      appId,
      fields,
    ]);
  }

  /**
   * Delete an app by its id.
   *
   * ```ts
   * const { app } = await api.deleteApp('MY_APP_ID');
   * ```
   *
   * @param appId -- UUID of the app
   */
  async deleteApp(appId: string): Promise<InstantAPIDeleteAppResponse> {
    return this.withRetry(deleteApp, [this.#apiURI, this.token(), appId]);
  }

  /**
   * Dry-run a **schema push** and receive a _plan_ of steps the server would
   * execute.
   *
   * ```ts
   * const { steps } = await api.planSchemaPush(appId, body);
   * ```
   */
  async planSchemaPush(
    appId: string,
    body: InstantAPISchemaPushBody,
  ): Promise<InstantAPIPlanSchemaPushResponse> {
    const useOverwrite = shouldOverwrite(body);
    return this.withRetry(
      useOverwrite ? planSchemaPushOverwrite : planSchemaPush,
      [this.#apiURI, this.token(), appId, body],
    );
  }

  /**
   * Execute a **schema push**. The server returns a long-running job
   * represented as a {@link ProgressPromise}: you can both `await` the final
   * result **or** subscribe to intermediate status updates.
   *
   * ```ts
   * // 1) Subscribe to progress
   * const schema = i.schema({
   *   entities: {
   *     books: i.entity({
   *       title: i.string().indexed(),
   *     }),
   *   },
   * });
   * const job = api.schemaPush(appId, { overwrite: true, schema: schema });
   * job
   *   .then(({ summary }) => console.log('done!', summary))
   *   .catch((e) => console.error(e));
   * job.subscribe({
   *   next: (status) => renderProgress(status),
   * });
   *
   * // 2) Or just await it
   * const result = await api.schemaPush(appId, { schema: schema });
   * ```
   */
  schemaPush(
    appId: string,
    body: InstantAPISchemaPushBody,
  ): ProgressPromise<InProgressStepsSummary, InstantAPISchemaPushResponse> {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    return new ProgressPromise(async (progress, resolve, reject) => {
      try {
        const useOverwrite = shouldOverwrite(body);
        const pushFn = useOverwrite ? schemaPushOverwrite : schemaPush;

        // It's tricky to add withRetry to the background process that fetches the jobs,
        // so we'll just refresh the token at the start.
        if (this.canRefreshToken()) {
          try {
            await this.refreshToken();
          } catch (_e) {}
        }
        pushFn(this.#apiURI, this.token(), appId, body).subscribe({
          complete(v) {
            resolve(v);
          },
          error(e) {
            reject(e);
          },
          next(v) {
            progress(v);
          },
        });
      } catch (e) {
        reject(e as Error);
      }
    });
  }

  /**
   * Update permission rules for an app by its id.
   *
   * Completely replaces the current rule set.
   *
   * ```ts
   * const { steps } = await api.pushPerms(appId, {
   *   perms: {
   *     $default: { allow: { $default: 'false' } },
   *     books: { allow: { view: 'true', $default: 'false' } },
   *   },
   * });
   * ```
   */
  async pushPerms(
    appId: string,
    body: InstantAPIPushPermsBody,
  ): Promise<InstantAPIPushPermsResponse> {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    return this.withRetry(pushPerms, [this.#apiURI, this.token(), appId, body]);
  }

  async tokenInfo(): Promise<InstantAPITokenInfoResponse> {
    if (!this.#auth) {
      throw new PlatformApiMissingAuthError();
    }
    return this.withRetry(tokenInfo, [this.#apiURI, this.token()]);
  }
}
