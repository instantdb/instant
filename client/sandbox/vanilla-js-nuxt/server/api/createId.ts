import { id as adminId } from '@instantdb/admin';
import { id as coreId } from '@instantdb/core';

export default defineEventHandler(async () => {
  try {
    console.log('admin/id', adminId);
    console.log('core/id', coreId);

    return { adminId: adminId(), coreId: coreId() };
  } catch (error) {
    console.error('error:', error);
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
});
