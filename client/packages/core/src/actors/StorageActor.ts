import { BaseActor, Message } from './BaseActor.js';

interface StorageState {
  // Simple actor - mostly just passes through to API
}

/**
 * StorageActor handles file upload/download operations.
 *
 * Receives:
 * - { type: 'storage:upload', path, file, opts }
 * - { type: 'storage:delete', path }
 *
 * Publishes:
 * - { type: 'storage:upload-complete', path, result }
 * - { type: 'storage:error', operation, error }
 */
export class StorageActor extends BaseActor<StorageState> {
  constructor() {
    super('Storage', {});
  }

  receive(message: Message): void {
    switch (message.type) {
      case 'storage:upload':
        this.handleUpload(message.path, message.file, message.opts);
        break;

      case 'storage:delete':
        this.handleDelete(message.path);
        break;
    }
  }

  private async handleUpload(path: string, file: any, opts?: any): Promise<void> {
    try {
      // In real implementation, this would call StorageAPI
      this.publish({
        type: 'storage:upload-complete',
        path,
        result: { url: `https://storage.example.com/${path}` },
      });
    } catch (error) {
      this.publish({
        type: 'storage:error',
        operation: 'upload',
        error,
      });
    }
  }

  private async handleDelete(path: string): Promise<void> {
    try {
      // In real implementation, this would call StorageAPI
      this.publish({
        type: 'storage:delete-complete',
        path,
      });
    } catch (error) {
      this.publish({
        type: 'storage:error',
        operation: 'delete',
        error,
      });
    }
  }
}
