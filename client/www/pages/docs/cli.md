---
title: Instant CLI
description: How to use the Instant CLI to manage schema and permissions.
---

The Instant CLI was designed to drive your Instant application entirely from a project's codebase. You can create apps, define your data model, and update your permissions, **all through your terminal**.

## Init

To get started, head on over to your project's root repository, and write:

```shell {% showCopy=true %}
npx instant-cli@latest init
```

This will guide you through picking an Instant app and generate two files for you:

- `instant.schema.ts` defines your application's data model.
- `instant.perms.ts` defines your permission rules.

To learn how to change `instant.schema.ts`, check our [Modeling Data](/docs/modeling-data). For `instant.perms.ts`, check out the [permissions](/docs/permissions) page.

## Push

When you're ready to publish your changes to `instant.schema.ts`, run:

```shell {% showCopy=true %}
npx instant-cli@latest push schema
```

This will evaluate your schema, compare it with production, and migrate your data model.

{% callout %}

`push schema` doesn't support _renaming_ or _deleting_ attributes yet. To do this, use the [Explorer](/docs/modeling-data#update-or-delete-attributes)

{% /callout %}

Similarly, when you change `instant.perms.ts`, you can run:

```shell {% showCopy=true %}
npx instant-cli@latest push perms
```

## Pull

Sometimes, you change your schema or rules from your Explorer. If you want to `pull` the latest version of schema and perms for production, write:

```shell {% showCopy=true %}
npx instant-cli@latest pull
```

This will generate new `instant.schema.ts` and `instant.perms.ts` files, based on your production state.

## Export

You can export your database to local files using the `export` command:

```shell {% showCopy=true %}
npx instant-cli@latest export
```

### Export Features

- Export schema, permissions, entities and relationships
- Export between different apps
- Preserve all relationship links between entities
- Fast batch processing with configurable batch sizes
- User-friendly CLI with progress indicators

### Export Examples

```shell {% showCopy=true %}
# Preview export (dry run)
npx instant-cli@latest export -a your-app-id --dry-run

# Default export (limits to 10 entities per namespace)
npx instant-cli@latest export -a your-app-id

# Full export (only run when you're ready)
npx instant-cli@latest export -a your-app-id --limit none

# Export with custom batch size and sleep time
npx instant-cli@latest export -a your-app-id --limit none --batch-size 50 --sleep 200

# Export with verbose logging
npx instant-cli@latest export -a your-app-id --limit none --verbose
```

### Export Directory Structure

```
instant-export/
└── 2025-04-24_20-58-50/
    ├── metadata.json       # Export metadata and summary
    ├── schema.json         # Database schema
    ├── permissions.json    # Access rules
    └── namespaces/         # Entity data by namespace
        ├── todos.json
        ├── users.json
        ├── comments.json
        ├── $users.json     # System users table
        └── ...
```

## Import

You can import your database from local files using the `import` command:

```shell {% showCopy=true %}
npx instant-cli@latest import
```

### Import Features

- Import schema, permissions, entities, and relationships
- Import between different apps
- Preserve all relationship links between entities
- Prompts for backup before import
- User mappings preserve relationships when importing to a different app

### Import Examples

```shell {% showCopy=true %}
# Preview import (dry run)
npx instant-cli@latest import -a your-app-id --dry-run

# Basic import (will prompt for confirmation)
npx instant-cli@latest import -a your-app-id

# Import from specific directory with custom settings
npx instant-cli@latest import -a your-app-id --input ./instant-export/2025-04-27_15-30-45 --batch-size 50 --sleep 200

# Force import without confirmation
npx instant-cli@latest import -a your-app-id --force
```

### Import Notes

{% callout type="warning" %}
**WARNING**: Import will clear all existing data in the destination app. Automatic backup is offered before import for safety.
{% /callout %}

- $users table is handled specially - only adds missing users, doesn't remove existing ones
- $files table is not currently supported
- The tool maintains metadata about imports/exports for traceability

## Migrate

The Migration Tool allows you to export data from an InstantDB app, transform it using JavaScript migration scripts, and optionally re-import the transformed data back to the app.

```shell {% showCopy=true %}
npx instant-cli@latest migrate ./my-migration-script.js
```

### Basic Migration Usage

```shell {% showCopy=true %}
# Run a single migration script
npx instant-cli@latest migrate ./my-migration-script.js

# Run multiple migration scripts in sequence
npx instant-cli@latest migrate ./script1.js ./script2.js ./script3.js

# Export data, run migrations, then import changes back to the app
npx instant-cli@latest migrate ./my-migration-script.js --publish

# Use an existing export as the base
npx instant-cli@latest migrate ./my-migration-script.js --base ./instant-export/2025-04-27_12-34-56

# Select an export interactively
npx instant-cli@latest migrate ./my-migration-script.js --base select
```

### Migration Command Options

```
Options:
  -a, --app <app-id>        App ID to migrate. Defaults to *_INSTANT_APP_ID in .env
  -b, --base <base-dir>     Base directory to use for migration. Can be an export directory,
                            "select" to choose from available exports, or omitted to export current app.
  --publish                 Import migrated data back to the app after migration completes
  --batch-size <size>       Number of entities to process in each API request batch (for export/import)
  --sleep <ms>              Milliseconds to sleep between API request batches (for rate limiting)
  --verbose                 Print detailed logs during migration process
  --force                   Skip confirmation prompts
  -h, --help                Display help
```

### Writing Migration Scripts

Migration scripts are JavaScript files that export a default function or a `migrate` function. The function receives a context object with access to the database and logging utilities.

Here's a simple migration script:

```javascript
// my-migration.js
module.exports = async function({ db, log }) {
  log.info('Starting migration');
  
  // Modify schema
  if (db.schema.refs.oldReference) {
    delete db.schema.refs.oldReference;
    log.info('Removed old reference');
  }
  
  // Update permissions
  db.permissions.posts = {
    allow: { view: true, create: true, update: "$user.id == entity.author.id" }
  };
  
  // Update entities
  for (const id of Object.keys(db.entities.todos)) {
    const todo = db.entities.todos[id];
    todo.priority = 'high';
    log.info(`Updated todo ${id}`);
  }
  
  log.success('Migration completed');
}

// Alternatively, you can export the function as 'migrate'
// module.exports.migrate = async function({ db, log }) { ... }
```

### Migration Context

The migration function receives a context object with the following properties:

#### `db` Object

The `db` object provides direct access to the database:

- `db.schema` - Access and modify the schema
- `db.permissions` - Access and modify permissions
- `db.entities` - Access and modify entities by namespace and ID

#### `log` Object

The `log` object provides logging utilities:

- `log.info(message)` - Log an informational message
- `log.success(message)` - Log a success message
- `log.warning(message)` - Log a warning message
- `log.error(message)` - Log an error message

### Migration Examples

#### Modifying Schema

```javascript
// Add a new reference
db.schema.refs.newRelationship = {
  'forward-identity': ['one', 'users', 'projects'],
  'reverse-identity': ['many', 'projects', 'members']
};

// Remove a reference
delete db.schema.refs.oldReference;
```

#### Updating Permissions

```javascript
// Set permissions for a namespace
db.permissions.projects = {
  allow: {
    create: true,
    view: true,
    update: "$user.id == entity.owner.id",
    delete: "$user.id == entity.owner.id"
  }
};
```

#### Working with Entities

```javascript
// Get all todo IDs
const todoIds = Object.keys(db.entities.todos);

// Access an entity
const todo = db.entities.todos['some-id'];

// Update an entity
todo.completed = true;
todo.completedAt = new Date().toISOString();

// Create a new entity
const newId = crypto.randomUUID();
db.entities.categories[newId] = {
  id: newId,
  name: 'Important',
  color: '#FF0000'
};

// Delete an entity
delete db.entities.temp_data['outdated-id'];
```

#### Handling Relationships

```javascript
// Scenario: Remove all posts containing a specific phrase from a user's posts list

// Get the user entity
const userId = 'user-123';
const user = db.entities.users[userId];

if (user && user.posts && Array.isArray(user.posts)) {
  const targetPhrase = 'inappropriate content';
  log.info(`Scanning ${user.posts.length} posts for "${targetPhrase}"`);
  
  // Posts to keep (we'll rebuild the list)
  const postsToKeep = [];
  // Track removed posts for logging
  const removedPostIds = [];
  
  // Process each post reference
  for (const postRef of user.posts) {
    const postId = postRef.id;
    const post = db.entities.posts[postId];
    
    // Skip if post doesn't exist in the database
    if (!post) continue;
    
    // Check if post body contains the target phrase
    if (post.body && post.body.toLowerCase().includes(targetPhrase.toLowerCase())) {
      // This post contains the target phrase - don't add to postsToKeep
      removedPostIds.push(postId);
      
      // Optionally, add a flag to the post entity itself
      post.flaggedForReview = true;
    } else {
      // This post is clean - keep it
      postsToKeep.push(postRef);
    }
  }
  
  // Update the user's posts array with only the posts to keep
  user.posts = postsToKeep;
  
  if (removedPostIds.length > 0) {
    log.success(`Removed ${removedPostIds.length} posts containing "${targetPhrase}" from user ${userId}`);
    log.info(`Removed post IDs: ${removedPostIds.join(', ')}`);
  } else {
    log.info(`No posts found containing "${targetPhrase}"`);
  }
}
```

### How Migration Works

1. The migration tool exports your app data (or uses an existing export).
2. It creates a workspace with `before` and `after` directories in `instant-migrate/TIMESTAMP/`.
3. It runs your migration scripts on the data in the `after` directory.
4. Optionally, it imports the transformed data back to your app with the `--publish` flag.

All changes are saved in the workspace, so you can review them before publishing.

## Performance Tips for Data Operations

- For large datasets, increase the batch size (`--batch-size 200`)
- If hitting rate limits, increase sleep time (`--sleep 500`)
- Use `--verbose` for detailed logging during export/import/migrate operations
- Use `--dry-run` to preview operations before execution

## App ID

Whenever you run a CLI command, we look up your app id. You can either provide an app id as an option:

```shell
  npx instant-cli@latest init --app $MY_APP_ID
```

Or store it in your `.env` file:

```yaml
INSTANT_APP_ID=*****
```

As a convenience, apart from `INSTANT_APP_ID`, we also check for:

- `NEXT_PUBLIC_INSTANT_APP_ID` for next apps,
- `PUBLIC_INSTANT_APP_ID` for svelte apps,
- `VITE_INSTANT_APP_ID` for vite apps
- `NUXT_PUBLIC_INSTANT_APP_ID` for nuxt apps
- `EXPO_PUBLIC_INSTANT_APP_ID` for expo apps

## Where to save files

By default, Instant will search for your `instant.schema.ts` and `instant.perms.ts` file in:

1. The `root` directory: `./`
2. The `src` directory: `./src`
3. The `app` directory: `./app`

If you'd like to save them in a custom location, you can set the following environment variables:

- `INSTANT_SCHEMA_FILE_PATH` sets the location for your `instant.schema.ts` file.
- `INSTANT_PERMS_FILE_PATH` sets the location for your `instant.perms.ts` file.

```yaml
# in your .env file
INSTANT_SCHEMA_FILE_PATH=./src/db/instant.schema.ts
INSTANT_PERMS_FILE_PATH=./src/db/instant.perms.ts
```

## Authenticating in CI

In CI or similar environments, you may want to handle authentication without having to go through a web-based validation step each time.

In these cases, you can provide a `INSTANT_CLI_AUTH_TOKEN` environment variable.

To obtain a token for later use, run:

```shell {% showCopy=true %}
npx instant-cli@latest login -p
```

Instead of saving the token to your local device, the CLI will print it to your console. You can copy this token and provide it as `INSTANT_CLI_AUTH_TOKEN` later in your CI tool.
