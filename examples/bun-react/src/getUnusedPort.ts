import net from "net";

export const getUnusedPort = async (
  startPort: number = 3000,
  maxAttempts: number = 10,
): Promise<number> => {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    const isAvailable = await checkPort(port);

    if (isAvailable) {
      return port;
    }
  }

  throw new Error(
    `No available ports found in range ${startPort}-${startPort + maxAttempts - 1}`,
  );
};

const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", (_err: NodeJS.ErrnoException) => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
};
