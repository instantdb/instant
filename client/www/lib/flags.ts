import { isDev } from './config';

export const flags = {
  emails: false,
  createOrgs: true,
  webhooks: isDev,
} as const;
