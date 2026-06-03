export const flags = {
  emails: false,
  createOrgs: true,
  // Gates the "Send a test email" button in the magic-code email editor. The
  // backend (POST /dash/apps/:id/send-test-email) lands first; flip to true
  // once it's deployed.
  sendTestEmail: false,
} as const;
