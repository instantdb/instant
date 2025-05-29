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
} from '@instantdb/core';
import version from './version.js';
import {
  attrFwdLabel,
  attrFwdName,
  attrRevName,
  identName,
  InstantAPIPlatformSchema,
  InstantAPISchemaPlanStep,
  InstantAPISchemaPushStep,
} from './schema.ts';
import { ProgressPromise } from './ProgressPromise.ts';

type Simplify<T> = {
  [K in keyof T]: T[K];
} & {};

type AppDataOpts = {
  includePerms?: boolean | null | undefined;
  includeSchema?: boolean | null | undefined;
};

export type InstantAPIAppDetails<Opts extends AppDataOpts | undefined> =
  Simplify<
    {
      id: string;
      title: string;
      createdAt: Date;
    } & (NonNullable<Opts>['includePerms'] extends true
      ? { perms: InstantRules }
      : {}) &
      (NonNullable<Opts>['includeSchema'] extends true
        ? { schema: InstantAPIPlatformSchema }
        : {})
  >;

export type InstantAPIGetAppResponse<Opts extends AppDataOpts> = Simplify<{
  app: InstantAPIAppDetails<Opts>;
}>;

export type InstantAPIListAppsResponse<Opts extends AppDataOpts | undefined> =
  Simplify<{
    apps: InstantAPIAppDetails<Opts>[];
  }>;

export type InstantAPIGetAppSchemaResponse = {
  schema: InstantAPIPlatformSchema;
};

export type InstantAPIGetAppPermsResponse = { perms: InstantRules };

export type InstantAPIUpdateAppBody = { title: string };

export type InstantAPIUpdateAppResponse = Simplify<{
  app: InstantAPIAppDetails<{}>;
}>;

export type InstantAPIDeleteAppResponse = Simplify<{
  app: InstantAPIAppDetails<{}>;
}>;

export type InstantAPISchemaPushBody = {
  schema: InstantSchemaDef<EntitiesDef, LinksDef<EntitiesDef>, RoomsDef>;
};

export type InstantAPIPushPermsBody = {
  perms: InstantRules;
};

export type InstantAPIPushPermsResponse = {
  perms: InstantRules;
};

type PlanStep =
  | ['add-attr', InstantDBAttr]
  | ['update-attr', InstantDBAttr]
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
    ];

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
  newSchema: InstantAPIPlatformSchema;
  currentSchema: InstantAPIPlatformSchema;
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
  newSchema: InstantAPIPlatformSchema;
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
  return await jsonFetch<InstantAPIListAppsResponse<typeof opts>>(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

async function getAppSchema(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIGetAppSchemaResponse> {
  return await jsonFetch<InstantAPIGetAppSchemaResponse>(
    `${apiURI}/superadmin/apps/${appId}/schema`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
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

  const res = await jsonFetch<
    InstantAPIGetAppResponse<NonNullable<typeof opts>>
  >(`${apiURI}/superadmin/apps/${appId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!permsPromise && !schemaPromise) {
    return res;
  }

  return {
    ...res,
    app: {
      ...res.app,
      ...(permsPromise ? { perms: (await permsPromise).perms } : {}),
      ...(schemaPromise ? { schema: (await schemaPromise).schema } : {}),
    },
  };
}

async function updateApp(
  apiURI: string,
  token: string,
  appId: string,
  fields: InstantAPIUpdateAppBody,
): Promise<InstantAPIUpdateAppResponse> {
  return jsonFetch<InstantAPIUpdateAppResponse>(
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
}

async function deleteApp(
  apiURI: string,
  token: string,
  appId: string,
): Promise<InstantAPIDeleteAppResponse> {
  return jsonFetch<InstantAPIDeleteAppResponse>(
    `${apiURI}/superadmin/apps/${appId}`,
    {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

function translatePlanStep(apiStep: PlanStep): InstantAPISchemaPlanStep {
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
      const attr = stepParams;
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
    default: {
      // Get a type error if we ignore a case
      const unknownType: never = stepType;
      throw new Error(`Uknown schema operation ${unknownType}.`);
    }
  }
}

export function translatePlanSteps(
  apiSteps: PlanStep[],
): InstantAPISchemaPlanStep[] {
  return apiSteps.map((step) => translatePlanStep(step));
}

type PushObjOf<S extends PushStep> =
  // grab from the union the member whose discriminant matches S[0]
  Extract<InstantAPISchemaPushStep, { type: S[0] }>;

function translatePushStep<S extends PushStep>(
  apiStep: S,
  jobs: IndexingJobJSON[],
): PushObjOf<S> {
  const [stepType, stepParams] = apiStep;
  if (stepType === 'add-attr' || stepType === 'update-attr') {
    const planStep = translatePlanStep(apiStep);
    if (planStep.type !== 'add-attr' && planStep.type !== 'update-attr') {
      // This is just here for typescript
      throw new Error('Invalid step.');
    }
    return planStep as PushObjOf<S>;
  }
  const jobId = stepParams['job-id'];
  const job = jobs.find((j) => j.id === jobId)!;
  const planStep = translatePlanStep(apiStep);
  const backgroundJob = formatJob(job);

  if (planStep.type !== backgroundJob.type) {
    throw new Error('Invalid type');
  }

  return { ...planStep, backgroundJob } as PushObjOf<S>;
}

function translatePushSteps(
  apiSteps: PushStep[],
  jobs: IndexingJobJSON[],
): InstantAPISchemaPushStep[] {
  return apiSteps.map((step) => translatePushStep(step, jobs));
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

  return {
    newSchema: resp['new-schema'],
    currentSchema: resp['current-schema'],
    steps: translatePlanSteps(resp['steps']),
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
      : `Finished ${steps.length} schema operation${
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
              progress(stepSummary(translatePushSteps(resp.steps, jobs)));
            },
          );

      const schemaRes = await getAppSchema(apiURI, token, appId);
      resolve({
        newSchema: schemaRes.schema,
        steps: translatePushSteps(resp.steps, jobs),
        summary: stepSummary(translatePushSteps(resp.steps, jobs)),
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

export type PlatformApiAuth = {
  token: string;
};

export type PlatformApiConfig = {
  auth: PlatformApiAuth;
  apiURI?: string;
};

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
  #token: string;
  #apiURI: string;

  /**
   * @param config – Runtime configuration.
   * @param config.auth.token – OAuth access-token obtained via the oauth flow
   *   or a personal access token.
   * @throws {Error} When `token` is missing.
   */
  constructor(config: PlatformApiConfig) {
    this.#token = config.auth.token;
    this.#apiURI = config.apiURI || 'https://api.instantdb.com';

    if (!this.#token) {
      throw new Error('PlatformApi must be constructed with a token.');
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
    return getApp<Opts>(this.#apiURI, this.#token, appId, opts);
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
    return getApps<Opts>(this.#apiURI, this.#token, opts);
  }

  /**
   * Gets the schema for an app by its id.
   *
   * ```ts
   * const { apps } = await api.getApps({
   *   includeSchema: true,
   *   includePerms: true,
   * });
   * ```
   *
   * @param appId -- UUID of the app
   */
  async getSchema(appId: string): Promise<InstantAPIGetAppSchemaResponse> {
    return getAppSchema(this.#apiURI, this.#token, appId);
  }

  /**
   * Gets the permissions for an app by its id.
   *
   * @param appId -- UUID of the app
   */
  async getPerms(appId: string): Promise<InstantAPIGetAppPermsResponse> {
    return getAppPerms(this.#apiURI, this.#token, appId);
  }

  /**
   * Update the title of an app by its id.
   *
   * @param appId -- UUID of the app
   * @param fields.title -- New title for the app
   */
  async updateApp(
    appId: string,
    fields: InstantAPIUpdateAppBody,
  ): Promise<InstantAPIUpdateAppResponse> {
    return updateApp(this.#apiURI, this.#token, appId, fields);
  }

  /**
   * Delete an app by its id.
   *
   * @param appId -- UUID of the app
   */
  async deleteApp(appId: string): Promise<InstantAPIDeleteAppResponse> {
    return deleteApp(this.#apiURI, this.#token, appId);
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
    return planSchemaPush(this.#apiURI, this.#token, appId, body);
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
   * const job = api.schemaPush(appId, { schema: schema });
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
    return schemaPush(this.#apiURI, this.#token, appId, body);
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
    return pushPerms(this.#apiURI, this.#token, appId, body);
  }
}
