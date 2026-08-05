import { InstantAPIError, version as coreVersion } from '@instantdb/core';
import type { WithAuth } from '@instantdb/webhooks';
import version from './version.ts';
import {
  downloadBackupArchive,
  type BackupDownloadResult,
  type DownloadBackupArchiveOpts,
} from './backupDownload.ts';

/** A point-in-time snapshot of an app. */
export type AppBackup = {
  /** Unique identifier for the backup. */
  id: string;
  /** Instant sequence number the snapshot was taken at. */
  isn: string;
  /** When the snapshot was taken. */
  backupAt: Date;
  /** Total size in bytes of the app's storage files at backup time, if known. */
  filesSize: number | null;
  /** Size in bytes of the app's database at backup time, if known. */
  dbSize: number | null;
  /**
   * Total uncompressed size in bytes of the backup's entity files (what they
   * take up unpacked on disk), if known.
   */
  uncompressedSize: number | null;
  /** Human-readable label, e.g. "Automated Daily Snapshot". */
  description: string | null;
  /** When the backup stops being available for download. */
  expiresAt: Date | null;
};

/**
 * A file that makes up the backup payload: `config.json` or an
 * `entities/<etype>.jsonl` shard.
 */
export type AppBackupFile = {
  name: string;
  /** Size in bytes as stored (the entity shards are stored compressed). */
  size: number;
};

/** A storage file captured in a backup, with a presigned download URL. */
export type AppBackupStorageFile = {
  /**
   * Stable id of the file's blob. A backup archive stores the blob at
   * `files/<locationId>`.
   */
  locationId: string;
  /** The path the user uploaded the file to. */
  path: string | null;
  /** Presigned URL for the file's contents. Expires after 12 hours. */
  url: string;
};

type AppBackupResponse = {
  id: string;
  isn: string;
  backup_at: string;
  files_size: number | null;
  db_size: number | null;
  uncompressed_size: number | null;
  description: string | null;
  expires_at: string | null;
};

/** Converts a backup row as the server sends it into an {@link AppBackup}. */
export function toAppBackup(row: AppBackupResponse): AppBackup {
  return {
    id: row.id,
    isn: row.isn,
    backupAt: new Date(row.backup_at),
    filesSize: row.files_size,
    dbSize: row.db_size,
    uncompressedSize: row.uncompressed_size,
    description: row.description,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  };
}

/** Suggested filename for a backup archive. */
export function backupZipName(backup: AppBackup): string {
  const safe = backup.backupAt.toISOString().replace(/[:.]/g, '-');
  return `instant-backup-${safe}.zip`;
}

/**
 * Estimated size range for a backup's zip archive, or null when the backup
 * row carries no sizes. Upper bound: everything stored uncompressed (STORE
 * mode and/or files that don't compress). Lower bound: everything compressed
 * at a ~4x DEFLATE ratio, best case for text/JSON, but storage files vary
 * wildly (raw text compresses well, already-compressed images/videos don't).
 * The same divisor applies to both since the file types aren't visible from
 * here; the actual zip lands somewhere inside the range.
 */
export function estimateZipSize(
  backup: AppBackup,
): { min: number; max: number } | null {
  const backupBytes = backup.uncompressedSize ?? backup.dbSize;
  if (backupBytes == null || backup.filesSize == null) return null;
  const max = backupBytes + backup.filesSize;
  return { min: Math.round(max / 4), max };
}

function authHeaders(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'Instant-Platform-Version': version,
    'Instant-Core-Version': coreVersion,
    'X-Instant-Source': 'platform-sdk',
    'X-Instant-Version': version,
  };
}

async function apiError(res: Response): Promise<InstantAPIError> {
  const body = await res.text();
  try {
    return new InstantAPIError({ status: res.status, body: JSON.parse(body) });
  } catch (_e) {
    return new InstantAPIError({
      status: res.status,
      body: { type: undefined, message: body },
    });
  }
}

async function* ndjsonLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<any, void, void> {
  const reader = body.getReader();
  try {
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.length > 0) {
          yield JSON.parse(line);
        }
        nl = buf.indexOf('\n');
      }
    }
    const line = buf.trim();
    if (line.length > 0) {
      yield JSON.parse(line);
    }
  } finally {
    // Also releases the connection when the consumer stops iterating early.
    await reader.cancel().catch(() => {});
  }
}

/**
 * Read-only API for an app's backups.
 *
 * A backup archive has a canonical entry order that restore relies on:
 * `config.json` first, then every `entities/<etype>.jsonl` shard, then the
 * `files/<locationId>` storage blobs. In particular ALL entity files must
 * come before ANY storage file, so a restore can process the archive in a
 * single streaming pass: `config.json` sets up the schema, the `$files`
 * entities register file metadata, and only then can each blob be matched
 * to its entity. {@link downloadArchive} implements that order end to end;
 * {@link listFiles} (which returns the entity files already in write order)
 * and {@link streamStorageFiles} are the pieces for building a custom
 * pipeline.
 */
export class BackupsManager {
  #appId: string;
  #apiURI: string;
  #withAuth: WithAuth;

  constructor(opts: { appId: string; apiURI: string; withAuth: WithAuth }) {
    this.#appId = opts.appId;
    this.#apiURI = opts.apiURI;
    this.#withAuth = opts.withAuth;
  }

  #getJson(path: string, signal?: AbortSignal): Promise<any> {
    return this.#withAuth(async (token) => {
      const res = await fetch(`${this.#apiURI}${path}`, {
        headers: authHeaders(token),
        signal,
      });
      if (res.status !== 200) {
        throw await apiError(res);
      }
      return res.json();
    });
  }

  /**
   * Returns the app's downloadable (non-expired) backups, newest first.
   */
  async list(opts?: { signal?: AbortSignal }): Promise<AppBackup[]> {
    const res = await this.#getJson(
      `/dash/apps/${this.#appId}/backups`,
      opts?.signal,
    );
    return ((res.backups || []) as AppBackupResponse[]).map(toAppBackup);
  }

  /**
   * Returns the backup's entity files (`config.json` and the
   * `entities/<etype>.jsonl` shards) in archive write order. Storage blobs
   * are not included; discover those with {@link streamStorageFiles}.
   */
  async listFiles(
    backupId: string,
    opts?: { signal?: AbortSignal },
  ): Promise<AppBackupFile[]> {
    const res = await this.#getJson(
      `/dash/apps/${this.#appId}/backups/${backupId}/files`,
      opts?.signal,
    );
    return (res.files || []) as AppBackupFile[];
  }

  /**
   * Returns a presigned download URL for one of the backup's entity files.
   * The URL expires after 1 hour, so fetch it right before downloading.
   *
   * The entity files are stored zstd-compressed (the response carries
   * `Content-Encoding: zstd`); decompress to get the raw JSON/JSONL.
   */
  async getFileUrl(
    backupId: string,
    name: string,
    opts?: { signal?: AbortSignal },
  ): Promise<string> {
    const res = await this.#getJson(
      `/dash/apps/${this.#appId}/backups/${backupId}/file-url?name=${encodeURIComponent(name)}`,
      opts?.signal,
    );
    return res.url as string;
  }

  /**
   * Streams every storage file captured in the backup, each with a presigned
   * download URL. Completes without yielding anything when the app has no
   * storage files.
   *
   * The server ends a healthy stream with a terminal sentinel; if the stream
   * closes without it (a server-side failure truncated the listing), this
   * throws instead of silently under-reporting files.
   */
  async *streamStorageFiles(
    backupId: string,
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<AppBackupStorageFile, void, void> {
    const res = await this.#withAuth(async (token) => {
      const res = await fetch(
        `${this.#apiURI}/dash/apps/${this.#appId}/backups/${backupId}/storage-files`,
        { headers: authHeaders(token), signal: opts?.signal },
      );
      if (res.status !== 200) {
        throw await apiError(res);
      }
      return res;
    });
    if (!res.body) {
      throw new Error('Storage file listing returned no body.');
    }
    let complete = false;
    for await (const line of ndjsonLines(res.body)) {
      if (line.done === true) {
        complete = true;
        break;
      }
      // A file record always carries a locationId and url; anything else is
      // corruption, and skipping it would silently omit a file from the
      // archive.
      if (
        typeof line.locationId !== 'string' ||
        line.locationId.length === 0 ||
        typeof line.url !== 'string' ||
        line.url.length === 0
      ) {
        throw new Error(
          'Storage file listing returned a malformed record. Please retry the download.',
        );
      }
      yield {
        locationId: line.locationId,
        path: line.path ?? null,
        url: line.url,
      };
    }
    if (!complete) {
      throw new Error(
        'Storage file listing ended before it finished. Please retry the download.',
      );
    }
  }

  /**
   * Downloads the backup into a single zip archive written to `opts.sink`,
   * entries in the canonical restore order described above. The caller
   * supplies the runtime-specific pieces — how to fetch a presigned URL,
   * where the bytes go, and the archive encoder (e.g. zip.js's `ZipWriter`);
   * see {@link DownloadBackupArchiveOpts}.
   */
  downloadArchive(
    opts: DownloadBackupArchiveOpts,
  ): Promise<BackupDownloadResult> {
    return downloadBackupArchive({ manager: this, ...opts });
  }
}
