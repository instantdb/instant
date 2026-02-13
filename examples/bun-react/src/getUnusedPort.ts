export const getUnusedPort = async (
  startPort: number = 3000,
  maxAttempts: number = 10,
): Promise<number> => {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const isAvailable = await isPortAvailable(port);

    if (isAvailable) {
      return port;
    }
  }

  throw new Error(
    `No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`,
  );
};

const isPortAvailable = async (port: number): Promise<boolean> => {
  try {
    const server = Bun.serve({
      port,
      fetch() {
        return new Response("OK");
      },
    });
    await server.stop(true);
    return true;
  } catch (err) {
    return false;
  }
};
