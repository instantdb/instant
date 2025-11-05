export function isHeadlessEnvironment(opts) {
  const noBrowserMode = Boolean(
    process.env.INSTANT_CLI_NO_BROWSER || process.env.CI || opts?.headless,
  );

  // Check for common headless environment indicators
  return (
    noBrowserMode ||
    process.env.TERM === 'dumb' ||
    process.env.SSH_CONNECTION !== undefined ||
    process.env.SSH_CLIENT !== undefined ||
    (!process.env.DISPLAY && process.platform === 'linux') ||
    process.env.WSL_DISTRO_NAME !== undefined
  );
}
