import { id as coreId } from '@instantdb/core';

export default defineEventHandler(async () => {
  try {
    console.log('core/id', coreId);

    return { coreId: coreId() };
  } catch (error) {
    console.error('error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
