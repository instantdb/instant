// @ts-check

import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import chalk from "chalk";
import { program } from "commander";
import { input, confirm } from "@inquirer/prompts";
import envPaths from "env-paths";
import { loadConfig } from "unconfig";
import { packageDirectory } from "pkg-dir";
import openInBrowser from "open";

// config

const dev = Boolean(process.env.DEV);
const verbose = Boolean(process.env.VERBOSE);

const instantDashOrigin = dev
  ? "http://localhost:3000"
  : "https://instantdb.com";

const instantBackendOrigin = dev
  ? "http://localhost:8888"
  : "https://api.instantdb.com";

// cli

program
  .name("instant-cli")
  .description(
    `
${chalk.magenta(`Instant CLI`)}
Docs: ${chalk.underline(`https://www.instantdb.com/docs/cli`)}
Dash: ${chalk.underline(`https://www.instantdb.com/dash`)}
Discord: ${chalk.underline(`https://discord.com/invite/VU53p7uQcE`)}`.trim(),
  )
  .option("-t --token <TOKEN>", "auth token override")
  .option("-y", "skip confirmation prompt");

program
  .command("login")
  .description("Authenticates with Instant")
  .action(login);

program
  .command("init")
  .description("Creates a new app with configuration files")
  .action(init);

program
  .command("push-schema")
  .description("Pushes local instant.schema definition to production.")
  .action(pushSchema);

program
  .command("push-perms")
  .description("Pushes local instant.perms rules to production.")
  .action(pushPerms);

program
  .command("push")
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
  .action(pullSchema);

program
  .command("pull-perms")
  .argument("[ID]")
  .description(
    "Generates an initial instant.perms definition from production rules.",
  )
  .action(pullPerms);

program
  .command("pull")
  .argument("[ID]")
  .description(
    "Generates initial instant.schema and instant.perms definition from production state.",
  )
  .action(pullAll);

const options = program.opts();

program.parse(process.argv);

// command actions

async function pushAll() {
  await pushSchema();
  await pushPerms();
}

async function pullAll(inputAppId) {
  await pullSchema(inputAppId);
  await pullPerms(inputAppId);
}

async function login() {
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
  await saveConfigAuthToken(token);

  console.log(chalk.green(`Successfully logged in as ${email}!`));
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
  console.log(`Your app ID: ${id}`);
  console.log(chalk.underline(appDashUrl(id)));

  if (!schema) {
    const schemaPath = join(pkgDir, "instant.schema.ts");
    await writeFile(
      schemaPath,
      instantSchemaTmpl(title, id, instantModuleName),
      "utf-8",
    );
    console.log("Start building your schema: " + schemaPath);
  } else {
    console.warn(`Make sure to update your app ID in instant.schema!`);
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

async function pullSchema(inputAppId) {
  const pkgDir = await packageDirectory();
  if (!pkgDir) {
    console.error("Failed to locate app root dir.");
    return;
  }

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

  const appId = inputAppId ?? (await readLocalSchemaFile())?.appId;
  if (!appId) {
    console.error(
      "No app ID found. Please provide an app ID: `instant-cli pull-schema <ID>`",
    );
    return;
  }

  console.log("Pulling schema...");

  const pullRes = await fetchJson({
    path: `/dash/apps/${appId}/schema/pull`,
    debugName: "Schema pull",
    errorMessage: "Failed to pull schema.",
  });

  if (!pullRes.ok) return;

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
}

async function pullPerms(inputAppId) {
  console.log("Pulling perms...");

  const appId = inputAppId ?? (await readLocalSchemaFile())?.appId;
  if (!appId) {
    console.error("Please provide an app ID: `instant-cli pull-schema <ID>`");
    return;
  }

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
}

async function pushSchema() {
  const schema = await readLocalSchemaFileWithErrorLogging();
  if (!schema) return;

  const okStart = await promptOk(
    "Pushing schema.  This will immediately overwrite your production schema. OK to proceed?",
  );
  if (!okStart) return;

  console.log("Planning...");

  const planRes = await fetchJson({
    method: "POST",
    path: `/dash/apps/${schema.appId}/schema/push/plan`,
    debugName: "Schema plan",
    errorMessage: "Failed to update schema.",
    body: {
      schema,
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
    const [, fns, fname] = attr["forward-identity"];
    const [, rns, rname] = attr["reverse-identity"] ?? [null, null, null];

    if (attr["value-type"] === "blob" && fname === "id") {
      console.log(
        `${action === "add-attr" ? chalk.magenta("ADD ENTITY") : chalk.magenta("UPDATE ENTITY")} ${fns}`,
      );
    } else if (attr["value-type"] === "blob") {
      console.log(
        `${action === "add-attr" ? chalk.green("ADD ATTR") : chalk.blue("UPDATE ATTR")} ${fns}.${fname} :: unique=${attr["unique?"]}, indexed=${attr["index?"]}`,
      );
    } else {
      console.log(
        `${action === "add-attr" ? chalk.green("ADD LINK") : chalk.blue("UPDATE LINK")} ${fns}.${fname} <=> ${rns}.${rname}`,
      );
    }
  }

  const okPush = await promptOk("OK to proceed?");
  if (!okPush) return;

  const applyRes = await fetchJson({
    method: "POST",
    path: `/dash/apps/${schema.appId}/schema/push/apply`,
    debugName: "Schema apply",
    errorMessage: "Failed to update schema.",
    body: {
      schema,
    },
  });

  if (!applyRes.ok) return;

  console.log(chalk.green("Schema updated!"));
}

async function pushPerms() {
  const schema = await readLocalSchemaFileWithErrorLogging();
  if (!schema) return;

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
    path: `/dash/apps/${schema.appId}/rules`,
    debugName: "Schema apply",
    errorMessage: "Failed to update schema.",
    body: {
      code: perms,
    },
  });

  if (!permsRes.ok) return;

  console.log(chalk.green("Permissions updated!"));
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
      console.error("Unauthenticated.  Please log in with `instant-cli login`");
      return { ok: false, data: undefined };
    }
  }

  const res = await fetch(`${instantBackendOrigin}${path}`, {
    method: method ?? "GET",
    headers: {
      ...(withAuth ? { Authorization: `Bearer ${authToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (verbose) {
    console.log(debugName, "response:", res.status, res.statusText);
  }

  if (!res.ok) {
    if (withErrorLogging) {
      console.error(errorMessage);
    }
    let errData;
    try {
      errData = await res.json();
      if (withErrorLogging) {
        if (errData?.message) {
          console.error(errData.message);
        }

        if (Array.isArray(errData?.hint?.errors)) {
          for (const error of errData.hint.errors) {
            console.error(`${error.in.join("->")}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      if (withErrorLogging) {
        console.error("Failed to parse error response");
      }
    }

    return { ok: false, data: errData };
  }

  const data = await res.json();

  if (verbose) {
    console.log(debugName, "data:", data);
  }

  return {
    ok: true,
    data,
  };
}

async function promptOk(message) {
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

async function readLocalSchemaFileWithErrorLogging() {
  const schema = await readLocalSchemaFile();

  if (!schema) {
    console.error("Missing instant.schema file!");
    return;
  }

  if (!schema.appId) {
    console.error("Missing app ID in instant.schema!");
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
  if (options.token) {
    return options.token;
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

// templates and constants

export const rels = {
  "many-false": ["many", "many"],
  "one-true": ["one", "one"],
  "many-true": ["many", "one"],
  "one-false": ["one", "many"],
};

function appDashUrl(id) {
  return `${instantDashOrigin}/dash?s=main&t=home&app=${id}`;
}

function instantSchemaTmpl(title, id, instantModuleName) {
  return /* ts */ `// ${title}
// ${appDashUrl(id)}

import { i } from "${instantModuleName ?? "@instantdb/core"}";

const INSTANT_APP_ID = "${id}";

// Example entities and links (you can delete these!)
const graph = i.graph(
  INSTANT_APP_ID,
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
            return [
              `    `,
              `"${name}"`,
              `: `,
              `i.any()`,
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
    sortedEntries(schema.refs).map(([name, config]) => {
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

const INSTANT_APP_ID = "${id}";

const graph = i.graph(
  INSTANT_APP_ID,
${indentLines(entitiesObjCode, 1)},
${indentLines(JSON.stringify(linksEntriesCode, null, "  "), 1)}
);

export default graph;
`;
}
