// @ts-check
import boxen from 'boxen';
import chalk from 'chalk';
import { program } from '@commander-js/extra-typings';
import { readFile } from 'fs/promises';
import path from 'path';
import terminalLink from 'terminal-link';
import { UI } from './ui/index.ts';
import { deferred, renderUnwrap } from './ui/lib.ts';
import {
  getPermsReadCandidates,
  getSchemaReadCandidates,
} from './util/findConfigCandidates.ts';
import { getAuthPaths } from './util/getAuthPaths.ts';
import { loadConfig } from './util/loadConfig.ts';
import { loadEnv } from './util/loadEnv.ts';
import { ResolveRenamePrompt } from './util/renamePrompt.ts';
import version from './version.js';

loadEnv();

const dev = Boolean(process.env.INSTANT_CLI_DEV);
const verbose = Boolean(process.env.INSTANT_CLI_VERBOSE);

function error(firstArg, ...rest) {
  console.error(chalk.red('[error]') + ' ' + firstArg, ...rest);
}

const potentialAdminTokenEnvs = {
  default: 'INSTANT_APP_ADMIN_TOKEN',
  short: 'INSTANT_ADMIN_TOKEN',
};

const instantDashOrigin = dev
  ? 'http://localhost:3000'
  : 'https://instantdb.com';

const instantBackendOrigin =
  process.env.INSTANT_CLI_API_URI ||
  (dev ? 'http://localhost:8888' : 'https://api.instantdb.com');

function indexingJobCompletedActionMessage(job) {
  if (job.job_type === 'check-data-type') {
    return `setting type of ${job.attr_name} to ${job.checked_data_type}`;
  }
  if (job.job_type === 'remove-data-type') {
    return `removing type from ${job.attr_name}`;
  }
  if (job.job_type === 'index') {
    return `adding index to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-index') {
    return `removing index from ${job.attr_name}`;
  }
  if (job.job_type === 'unique') {
    return `adding uniqueness constraint to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-unique') {
    return `removing uniqueness constraint from ${job.attr_name}`;
  }
  if (job.job_type === 'required') {
    return `adding required constraint to ${job.attr_name}`;
  }
  if (job.job_type === 'remove-required') {
    return `removing required constraint from ${job.attr_name}`;
  }
  return `unexpected job type ${job.job_type} - please ping us on discord with this job id (${job.id})`;
}

function truncate(s, maxLen) {
  if (s.length > maxLen) {
    return `${s.substr(0, maxLen - 3)}...`;
  }
  return s;
}

function formatSamples(triples_samples) {
  return triples_samples.slice(0, 3).map((t) => {
    return { ...t, value: truncate(JSON.stringify(t.value), 32) };
  });
}

function createUrl(triple, job) {
  const urlParams = new URLSearchParams({
    s: 'main',
    app: job.app_id,
    t: 'explorer',
    ns: job.attr_name.split('.')[0],
    where: JSON.stringify(['id', triple.entity_id]),
  });
  const url = new URL(instantDashOrigin);
  url.pathname = '/dash';
  url.search = urlParams.toString();
  return url;
}

function padCell(value, width) {
  const trimmed = value.length > width ? value.substring(0, width) : value;
  return trimmed + ' '.repeat(width - trimmed.length);
}

function indexingJobCompletedMessage(job) {
  const actionMessage = indexingJobCompletedActionMessage(job);
  if (job.job_status === 'canceled') {
    return `Canceled ${actionMessage} before it could finish.`;
  }
  if (job.job_status === 'completed') {
    return `Finished ${actionMessage}.`;
  }
  if (job.job_status === 'errored') {
    if (job.invalid_triples_sample?.length) {
      const [etype, label] = job.attr_name.split('.');
      const samples = formatSamples(job.invalid_triples_sample);
      const longestValue = samples.reduce(
        (acc, { value }) => Math.max(acc, value.length),
        label.length,
      );

      const columns = [
        { header: 'namespace', width: 15, getValue: () => etype },
        {
          header: 'id',
          width: 37,
          getValue: (triple) =>
            terminalLink(triple.entity_id, createUrl(triple, job).toString(), {
              fallback: () => triple.entity_id,
            }),
        },
        {
          header: label,
          width: longestValue + 2,
          getValue: (triple) => triple.value,
        },
        { header: 'type', width: 8, getValue: (triple) => triple.json_type },
      ];

      let msg = `${chalk.red('INVALID DATA')} ${actionMessage}.\n`;
      if (job.invalid_unique_value) {
        msg += `  Found multiple entities with value ${truncate(JSON.stringify(job.invalid_unique_value), 64)}.\n`;
      }
      if (job.error === 'triple-too-large-error') {
        msg += `  Some of the existing data is too large to index.\n`;
      }

      msg += `  First few examples:\n`;
      msg += `  ${columns.map((col) => chalk.bold(padCell(col.header, col.width))).join(' | ')}\n`;
      msg += `  ${columns.map((col) => '-'.repeat(col.width)).join('-|-')}\n`;

      for (const triple of samples) {
        const cells = columns.map((col) =>
          padCell(col.getValue(triple), col.width),
        );
        msg += `  ${cells.join(' | ')}\n`;
      }
      return msg;
    }
    return `Error ${actionMessage}.`;
  }
}

function joinInSentence(items) {
  if (items.length === 0) {
    return '';
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function jobGroupDescription(jobs) {
  const actions = new Set();
  const jobActions = {
    'check-data-type': 'updating types',
    'remove-data-type': 'updating types',
    index: 'updating indexes',
    'remove-index': 'updating indexes',
    unique: 'updating uniqueness constraints',
    'remove-unique': 'updating uniqueness constraints',
    required: 'making attributes required',
    'remove-required': 'making attributes optional',
  };
  for (const job of jobs) {
    actions.add(jobActions[job.job_type]);
  }
  return joinInSentence([...actions].sort()) || 'updating schema';
}

// TODO: rewrite in effect
export async function waitForIndexingJobsToFinish(appId, data, authToken) {
  const spinnerDefferedPromise = deferred();
  const spinner = new UI.Spinner({
    promise: spinnerDefferedPromise.promise,
  });
  const spinnerRenderPromise = renderUnwrap(spinner);

  const groupId = data['group-id'];
  let jobs = data.jobs;
  let waitMs = 20;
  let lastUpdatedAt = new Date(0);

  const completedIds = new Set();

  const errorMessages = [];

  while (true) {
    let stillRunning = false;
    let updated = false;
    let workEstimateTotal = 0;
    let workCompletedTotal = 0;

    for (const job of jobs) {
      const updatedAt = new Date(job.updated_at);
      if (updatedAt > lastUpdatedAt) {
        updated = true;
        lastUpdatedAt = updatedAt;
      }
      if (job.job_status === 'waiting' || job.job_status === 'processing') {
        stillRunning = true;
        // Default estimate to high value to prevent % from jumping around
        workEstimateTotal += job.work_estimate ?? 50000;
        workCompletedTotal += job.work_completed ?? 0;
      } else {
        if (!completedIds.has(job.id)) {
          completedIds.add(job.id);
          const msg = indexingJobCompletedMessage(job);
          if (msg) {
            if (job.job_status === 'errored') {
              spinner.addMessage(msg);
              errorMessages.push(msg);
            } else {
              spinner.addMessage(msg);
            }
          }
        }
      }
    }
    if (!stillRunning) {
      break;
    }
    if (workEstimateTotal) {
      const percent = Math.floor(
        (workCompletedTotal / workEstimateTotal) * 100,
      );
      spinner.updateText(`${jobGroupDescription(jobs)} ${percent}%`);
    }
    waitMs = updated ? 1 : Math.min(10000, waitMs * 2);
    await sleep(waitMs);
    const res = await fetchJson({
      debugName: 'Check indexing status',
      method: 'GET',
      authToken,
      path: `/dash/apps/${appId}/indexing-jobs/group/${groupId}`,
      errorMessage: 'Failed to check indexing status.',
      command: 'push',
    });
    if (!res.ok) {
      break;
    }
    jobs = res.data.jobs;
  }

  spinnerDefferedPromise.resolve(null);

  await spinnerRenderPromise;

  // Log errors at the end so that they're easier to see.
  if (errorMessages.length) {
    for (const msg of errorMessages) {
      console.log(msg);
    }
    console.log(chalk.red('Some steps failed while updating schema.'));
    process.exit(1);
  }
}

export const resolveRenames = async (created, promptData, extraInfo) => {
  const answer = await renderUnwrap(
    new ResolveRenamePrompt(
      created,
      promptData,
      extraInfo,
      UI.modifiers.piped([
        (out) =>
          boxen(out, {
            dimBorder: true,
            padding: {
              left: 1,
              right: 1,
            },
          }),
        UI.modifiers.vanishOnComplete,
      ]),
    ),
  );
  return answer;
};

/**
 * Fetches JSON data from a specified path using the POST method.
 *
 * @param {Object} options
 * @param {string} options.debugName
 * @param {string} options.errorMessage
 * @param {string} options.path
 * @param {'POST' | 'GET'} [options.method]
 * @param {Object} [options.body=undefined]
 * @param {boolean} [options.noAuth]
 * @param {boolean} [options.noLogError]
 * @param {string} [options.command] - The CLI command being executed (e.g., 'push', 'pull', 'login')
 * @param {string} [options.authToken] - Optional auth token to use instead of reading from config
 * @param {Record<string, string>} [options.headers] - Extra headers to include in the request
 * @returns {Promise<{ ok: boolean; data: any }>}
 */
async function fetchJson({
  debugName,
  errorMessage,
  path,
  body,
  method,
  noAuth,
  noLogError,
  command,
  authToken: providedAuthToken,
  headers: extraHeaders,
}) {
  const withAuth = !noAuth;
  const withErrorLogging = !noLogError;
  let authToken = null;
  if (withAuth) {
    authToken =
      providedAuthToken ?? (await readConfigAuthTokenWithErrorLogging());
    if (!authToken) {
      return { ok: false, data: undefined };
    }
  }
  const timeoutMs = 1000 * 60 * 5; // 5 minutes

  try {
    const res = await fetch(`${instantBackendOrigin}${path}`, {
      method: method ?? 'GET',
      headers: {
        ...(withAuth ? { Authorization: `Bearer ${authToken}` } : {}),
        'Content-Type': 'application/json',
        'X-Instant-Source': 'instant-cli',
        'X-Instant-Version': version,
        ...(command ? { 'X-Instant-Command': command } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (verbose) {
      console.log(debugName, 'response:', res.status, res.statusText);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (verbose && data) {
      console.log(debugName, 'json:', JSON.stringify(data, null, 2));
    }
    if (!res.ok) {
      if (withErrorLogging) {
        error(errorMessage);
        prettyPrintJSONErr(data);
      }
      return { ok: false, data };
    }

    return { ok: true, data };
  } catch (err) {
    if (withErrorLogging) {
      if (err.name === 'AbortError') {
        error(
          `Timeout: It took more than ${timeoutMs / 60000} minutes to get the result.`,
        );
      } else {
        error(`Error: type: ${err.name}, message: ${err.message}`);
      }
    }
    return { ok: false, data: null };
  }
}

function prettyPrintJSONErr(data) {
  if (data?.message) {
    error(data.message);
  }
  if (Array.isArray(data?.hint?.errors)) {
    for (const err of data.hint.errors) {
      error(`${err.in ? err.in.join('->') + ': ' : ''}${err.message}`);
    }
  }
  if (!data) {
    error('Failed to parse error response');
  }
}

export async function readLocalPermsFile() {
  const readCandidates = getPermsReadCandidates();
  const res = await loadConfig({
    sources: readCandidates,
    merge: false,
  });
  if (!res.config) return;
  const relativePath = path.relative(process.cwd(), res.sources[0]);
  return { path: relativePath, perms: res.config };
}

export async function readLocalSchemaFile() {
  const readCandidates = getSchemaReadCandidates();
  const res = await loadConfig({
    sources: readCandidates,
    merge: false,
  });
  if (!res.config) return;
  const relativePath = path.relative(process.cwd(), res.sources[0]);
  return { path: relativePath, schema: res.config };
}

export async function readInstantConfigFile() {
  return (
    await loadConfig({
      sources: [
        // load from `instant.config.xx`
        {
          files: 'instant.config',
          extensions: ['ts', 'mts', 'cts', 'js', 'mjs', 'cjs', 'json'],
        },
      ],
      // if false, the only the first matched will be loaded
      // if true, all matched will be loaded and deep merged
      merge: false,
    })
  ).config;
}

async function readConfigAuthToken(allowAdminToken = true) {
  const options = program.opts();
  // @ts-expect-error command opts type is unknown
  if (typeof options.token === 'string') {
    // @ts-expect-error command opts type is unknown
    return options.token;
  }

  if (process.env.INSTANT_CLI_AUTH_TOKEN) {
    return process.env.INSTANT_CLI_AUTH_TOKEN;
  }

  if (allowAdminToken) {
    const adminTokenNames = Object.values(potentialAdminTokenEnvs);
    for (const envName of adminTokenNames) {
      const token = process.env[envName];
      if (token) {
        return token;
      }
    }
  }

  const authToken = await readFile(
    getAuthPaths().authConfigFilePath,
    'utf-8',
  ).catch(() => null);

  if (authToken) {
    return authToken;
  }

  return null;
}

export async function readConfigAuthTokenWithErrorLogging() {
  const token = await readConfigAuthToken();
  if (!token) {
    error(
      `Looks like you are not logged in. Please log in with ${chalk.green('`instant-cli login`')}`,
    );
  }
  return token;
}

// utils

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function countEntities(o) {
  return Object.keys(o).length;
}
