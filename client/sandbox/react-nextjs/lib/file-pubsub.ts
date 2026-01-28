import type { Publisher, Subscriber } from 'resumable-stream';
import fs from 'fs';
import path from 'path';

type PubSub = Publisher & Subscriber;

const DATA_DIR = path.join(process.cwd(), '.stream-data');
const CHANNELS_DIR = path.join(DATA_DIR, 'channels');
const KV_DIR = path.join(DATA_DIR, 'kv');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9-_]/g, '_');
}

function getKvPath(key: string): string {
  return path.join(KV_DIR, `${sanitizeKey(key)}.json`);
}

function getChannelPath(channel: string): string {
  return path.join(CHANNELS_DIR, `${sanitizeKey(channel)}.jsonl`);
}

let instance: { subscriber: PubSub; publisher: PubSub } | null = null;

// Track active watchers so we can clean them up
const watchers = new Map<string, fs.FSWatcher>();
const lastReadPosition = new Map<string, number>();

export function getFilePubSub(): {
  subscriber: PubSub;
  publisher: PubSub;
} {
  if (instance) {
    return instance;
  }

  ensureDir(KV_DIR);
  ensureDir(CHANNELS_DIR);

  const pubsub: PubSub = {
    connect: async () => {},

    publish: async (channel, message) => {
      ensureDir(CHANNELS_DIR);
      const channelPath = getChannelPath(channel);
      const line = JSON.stringify({ message, timestamp: Date.now() }) + '\n';
      fs.appendFileSync(channelPath, line, 'utf-8');
      return 1;
    },

    subscribe: async (channel, callback) => {
      ensureDir(CHANNELS_DIR);
      const channelPath = getChannelPath(channel);

      // Create the file if it doesn't exist
      if (!fs.existsSync(channelPath)) {
        fs.writeFileSync(channelPath, '', 'utf-8');
      }

      // Start reading from the end of the file
      const stats = fs.statSync(channelPath);
      lastReadPosition.set(channelPath, stats.size);

      // Watch for changes
      const watcher = fs.watch(channelPath, (eventType) => {
        if (eventType === 'change') {
          try {
            const currentPos = lastReadPosition.get(channelPath) || 0;
            const content = fs.readFileSync(channelPath, 'utf-8');
            const newContent = content.slice(currentPos);
            lastReadPosition.set(channelPath, content.length);

            // Parse new lines
            const lines = newContent.split('\n').filter((l) => l.trim());
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                let message: string;

                if (typeof data.message === 'string') {
                  message = data.message;
                } else if (data.message && typeof data.message === 'object') {
                  // Convert byte array object back to string
                  // e.g., {"0":48,"1":58,...} -> "0:..."
                  const keys = Object.keys(data.message).map(Number).sort((a, b) => a - b);
                  const bytes = keys.map(k => data.message[k]);
                  message = String.fromCharCode(...bytes);
                } else {
                  message = String(data.message);
                }

                callback(message);
              } catch (e) {
                // Ignore parse errors
              }
            }
          } catch (e) {
            console.error('[pubsub] Error reading channel file:', e);
          }
        }
      });

      watchers.set(channel, watcher);
    },

    unsubscribe: async (channel) => {
      const watcher = watchers.get(channel);
      if (watcher) {
        watcher.close();
        watchers.delete(channel);
      }
      const channelPath = getChannelPath(channel);
      lastReadPosition.delete(channelPath);
    },

    set: async (key, value) => {
      ensureDir(KV_DIR);
      const filePath = getKvPath(key);
      const data = { value, timestamp: Date.now() };
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
      return 'OK' as const;
    },

    get: async (key) => {
      const filePath = getKvPath(key);
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          return data.value;
        }
      } catch (e) {
        // Ignore read errors
      }
      return null;
    },

    incr: async (key) => {
      ensureDir(KV_DIR);
      const filePath = getKvPath(key);
      let value = 0;

      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          value = Number(data.value) || 0;
        }
      } catch {
        // File doesn't exist or is invalid, start at 0
      }

      const newValue = value + 1;
      const data = { value: newValue, timestamp: Date.now() };
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
      return newValue;
    },
  };

  instance = {
    subscriber: pubsub,
    publisher: pubsub,
  };

  return instance;
}
