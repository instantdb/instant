import { TransactionChunk } from '@instantdb/core';

import { MaybeUndefined } from '@/utils/types';
import { db } from '@/db';
import { id } from '@instantdb/react';

const BATCH_SIZE = 20;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Chunk = TransactionChunk<any, any>;

export type TransactionProgress = {
  transactionId: string;
  remainingBatches: number;
  totalBatches: number;
  batchSize: number;
};

let _tempId = 0;
async function loggingTransact(chunks: Chunk[]) { 
  const _id = _tempId++;
  const ops = chunks.map((chunk) => chunk.__ops);
  console.log('[transact]', _id, 'start', ops);
  await db.transact(chunks);
  console.log('[transact]', _id, 'end', ops);
}

/**
 * Batch transact the given Transaction Chunks
 * about batching see: https://discord.com/channels/1031957483243188235/1252314570626695298/1252328034585808936
 * > I found that 500ms between batches and 100 transactions per batch was my sweet spot
 * @param chunks
 * @param onProgress
 */
export const batchTransact = async (
  chunks: MaybeUndefined<Chunk> | MaybeUndefined<Chunk>[],
  onProgress?: (progress: TransactionProgress) => void
) => {
  if (Array.isArray(chunks)) {
    const batches: Array<Chunk[]> = [];
    let batch: Chunk[] = [];
    for (const chunk of chunks) {
      if (chunk) {
        batch.push(chunk);
        if (batch.length > BATCH_SIZE) {
          batches.push(batch);
          batch = [];
        }
      }
    }
    if (batch.length) {
      batches.push(batch);
    }
    let i = 0;
    const transactionId = id();
    for (const batch of batches) {
      await loggingTransact(batch);
      i += 1;
      onProgress?.({
        transactionId,
        remainingBatches: batches.length - i,
        totalBatches: batches.length,
        batchSize: BATCH_SIZE,
      });
    }
  } else {
    if (chunks) {
      await loggingTransact([chunks]);
    }
  }
};
