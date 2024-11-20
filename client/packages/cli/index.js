// @ts-check

import version from "./src/version.js";
import setupHelp from "./src/setupHelp.js";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import chalk from "chalk";
import { program } from "commander";
import { input, confirm } from "@inquirer/prompts";
import envPaths from "env-paths";
import { loadConfig } from "unconfig";
import { packageDirectory } from "pkg-dir";
import openInBrowser from "open";
import ora from "ora";
import terminalLink from "terminal-link";

// config
dotenv.config();

const dev = Boolean(process.env.INSTANT_CLI_DEV);
const verbose = Boolean(process.env.INSTANT_CLI_VERBOSE);

// consts

const noAppIdErrorMessage = `
No app ID found.
Add \`INSTANT_APP_ID=<ID>\` to your .env file.
(Or \`NEXT_PUBLIC_INSTANT_APP_ID\`, \`VITE_INSTANT_APP_ID\`)
Or provide an app ID via the CLI \`instant-cli pull-schema <ID>\`.
`.trim();

const instantDashOrigin = dev
  ? "http://localhost:3000"
  : "https://instantdb.com";

const instantBackendOrigin =
  process.env.INSTANT_CLI_API_URI ||
  (dev ? "http://localhost:8888" : "https://api.instantdb.com");

// cli

setupHelp(program);

program
  .name("instant-cli")
  .option("-t --token <TOKEN>", "auth token override")
  .option("-y", "skip confirmation prompt")
  .option("-v --version", "output the version number", () => {
    console.log(version);
    process.exit(0);
  });

program
  .command("login")
  .description("Authenticates with Instant")
  .option("-p --print", "print auth token")
  .action(login);

program
  .command("init")
  .description("Creates a new app with configuration files")
  .action(init);

program
  .command("push-schema")
  .argument("[ID]")
  .description("Pushes local instant.schema definition to production.")
  .option(
    "--skip-check-types",
    "Don't check types on the server when pushing schema",
  )
  .action((id, opts) => {
    pushSchema(id, opts);
  });

program
  .command("push-perms")
  .argument("[ID]")
  .description("Pushes local instant.perms rules to production.")
  .action(() => {
    pushPerms();
  });

program
  .command("push")
  .argument("[ID]")
  .option(
    "--skip-check-types",
    "Don't check types on the server when pushing schema",
  )
  .description(
    "Pushes local instant.schema and instant.perms rules to production.",
  )
  .action(pushAll);

program
  .command("pull-schema")
  .argument("[ID]")
  .description(
    "Generates an initial instant.schema definition from production state.",
  )
  .action((appIdOrName) => {
    pullSchema(appIdOrName);
  });

program
  .command("pull-perms")
  .argument("[ID]")
  .description(
    "Generates an initial instant.perms definition from production rules.",
  )
  .action((appIdOrName) => {
    pullPerms(appIdOrName);
  });

program
  .command("pull")
  .argument("[ID]")
  .description(
    "Generates initial instant.schema and instant.perms definition from production state.",
  )
  .action(pullAll);

program.parse(process.argv);

// command actions

async function pushAll(appIdOrName, opts) {
  const ok = await pushSchema(appIdOrName, opts);
  if (!ok) return;

  await pushPerms(appIdOrName);
}

async function pullAll(appIdOrName) {
  const ok = await pullSchema(appIdOrName);
  if (!ok) return;
  await pullPerms(appIdOrName);
}

async function login(options) {
  const registerRes = await fetchJson({
    method: "POST",
    path: "/dash/cli/auth/register",
    debugName: "Login register",
    errorMessage: "Failed to register login.",
    noAuth: true,
  });

  if (!registerRes.ok) return;

  const { secret, ticket } = registerRes.data;

  const ok = await promptOk(
    `This will open instantdb.com in your browser, OK to proceed?`,
  );

  if (!ok) return;

  openInBrowser(`${instantDashOrigin}/dash?ticket=${ticket}`);

  console.log("Waiting for authentication...");
  const authTokenRes = await waitForAuthToken({ secret });
  if (!authTokenRes) {
    return;
  }

  const { token, email } = authTokenRes;

  if (options.print) {
    console.log(chalk.red("[Do not share] Your Instant auth token:", token));
  } else {
    await saveConfigAuthToken(token);
    console.log(chalk.green(`Successfully logged in as ${email}!`));
  }
}

async function init() {
  const pkgDir = await packageDirectory();
  if (!pkgDir) {
    console.error("Failed to locate app root dir.");
    return;
  }

  const instantModuleName = await getInstantModuleName(pkgDir);
  const schema = await readLocalSchemaFile();
  const { perms } = await readLocalPermsFile();
  const authToken = await readConfigAuthToken();
  if (!authToken) {
    console.error("Unauthenticated.  Please log in with `instant-cli login`!");
    return;
  }

  const id = randomUUID();
  const token = randomUUID();

  const title = await input({
    message: "Enter a name for your app",
    required: true,
  }).catch(() => null);

  if (!title) {
    console.error("No name provided. Exiting.");
    return;
  }

  const appRes = await fetchJson({
    method: "POST",
    path: "/dash/apps",
    debugName: "App create",
    errorMessage: "Failed to create app.",
    body: { id, title, admin_token: token },
  });

  if (!appRes.ok) return;

  console.log(chalk.green(`Successfully created your Instant app "${title}"`));
  console.log(`Please add your app ID to your .env config:`);
  console.log(chalk.magenta(`INSTANT_APP_ID=${id}`));
  console.log(chalk.underline(appDashUrl(id)));

  if (!schema) {
    const schemaPath = join(pkgDir, "instant.schema.ts");
    await writeFile(
      schemaPath,
      instantSchemaTmpl(title, id, instantModuleName),
      "utf-8",
    );
    console.log("Start building your schema: " + schemaPath);
  }

  if (!perms) {
    await writeFile(
      join(pkgDir, "instant.perms.ts"),
      examplePermsTmpl,
      "utf-8",
    );
  }
}

async function getInstantModuleName(pkgDir) {
  const pkgJson = await readJsonFile(join(pkgDir, "package.json"));
  const instantModuleName = pkgJson?.dependencies?.["@instantdb/react"]
    ? "@instantdb/react"
    : pkgJson?.dependencies?.["@instantdb/core"]
      ? "@instantdb/core"
      : null;
  return instantModuleName;
}

async function pullSchema(appIdOrName) {
  const pkgDir = await packageDirectory();
  if (!pkgDir) {
    console.error("Failed to locate app root dir.");
    return;
  }

  const appId = await getAppIdWithErrorLogging(appIdOrName);
  if (!appId) return;

  const instantModuleName = await getInstantModuleName(pkgDir);
  if (!instantModuleName) {
    console.warn(
      "Missing Instant dependency in package.json.  Please install `@instantdb/react` or `@instantdb/core`.",
    );
  }

  const authToken = await readConfigAuthToken();
  if (!authToken) {
    console.error("Unauthenticated.  Please log in with `login`!");
    return;
  }

  console.log("Pulling schema...");

  const pullRes = await fetchJson({
    path: `/dash/apps/${appId}/schema/pull`,
    debugName: "Schema pull",
    errorMessage: "Failed to pull schema.",
  });

  if (!pullRes.ok) return;

  const hasEnvFile = await pathExists(join(pkgDir, ".env"));
  if (!hasEnvFile) {
    const ok = await promptOk(
      "No .env file detected, would you like to create one so you can push updates to schema and perms?",
    );

    if (ok) {
      await writeFile(join(pkgDir, ".env"), `INSTANT_APP_ID=${appId}`, "utf-8");
      console.log(
        `Created .env file with INSTANT_APP_ID=${appId} in ${pkgDir}`,
      );
    } else {
      console.log(
        "No .env file created. If you plan to push updates, please create one.",
      );
    }
  }

  if (
    !countEntities(pullRes.data.schema.refs) &&
    !countEntities(pullRes.data.schema.blobs)
  ) {
    console.log("Schema is empty.  Skipping.");
    return;
  }

  const hasSchemaFile = await pathExists(join(pkgDir, "instant.schema.ts"));
  if (hasSchemaFile) {
    const ok = await promptOk(
      "This will overwrite your local instant.schema file, OK to proceed?",
    );

    if (!ok) return;
  }

  const schemaPath = join(pkgDir, "instant.schema.ts");
  await writeFile(
    schemaPath,
    generateSchemaTypescriptFile(
      appId,
      pullRes.data.schema,
      pullRes.data["app-title"],
      instantModuleName,
    ),
    "utf-8",
  );

  console.log("Wrote schema to instant.schema.ts");

  return true;
}

async function pullPerms(appIdOrName) {
  console.log("Pulling perms...");

  const appId = await getAppIdWithErrorLogging(appIdOrName);
  if (!appId) return;

  const pkgDir = await packageDirectory();
  if (!pkgDir) {
    console.error("Failed to locate app root dir.");
    return;
  }

  const authToken = await readConfigAuthToken();
  if (!authToken) {
    console.error("Unauthenticated.  Please log in with `login`!");
    return;
  }

  const pullRes = await fetchJson({
    path: `/dash/apps/${appId}/perms/pull`,
    debugName: "Perms pull",
    errorMessage: "Failed to pull perms.",
  });

  if (!pullRes.ok) return;

  if (!pullRes.data.perms || !countEntities(pullRes.data.perms)) {
    console.log("No perms.  Exiting.");
    return;
  }

  if (await pathExists(join(pkgDir, "instant.perms.ts"))) {
    const ok = await promptOk(
      "This will ovwerwrite your local instant.perms file, OK to proceed?",
    );

    if (!ok) return;
  }

  const permsPath = join(pkgDir, "instant.perms.ts");
  await writeFile(
    permsPath,
    `export default ${JSON.stringify(pullRes.data.perms, null, "  ")};`,
    "utf-8",
  );

  console.log("Wrote permissions to instant.perms.ts");

  return true;
}

function indexingJobCompletedActionMessage(job) {
  if (job.job_type === "check-data-type") {
    return `setting type of ${job.attr_name} to ${job.checked_data_type}`;
  }
  if (job.job_type === "remove-data-type") {
    return `removing type from ${job.attr_name}`;
  }
  if (job.job_type === "index") {
    return `adding index to ${job.attr_name}`;
  }
  if (job.job_type === "remove-index") {
    return `removing index from ${job.attr_name}`;
  }
  if (job.job_type === "unique") {
    return `adding uniqueness constraint to ${job.attr_name}`;
  }
  if (job.job_type === "remove-unique") {
    return `removing uniqueness constraint from ${job.attr_name}`;
  }
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

function indexingJobCompletedMessage(job) {
  const actionMessage = indexingJobCompletedActionMessage(job);
  if (job.job_status === "canceled") {
    return `Canceled ${actionMessage} before it could finish.`;
  }
  if (job.job_status === "completed") {
    return `Finished ${actionMessage}.`;
  }
  if (job.job_status === "errored") {
    if (job.invalid_triples_sample?.length) {
      const [etype, label] = job.attr_name.split(".");
      const samples = formatSamples(job.invalid_triples_sample);
      const longestValue = samples.reduce(
        (acc, { value }) => Math.max(acc, value.length),
        // Start with length of label
        label.length,
      );

      let msg = `${chalk.red("INVALID DATA")} ${actionMessage}.\n`;
      if (job.invalid_unique_value) {
        msg += `  Found multiple entities with value ${truncate(JSON.stringify(job.invalid_unique_value), 64)}.\n`;
      }
      if (job.error === "triple-too-large-error") {
        msg += `  Some of the existing data is too large to index.\n`;
      }
      msg += `  First few examples:\n`;
      msg += `  ${chalk.bold("id")}${" ".repeat(35)}| ${chalk.bold(label)}${" ".repeat(longestValue - label.length)} | ${chalk.bold("type")}\n`;
      msg += `  ${"-".repeat(37)}|${"-".repeat(longestValue + 2)}|--------\n`;
      for (const triple of samples) {
        const urlParams = new URLSearchParams({
          s: "main",
          app: job.app_id,
          t: "explorer",
          ns: etype,
          where: JSON.stringify(["id", triple.entity_id]),
        });
        const url = new URL(instantDashOrigin);
        url.pathname = "/dash";
        url.search = urlParams.toString();

        const link = terminalLink(triple.entity_id, url.toString(), {
          fallback: () => triple.entity_id,
        });
        msg += `  ${link} | ${triple.value}${" ".repeat(longestValue - triple.value.length)} | ${triple.json_type}\n`;
      }
      return msg;
    }
    return `Error ${actionMessage}.`;
  }
}

function joinInSentence(items) {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function jobGroupDescription(jobs) {
  const actions = new Set();
  const jobActions = {
    "check-data-type": "updating types",
    "remove-data-type": "updating types",
    index: "updating indexes",
    "remove-index": "updating indexes",
    unique: "updating uniqueness constraints",
    "remove-unique": "updating uniqueness constraints",
  };
  for (const job of jobs) {
    actions.add(jobActions[job.job_type]);
  }
  return joinInSentence([...actions].sort()) || "updating schema";
}

async function waitForIndexingJobsToFinish(appId, data) {
  const spinner = ora({
    text: "checking data types",
  }).start();
  const groupId = data["group-id"];
  let jobs = data.jobs;
  let waitMs = 20;
  let lastUpdatedAt = new Date(0);

  const completedIds = new Set();

  const completedMessages = [];
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
      if (job.job_status === "waiting" || job.job_status === "processing") {
        stillRunning = true;
        // Default estimate to high value to prevent % from jumping around
        workEstimateTotal += job.work_estimate ?? 50000;
        workCompletedTotal += job.work_completed ?? 0;
      } else {
        if (!completedIds.has(job.id)) {
          completedIds.add(job.id);
          const msg = indexingJobCompletedMessage(job);
          if (job.job_status === "errored") {
            errorMessages.push(msg);
          } else {
            completedMessages.push(msg);
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
      spinner.text = `${jobGroupDescription(jobs)} ${percent}%`;
    }
    if (completedMessages.length) {
      spinner.prefixText = completedMessages.join("\n") + "\n";
    }
    waitMs = updated ? 1 : Math.min(10000, waitMs * 2);
    await sleep(waitMs);
    const res = await fetchJson({
      debugName: "Check indexing status",
      method: "GET",
      path: `/dash/apps/${appId}/indexing-jobs/group/${groupId}`,
      errorMessage: "Failed to check indexing status.",
    });
    if (!res.ok) {
      break;
    }
    jobs = res.data.jobs;
  }
  spinner.stopAndPersist({
    text: "",
    prefixText: completedMessages.join("\n"),
  });

  // Log errors at the end so that they're easier to see.
  if (errorMessages.length) {
    for (const msg of errorMessages) {
      console.log(msg);
    }
    console.log(chalk.red("Some steps failed while updating schema."));
    process.exit(1);
  }
}

async function pushSchema(appIdOrName, opts) {
  const appId = await getAppIdWithErrorLogging(appIdOrName);
  if (!appId) return;

  const schema = await readLocalSchemaFileWithErrorLogging();
  if (!schema) return;

  console.log("Planning...");

  const planRes = await fetchJson({
    method: "POST",
    path: `/dash/apps/${appId}/schema/push/plan`,
    debugName: "Schema plan",
    errorMessage: "Failed to update schema.",
    body: {
      schema,
      check_types: !opts?.skipCheckTypes,
      supports_background_updates: true,
    },
  });

  if (!planRes.ok) return;

  if (!planRes.data.steps.length) {
    console.log("No schema changes detected.  Exiting.");
    return;
  }

  console.log(
    "The following changes will be applied to your production schema:",
  );

  for (const [action, attr] of planRes.data.steps) {
    switch (action) {
      case "add-attr":
      case "update-attr": {
        const valueType = attr["value-type"];
        const isAdd = action === "add-attr";
        if (valueType === "blob" && attrFwdLabel(attr) === "id") {
          console.log(
            `${isAdd ? chalk.magenta("ADD ENTITY") : chalk.magenta("UPDATE ENTITY")} ${attrFwdName(attr)}`,
          );
          break;
        }

        if (valueType === "blob") {
          console.log(
            `${isAdd ? chalk.green("ADD ATTR") : chalk.blue("UPDATE ATTR")} ${attrFwdName(attr)} :: unique=${attr["unique?"]}, indexed=${attr["index?"]}`,
          );
          break;
        }

        console.log(
          `${isAdd ? chalk.green("ADD LINK") : chalk.blue("UPDATE LINK")} ${attrFwdName(attr)} <=> ${attrRevName(attr)}`,
        );
        break;
      }
      case "check-data-type": {
        console.log(
          `${chalk.green("CHECK TYPE")} ${attrFwdName(attr)} => ${attr["checked-data-type"]}`,
        );
        break;
      }
      case "remove-data-type": {
        console.log(`${chalk.red("REMOVE TYPE")} ${attrFwdName(attr)} => any`);
        break;
      }
      case "index": {
        console.log("%s on %s", chalk.green("ADD INDEX"), attrFwdName(attr));
        break;
      }
      case "remove-index": {
        console.log("%s on %s", chalk.red("REMOVE INDEX"), attrFwdName(attr));
        break;
      }
      case "unique": {
        console.log(
          "%s to %s",
          chalk.green("ADD UNIQUE CONSTRAINT"),
          attrFwdName(attr),
        );
        break;
      }
      case "remove-unique": {
        console.log(
          "%s from %s",
          chalk.red("REMOVE UNIQUE CONSTRAINT"),
          attrFwdName(attr),
        );
        break;
      }
    }
  }

  const okPush = await promptOk("OK to proceed?");
  if (!okPush) return;

  const applyRes = await fetchJson({
    method: "POST",
    path: `/dash/apps/${appId}/schema/push/apply`,
    debugName: "Schema apply",
    errorMessage: "Failed to update schema.",
    body: {
      schema,
      check_types: !opts?.skipCheckTypes,
      supports_background_updates: true,
    },
  });

  if (!applyRes.ok) return;

  if (applyRes.data["indexing-jobs"]) {
    await waitForIndexingJobsToFinish(appId, applyRes.data["indexing-jobs"]);
  }

  console.log(chalk.green("Schema updated!"));

  return true;
}

async function pushPerms(appIdOrName) {
  const appId = await getAppIdWithErrorLogging(appIdOrName);
  if (!appId) return;

  const { perms } = await readLocalPermsFile();
  if (!perms) {
    console.error("Missing instant.perms file!");
    return;
  }

  const ok = await promptOk(
    "Pushing permissions rules. This will immediately replace your production rules. OK to proceed?",
  );
  if (!ok) return;

  const permsRes = await fetchJson({
    method: "POST",
    path: `/dash/apps/${appId}/rules`,
    debugName: "Schema apply",
    errorMessage: "Failed to update schema.",
    body: {
      code: perms,
    },
  });

  if (!permsRes.ok) return;

  console.log(chalk.green("Permissions updated!"));

  return true;
}

async function waitForAuthToken({ secret }) {
  for (let i = 1; i <= 120; i++) {
    await sleep(1000);

    try {
      const authCheckRes = await fetchJson({
        method: "POST",
        debugName: "Auth check",
        errorMessage: "Failed to check auth status.",
        path: "/dash/cli/auth/check",
        body: { secret },
        noAuth: true,
        noLogError: true,
      });

      if (authCheckRes.ok) {
        return authCheckRes.data;
      }
    } catch (error) {}
  }

  console.error("Login timed out.");
  return null;
}

// resources

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
}) {
  const withAuth = !noAuth;
  const withErrorLogging = !noLogError;
  let authToken = null;
  if (withAuth) {
    authToken = await readConfigAuthToken();
    if (!authToken) {
      console.error("Unauthenticated. Please log in with `instant-cli login`");
      return { ok: false, data: undefined };
    }
  }
  const timeoutMs = 1000 * 60 * 5; // 5 minutes

  try {
    const res = await fetch(`${instantBackendOrigin}${path}`, {
      method: method ?? "GET",
      headers: {
        ...(withAuth ? { Authorization: `Bearer ${authToken}` } : {}),
        "Content-Type": "application/json",
        "Instant-CLI-Version": version,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (verbose) {
      console.log(debugName, "response:", res.status, res.statusText);
    }

    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      if (withErrorLogging) {
        console.error(errorMessage);
        if (data?.message) {
          console.error(data.message);
        }
        if (Array.isArray(data?.hint?.errors)) {
          for (const error of data.hint.errors) {
            console.error(
              `${error.in ? error.in.join("->") + ": " : ""}${error.message}`,
            );
          }
        }
        if (!data) {
          console.error("Failed to parse error response");
        }
      }
      return { ok: false, data };
    }

    if (verbose) {
      console.log(debugName, "data:", data);
    }

    return { ok: true, data };
  } catch (err) {
    if (withErrorLogging) {
      if (err.name === "AbortError") {
        console.error(
          `Timeout: It took more than ${timeoutMs / 60000} minutes to get the result!`,
        );
      } else {
        console.error(`Error: type: ${err.name}, message: ${err.message}`);
      }
    }
    return { ok: false, data: null };
  }
}

async function promptOk(message) {
  const options = program.opts();

  if (options.y) return true;

  return await confirm({
    message,
    default: false,
  }).catch(() => false);
}

async function pathExists(f) {
  try {
    await stat(f);
    return true;
  } catch {
    return false;
  }
}

async function readLocalPermsFile() {
  const { config, sources } = await loadConfig({
    sources: [
      // load from `instant.perms.xx`
      {
        files: "instant.perms",
        extensions: ["ts", "mts", "cts", "js", "mjs", "cjs", "json"],
      },
    ],
    // if false, the only the first matched will be loaded
    // if true, all matched will be loaded and deep merged
    merge: false,
  });

  return {
    perms: config,
    path: sources.at(0),
  };
}

async function readLocalSchemaFile() {
  return (
    await loadConfig({
      sources: [
        // load from `instant.config.xx`
        {
          files: "instant.schema",
          extensions: ["ts", "mts", "cts", "js", "mjs", "cjs"],
        },
      ],
      // if false, the only the first matched will be loaded
      // if true, all matched will be loaded and deep merged
      merge: false,
    })
  ).config;
}

async function readInstantConfigFile() {
  return (
    await loadConfig({
      sources: [
        // load from `instant.config.xx`
        {
          files: "instant.config",
          extensions: ["ts", "mts", "cts", "js", "mjs", "cjs", "json"],
        },
      ],
      // if false, the only the first matched will be loaded
      // if true, all matched will be loaded and deep merged
      merge: false,
    })
  ).config;
}

async function readLocalSchemaFileWithErrorLogging() {
  const schema = await readLocalSchemaFile();

  if (!schema) {
    console.error("Missing instant.schema file!");
    return;
  }

  return schema;
}

async function readJsonFile(path) {
  if (!pathExists(path)) {
    return null;
  }

  try {
    const data = await readFile(path, "utf-8");
    return JSON.parse(data);
  } catch (error) {}

  return null;
}

async function readConfigAuthToken() {
  const options = program.opts();
  if (options.token) {
    return options.token;
  }

  if (process.env.INSTANT_CLI_AUTH_TOKEN) {
    return process.env.INSTANT_CLI_AUTH_TOKEN;
  }

  const authToken = await readFile(
    getAuthPaths().authConfigFilePath,
    "utf-8",
  ).catch(() => null);

  return authToken;
}

async function saveConfigAuthToken(authToken) {
  const authPaths = getAuthPaths();

  await mkdir(authPaths.appConfigDirPath, {
    recursive: true,
  });

  return writeFile(authPaths.authConfigFilePath, authToken, "utf-8");
}

function getAuthPaths() {
  const key = `instantdb-${dev ? "dev" : "prod"}`;
  const { config: appConfigDirPath } = envPaths(key);
  const authConfigFilePath = join(appConfigDirPath, "a");

  return { authConfigFilePath, appConfigDirPath };
}

// utils

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countEntities(o) {
  return Object.keys(o).length;
}

function sortedEntries(o) {
  return Object.entries(o).sort(([a], [b]) => a.localeCompare(b));
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function indentLines(s, n) {
  return s
    .split("\n")
    .map((c) => `${"  ".repeat(n)}${c}`)
    .join("\n");
}

// attr helpers

function attrFwdLabel(attr) {
  return attr["forward-identity"]?.[2];
}

function attrFwdEtype(attr) {
  return attr["forward-identity"]?.[1];
}

function attrRevLabel(attr) {
  return attr["reverse-identity"]?.[2];
}

function attrRevEtype(attr) {
  return attr["reverse-identity"]?.[1];
}

function attrFwdName(attr) {
  return `${attrFwdEtype(attr)}.${attrFwdLabel(attr)}`;
}

function attrRevName(attr) {
  if (attr["reverse-entity"]) {
    return `${attrRevEtype(attr)}.${attrRevLabel(attr)}`;
  }
}

// templates and constants

export const rels = {
  "many-false": ["many", "many"],
  "one-true": ["one", "one"],
  "many-true": ["many", "one"],
  "one-false": ["one", "many"],
};

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUUID(uuid) {
  return uuidRegex.test(uuid);
}

async function getAppIdWithErrorLogging(defaultAppIdOrName) {
  if (defaultAppIdOrName) {
    const config = await readInstantConfigFile();

    const nameMatch = config?.apps?.[defaultAppIdOrName];
    const namedAppId = nameMatch?.id && isUUID(nameMatch.id) ? nameMatch : null;
    const uuidAppId =
      defaultAppIdOrName && isUUID(defaultAppIdOrName)
        ? defaultAppIdOrName
        : null;

    if (nameMatch && !namedAppId) {
      console.error(
        `App ID for \`${defaultAppIdOrName}\` is not a valid UUID.`,
      );
    } else if (!namedAppId && !uuidAppId) {
      console.error(`The provided app ID is not a valid UUID.`);
    }

    return (
      // first, check for a config and whether the provided arg
      // matched a named ID
      namedAppId ||
      // next, check whether there's a provided arg at all
      uuidAppId
    );
  }
  const appId =
    // finally, check .env
    process.env.INSTANT_APP_ID ||
    process.env.NEXT_PUBLIC_INSTANT_APP_ID ||
    process.env.PUBLIC_INSTANT_APP_ID || // for Svelte
    process.env.VITE_INSTANT_APP_ID ||
    null;

  // otherwise, instruct the user to set one of these up
  if (!appId) {
    console.error(noAppIdErrorMessage);
  }

  return appId;
}

function appDashUrl(id) {
  return `${instantDashOrigin}/dash?s=main&t=home&app=${id}`;
}

function instantSchemaTmpl(title, id, instantModuleName) {
  return /* ts */ `// ${title}
// ${appDashUrl(id)}

import { i } from "${instantModuleName ?? "@instantdb/core"}";

// Example entities and links (you can delete these!)
const graph = i.graph(
  {
    posts: i.entity({
      name: i.string(),
      content: i.string(),
    }),
    authors: i.entity({
      userId: i.string(),
      name: i.string(),
    }),
    tags: i.entity({
      label: i.string(),
    }),
  },
  {
    authorPosts: {
      forward: {
        on: "authors",
        has: "many",
        label: "posts",
      },
      reverse: {
        on: "posts",
        has: "one",
        label: "author",
      },
    },
    postsTags: {
      forward: {
        on: "posts",
        has: "many",
        label: "tags",
      },
      reverse: {
        on: "tags",
        has: "many",
        label: "posts",
      },
    },
  },
);


export default graph;
`;
}

const examplePermsTmpl = /* ts */ `export default {
  authors: {
    bind: ["isAuthor", "auth.id == data.userId"],
    allow: {
      view: "true",
      create: "isAuthor",
      update: "isAuthor",
      delete: "isAuthor",
    },
  },
  posts: {
    bind: ["isAuthor", "auth.id in data.ref('authors.userId')"],
    allow: {
      view: "true",
      create: "isAuthor",
      update: "isAuthor",
      delete: "isAuthor",
    },
  },
  tags: {
    bind: ["isOwner", "auth.id in data.ref('posts.authors.userId')"],
    allow: {
      view: "true",
      create: "isOwner",
      update: "isOwner",
      delete: "isOwner",
    },
  },
};
`;

function generateSchemaTypescriptFile(id, schema, title, instantModuleName) {
  const entitiesEntriesCode = sortedEntries(schema.blobs)
    .map(([name, attrs]) => {
      // a block of code for each entity
      return [
        `  `,
        `"${name}"`,
        `: `,
        `i.entity`,
        `({`,
        `\n`,
        // a line of code for each attribute in the entity
        sortedEntries(attrs)
          .filter(([name]) => name !== "id")
          .map(([name, config]) => {
            const type = config["checked-data-type"] || "any";

            return [
              `    `,
              `"${name}"`,
              `: `,
              `i.${type}()`,
              config["unique?"] ? ".unique()" : "",
              config["index?"] ? ".indexed()" : "",
              `,`,
            ].join("");
          })
          .join("\n"),
        `\n`,
        `  `,
        `})`,
        `,`,
      ].join("");
    })
    .join("\n");

  const entitiesObjCode = `{\n${entitiesEntriesCode}\n}`;

  const linksEntriesCode = Object.fromEntries(
    sortedEntries(schema.refs).map(([_name, config]) => {
      const [, fe, flabel] = config["forward-identity"];
      const [, re, rlabel] = config["reverse-identity"];
      const [fhas, rhas] = rels[`${config.cardinality}-${config["unique?"]}`];
      return [
        `${fe}${capitalizeFirstLetter(flabel)}`,
        {
          forward: {
            on: fe,
            has: fhas,
            label: flabel,
          },
          reverse: {
            on: re,
            has: rhas,
            label: rlabel,
          },
        },
      ];
    }),
  );

  return `// ${title}
// ${appDashUrl(id)}

import { i } from "${instantModuleName ?? "@instantdb/core"}";

const graph = i.graph(
${indentLines(entitiesObjCode, 1)},
${indentLines(JSON.stringify(linksEntriesCode, null, "  "), 1)}
);

export default graph;
`;
}
