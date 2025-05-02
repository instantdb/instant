import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';

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
 * Format link info text based on link count
 */
function formatLinkInfo(linkCount: number): string {
  if (linkCount === 0) return '';
  return ` with ${linkCount} linked relationship${linkCount !== 1 ? 's' : ''}`;
}

interface PackageAndAuthInfo {
  pkgDir: string;
  authToken: string;
  instantModuleName?: string;
}

interface ExportOptions {
  output?: string;
  limit?: string | number;
  dryRun?: boolean;
  batchSize?: number;
  sleep?: number;     // Add sleep option for rate limiting
  verbose?: boolean;
}

/**
 * Export schema and data from an Instant app to local JSON files
 * @param appId - The app ID to export from
 * @param pkgAndAuthInfo - Authentication info
 * @param opts - Export options
 * @returns Object indicating success or failure
 */
export async function exportData(
  appId: string, 
  pkgAndAuthInfo: PackageAndAuthInfo, 
  opts: ExportOptions
): Promise<{ ok: boolean }> {
  const { authToken } = pkgAndAuthInfo;
  const dryRun = opts.dryRun || false;
  
  // Define the total steps in the export process
  const TOTAL_STEPS = 6;
  
  // Record start time
  const startTime = new Date();
  const startTimeFormatted = startTime.toLocaleString(undefined, { timeZoneName: 'short' });
  
  // Create a timestamped directory for this export using the start time
  const timestamp = generateTimestampDirName(startTime);
  const baseDir = opts.output || 'instant-export';
  const exportPath = join(process.cwd(), baseDir, timestamp);
  const namespacesPath = join(exportPath, 'namespaces');
  
  log.header(dryRun ? "EXPORT PREVIEW (DRY RUN)" : "STARTING EXPORT");
  
  // Metadata to collect
  const metadata: {
    appId: string;
    appName: string;
    startTimestamp: string;
    endTimestamp: string;
    summary: {
      namespaces: {
        name: string;
        entityCount: number;
        linkCount: number;
      }[];
    };
  } = {
    appId,
    appName: '', // Will be filled in after fetching app information
    startTimestamp: startTimeFormatted,
    endTimestamp: '',
    summary: {
      namespaces: []
    }
  };
  
  // Parse limit options
  const limit = opts.limit === 'none' ? null : 
    typeof opts.limit === 'string' ? parseInt(opts.limit, 10) : opts.limit;
    
  if (opts.limit !== 'none' && typeof limit === 'number' && isNaN(limit)) {
    log.error(`Invalid limit value: ${opts.limit}. Use a number or "none".`);
    return { ok: false };
  }

  // Set a batch size for pagination to avoid hitting API limits
  const batchSize = opts.batchSize || 100;
  
  // Set sleep time between batches for rate limiting
  // Default to 100ms if not specified
  const sleepTime = opts.sleep !== undefined ? opts.sleep : 100;
  
  // Log basic configuration
  log.info(`Batch size: ${batchSize} entities per batch`);
  log.info(`Sleep between batches: ${sleepTime}ms`);
  log.info(`Entity limit: ${limit === null ? 'none' : limit} per namespace`);

  // ---------------
  // STEP 1: Create export directories
  // ---------------
  log.step(1, TOTAL_STEPS, "Creating export directories");
  
  // Create export directories if they don't exist (unless in dry run mode)
  if (!dryRun) {
    try {
      await mkdir(exportPath, { recursive: true });
      await mkdir(namespacesPath, { recursive: true });
      log.success(`Created directories at ${chalk.dim(exportPath)}`);
    } catch (err) {
      log.error(`Failed to create export directories: ${(err as Error).message}`);
      return { ok: false };
    }
  } else {
    log.info(`Would create directories at ${chalk.dim(exportPath)}`);
  }

  // ---------------
  // STEP 2: Fetch app info and authentication
  // ---------------
  log.step(2, TOTAL_STEPS, "Fetching app information");
  
  const apiURI = process.env.INSTANT_CLI_API_URI || 
    (process.env.INSTANT_CLI_DEV ? 'http://localhost:8888' : 'https://api.instantdb.com');
  
  try {
    // First fetch the app info from the /dash endpoint to get the admin token
    const appInfoSpinner = ora('Retrieving app credentials...').start();
    
    const appInfoResponse = await fetch(`${apiURI}/dash`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (!appInfoResponse.ok) {
      appInfoSpinner.fail();
      log.error(`Failed to fetch app information: ${appInfoResponse.status} ${appInfoResponse.statusText}`);
      return { ok: false };
    }
    
    const dashData = await appInfoResponse.json();
    const app = dashData.apps.find((a: any) => a.id === appId);
    
    if (!app) {
      appInfoSpinner.fail();
      log.error(`Could not find app with ID ${appId} in your account.`);
      return { ok: false };
    }
    
    const adminToken = app.admin_token;
    
    if (!adminToken) {
      appInfoSpinner.fail();
      log.error('Could not retrieve admin token for the app.');
      return { ok: false };
    }
    
    // Store app title in metadata
    metadata.appName = app.title;
    
    appInfoSpinner.succeed(`Found app: ${chalk.bold(app.title)}`);
    
    // ---------------
    // STEP 3: Fetch schema
    // ---------------
    log.step(3, TOTAL_STEPS, "Fetching schema and permissions");
    
    // Function to make authenticated requests using the admin token
    async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
      const url = `${apiURI}${path}`;
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
        'App-Id': appId
      };
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...headers,
          ...(options.headers || {}),
        },
      });
      
      try {
        const responseText = await response.text();
        
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
    
    const client = {
      query: async <T extends Record<string, any>>(query: T): Promise<any> => {
        const requestBody = JSON.stringify({
          query: query,
          'inference?': false,
        });
        
        return request('/admin/query', {
          method: 'POST',
          body: requestBody,
        });
      }
    };

    // Fetch schema
    const schemaSpinner = ora('Fetching schema...').start();
    
    try {
      // Try to get schema using admin/schema endpoint, fall back to query if needed
      let schema;
      
      try {
        const schemaResult = await request<{schema: any}>('/admin/schema', { method: 'GET' });
        schema = schemaResult.schema;
      } catch (schemaErr) {
        schemaSpinner.text = 'Falling back to alternate schema method...';
        const result = await client.query({ __schema: { entities: {}, links: {} } });
        schema = result.__schema;
      }
      
      if (!schema) {
        throw new Error('Could not retrieve schema information');
      }
      
      // Save schema to file if not in dry run mode
      if (!dryRun) {
        await writeFile(
          join(exportPath, 'schema.json'),
          JSON.stringify(schema, null, 2),
          'utf-8'
        );
        schemaSpinner.succeed('Schema exported successfully');
      } else {
        schemaSpinner.succeed('Schema retrieved successfully');
      }

      // ---------------
      // STEP 4: Export permissions rules
      // ---------------
      const permsSpinner = ora('Fetching permissions...').start();
      
      try {
        // Create a special fetch for permissions using the user auth token, not admin token
        const fetchPerms = async () => {
          const url = `${apiURI}/dash/apps/${appId}/perms/pull`;
          const response = await fetch(url, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`, // Use the user token, not admin token
            },
          });
          
          const responseText = await response.text();
          
          if (!response.ok) {
            throw new Error(`API request failed: ${responseText || 'Unknown error'}`);
          }
          
          return JSON.parse(responseText);
        };
        
        // Fetch permissions using the user token
        const permsResult = await fetchPerms();
        const permsData = permsResult.perms || {};
        
        // Save permissions to file if not in dry run mode
        if (!dryRun) {
          await writeFile(
            join(exportPath, 'permissions.json'),
            JSON.stringify(permsData, null, 2),
            'utf-8'
          );
          permsSpinner.succeed('Permissions exported successfully');
        } else {
          permsSpinner.succeed('Permissions retrieved successfully');
        }

        // Extract and sort namespaces from schema
        const namespaces = extractNamespacesFromSchema(schema);
        
        if (namespaces.length === 0) {
          log.info('No namespaces found in schema. Export complete.');
          
          // Write metadata even if no namespaces
          if (!dryRun) {
            metadata.endTimestamp = new Date().toLocaleString(undefined, { timeZoneName: 'short' });
            await writeFile(
              join(exportPath, 'metadata.json'),
              JSON.stringify(metadata, null, 2),
              'utf-8'
            );
            log.success(`Metadata exported successfully`);
          } else {
            log.info(`Would export metadata information`);
          }
          
          return { ok: true };
        }

        namespaces.sort();
        
        // ---------------
        // STEP 5: Analyze namespaces
        // ---------------
        log.step(5, TOTAL_STEPS, "Analyzing namespaces");
        
        log.info(`Found ${namespaces.length} namespaces: ${chalk.cyan(namespaces.join(', '))}`);
        
        // ---------------
        // STEP 6: Export each namespace
        // ---------------
        log.step(6, TOTAL_STEPS, "Exporting namespace data");
        
        // For each namespace, export data
        for (const namespace of namespaces) {
          // Get link information for this namespace
          const namespaceLinks = getNamespaceLinks(schema, namespace);
          const linkCount = Object.keys(namespaceLinks).length;
          const linkInfo = formatLinkInfo(linkCount);
          
          // Handle dry run
          if (dryRun) {
            log.info(`Would export namespace: ${chalk.cyan(namespace)}${linkInfo}`);
            
            metadata.summary.namespaces.push({
              name: namespace,
              entityCount: 0, // Placeholder for dry run
              linkCount: linkCount
            });
            continue;
          }
          
          // Export namespace data
          const spinner = ora(`Exporting ${namespace}`).start();
          
          try {
            // Query entities with batching
            let entities: any[] = [];
            let cursor: { after?: string; before?: string; offset?: number; } | undefined = undefined;
            let hasMore = true;
            let totalEntities = 0;
            let batchCount = 0;
            
            // Determine the query batch size
            const queryBatchSize = limit && limit < batchSize ? limit : batchSize;
            
            // Sleep before starting the first batch
            if (sleepTime > 0 && batchCount === 0) {
              spinner.text = `Preparing to export ${chalk.cyan(namespace)}...`;
              await sleep(sleepTime);
            }
            
            // Flag to indicate if we should stop fetching more batches
            let shouldStopAfterBatch = false;
            
            while (hasMore && !shouldStopAfterBatch) {
              batchCount++;
              spinner.text = `Exporting ${chalk.cyan(namespace)} - batch ${batchCount}`;
              
              // For subsequent batches, calculate remaining items
              const remainingItems = limit ? limit - totalEntities : null;
              const currentBatchSize = remainingItems && remainingItems < queryBatchSize 
                ? remainingItems 
                : queryBatchSize;
              
              // Build query for this namespace with expanded links and cursor
              const namespaceQuery = buildQueryWithLinks(namespace, namespaceLinks, currentBatchSize, cursor);
              
              if (opts.verbose) {
                log.info(`\nQuery details for batch ${batchCount}:`);
                log.info(`- Batch size: ${currentBatchSize}`);
                log.info(`- Cursor: ${JSON.stringify(cursor)}`);
                log.info(`- Total so far: ${totalEntities}`);
              }
              
              const query = { [namespace]: namespaceQuery };
              const data = await client.query(query);
              const batchEntities = data[namespace] || [];
              
              // Parse pageInfo - this could be in different locations depending on API version
              const pageInfo = data?.pageInfo && data?.pageInfo[namespace] ? 
                              data?.pageInfo[namespace] : 
                              data?.__pageInfo && data?.__pageInfo[namespace] ? 
                              data?.__pageInfo[namespace] : null;
              
              const endCursor = pageInfo?.endCursor;
              
              // Add entities to our accumulated list
              entities = entities.concat(batchEntities);
              totalEntities += batchEntities.length;
              
              // Update spinner text to show progress
              spinner.text = `Exporting ${chalk.cyan(namespace)} - ${totalEntities}/${limit || '∞'} entities (batch ${batchCount})`;
              
              // Continue fetching if:
              // 1. We have an endCursor AND
              // 2. Either we have no limit OR we haven't reached the limit yet AND
              // 3. We received some entities in this batch (items remain)
              hasMore = Boolean(endCursor) && 
                       (limit === null || totalEntities < limit) && 
                       batchEntities.length > 0;
              
              // Fallback: if we don't have pageInfo but received a full batch
              // and haven't reached our limit, assume there's more data
              if (!pageInfo && batchEntities.length === currentBatchSize &&
                  (limit === null || totalEntities < limit)) {
                hasMore = true;
                
                // Since we don't have a cursor, use count-based pagination
                cursor = { offset: totalEntities };
              } else if (hasMore) {
                // We have a cursor, use it
                cursor = { after: endCursor };
              }
              
              // Sleep between batches if specified
              if (hasMore && sleepTime > 0) {
                spinner.text = `Waiting ${sleepTime}ms before next batch...`;
                await sleep(sleepTime);
              }
              
              // Check if we've reached the specified limit
              if (limit && totalEntities >= limit) {
                shouldStopAfterBatch = true;
                // Truncate entities if we got more than the limit
                if (totalEntities > limit) {
                  entities = entities.slice(0, limit);
                  totalEntities = limit;
                }
              }
            }
            
            // Add to metadata summary
            metadata.summary.namespaces.push({
              name: namespace,
              entityCount: totalEntities,
              linkCount: linkCount
            });
            
            // Write to file
            await writeFile(
              join(namespacesPath, `${namespace}.json`),
              JSON.stringify(entities, null, 2),
              'utf-8'
            );
            
            spinner.succeed(`Exported ${chalk.bold(totalEntities)} ${chalk.cyan(namespace)} entities${linkInfo}`);
          } catch (err) {
            spinner.fail(`Error exporting ${chalk.cyan(namespace)}`);
            log.error((err as Error).message);
          }
        }
        
        // Write metadata and complete
        if (!dryRun) {
          metadata.endTimestamp = new Date().toLocaleString(undefined, { timeZoneName: 'short' });
          await writeFile(
            join(exportPath, 'metadata.json'),
            JSON.stringify(metadata, null, 2),
            'utf-8'
          );
          
          log.header("EXPORT SUMMARY");
          
          // Count total entities and namespaces for summary
          const totalEntities = metadata.summary.namespaces.reduce((sum, ns) => sum + ns.entityCount, 0);
          const totalNamespaces = metadata.summary.namespaces.length;
          
          log.success(`Exported ${chalk.bold(totalEntities)} entities across ${chalk.bold(totalNamespaces)} namespaces`);
          log.info(`Export completed at ${chalk.dim(metadata.endTimestamp)}`);
          log.info(`Files saved to ${chalk.dim(exportPath)}`);
        } else {
          log.header("DRY RUN COMPLETE");
          log.info(`No files were written. Use without --dry-run to perform the actual export.`);
        }
        
        return { ok: true };
        
      } catch (err) {
        permsSpinner.fail();
        log.error(`Failed to export permissions: ${(err as Error).message}`);
        return { ok: false };
      }
      
    } catch (err) {
      schemaSpinner.fail();
      log.error(`Failed to export schema: ${(err as Error).message}`);
      return { ok: false };
    }
  } catch (err) {
    log.error(`Failed to fetch app information: ${(err as Error).message}`);
    return { ok: false };
  }
}

/**
 * Extract namespaces from schema
 * @param schema - The schema object
 * @returns Array of namespace names
 */
function extractNamespacesFromSchema(schema: {
  entities?: Record<string, any>;
  links?: Record<string, any>;
  refs?: Record<string, any>;
  blobs?: Record<string, any>;
}): string[] {
  const namespaces = new Set<string>();
  
  // Always include special namespaces
  namespaces.add('$users');
  namespaces.add('$files');
  
  // Extract from entities if they exist
  if (schema.entities) {
    Object.keys(schema.entities).forEach(namespace => {
      namespaces.add(namespace);
    });
  }
  
  // Extract from refs which contain relationships between entities
  if (schema.refs) {
    Object.entries(schema.refs).forEach(([refKey, ref]) => {
      // Extract namespaces from ref keys (usually in format "entity1-entity2")
      const parts = refKey.split('-');
      if (parts.length >= 2) {
        // First and last parts are typically entity types
        namespaces.add(parts[0]);
        namespaces.add(parts[parts.length - 1]);
      }
      
      // Also extract from forward/reverse identity
      if (ref['forward-identity'] && ref['forward-identity'][1]) {
        namespaces.add(ref['forward-identity'][1]);
      }
      if (ref['reverse-identity'] && ref['reverse-identity'][1]) {
        namespaces.add(ref['reverse-identity'][1]);
      }
    });
  }
  
  // Extract from blobs which define entity attributes
  if (schema.blobs) {
    Object.keys(schema.blobs).forEach(blobKey => {
      // Include all entity types including special namespaces $users and $files
      namespaces.add(blobKey);
    });
  }
  
  // Extract from links if they exist (original logic)
  if (schema.links) {
    // Add link sources and targets from either format
    Object.entries(schema.links).forEach(([linkKey, link]) => {
      // Handle forward/reverse format
      if (link.forward?.on) {
        namespaces.add(link.forward.on);
      }
      if (link.reverse?.on) {
        namespaces.add(link.reverse.on);
      }
      
      // Handle forward-identity/reverse-identity format
      if (link['forward-identity'] && link['forward-identity'][1]) {
        namespaces.add(link['forward-identity'][1]);
      }
      if (link['reverse-identity'] && link['reverse-identity'][1]) {
        namespaces.add(link['reverse-identity'][1]);
      }
    });
  }
  
  return Array.from(namespaces);
}

/**
 * Get all link labels for a given namespace
 * @param schema - The schema object
 * @param namespace - The namespace to find links for
 * @returns Object with link labels mapped to target namespaces
 */
function getNamespaceLinks(schema: {
  links?: Record<string, any>;
  refs?: Record<string, any>;
}, namespace: string): Record<string, string> {
  const links: Record<string, string> = {};
  
  if (!schema.refs) {
    return links;
  }
  
  // Process each ref
  Object.entries(schema.refs).forEach(([refKey, ref]) => {
    // Skip if missing identity information
    if (!ref['forward-identity'] || !ref['reverse-identity']) return;
    
    // Get forward identity information
    const fwdIdentity = ref['forward-identity'];
    if (!Array.isArray(fwdIdentity) || fwdIdentity.length < 3) return;
    
    // Get reverse identity information
    const revIdentity = ref['reverse-identity'];
    if (!Array.isArray(revIdentity) || revIdentity.length < 3) return;
    
    const fwdEntity = String(fwdIdentity[1]);
    const fwdAttribute = String(fwdIdentity[2]);
    const revEntity = String(revIdentity[1]);
    const revAttribute = String(revIdentity[2]);
    
    // If this namespace is the forward entity
    if (fwdEntity === namespace) {
      links[fwdAttribute] = revEntity;
    }
    
    // If this namespace is the reverse entity
    if (revEntity === namespace) {
      links[revAttribute] = fwdEntity;
    }
  });
  
  return links;
}

/**
 * Build a query object with expanded links
 * @param namespace - The namespace to query
 * @param links - Links information from the schema
 * @param limit - Main query limit
 * @param cursor - Pagination cursor (after/before)
 * @returns Query object with expanded links
 */
function buildQueryWithLinks(
  namespace: string,
  links: Record<string, string>,
  limit: number | null,
  cursor?: { after?: string; before?: string; offset?: number; }
): Record<string, any> {
  const query: Record<string, any> = {};
  
  // Add main namespace query with pagination options in the $ object
  query.$ = {
    // Always use orderBy for consistency
    order: {
      serverCreatedAt: 'desc',
    }
  };

  // Add pagination parameters based on cursor type
  if (cursor?.after) {
    // When paginating forward with "after" cursor
    query.$.after = cursor.after;
    if (limit) {
      // For cursor-based pagination, use first instead of limit
      query.$.first = limit;
    }
  } else if (cursor?.before) {
    // When paginating backward with "before" cursor
    query.$.before = cursor.before;
    if (limit) {
      // For backward pagination, use last instead of first
      query.$.last = limit;
    }
  } else if (cursor?.offset !== undefined) {
    // When using offset-based pagination
    query.$.offset = cursor.offset;
    if (limit) {
      // For offset-based pagination, use limit
      query.$.limit = limit;
    }
  } else {
    // Initial query with no cursor - use limit for first query
    if (limit) {
      query.$.limit = limit;
    }
  }
  
  // Get links sorted alphabetically by attribute name
  const sortedLinks = Object.entries(links).sort(([attr1], [attr2]) => attr1.localeCompare(attr2));
  
  // Add links to the query with field selection in alphabetical order
  sortedLinks.forEach(([attribute, targetNamespace]) => {
    // Add the link attribute to the query, only selecting the ID field
    query[attribute] = {
      $: {
        fields: ['id']
      }
    };
  });
  
  return query;
} 