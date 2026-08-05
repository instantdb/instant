export type InstantAppBackup = {
  id: string;
  isn: string;
  backup_at: string;
  files_size: number | null;
  db_size: number | null;
  uncompressed_size: number | null;
  description: string | null;
  expires_at: string | null;
};

export type BackupFile = {
  name: string;
  size: number;
};

export type StorageFile = {
  locationId: string;
  path: string | null;
  url: string;
};

export type BackupEntry = {
  kind: 'config' | 'entity' | 'storage';
  name: string;
  sourceName: string;
  lastModified: Date;
  input: ReadableStream<Uint8Array>;
};

export type BackupDownloadCallbacks = {
  onBackupFiles?: (files: readonly BackupFile[]) => void;
  onStorageFile?: (file: StorageFile) => void;
  onStorageComplete?: () => void;
};

export type BackupsManagerConfig = {
  apiURI?: string;
  token: string;
  fetch?: typeof globalThis.fetch;
  headers?: HeadersInit;
  decodeBackupBody?: (
    response: Response,
  ) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;
};

export class BackupDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupDownloadError';
  }
}

const compareNames = (a: BackupFile, b: BackupFile) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/;
const safeDisplayName = (value: string) => {
  const safe = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '�');
  return safe.length > 512 ? `${safe.slice(0, 511)}…` : safe;
};

const isBackupFile = (value: unknown): value is BackupFile => {
  if (!value || typeof value !== 'object') return false;
  const file = value as Record<string, unknown>;
  return (
    typeof file.name === 'string' &&
    typeof file.size === 'number' &&
    Number.isFinite(file.size) &&
    file.size >= 0
  );
};

const isNullableNumber = (value: unknown): value is number | null =>
  value === null ||
  (typeof value === 'number' && Number.isFinite(value) && value >= 0);

const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const isBackup = (value: unknown): value is InstantAppBackup => {
  if (!value || typeof value !== 'object') return false;
  const backup = value as Record<string, unknown>;
  return (
    typeof backup.id === 'string' &&
    typeof backup.isn === 'string' &&
    typeof backup.backup_at === 'string' &&
    isNullableNumber(backup.files_size) &&
    isNullableNumber(backup.db_size) &&
    isNullableNumber(backup.uncompressed_size) &&
    isNullableString(backup.description) &&
    isNullableString(backup.expires_at)
  );
};

// Entry names become paths inside the zip, so refuse traversal segments,
// backslashes, and control characters outright.
const isSafeEntryName = (name: string) => {
  if (name.includes('\\') || controlCharacters.test(name)) return false;
  return name
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

export function canonicalizeBackupFiles(
  files: readonly BackupFile[],
): BackupFile[] {
  const seen = new Set<string>();
  let config: BackupFile | undefined;
  const rest: BackupFile[] = [];

  for (const file of files) {
    if (seen.has(file.name)) {
      throw new BackupDownloadError(
        `Backup contains duplicate entry "${safeDisplayName(file.name)}".`,
      );
    }
    seen.add(file.name);

    if (file.name === 'config.json') {
      config = file;
      continue;
    }
    // Unknown-but-safe names are allowed so newer servers can add files to
    // backups without breaking older clients. `files/` is reserved for the
    // storage entries the archive appends after the backup payload.
    if (
      !isSafeEntryName(file.name) ||
      file.name === 'files' ||
      file.name.startsWith('files/')
    ) {
      throw new BackupDownloadError(
        `Backup contains unexpected entry "${safeDisplayName(file.name)}".`,
      );
    }
    rest.push(file);
  }

  if (!config) {
    throw new BackupDownloadError('Backup is missing config.json.');
  }

  return [config, ...rest.sort(compareNames)];
}

export function backupZipName(backup: InstantAppBackup): string {
  const safe = backup.backup_at.replace(/[:.]/g, '-');
  return `instant-backup-${safe}.zip`;
}

const storageEntryName = (locationId: string) => {
  if (!locationId.trim() || !isSafeEntryName(locationId)) {
    throw new BackupDownloadError(
      `Backup contains invalid storage location ID "${safeDisplayName(locationId)}".`,
    );
  }
  return `files/${locationId}`;
};

const responseError = async (response: Response, action: string) => {
  let detail = '';
  try {
    const body = await response.text();
    if (body) {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string') {
        detail = `: ${safeDisplayName(parsed.message)}`;
      }
    }
  } catch {
    // The status and action are sufficient when the response body is not JSON.
  }
  return new BackupDownloadError(
    `${action} failed with HTTP ${response.status}${detail}`,
  );
};

async function* lines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let reachedEnd = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        reachedEnd = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        yield buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (buffer) yield buffer;
  } finally {
    if (!reachedEnd) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export class BackupsManager {
  readonly #apiURI: string;
  readonly #token: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #headers: HeadersInit | undefined;
  readonly #decodeBackupBody: (
    response: Response,
  ) => ReadableStream<Uint8Array> | Promise<ReadableStream<Uint8Array>>;

  constructor(config: BackupsManagerConfig) {
    this.#apiURI = (config.apiURI ?? 'https://api.instantdb.com').replace(
      /\/$/,
      '',
    );
    this.#token = config.token;
    this.#fetch = config.fetch ?? globalThis.fetch;
    this.#headers = config.headers;
    this.#decodeBackupBody =
      config.decodeBackupBody ??
      ((response) => {
        if (!response.body) {
          throw new BackupDownloadError('Backup entry response has no body.');
        }
        return response.body;
      });
  }

  async #authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(this.#headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) =>
        headers.set(key, value),
      );
    }
    headers.set('authorization', `Bearer ${this.#token}`);
    return this.#fetch(`${this.#apiURI}${path}`, { ...init, headers });
  }

  async #json<T>(
    path: string,
    action: string,
    signal?: AbortSignal,
  ): Promise<T> {
    const response = await this.#authedFetch(path, { signal });
    if (!response.ok) throw await responseError(response, action);
    try {
      return (await response.json()) as T;
    } catch {
      throw new BackupDownloadError(`${action} returned invalid JSON.`);
    }
  }

  async list(appId: string, signal?: AbortSignal): Promise<InstantAppBackup[]> {
    const result = await this.#json<{ backups?: unknown }>(
      `/dash/apps/${encodeURIComponent(appId)}/backups`,
      'Listing backups',
      signal,
    );
    if (!Array.isArray(result.backups) || !result.backups.every(isBackup)) {
      throw new BackupDownloadError(
        'Listing backups returned an invalid response.',
      );
    }
    return result.backups;
  }

  async files(
    appId: string,
    backupId: string,
    signal?: AbortSignal,
  ): Promise<BackupFile[]> {
    const result = await this.#json<{ files?: unknown }>(
      `/dash/apps/${encodeURIComponent(appId)}/backups/${encodeURIComponent(backupId)}/files`,
      'Listing backup entries',
      signal,
    );
    if (!Array.isArray(result.files) || !result.files.every(isBackupFile)) {
      throw new BackupDownloadError(
        'Listing backup entries returned an invalid response.',
      );
    }
    return canonicalizeBackupFiles(result.files);
  }

  async #fileUrl(
    appId: string,
    backupId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const result = await this.#json<{ url?: unknown }>(
      `/dash/apps/${encodeURIComponent(appId)}/backups/${encodeURIComponent(backupId)}/file-url?name=${encodeURIComponent(name)}`,
      `Preparing ${name}`,
      signal,
    );
    if (typeof result.url !== 'string' || !result.url) {
      throw new BackupDownloadError(
        `Preparing ${name} returned an invalid URL.`,
      );
    }
    return result.url;
  }

  async *#storageFiles(
    appId: string,
    backupId: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StorageFile> {
    const response = await this.#authedFetch(
      `/dash/apps/${encodeURIComponent(appId)}/backups/${encodeURIComponent(backupId)}/storage-files`,
      { signal },
    );
    if (!response.ok) {
      throw await responseError(response, 'Listing storage files');
    }
    if (!response.body) {
      throw new BackupDownloadError('Listing storage files returned no body.');
    }

    let complete = false;
    let lineNumber = 0;
    for await (const line of lines(response.body)) {
      lineNumber++;
      if (!line.trim()) continue;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new BackupDownloadError(
          `Storage file listing contains invalid JSON on line ${lineNumber}.`,
        );
      }

      if (!value || typeof value !== 'object') {
        throw new BackupDownloadError(
          `Storage file listing contains an invalid record on line ${lineNumber}.`,
        );
      }
      const record = value as Record<string, unknown>;
      if (record.done === true) {
        complete = true;
        continue;
      }
      if (
        typeof record.locationId !== 'string' ||
        typeof record.url !== 'string' ||
        !record.url.trim() ||
        (record.path !== null && typeof record.path !== 'string')
      ) {
        throw new BackupDownloadError(
          `Storage file listing contains an invalid record on line ${lineNumber}.`,
        );
      }
      yield {
        locationId: record.locationId,
        path: record.path,
        url: record.url,
      };
    }

    if (!complete) {
      throw new BackupDownloadError(
        'Storage file listing ended before it finished. Please retry the download.',
      );
    }
  }

  async *downloadEntries(
    appId: string,
    backup: InstantAppBackup,
    options: {
      signal?: AbortSignal;
      callbacks?: BackupDownloadCallbacks;
    } = {},
  ): AsyncGenerator<BackupEntry> {
    const { signal, callbacks } = options;
    const controller = new AbortController();
    const forwardAbort = () => controller.abort(signal?.reason);
    if (signal?.aborted) forwardAbort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });

    // `storageQueue` is a FIFO of yet-to-fetch storage files — dequeued as the
    // generator reaches the storage phase. It's an object with head/tail
    // indices rather than an array because discovery streams the whole list in
    // up front: Array.shift() is O(n), so draining a large backup would be
    // O(n²). Object access is O(1) and delete frees each slot as it's consumed.
    const storageQueue: Record<number, { file: StorageFile; name: string }> =
      {};
    let queueHead = 0;
    let queueTail = 0;
    let storageDone = false;
    let storageError: unknown = null;
    let waitResolve: (() => void) | null = null;

    const notify = () => {
      const w = waitResolve;
      waitResolve = null;
      w?.();
    };

    // Kick off storage-files discovery in parallel with the backup file list,
    // draining the listing as fast as the server streams it so it can finish
    // and close the connection; a response left half-read through the whole
    // entity phase risks being cut off by proxy idle timeouts.
    const storageProducer = (async () => {
      const seenEntries = new Set<string>();
      try {
        for await (const file of this.#storageFiles(
          appId,
          backup.id,
          controller.signal,
        )) {
          const name = storageEntryName(file.locationId);
          if (seenEntries.has(name)) {
            throw new BackupDownloadError(
              `Backup contains duplicate entry "${name}".`,
            );
          }
          seenEntries.add(name);
          storageQueue[queueTail++] = { file, name };
          callbacks?.onStorageFile?.(file);
          notify();
        }
        callbacks?.onStorageComplete?.();
      } catch (error) {
        storageError = error;
        if (!controller.signal.aborted) controller.abort(error);
      } finally {
        storageDone = true;
        notify();
      }
    })();

    try {
      const files = await this.files(appId, backup.id, controller.signal);
      callbacks?.onBackupFiles?.(files);
      const lastModified = new Date(backup.backup_at);
      if (Number.isNaN(lastModified.valueOf())) {
        throw new BackupDownloadError(
          `Backup contains invalid timestamp "${safeDisplayName(backup.backup_at)}".`,
        );
      }

      for (const file of files) {
        const url = await this.#fileUrl(
          appId,
          backup.id,
          file.name,
          controller.signal,
        );
        const response = await this.#fetch(url, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw await responseError(response, `Downloading ${file.name}`);
        }
        if (!response.body) {
          throw new BackupDownloadError(
            `Downloading ${file.name} returned no body.`,
          );
        }
        yield {
          kind: file.name === 'config.json' ? 'config' : 'entity',
          name: file.name,
          sourceName: file.name,
          lastModified,
          input: await this.#decodeBackupBody(response),
        };
      }

      while (true) {
        if (storageError) throw storageError;
        let next: { file: StorageFile; name: string } | undefined;
        if (queueHead < queueTail) {
          next = storageQueue[queueHead];
          delete storageQueue[queueHead];
          queueHead++;
        }
        if (!next) {
          if (storageDone) break;
          await new Promise<void>((resolve) => {
            waitResolve = resolve;
          });
          continue;
        }
        const { file, name } = next;
        const sourceName = safeDisplayName(file.path ?? file.locationId);
        const response = await this.#fetch(file.url, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw await responseError(
            response,
            `Downloading storage file "${sourceName}"`,
          );
        }
        if (!response.body) {
          throw new BackupDownloadError(
            `Downloading storage file "${sourceName}" returned no body.`,
          );
        }
        yield {
          kind: 'storage',
          name,
          sourceName,
          lastModified,
          input: response.body,
        };
      }
    } finally {
      controller.abort();
      await storageProducer;
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}
