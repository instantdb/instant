import fs from 'fs/promises';
import path from 'path';
import os from 'os';

interface StorageAdapter {
  getItem(k: string): Promise<string | null>;
  setItem(k: string, v: string): Promise<void>;
  clear(): Promise<void>;
}

export class FileSystemStorage implements StorageAdapter {
  private storageDir: string;
  private initialized: boolean = false;

  constructor(appId: string) {
    // Store data in user's home directory under .instantdb
    this.storageDir = path.join(os.homedir(), '.instantdb', appId);
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await fs.mkdir(this.storageDir, { recursive: true });
      this.initialized = true;
    }
  }

  private getFilePath(key: string): string {
    // Sanitize key to be filesystem-safe
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.storageDir, `${safeKey}.json`);
  }

  async getItem(key: string): Promise<string | null> {
    await this.ensureInitialized();
    const filePath = this.getFilePath(key);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return data;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    const filePath = this.getFilePath(key);
    
    await fs.writeFile(filePath, value, 'utf-8');
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const files = await fs.readdir(this.storageDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.storageDir, file)))
      );
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
}

// Factory function to match the core package's IndexedDBStorage interface
export function createFileSystemStorage(appId: string): StorageAdapter {
  return new FileSystemStorage(appId);
}