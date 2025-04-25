import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { exportData as exportAppData } from './export.js';

/**
 * Sleep for the specified number of milliseconds
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
 * Find all available exports by reading metadata.json files
 * @returns Array of export options sorted by timestamp (newest first)
 */
async function findExports(): Promise<Array<{
  path: string;
  timestamp: string;
  appName: string;
  entities: number;
  exportedAt: string;
}>> {
  const baseDir = 'instant-export';
  try {
    // Check if export directory exists using stat instead of readFile
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

interface PackageAndAuthInfo {
  pkgDir: string;
  authToken: string;
  instantModuleName?: string;
}

interface ImportOptions {
  input?: string;
  dryRun?: boolean;
  batchSize?: number;
  sleep?: number;
  verbose?: boolean;
  force?: boolean;
}

/**
 * Import schema, permissions, and data from exported JSON files to an Instant app
 * @param appId - The app ID to import to
 * @param pkgAndAuthInfo - Authentication info
 * @param opts - Import options
 * @returns Object indicating success or failure
 */
export async function importData(
  appId: string,
  pkgAndAuthInfo: PackageAndAuthInfo,
  opts: ImportOptions
): Promise<{ ok: boolean }> {
  const { authToken } = pkgAndAuthInfo;
  const dryRun = opts.dryRun || false;
  
  // Record start time
  const startTime = new Date();
  const startTimeFormatted = startTime.toLocaleString(undefined, { timeZoneName: 'short' });
  
  // Set a batch size for pagination to avoid hitting API limits
  const batchSize = opts.batchSize || 100;
  
  // Set sleep time between batches for rate limiting
  // Default to 100ms if not specified
  const sleepTime = opts.sleep !== undefined ? opts.sleep : 100;
  
  // Total steps in the import process
  const TOTAL_STEPS = 10;
  
  // Create import metadata object
  const importMetadata: {
    sourceAppName: string;
    sourceAppId: string;
    sourceExportDate: string;
    destinationAppId: string;
    destinationAppName: string;
    importStarted: string;
    importCompleted: string;
    dryRun: boolean;
    summary: {
      totalEntitiesImported: number;
      totalRelationshipsImported: number;
      userMappingsCreated: number;
      entityTypeCount: number;
      entityTypes: {
        name: string;
        entitiesImported: number;
        relationshipsImported: number;
      }[];
    };
  } = {
    sourceAppName: 'Unknown',
    sourceAppId: 'Unknown',
    sourceExportDate: 'Unknown',
    destinationAppId: appId,
    destinationAppName: 'Unknown',
    importStarted: startTimeFormatted,
    importCompleted: '',
    dryRun,
    summary: {
      totalEntitiesImported: 0,
      totalRelationshipsImported: 0,
      userMappingsCreated: 0,
      entityTypeCount: 0,
      entityTypes: []
    }
  };
  
  log.header(dryRun ? "IMPORT PREVIEW (DRY RUN)" : "STARTING IMPORT");
  log.info(`Batch size: ${batchSize} entities per batch`);
  log.info(`Sleep between batches: ${sleepTime}ms`);

  // Resolve input path - either use specified input or prompt user to select from available exports
  let inputPath = opts.input;
  
  if (!inputPath) {
    const exports = await findExports();
    if (exports.length > 0) {
      // If there are available exports, present them to the user
      const { selectedExport } = await inquirer.prompt([{
        type: 'list',
        name: 'selectedExport',
        message: 'Select an export to import:',
        choices: exports.map(exp => ({
          name: `${chalk.bold(exp.appName)} (${exp.entities} entities) - ${chalk.dim(exp.timestamp)}`,
          value: exp.path
        }))
      }]);
      
      // Use the selected export path
      inputPath = selectedExport;
    } else {
      // Default to 'instant-export' if no specific exports found
      inputPath = 'instant-export';
    }
  }
  
  if (!await pathExists(inputPath)) {
    log.error(`Import directory not found: ${inputPath}`);
    return { ok: false };
  }

  // Create timestamped directory for this import
  const timestamp = generateTimestampDirName();
  const baseDir = 'instant-import';
  const importPath = join(process.cwd(), baseDir, timestamp);
  
  // Create directories
  const namespacesPath = join(importPath, 'namespaces');
  const txFilesPath = join(importPath, 'transactions');
  
  try {
    await mkdir(importPath, { recursive: true });
    await mkdir(namespacesPath, { recursive: true });
    await mkdir(txFilesPath, { recursive: true });
    log.success(`Created import workspace at ${chalk.dim(importPath)}`);
  } catch (err) {
    log.error(`Failed to create required directories: ${(err as Error).message}`);
    return { ok: false };
  }

  // ---------------
  // STEP 1: First fetch app info using the user token to get the admin token
  // ---------------
  log.step(1, TOTAL_STEPS, "Fetching app information");
  
  const apiURI = process.env.INSTANT_CLI_API_URI || 
    (process.env.INSTANT_CLI_DEV ? 'http://localhost:8888' : 'https://api.instantdb.com');
  
  try {
    // First fetch the app info from the /dash endpoint to get the admin token
    const appInfoResponse = await fetch(`${apiURI}/dash`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!appInfoResponse.ok) {
      log.error(`Failed to fetch app information: ${appInfoResponse.status} ${appInfoResponse.statusText}`);
      return { ok: false };
    }
    
    const dashData = await appInfoResponse.json();
    const app = dashData.apps.find((a: any) => a.id === appId);
    
    if (!app) {
      log.error(`Could not find app with ID ${appId} in your account.`);
      return { ok: false };
    }
    
    const adminToken = app.admin_token;
    
    if (!adminToken) {
      log.error('Could not retrieve admin token for the app.');
      return { ok: false };
    }
    
    const appName = app.title;
    log.success(`Found app: ${chalk.bold(appName)}`);
    
    // Set destination app name in metadata
    importMetadata.destinationAppName = appName;
    
    // ---------------
    // STEP 2: Copy and prepare files
    // ---------------
    log.step(2, TOTAL_STEPS, "Preparing import files");
    
    const copySpinner = ora(`Copying files from ${chalk.dim(inputPath)}`).start();
    
    // Locate source files
    const srcSchemaPath = join(inputPath, 'schema.json');
    const srcPermissionsPath = join(inputPath, 'permissions.json');
    const srcNamespacesPath = join(inputPath, 'namespaces');
    const srcMetadataPath = join(inputPath, 'metadata.json');
    
    if (!await pathExists(srcSchemaPath)) {
      copySpinner.fail();
      log.error(`Schema file not found: ${srcSchemaPath}`);
      return { ok: false };
    }
    
    if (!await pathExists(srcNamespacesPath)) {
      copySpinner.fail();
      log.error(`Namespaces directory not found: ${srcNamespacesPath}`);
      return { ok: false };
    }
    
    // Load and copy files to the working directory
    let schema: any = {};
    let permissions: any = {};
    let sourceMetadata: any = {};
    
    try {
      // Copy schema
      schema = JSON.parse(await readFile(srcSchemaPath, 'utf-8'));
      await writeFile(join(importPath, 'schema.json'), JSON.stringify(schema, null, 2));
      
      // Copy permissions if they exist
      if (await pathExists(srcPermissionsPath)) {
        permissions = JSON.parse(await readFile(srcPermissionsPath, 'utf-8'));
        await writeFile(join(importPath, 'permissions.json'), JSON.stringify(permissions, null, 2));
      }
      
      // Read source metadata if it exists
      if (await pathExists(srcMetadataPath)) {
        sourceMetadata = JSON.parse(await readFile(srcMetadataPath, 'utf-8'));
        
        // Update our import metadata with source info
        if (sourceMetadata.appName) importMetadata.sourceAppName = sourceMetadata.appName;
        if (sourceMetadata.appId) importMetadata.sourceAppId = sourceMetadata.appId;
        if (sourceMetadata.endTimestamp) importMetadata.sourceExportDate = sourceMetadata.endTimestamp;
        
        copySpinner.text = `Preparing to import data from app: ${chalk.bold(sourceMetadata.appName || 'Unknown')}`;
        
        // Save original export metadata for reference
        await writeFile(join(importPath, 'source_metadata.json'), JSON.stringify(sourceMetadata, null, 2));
      }
      
      // Copy namespace files
      const namespaceFiles = await readdir(srcNamespacesPath);
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        const content = await readFile(join(srcNamespacesPath, file), 'utf-8');
        await writeFile(join(namespacesPath, file), content);
      }
      
      copySpinner.succeed('Files prepared successfully');
    } catch (err) {
      copySpinner.fail();
      log.error(`Failed to prepare files: ${(err as Error).message}`);
      return { ok: false };
    }
    
    // ---------------
    // STEP 3: Confirmation and backup
    // ---------------
    log.step(3, TOTAL_STEPS, "Confirmation and backup");
    console.log(chalk.bgRed.white.bold(' WARNING ') + chalk.red.bold(' This operation will DELETE ALL DATA in your app and replace it with imported data.'));
    console.log(chalk.red('         This action cannot be undone.\n'));
    
    if (!opts.force && !dryRun) {
      await inquirer.prompt([{
        type: 'input',
        name: 'confirmAppName',
        message: `Type the app name "${appName}" to confirm:`,
        validate: (input: string) => input === appName || 'App name does not match. Operation cancelled.'
      }]);
      
      // Offer to create a backup
      const { createBackup } = await inquirer.prompt([{
        type: 'confirm',
        name: 'createBackup',
        message: 'Create a backup of the existing app before importing?',
        default: true
      }]);
      
      if (createBackup) {
        const backupSpinner = ora('Creating backup...').start();
        try {
          // Call the export function
          const exportResult = await exportAppData(appId, pkgAndAuthInfo, {
            limit: 'none', // Export everything
            batchSize: opts.batchSize || 100,
            sleep: opts.sleep || 100,
            verbose: opts.verbose || false
          });
          
          if (!exportResult.ok) {
            backupSpinner.fail('Backup failed');
            log.error('Import operation canceled for safety.');
            return { ok: false };
          } else {
            backupSpinner.succeed(`Backup created successfully`);
          }
        } catch (err) {
          backupSpinner.fail('Backup failed');
          log.error(`Error: ${(err as Error).message}`);
          log.error('Import operation canceled for safety.');
          return { ok: false };
        }
      }
    }
    
    // ---------------
    // STEP 4: Initialize API client
    // ---------------
    log.step(4, TOTAL_STEPS, "Initializing API client");
    
    // Transaction arrays to record all operations
    const userTxs: any[] = [];
    const createTxs: any[] = [];
    const linkTxs: any[] = [];
    
    // Function to make authenticated requests using the admin token
    async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
      const url = `${apiURI}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'App-Id': appId
      };
      
      // Capture transaction data for /admin/transact endpoint
      if (path === '/admin/transact' && options.body) {
        try {
          const body = JSON.parse(options.body as string);
          const steps = body.steps;
          
          // Sort transactions into appropriate arrays
          for (const step of steps) {
            const operation = step[0];
            
            if (operation === 'link') {
              const sourceNamespace = step[1];
              const sourceId = step[2]; 
              const linkData = step[3];
              
              // For each attribute in the link data
              for (const [attr, targetId] of Object.entries(linkData)) {
                linkTxs.push({
                  type: 'link',
                  entity: sourceNamespace,
                  id: sourceId,
                  attr: attr,
                  target: {
                    entity: attr,
                    id: targetId as string
                  }
                });
              }
            } else if (operation === 'update') {
              createTxs.push({
                type: 'create',
                entity: step[1],
                id: step[2],
                data: step[3]
              });
            }
          }
          
          // Log first transaction for debugging
          if (!request.firstRequestLogged && !dryRun) {
            request.firstRequestLogged = true;
            await writeFile(
              join(txFilesPath, 'first_request_debug.json'),
              JSON.stringify({
                url,
                method: options.method,
                headers,
                body: JSON.stringify(body, null, 2).substring(0, 500) + (JSON.stringify(body).length > 500 ? '...' : '')
              }, null, 2)
            );
          }
        } catch (err) {
          console.error('Error parsing transaction:', err);
        }
      }
      
      // Skip actual API calls in dry run mode
      if (dryRun) {
        return { success: true } as unknown as T;
      }
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {}),
        },
      });
      
      try {
        const responseText = await response.text();
        
        // Log first error for diagnostics
        if (!response.ok && !request.firstErrorLogged) {
          request.firstErrorLogged = true;
          await writeFile(
            join(txFilesPath, 'first_error_response.json'),
            JSON.stringify({
              url,
              status: response.status,
              statusText: response.statusText,
              headers: Object.fromEntries(response.headers.entries()),
              body: responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : '')
            }, null, 2)
          );
        }
        
        if (!response.ok) {
          throw new Error(`API request failed: ${responseText || 'Unknown error'}`);
        }
        
        return JSON.parse(responseText);
      } catch (err) {
        if (err instanceof SyntaxError) {
          throw new Error('API response was not valid JSON');
        }
        throw err;
      }
    }
    
    // Add properties to the request function for state tracking
    request.firstRequestLogged = false;
    request.firstErrorLogged = false;
    
    const client = {
      query: async <T extends Record<string, any>>(query: T): Promise<any> => {
        return request('/admin/query', {
          method: 'POST',
          body: JSON.stringify({
            query: query,
            'inference?': false,
          }),
        });
      },
      transact: async (tx: any[]): Promise<any> => {
        // Convert tx to steps array format if needed
        const steps = Array.isArray(tx[0]) ? tx : tx.map(operation => {
          if (operation.type === 'create' || operation.type === 'update') {
            // Clean data by removing ID
            const data = { ...operation.data };
            delete data.id;
            return ["update", operation.entity, operation.id, data];
          } else if (operation.type === 'link') {
            const linkData = {};
            linkData[operation.attr] = operation.target.id;
            return ["link", operation.entity, operation.id, linkData];
          } else if (operation.type === 'delete') {
            return ["delete", operation.entity, operation.id];
          }
          return operation;
        });
        
        return request('/admin/transact', {
          method: 'POST',
          body: JSON.stringify({ steps }),
        });
      }
    };
    
    log.success('API client initialized');

    // ---------------
    // STEP 5: Process users
    // ---------------
    log.step(5, TOTAL_STEPS, "Processing users");

    const userMappings = new Map<string, string>();
    const usersPath = join(namespacesPath, '$users.json');
    
    if (await pathExists(usersPath)) {
      const usersSpinner = ora('Processing users...').start();
      
      try {
        const users = JSON.parse(await readFile(usersPath, 'utf-8'));
        
        if (dryRun) {
          usersSpinner.text = `Would process ${users.length} users`;
          
          // Create user transactions for dry run
          for (const user of users) {
            if (!user.email) {
              continue; // Skip users without email
            }
            
            userTxs.push({
              type: 'create',
              entity: '$users',
              id: user.id,
              data: {
                email: user.email
              }
            });
            
            // For dry run, just map the ID to itself
            userMappings.set(user.id, user.id);
          }
          
          usersSpinner.succeed(`Would process ${users.length} users (dry run)`);
        } else {
          let processedCount = 0;
          let skipCount = 0;
          
          // Process each user directly with the refresh_tokens endpoint
          for (const user of users) {
            try {
              if (!user.email) {
                skipCount++;
                continue;
              }
              
              // Create or get user with refresh token
              const createUserResponse = await fetch(`${apiURI}/admin/refresh_tokens`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${adminToken}`,
                  'App-Id': appId
                },
                body: JSON.stringify({
                  email: user.email
                })
              });
              
              if (!createUserResponse.ok) {
                skipCount++;
                continue;
              }
              
              const newUser = await createUserResponse.json();
              
              // Record the user transaction
              userTxs.push({
                type: 'create',
                entity: '$users',
                id: newUser.user.id,
                data: {
                  email: user.email
                }
              });
              
              // Map old ID to new ID
              userMappings.set(user.id, newUser.user.id);
              processedCount++;
              
              usersSpinner.text = `Processing users... ${processedCount}/${users.length}`;
              
              // Sleep to avoid rate limits
              await sleep(sleepTime);
            } catch (err) {
              skipCount++;
            }
          }
          
          if (skipCount > 0) {
            usersSpinner.succeed(`Processed ${processedCount} users (${skipCount} skipped)`);
          } else {
            usersSpinner.succeed(`Processed ${processedCount} users`);
          }
          
          // Update metadata with user mapping information
          importMetadata.summary.userMappingsCreated = userMappings.size;
        }
        
        // Write user transactions to file immediately
        await writeFile(
          join(txFilesPath, '0_user_txs.json'),
          JSON.stringify(userTxs, null, 2)
        );
        log.info(`Saved user transactions to transaction logs`);
        
      } catch (err) {
        usersSpinner.fail(`Error processing users`);
        log.error((err as Error).message);
      }
    } else {
      log.info('No users found in export. Skipping user import.');
    }
    
    // ---------------
    // STEP 6: Update entity references
    // ---------------
    log.step(6, TOTAL_STEPS, "Updating entity references");
    
    const processSpinner = ora('Updating user references in entities...').start();
    
    try {
      const namespaceFiles = await readdir(namespacesPath);
      let processed = 0;
      const totalFiles = namespaceFiles.filter(f => f.endsWith('.json') && 
                                                f !== '$users.json' && 
                                                f !== '$files.json').length;
      
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        // Skip $users (already processed) and $files (not supported yet)
        const namespaceName = file.replace('.json', '');
        if (namespaceName === '$users' || namespaceName === '$files') continue;
        
        // Read entity file
        const entityPath = join(namespacesPath, file);
        let entities = JSON.parse(await readFile(entityPath, 'utf-8'));
        
        // Process each entity to replace user IDs
        entities = replaceUserIds(entities, userMappings);
        
        // Write back to the same file with updated user IDs
        await writeFile(entityPath, JSON.stringify(entities, null, 2));
        
        processed++;
        processSpinner.text = `Updating user references... ${processed}/${totalFiles}`;
      }
      
      processSpinner.succeed(`Updated ${processed} entity types`);
    } catch (err) {
      processSpinner.fail(`Error updating entity references`);
      log.error((err as Error).message);
      return { ok: false };
    }
    
    if (!dryRun) {
      // ---------------
      // STEP 7: Clear existing app data
      // ---------------
      log.step(7, TOTAL_STEPS, "Clearing existing app data");
      
      const clearAppSpinner = ora('Clearing existing app data...').start();
      
      try {
        // Use the user token for app clearing
        const clearResponse = await fetch(`${apiURI}/dash/apps/${appId}/clear`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          }
        });
        
        if (!clearResponse.ok) {
          const errorText = await clearResponse.text();
          clearAppSpinner.fail();
          log.error(`Failed to clear app: ${errorText}`);
          return { ok: false };
        }
        
        clearAppSpinner.succeed('App data cleared');
        
        // Small delay to ensure the clear operation completes on the server side
        await sleep(500);
      } catch (err) {
        clearAppSpinner.fail();
        log.error(`Error clearing app: ${(err as Error).message}`);
        return { ok: false };
      }
      
      // ---------------
      // STEP 8: Push schema and permissions
      // ---------------
      log.step(8, TOTAL_STEPS, "Pushing schema and permissions");
      
      const schemaSpinner = ora('Pushing schema...').start();
      
      try {
        const schemaResponse = await fetch(`${apiURI}/admin/schema`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`,
            'App-Id': appId
          },
          body: JSON.stringify({ schema })
        });
        
        if (!schemaResponse.ok) {
          const errorText = await schemaResponse.text();
          schemaSpinner.fail();
          log.error(`Failed to push schema: ${errorText}`);
          return { ok: false };
        }
        
        schemaSpinner.succeed('Schema pushed successfully');
        
        // Verify schema was applied correctly
        const schemaVerifySpinner = ora('Verifying schema was applied...').start();
        try {
          const verifyResult = await fetch(`${apiURI}/admin/schema`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${adminToken}`,
              'App-Id': appId
            }
          });
          
          if (!verifyResult.ok) {
            schemaVerifySpinner.warn('Could not verify schema - continuing but there may be issues');
          } else {
            const currentSchema = await verifyResult.json();
            
            // Write current schema to file for comparison
            await writeFile(
              join(importPath, 'applied_schema.json'),
              JSON.stringify(currentSchema.schema, null, 2)
            );
            
            schemaVerifySpinner.succeed('Schema verified');
          }
        } catch (err) {
          schemaVerifySpinner.warn('Could not verify schema - continuing but there may be issues');
        }
      } catch (err) {
        schemaSpinner.fail();
        log.error(`Error pushing schema: ${(err as Error).message}`);
        return { ok: false };
      }
      
      // Push permissions
      if (Object.keys(permissions).length > 0) {
        const permsSpinner = ora('Pushing permissions...').start();
        
        try {
          const permsResponse = await fetch(`${apiURI}/dash/apps/${appId}/perms/push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}` // Use user token for permissions
            },
            body: JSON.stringify({ perms: permissions })
          });
          
          if (!permsResponse.ok) {
            permsSpinner.warn('Failed to push permissions, continuing anyway');
          } else {
            permsSpinner.succeed('Permissions pushed successfully');
          }
        } catch (err) {
          permsSpinner.warn('Failed to push permissions, continuing anyway');
        }
      }
    } else {
      // ---------------
      // STEP 7: Preview actions (dry run)
      // ---------------
      log.step(7, TOTAL_STEPS, "Preview actions (dry run)");
      log.info('Would clear existing app data');
      log.info('Would push schema');
      
      if (Object.keys(permissions).length > 0) {
        log.info('Would push permissions');
      }
    }
    
    // ---------------
    // STEP 9: Prepare import
    // ---------------
    log.step(9, TOTAL_STEPS, dryRun ? "Analyzing import data" : "Preparing import data");
    
    // Create a summary of what will be imported
    let entityTypesCount = 0;
    let totalEntitiesCount = 0;
    let totalRelationshipsCount = 0;
    
    try {
      const namespaceFiles = await readdir(namespacesPath);
      entityTypesCount = namespaceFiles.filter(f => f.endsWith('.json') && 
                                               f !== '$files.json').length;
      
      // Count total entities
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        if (file === '$files.json') continue;
        
        const namespaceName = file.replace('.json', '');
        const entities = JSON.parse(await readFile(join(namespacesPath, file), 'utf-8'));
        totalEntitiesCount += entities.length;
        
        // Add to import metadata
        const entityTypeSummary = {
          name: namespaceName,
          entitiesImported: entities.length,
          relationshipsImported: 0
        };
        
        // Get link information to estimate relationship count
        const namespaceLinks = getAllLinkFields(schema, namespaceName);
        
        if (namespaceLinks.length > 0) {
          let namespaceRelationships = 0;
          
          for (const entity of entities) {
            for (const linkAttr of namespaceLinks) {
              const linkedEntities = entity[linkAttr];
              
              if (!linkedEntities) continue;
              
              // Skip if attempting to create a forward link from $users or $files
              if ((namespaceName === '$users' || namespaceName === '$files') && 
                  linkedEntities.length > 0 && linkedEntities[0].id) {
                continue;
              }
              
              if (Array.isArray(linkedEntities)) {
                namespaceRelationships += linkedEntities.length;
                totalRelationshipsCount += linkedEntities.length;
              } else if (linkedEntities && linkedEntities.id) {
                namespaceRelationships += 1;
                totalRelationshipsCount += 1;
              }
            }
          }
          
          entityTypeSummary.relationshipsImported = namespaceRelationships;
        }
        
        importMetadata.summary.entityTypes.push(entityTypeSummary);
      }
      
      // Update totals in metadata
      importMetadata.summary.totalEntitiesImported = totalEntitiesCount;
      importMetadata.summary.totalRelationshipsImported = totalRelationshipsCount;
      importMetadata.summary.entityTypeCount = importMetadata.summary.entityTypes.length;
      
      if (dryRun) {
        log.success(`Found ${entityTypesCount} entity types with ${totalEntitiesCount} entities and approximately ${totalRelationshipsCount} relationships`);
      } else {
        log.success(`Ready to import ${entityTypesCount} entity types with ${totalEntitiesCount} entities and approximately ${totalRelationshipsCount} relationships`);
      }
    } catch (err) {
      log.warning(`Could not generate complete import summary: ${(err as Error).message}`);
    }
    
    // ---------------
    // STEP 10: Import data
    // ---------------
    log.step(10, TOTAL_STEPS, dryRun ? "Previewing entity import" : "Importing entities");
    
    try {
      const namespaceFiles = await readdir(namespacesPath);
      const totalNamespaces = namespaceFiles.filter(f => f.endsWith('.json') && 
                                                  f !== '$users.json' && 
                                                  f !== '$files.json').length;
      let namespaceCounter = 0;
      
      // First pass: process entities without links
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        const namespaceName = file.replace('.json', '');
        // Skip system namespaces which are handled separately
        if (namespaceName === '$files' || namespaceName === '$users') continue;
        
        namespaceCounter++;
        const action = dryRun ? 'Analyzing' : 'Importing';
        const entitiesSpinner = ora(`${action} ${namespaceName} entities (${namespaceCounter}/${totalNamespaces})...`).start();
        
        try {
          const entities = JSON.parse(await readFile(join(namespacesPath, file), 'utf-8'));
          
          // Get link information for this namespace
          const namespaceLinks = getAllLinkFields(schema, namespaceName);
          
          // Create a temporary array for this namespace's transactions
          const namespaceCreateTxs: any[] = [];
          
          // Import in batches
          let imported = 0;
          let failed = 0;
          
          for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);
            const tx = [];
            
            for (const entity of batch) {
              // Extract entity without links
              const { entityWithoutLinks } = extractSchemaLinks(entity, schema, namespaceName);
              
              // Remove id from data since it's already in the transaction object
              const entityData = { ...entityWithoutLinks };
              delete entityData.id;
              
              // Generate transaction format that matches InstantDB unofficial API
              tx.push(["update", namespaceName, entity.id, entityData]);
              
              // Also generate a create transaction for our transaction files
              const createTx = {
                type: 'create',
                entity: namespaceName,
                id: entity.id,
                data: entityWithoutLinks
              };
              
              namespaceCreateTxs.push(createTx);
              createTxs.push(createTx);
            }
            
            // Create entities without links (skipped in dry run mode because client.transact handles it)
            try {
              // Try with retries for resilience
              const maxRetries = 3;
              let retryCount = 0;
              let success = false;
              
              while (!success && retryCount < maxRetries) {
                try {
                  await client.transact(tx);
                  success = true;
                } catch (retryErr) {
                  retryCount++;
                  
                  // Log the first error for better diagnostics
                  if (retryCount === 1) {
                    console.error(`Error importing ${namespaceName}:`, retryErr);
                    
                    // Log the sample transaction data on error
                    console.log("Sample problematic transaction:", JSON.stringify(tx.slice(0, 1), null, 2));
                    
                    try {
                      const errorLogPath = join(txFilesPath, `entity_error_${namespaceName}.json`);
                      await writeFile(
                        errorLogPath,
                        JSON.stringify({
                          error: retryErr.message,
                          sampleData: tx.slice(0, 1)
                        }, null, 2)
                      );
                    } catch (e) {
                      // Ignore errors saving error logs
                    }
                  }
                  
                  if (retryCount >= maxRetries) {
                    failed += batch.length;
                    break; // Give up after max retries
                  }
                  
                  // Wait longer between each retry attempt
                  const retryDelay = sleepTime * Math.pow(2, retryCount);
                  entitiesSpinner.text = `${action} ${namespaceName}... Retry ${retryCount}/${maxRetries} (waiting ${retryDelay}ms)`;
                  await sleep(retryDelay);
                }
              }
              
              imported += batch.length;
            } catch (err) {
              // Stop execution at the first error and display full details
              entitiesSpinner.fail(`Error importing ${namespaceName} entities`);
              
              // Format error message for clear display
              console.log('\n');
              console.log(chalk.red('═════════════════════════════════════════'));
              console.log(chalk.red.bold('IMPORT ERROR DETAILS'));
              console.log(chalk.red('═════════════════════════════════════════'));
              console.log(`Namespace: ${chalk.yellow(namespaceName)}`);
              console.log(`Error: ${chalk.red((err as Error).message)}`);
              
              // Show sample of the data that failed
              if (tx && tx.length > 0) {
                console.log('\nSample of problematic entity:');
                try {
                  console.log(JSON.stringify(tx[0], null, 2).substring(0, 500));
                  if (JSON.stringify(tx[0]).length > 500) {
                    console.log('... (truncated)');
                  }
                } catch (e) {
                  console.log('Unable to display entity sample');
                }
              }
              
              console.log(chalk.red('═════════════════════════════════════════'));
              console.log('Import operation aborted due to error.');
              
              // Write detailed error info to a log file
              try {
                const errorLog = {
                  namespace: namespaceName,
                  error: (err as Error).message,
                  errorObject: err,
                  batch: tx.slice(0, 2), // Include just a couple of examples
                  time: new Date().toISOString()
                };
                
                const errorLogPath = join(txFilesPath, `error_log_${namespaceName}.json`);
                await writeFile(
                  errorLogPath,
                  JSON.stringify(errorLog, null, 2)
                );
                console.log(`Full error details saved to: ${chalk.cyan(errorLogPath)}`);
              } catch (logErr) {
                console.log('Could not write error log file');
              }
              
              // Exit the function with error
              return { ok: false };
            }
            
            entitiesSpinner.text = `${action} ${namespaceName}... ${imported}/${entities.length}`;
            
            // Sleep between batches
            if (!dryRun) {
              await sleep(sleepTime);
            }
          }
          
          // Write create transactions for this namespace immediately
          await writeFile(
            join(txFilesPath, `1_create_txs_${namespaceName}.json`),
            JSON.stringify(namespaceCreateTxs, null, 2)
          );
          
          if (dryRun) {
            entitiesSpinner.succeed(`Would import ${entities.length} ${namespaceName} entities`);
          } else if (failed > 0) {
            entitiesSpinner.warn(`Imported ${imported} ${namespaceName} entities (${failed} failed)`);
          } else {
            entitiesSpinner.succeed(`Imported ${imported} ${namespaceName} entities`);
          }
        } catch (err) {
          entitiesSpinner.fail(`Error processing ${namespaceName}`);
        }
      }
      
      // Write the combined create transactions file
      await writeFile(
        join(txFilesPath, '1_create_txs.json'),
        JSON.stringify(createTxs, null, 2)
      );
      
      // Second pass: process all links
      const linkAction = dryRun ? 'Analyzing' : 'Creating';
      log.header("Processing entity relationships");
      
      namespaceCounter = 0;
      for (const file of namespaceFiles) {
        if (!file.endsWith('.json')) continue;
        
        const namespaceName = file.replace('.json', '');
        // Skip system namespaces which are handled separately 
        if (namespaceName === '$files' || namespaceName === '$users') continue;
        
        namespaceCounter++;
        const linksSpinner = ora(`${linkAction} links for ${namespaceName} (${namespaceCounter}/${totalNamespaces})...`).start();
        
        try {
          const entities = JSON.parse(await readFile(join(namespacesPath, file), 'utf-8'));
          
          // Get link information for this namespace
          const namespaceLinks = getAllLinkFields(schema, namespaceName);
          
          if (namespaceLinks.length === 0) {
            linksSpinner.succeed(`No links for ${namespaceName}`);
            continue;
          }
          
          // Create a temporary array for this namespace's link transactions
          const namespaceLinkTxs: any[] = [];
          
          // Process entities in batches
          let processed = 0;
          let failed = 0;
          let allLinkTransactions: any[] = [];
          
          // First gather all link transactions
          for (const entity of entities) {
            // Extract links only
            const { links } = extractSchemaLinks(entity, schema, namespaceName);
            
            // Process links from schema
            for (const linkAttr of namespaceLinks) {
              const linkedEntities = links[linkAttr];
              
              if (!linkedEntities) continue;
              
              // Skip if attempting to create a forward link from $users or $files
              // These system namespaces can only have reverse links
              if ((namespaceName === '$users' || namespaceName === '$files') && 
                  linkedEntities.length > 0 && linkedEntities[0].id) {
                continue;
              }
              
              // Create link transactions
              processLinkEntities(entity.id, namespaceName, linkAttr, linkedEntities, 
                               allLinkTransactions, namespaceLinkTxs, linkTxs);
            }
          }
          
          if (allLinkTransactions.length === 0) {
            linksSpinner.succeed(`No links for ${namespaceName}`);
            continue;
          }
          
          // Now process the link transactions in batches
          if (!dryRun) {
            // Process link transactions in batches to avoid oversized transactions
            for (let i = 0; i < allLinkTransactions.length; i += batchSize) {
              const linkBatch = allLinkTransactions.slice(i, i + batchSize);
              
              try {
                // Try with retries for resilience
                const maxRetries = 3;
                let retryCount = 0;
                let success = false;
                
                while (!success && retryCount < maxRetries) {
                  try {
                    await client.transact(linkBatch);
                    success = true;
                    processed += linkBatch.length;
                  } catch (retryErr) {
                    retryCount++;
                    
                    // On first error, log more details
                    if (retryCount === 1) {
                      console.error(`Link error for ${namespaceName}:`, retryErr);
                      
                      // Log sample transaction data on error
                      console.log("Sample problematic link transaction:", 
                        JSON.stringify(linkBatch.slice(0, 1), null, 2));
                      
                      // Save error info for debugging
                      try {
                        const errorLogPath = join(txFilesPath, `link_error_${namespaceName}.json`);
                        await writeFile(
                          errorLogPath,
                          JSON.stringify({
                            error: retryErr.message,
                            sampleData: linkBatch.slice(0, 2)
                          }, null, 2)
                        );
                      } catch (e) {
                        // Ignore error logging failures
                      }
                    }
                    
                    if (retryCount >= maxRetries) {
                      failed += linkBatch.length;
                      break; // Give up after max retries
                    }
                    
                    // Wait longer between each retry attempt
                    const retryDelay = sleepTime * Math.pow(2, retryCount);
                    linksSpinner.text = `Creating links for ${namespaceName}... ${processed}/${allLinkTransactions.length} (Retry ${retryCount}/${maxRetries}, waiting ${retryDelay}ms)`;
                    await sleep(retryDelay);
                  }
                }
              } catch (err) {
                failed += linkBatch.length;
                console.error(`Link error for ${namespaceName}:`, err);
              }
              
              linksSpinner.text = `Creating links for ${namespaceName}... ${processed}/${allLinkTransactions.length}`;
              
              // Sleep between batches
              await sleep(sleepTime);
            }
          } else {
            processed = allLinkTransactions.length;
            linksSpinner.text = `Would create ${processed} links for ${namespaceName}`;
          }
          
          // Write link transactions for this namespace immediately 
          if (namespaceLinkTxs.length > 0) {
            await writeFile(
              join(txFilesPath, `2_link_txs_${namespaceName}.json`),
              JSON.stringify(namespaceLinkTxs, null, 2)
            );
          }
          
          if (dryRun) {
            linksSpinner.succeed(`Would create ${processed} links for ${namespaceName}`);
          } else if (failed > 0) {
            linksSpinner.warn(`Created ${processed} links for ${namespaceName} (${failed} failed)`);
          } else if (processed > 0) {
            linksSpinner.succeed(`Created ${processed} links for ${namespaceName}`);
          } else {
            linksSpinner.info(`No links created for ${namespaceName}`);
          }
        } catch (err) {
          linksSpinner.fail(`Error processing links for ${namespaceName}`);
        }
      }
      
      // Write all link transactions 
      await writeFile(
        join(txFilesPath, '2_link_txs.json'),
        JSON.stringify(linkTxs, null, 2)
      );
      
      // Write import metadata with completion timestamp
      importMetadata.importCompleted = new Date().toLocaleString(undefined, { timeZoneName: 'short' });
      await writeFile(
        join(importPath, 'import_metadata.json'),
        JSON.stringify(importMetadata, null, 2)
      );
      
      log.header("IMPORT SUMMARY");
      if (dryRun) {
        console.log(chalk.yellow('🔍 DRY RUN COMPLETED - No changes were made to your app'));
        console.log(`   Would import: ${createTxs.length} entities with ${linkTxs.length} relationships`);
      } else {
        console.log(chalk.green('✅ IMPORT COMPLETED SUCCESSFULLY'));
        console.log(`   Imported: ${createTxs.length} entities with ${linkTxs.length} relationships`);
      }
      
      log.info(`All import logs saved to: ${chalk.dim(importPath)}`);
      
      return { ok: true };
    } catch (err) {
      log.error(`Import failed: ${(err as Error).message}`);
      return { ok: false };
    }
  } catch (err) {
    log.error(`Failed to fetch app information: ${(err as Error).message}`);
    return { ok: false };
  }
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
 * Helper function to recursively replace user IDs in an object or array
 */
function replaceUserIds(data: any, userMappings: Map<string, string>): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data === 'string') {
    // Check if the string is a UUID that needs to be replaced
    return userMappings.has(data) ? userMappings.get(data) : data;
  }
  
  if (Array.isArray(data)) {
    return data.map(item => 
      typeof item === 'string' 
        ? (userMappings.has(item) ? userMappings.get(item) : item)
        : replaceUserIds(item, userMappings)
    );
  }
  
  if (typeof data === 'object') {
    const result = { ...data };
    
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string') {
        result[key] = userMappings.has(value) ? userMappings.get(value) : value;
      } else {
        result[key] = replaceUserIds(value, userMappings);
      }
    }
    
    return result;
  }
  
  return data;
}

/**
 * Get all link fields for a given namespace by parsing the schema
 */
function getAllLinkFields(schema: any, namespace: string): string[] {
  if (!schema?.refs) return [];
  
  const linkFields = new Set<string>();
  
  // Process each ref to find both forward and reverse links
  Object.values(schema.refs).forEach(ref => {
    const fwdIdentity = ref['forward-identity'];
    const revIdentity = ref['reverse-identity'];
    
    // Add forward links
    if (Array.isArray(fwdIdentity) && fwdIdentity.length >= 3 && String(fwdIdentity[1]) === namespace) {
      linkFields.add(String(fwdIdentity[2]));
    }
    
    // Add reverse links
    if (Array.isArray(revIdentity) && revIdentity.length >= 3 && String(revIdentity[1]) === namespace) {
      linkFields.add(String(revIdentity[2]));
    }
  });
  
  return Array.from(linkFields);
}

/**
 * Extract all link and non-link fields from an entity using comprehensive schema parsing
 */
function extractSchemaLinks(entity: any, schema: any, namespace: string): {
  entityWithoutLinks: any;
  links: Record<string, any>;
} {
  const entityWithoutLinks = { ...entity };
  const links: Record<string, any> = {};
  
  // Get all link fields from schema
  const linkFields = getAllLinkFields(schema, namespace);
  
  // Process all known link fields from schema
  linkFields.forEach(field => {
    if (field in entity) {
      links[field] = entity[field];
      delete entityWithoutLinks[field];
    }
  });
  
  // Also detect and remove any fields that look like links but weren't in schema
  Object.keys(entityWithoutLinks).forEach(key => {
    const value = entityWithoutLinks[key];
    
    // Check if it's an array containing objects with IDs or has special link naming patterns
    if ((Array.isArray(value) && value.length > 0 && 
         typeof value[0] === 'object' && value[0] !== null && 'id' in value[0]) ||
        key.includes('__in__') || key.startsWith('list_item__')) {
      // This looks like a link that wasn't explicitly in the schema
      links[key] = value;
      delete entityWithoutLinks[key];
    }
  });
  
  return { entityWithoutLinks, links };
}

/**
 * Helper function to process link entities and create transactions
 */
function processLinkEntities(
  entityId: string,
  sourceNamespace: string,
  linkAttr: string,
  linkedEntities: any,
  batchTransactions: any[],
  namespaceTxs: any[],
  allTxs: any[]
): void {
  // Determine target namespace from the attribute name if possible
  let targetNamespace = linkAttr;
  
  // If the attribute has a format like "list_item__asset__in__category"
  // Then the target is likely "category"
  if (linkAttr.includes('__in__')) {
    const parts = linkAttr.split('__in__');
    if (parts.length > 1) {
      targetNamespace = parts[parts.length - 1];
    }
  }
  
  // Handle both array and single entity formats by normalizing to array
  const entities = Array.isArray(linkedEntities) ? linkedEntities : 
                  (linkedEntities && linkedEntities.id ? [linkedEntities] : []);
  
  for (const linkedEntity of entities) {
    if (!linkedEntity || !linkedEntity.id) continue;
    
    try {
      // Create link data exactly as in the documentation
      const linkData = {};
      linkData[linkAttr] = linkedEntity.id;
      
      // Create link transaction in unofficial API format
      const linkTx = ["link", sourceNamespace, entityId, linkData];
      
      batchTransactions.push(linkTx);
      
      // Also keep our internal format for reference
      const internalTx = {
        type: 'link',
        entity: sourceNamespace,
        id: entityId,
        attr: linkAttr,
        target: {
          entity: targetNamespace,
          id: linkedEntity.id
        }
      };
      
      namespaceTxs.push(internalTx);
      allTxs.push(internalTx);
    } catch (err) {
      console.error(`Error creating link for ${sourceNamespace}.${entityId}.${linkAttr} -> ${linkedEntity.id}:`, err);
    }
  }
} 