import { mkdir, writeFile, readFile, readdir, copyFile } from 'fs/promises';
import { readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { exportData } from './export.js';
import { importData } from './import.js';

/**
 * Console output styling helper
 */
const log = {
  header: (message: string) => console.log('\n' + chalk.bold.blue('▶︎ ' + message)),
  step: (step: number, totalSteps: number, message: string) => console.log(chalk.bold.cyan(`[${step}/${totalSteps}] ${message}`)),
  success: (message: string) => console.log(chalk.green('✓ ') + message),
  warning: (message: string) => console.log(chalk.yellow('⚠ ') + message),
  error: (message: string) => console.log(chalk.red('✗ ') + message),
  info: (message: string) => console.log(chalk.dim('• ') + message)
};

/**
 * Generate a timestamp string suitable for directory naming
 * Format: YYYY-MM-DD_HH-MM-SS
 */
function generateTimestampDirName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * Check if a path exists
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    const { stat } = await import('fs/promises');
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sleep for the specified number of milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Find all available exports by reading metadata.json files
 * @returns Array of export options sorted by timestamp (newest first)
 */
async function findExports(baseDir = 'instant-export'): Promise<Array<{
  path: string;
  timestamp: string;
  appName: string;
  entities: number;
  exportedAt: string;
}>> {
  try {
    // Check if export directory exists
    try {
      const { stat } = await import('fs/promises');
      const stats = await stat(baseDir);
      if (!stats.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }
    
    // List all directories in the export folder
    const dirs = await readdir(baseDir);
    const exportOptions = [];
    
    for (const dir of dirs) {
      const metadataPath = join(baseDir, dir, 'metadata.json');
      try {
        const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));
        exportOptions.push({
          path: join(baseDir, dir),
          timestamp: dir,
          appName: metadata.appName || 'Unknown app',
          entities: metadata.summary.namespaces.reduce((sum, ns) => sum + ns.entityCount, 0),
          exportedAt: metadata.endTimestamp || 'Unknown date'
        });
      } catch (err) {
        // Skip directories without valid metadata.json
      }
    }
    
    // Sort by timestamp (newest first)
    return exportOptions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (err) {
    return [];
  }
}

/**
 * Copy a directory recursively
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

interface PackageAndAuthInfo {
  pkgDir: string;
  authToken: string;
  instantModuleName?: string;
}

interface MigrateOptions {
  base?: string;
  publish?: boolean;
  verbose?: boolean;
  batchSize?: number;
  sleep?: number;
  force?: boolean;
}

/**
 * Database proxy class that handles loading and saving data files
 */
class DBProxy {
  private dataDir: string;
  private _modified: boolean = false;
  private _schema: any = null;
  private _permissions: any = null;
  private _entities: any = {};
  private _schemaLoaded: boolean = false;
  private _permissionsLoaded: boolean = false;
  private _entitiesLoaded: boolean = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Check if any data has been modified
   */
  get modified() {
    return this._modified;
  }

  /**
   * Get schema data with lazy loading
   */
  get schema() {
    if (!this._schemaLoaded) {
      this._loadSchema();
    }
    return this._schema;
  }

  /**
   * Get permissions data with lazy loading
   */
  get permissions() {
    if (!this._permissionsLoaded) {
      this._loadPermissions();
    }
    return this._permissions;
  }

  /**
   * Get entities data with lazy loading
   */
  get entities() {
    if (!this._entitiesLoaded) {
      this._loadEntities();
    }
    return this._entities;
  }

  /**
   * Load schema data
   */
  private _loadSchema() {
    try {
      const schemaPath = join(this.dataDir, 'schema.json');
      const schemaData = require(schemaPath);
      this._schema = schemaData;
      this._schemaLoaded = true;
      
      // Create proxy for schema to track changes
      this._schema = new Proxy(this._schema, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
    } catch (err) {
      this._schema = {};
      this._schemaLoaded = true;
    }
  }

  /**
   * Load permissions data
   */
  private _loadPermissions() {
    try {
      const permissionsPath = join(this.dataDir, 'permissions.json');
      if (pathExists(permissionsPath)) {
        const permissionsData = require(permissionsPath);
        this._permissions = permissionsData;
      } else {
        this._permissions = {};
      }
      this._permissionsLoaded = true;
      
      // Create proxy for permissions to track changes
      this._permissions = new Proxy(this._permissions, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
    } catch (err) {
      this._permissions = {};
      this._permissionsLoaded = true;
    }
  }

  /**
   * Load entities data
   */
  private _loadEntities() {
    try {
      const namespacesDir = join(this.dataDir, 'namespaces');
      const namespaceFiles = readdirSync(namespacesDir);
      
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        const namespaceName = file.replace('.json', '');
        const filePath = join(namespacesDir, file);
        const entities = require(filePath);
        
        // Create an entity map by ID
        const entityMap = {};
        for (const entity of entities) {
          entityMap[entity.id] = entity;
        }
        
        // Create a proxy for this namespace's entities
        this._entities[namespaceName] = new Proxy(entityMap, {
          set: (target, prop, value) => {
            this._modified = true;
            target[prop] = value;
            return true;
          },
          deleteProperty: (target, prop) => {
            this._modified = true;
            delete target[prop];
            return true;
          }
        });
      }
      
      // Create the top-level proxy for entities
      this._entities = new Proxy(this._entities, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
      
      this._entitiesLoaded = true;
    } catch (err) {
      this._entities = {};
      this._entitiesLoaded = true;
    }
  }

  /**
   * Load all data from files synchronously
   */
  loadSync() {
    if (!this._schemaLoaded) this._loadSchema();
    if (!this._permissionsLoaded) this._loadPermissions();
    if (!this._entitiesLoaded) this._loadEntities();
    return this;
  }

  /**
   * Load all data from files
   */
  async load() {
    // Load schema
    const schemaPath = join(this.dataDir, 'schema.json');
    try {
      this._schema = JSON.parse(await readFile(schemaPath, 'utf-8'));
      
      // Create proxy for schema to track changes
      this._schema = new Proxy(this._schema, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
    } catch (err) {
      this._schema = {};
    }
    this._schemaLoaded = true;
    
    // Load permissions if they exist
    const permissionsPath = join(this.dataDir, 'permissions.json');
    try {
      if (await pathExists(permissionsPath)) {
        this._permissions = JSON.parse(await readFile(permissionsPath, 'utf-8'));
      } else {
        this._permissions = {};
      }
      
      // Create proxy for permissions to track changes
      this._permissions = new Proxy(this._permissions, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
    } catch (err) {
      this._permissions = {};
    }
    this._permissionsLoaded = true;
    
    // Load all namespaces
    this._entities = {};
    const namespacesDir = join(this.dataDir, 'namespaces');
    try {
      const namespaceFiles = await readdir(namespacesDir);
      
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        const namespaceName = file.replace('.json', '');
        const entities = JSON.parse(await readFile(join(namespacesDir, file), 'utf-8'));
        
        // Create an entity map by ID
        const entityMap = {};
        for (const entity of entities) {
          entityMap[entity.id] = entity;
        }
        
        // Create a proxy for this namespace's entities
        this._entities[namespaceName] = new Proxy(entityMap, {
          set: (target, prop, value) => {
            this._modified = true;
            target[prop] = value;
            return true;
          },
          deleteProperty: (target, prop) => {
            this._modified = true;
            delete target[prop];
            return true;
          }
        });
      }
      
      // Create the top-level proxy for entities
      this._entities = new Proxy(this._entities, {
        set: (target, prop, value) => {
          this._modified = true;
          target[prop] = value;
          return true;
        },
        deleteProperty: (target, prop) => {
          this._modified = true;
          delete target[prop];
          return true;
        }
      });
    } catch (err) {
      // Namespaces directory might not exist yet
    }
    this._entitiesLoaded = true;
    
    return this;
  }

  /**
   * Save all modified data back to files
   */
  async save() {
    if (!this._modified) {
      return this;
    }

    // Save schema
    await writeFile(
      join(this.dataDir, 'schema.json'),
      JSON.stringify(this._schema, null, 2)
    );

    // Save permissions if not empty
    if (this._permissions && Object.keys(this._permissions).length > 0) {
      await writeFile(
        join(this.dataDir, 'permissions.json'),
        JSON.stringify(this._permissions, null, 2)
      );
    }

    // Save each namespace
    const namespacesDir = join(this.dataDir, 'namespaces');
    await mkdir(namespacesDir, { recursive: true });

    for (const [namespace, entityMap] of Object.entries(this._entities)) {
      // Skip empty namespaces
      if (!entityMap || Object.keys(entityMap).length === 0) continue;

      // Convert entity map back to array for storage
      const entities = Object.values(entityMap);
      
      await writeFile(
        join(namespacesDir, `${namespace}.json`),
        JSON.stringify(entities, null, 2)
      );
    }

    return this;
  }
}

/**
 * Create a migration context that will be passed to migration scripts
 */
async function createMigrationContext(dataDir: string) {
  const db = new DBProxy(dataDir);
  await db.load();
  
  return {
    db,
    log
  };
}

/**
 * Run a migration script
 */
async function runMigrationScript(scriptPath: string, context: any) {
  try {
    // Resolve the script path relative to the current working directory
    const { resolve } = await import('path');
    const absoluteScriptPath = resolve(process.cwd(), scriptPath);
    
    const scriptModule = await import(absoluteScriptPath);
    
    if (typeof scriptModule.default === 'function') {
      await scriptModule.default(context);
    } else if (typeof scriptModule.migrate === 'function') {
      await scriptModule.migrate(context);
    } else {
      throw new Error(`Migration script ${scriptPath} does not export a default or migrate function`);
    }
    
    // Save any changes after script completes
    if (context.db.modified) {
      await context.db.save();
    }
    
    return true;
  } catch (err) {
    log.error(`Failed to run migration script ${scriptPath}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Migrate data from an app, transform it, and optionally import it back
 * @param appId - The app ID to migrate
 * @param migrationScripts - Paths to migration scripts to run
 * @param pkgAndAuthInfo - Authentication info
 * @param opts - Migration options
 * @returns Object indicating success or failure
 */
export async function migrateData(
  appId: string,
  migrationScripts: string[],
  pkgAndAuthInfo: PackageAndAuthInfo,
  opts: MigrateOptions
): Promise<{ ok: boolean }> {
  // Record start time
  const startTime = new Date();
  const timestamp = generateTimestampDirName(startTime);
  
  const baseDir = 'instant-migrate';
  const migrateDir = join(baseDir, timestamp);
  const beforeDir = join(migrateDir, 'before');
  const afterDir = join(migrateDir, 'after');
  
  log.header("STARTING MIGRATION");
  
  // Create migration directories
  try {
    await mkdir(migrateDir, { recursive: true });
    await mkdir(beforeDir, { recursive: true });
    await mkdir(afterDir, { recursive: true });
    log.success(`Created migration workspace at ${chalk.dim(migrateDir)}`);
  } catch (err) {
    log.error(`Failed to create required directories: ${(err as Error).message}`);
    return { ok: false };
  }
  
  // Step 1: Get base data (export or use specified base)
  let baseDataDir: string;
  
  if (opts.base === 'select') {
    // Let user select from available exports
    const exports = await findExports();
    
    if (exports.length === 0) {
      log.error('No exports found in instant-export directory');
      return { ok: false };
    }
    
    const { selectedExport } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedExport',
      message: 'Select an export to use as base:',
      choices: exports.map(exp => ({
        name: `${chalk.bold(exp.appName)} (${exp.entities} entities) - ${chalk.dim(exp.timestamp)}`,
        value: exp.path
      }))
    }]);
    
    baseDataDir = selectedExport;
  } else if (opts.base && await pathExists(opts.base)) {
    // Use specified base directory
    baseDataDir = opts.base;
  } else {
    // Export app data
    log.info(`Exporting app ${appId} to use as migration base...`);
    
    const exportResult = await exportData(appId, pkgAndAuthInfo, {
      output: beforeDir,
      limit: 'none',
      batchSize: opts.batchSize || 100,
      sleep: opts.sleep || 100,
      verbose: opts.verbose || false
    });
    
    if (!exportResult.ok) {
      log.error('Failed to export app data');
      return { ok: false };
    }
    
    baseDataDir = beforeDir;
  }
  
  // Copy base data to before directory if not already there
  if (baseDataDir !== beforeDir) {
    log.info(`Copying base data to migration workspace...`);
    await copyDir(baseDataDir, beforeDir);
  }
  
  // Copy before directory to after directory (we'll modify this one)
  log.info(`Preparing migration workspace...`);
  await copyDir(beforeDir, afterDir);
  
  // Load migration metadata
  const metadata = {
    appId,
    startTime: startTime.toISOString(),
    scripts: migrationScripts.map(script => basename(script)),
    changes: [] as Array<{ script: string, changes: number }>,
    endTime: '',
    summary: {
      totalScripts: migrationScripts.length,
      totalChanges: 0
    }
  };
  
  // Step 2: Run migration scripts
  log.header("RUNNING MIGRATION SCRIPTS");
  
  const totalScripts = migrationScripts.length;
  let successCount = 0;
  
  for (let i = 0; i < migrationScripts.length; i++) {
    const scriptPath = migrationScripts[i];
    const scriptName = basename(scriptPath);
    
    log.step(i + 1, totalScripts, `Running migration script: ${chalk.bold(scriptName)}`);
    
    // Create migration context with data from "after" directory
    const context = await createMigrationContext(afterDir);
    
    // Run migration script
    const spinner = ora(`Executing script...`).start();
    const success = await runMigrationScript(scriptPath, context);
    
    if (!success) {
      spinner.fail(`Script ${scriptName} failed`);
      continue;
    }
    
    // Check if changes were made
    if (context.db.modified) {
      spinner.succeed(`Script ${scriptName} completed with changes`);
      
      // Record changes in metadata
      metadata.changes.push({
        script: scriptName,
        changes: 1 // We don't have an exact count, just indicating changes occurred
      });
      
      metadata.summary.totalChanges += 1;
    } else {
      spinner.succeed(`Script ${scriptName} completed (no changes)`);
    }
    
    successCount++;
  }
  
  // Update and save metadata
  metadata.endTime = new Date().toISOString();
  await writeFile(
    join(migrateDir, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
  );
  
  log.header("MIGRATION SUMMARY");
  log.success(`${successCount} of ${totalScripts} scripts completed successfully`);
  log.info(`Migration workspace: ${chalk.dim(migrateDir)}`);
  log.info(`- Before: ${chalk.dim(beforeDir)}`);
  log.info(`- After: ${chalk.dim(afterDir)}`);
  
  // Step 3: Publish changes if requested
  if (opts.publish) {
    log.header("PUBLISHING CHANGES");
    
    if (successCount < totalScripts) {
      log.warning(`Some migration scripts failed. Are you sure you want to publish?`);
      
      if (!opts.force) {
        const { confirmPublish } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirmPublish',
          message: 'Proceed with publishing despite script failures?',
          default: false
        }]);
        
        if (!confirmPublish) {
          log.info('Publishing canceled');
          return { ok: true };
        }
      }
    }
    
    // Import the migrated data
    log.info(`Importing migrated data to app ${appId}...`);
    
    const importResult = await importData(appId, pkgAndAuthInfo, {
      input: afterDir,
      dryRun: false,
      batchSize: opts.batchSize || 100,
      sleep: opts.sleep || 100,
      verbose: opts.verbose || false,
      force: opts.force || false
    });
    
    if (!importResult.ok) {
      log.error('Failed to import migrated data');
      return { ok: false };
    }
    
    log.success('Migration published successfully');
  } else {
    log.info('Migration completed without publishing changes. Use --publish to apply changes to the app.');
  }
  
  return { ok: true };
} 