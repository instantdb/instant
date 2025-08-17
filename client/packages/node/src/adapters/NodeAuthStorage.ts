import crypto from 'crypto';
import { FileSystemStorage } from './FileSystemStorage.js';

interface AuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export class NodeAuthStorage implements AuthStorage {
  private storage: FileSystemStorage;
  private encryptionKey: Buffer;
  private algorithm = 'aes-256-gcm';
  
  constructor(appId: string) {
    this.storage = new FileSystemStorage(appId);
    // Derive encryption key from app ID (in production, use a proper key management system)
    this.encryptionKey = crypto.scryptSync(appId, 'instantdb-node-salt', 32);
  }
  
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv) as crypto.CipherGCM;
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine iv, authTag, and encrypted data
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }
  
  private decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv) as crypto.DecipherGCM;
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  async getItem(key: string): Promise<string | null> {
    const encryptedValue = await this.storage.getItem(`auth_${key}`);
    if (!encryptedValue) {
      return null;
    }
    
    try {
      return this.decrypt(encryptedValue);
    } catch (error) {
      // If decryption fails, treat as if item doesn't exist
      console.error('Failed to decrypt auth data:', error);
      return null;
    }
  }
  
  async setItem(key: string, value: string): Promise<void> {
    const encryptedValue = this.encrypt(value);
    await this.storage.setItem(`auth_${key}`, encryptedValue);
  }
  
  async removeItem(key: string): Promise<void> {
    await this.storage.setItem(`auth_${key}`, '');
  }
}

// Factory function to create auth storage
export function createNodeAuthStorage(appId: string): AuthStorage {
  return new NodeAuthStorage(appId);
}