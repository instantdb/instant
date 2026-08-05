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

type TokenProvider = string | (() => string | Promise<string>);

export type BackupsManagerConfig = {
  apiURI?: string;
  token: TokenProvider;
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

const isSafeEntityName = (name: string) => {
  if (!name.startsWith('entities/') || !name.endsWith('.jsonl')) return false;
  const namespace = name.slice('entities/'.length, -'.jsonl'.length);
  if (!namespace || name.includes('\\') || controlCharacters.test(name)) {
    return false;
  }
  return namespace
    .split('/')
    .every((segment) => segment !== '.' && segment !== '..');
};

export function canonicalizeBackupFiles(
  files: readonly BackupFile[],
): BackupFile[] {
  const seen = new Set<string>();
  let config: BackupFile | undefined;
  const entities: BackupFile[] = [];

  for (const file of files) {
    if (seen.has(file.name)) {
      throw new BackupDownloadError(
        `Backup contains duplicate entry "${safeDisplayName(file.name)}".`,
      );
    }
    seen.add(file.name);

    if (file.name === 'config.json') {
      config = file;
    } else if (isSafeEntityName(file.name)) {
      entities.push(file);
    } else {
      throw new BackupDownloadError(
        `Backup contains unexpected entry "${safeDisplayName(file.name)}".`,
      );
    }
  }

  if (!config) {
    throw new BackupDownloadError('Backup is missing config.json.');
  }

  return [config, ...entities.sort(compareNames)];
}

export function backupZipName(backup: InstantAppBackup): string {
  const safe = backup.backup_at.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `instant-backup-${safe}.zip`;
}

/**
 * Total uncompressed bytes the backup's data unpacks to (database entities
 * plus storage files), or null when the backup row carries no sizes.
 */
export function backupDataSize(backup: InstantAppBackup): number | null {
  const databaseSize = backup.uncompressed_size ?? backup.db_size;
  if (databaseSize == null && backup.files_size == null) return null;
  return (databaseSize ?? 0) + (backup.files_size ?? 0);
}

/**
 * Estimated size range for the backup's zip archive. Upper bound: everything
 * stored uncompressed (STORE mode and/or files that don't compress). Lower
 * bound: everything compressed at a ~4x DEFLATE ratio, best case for
 * text/JSON, but storage files vary wildly (raw text compresses well,
 * already-compressed images/videos don't), so the actual zip lands somewhere
 * inside the range. Null unless the backup row carries both the database and
 * storage-file sizes.
 */
export function backupZipSizeEstimate(
  backup: InstantAppBackup,
): { minBytes: number; maxBytes: number } | null {
  const databaseSize = backup.uncompressed_size ?? backup.db_size;
  if (databaseSize == null || backup.files_size == null) return null;
  const totalBytes = databaseSize + backup.files_size;
  return { minBytes: Math.round(totalBytes / 4), maxBytes: totalBytes };
}

/**
 * Formats a byte count with decimal (1000-based) SI units, matching how
 * macOS/Finder reports file sizes so the number lines up with what lands on
 * disk.
 */
export function formatByteSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1000;
    unit++;
  } while (value >= 1000 && unit < units.length - 1);
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

const storageEntryName = (locationId: string) => {
  if (
    !locationId.trim() ||
    locationId.includes('\\') ||
    controlCharacters.test(locationId) ||
    locationId.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
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

class AsyncQueue<T> {
  readonly #capacity: number;
  readonly #items: T[] = [];
  readonly #readWaiters = new Set<() => void>();
  readonly #writeWaiters = new Set<() => void>();
  #head = 0;
  #closed = false;
  #failed = false;
  #error: unknown;

  constructor(capacity: number) {
    this.#capacity = capacity;
  }

  #wait(waiters: Set<() => void>) {
    return new Promise<void>((resolve) => waiters.add(resolve));
  }

  #wake(waiters: Set<() => void>) {
    for (const resolve of waiters) resolve();
    waiters.clear();
  }

  async push(item: T): Promise<boolean> {
    while (!this.#closed && this.#items.length - this.#head >= this.#capacity) {
      await this.#wait(this.#writeWaiters);
    }
    if (this.#closed) return false;
    this.#items.push(item);
    this.#wake(this.#readWaiters);
    return true;
  }

  close(error?: unknown) {
    if (this.#closed) return;
    this.#closed = true;
    if (error !== undefined) {
      this.#failed = true;
      this.#error = error;
    }
    this.#wake(this.#readWaiters);
    this.#wake(this.#writeWaiters);
  }

  async next(): Promise<IteratorResult<T>> {
    while (!this.#closed && this.#head === this.#items.length) {
      await this.#wait(this.#readWaiters);
    }
    if (this.#failed) throw this.#error;
    if (this.#head < this.#items.length) {
      const value = this.#items[this.#head++]!;
      if (this.#head > 1024 && this.#head * 2 >= this.#items.length) {
        this.#items.splice(0, this.#head);
        this.#head = 0;
      }
      this.#wake(this.#writeWaiters);
      return { done: false, value };
    }
    return { done: true, value: undefined };
  }
}

export class BackupsManager {
  readonly #apiURI: string;
  readonly #token: TokenProvider;
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

  async #getToken(): Promise<string> {
    return typeof this.#token === 'function'
      ? await this.#token()
      : this.#token;
  }

  async #authedFetch(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(this.#headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) =>
        headers.set(key, value),
      );
    }
    headers.set('authorization', `Bearer ${await this.#getToken()}`);
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
        if (complete) {
          throw new BackupDownloadError(
            'Storage file listing contains more than one completion marker.',
          );
        }
        complete = true;
        continue;
      }
      if (complete) {
        throw new BackupDownloadError(
          'Storage file listing contains data after its completion marker.',
        );
      }
      if (typeof record.locationId === 'string' && !record.locationId.trim()) {
        throw new BackupDownloadError(
          `Storage file listing contains a blank location ID on line ${lineNumber}.`,
        );
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

    const storageQueue = new AsyncQueue<{
      file: StorageFile;
      name: string;
    }>(256);
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
          callbacks?.onStorageFile?.(file);
          if (!(await storageQueue.push({ file, name }))) return;
        }
        callbacks?.onStorageComplete?.();
        storageQueue.close();
      } catch (error) {
        storageQueue.close(error);
        if (!controller.signal.aborted) controller.abort(error);
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
        const next = await storageQueue.next();
        if (next.done) break;
        const { file, name } = next.value;
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
      storageQueue.close();
      await storageProducer;
      signal?.removeEventListener('abort', forwardAbort);
    }
  }
}
