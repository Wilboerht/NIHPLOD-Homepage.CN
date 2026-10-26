import http from "node:http";
import next from "next";

const dev = (process.env.NODE_ENV ?? "production") === "development";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
async function startServer() {
  await app.prepare();

const server = http.createServer((request, response) => handle(request, response));
const sockets = new Set<import("node:net").Socket>();
server.on("connection", (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Server] ${signal} received, draining connections`);
  server.close();
  server.closeIdleConnections();

  try {
    const { stopCronTasks } = await import("./src/lib/cron-tasks");
    stopCronTasks();
  } catch (error) {
    console.error("[Server] Failed to stop cron tasks", error);
  }

  const forceTimer = setTimeout(() => {
    for (const socket of sockets) socket.destroy();
  }, 20_000);
  forceTimer.unref();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 20_000);
    server.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  clearTimeout(forceTimer);

  try {
    const { prisma } = await import("./src/lib/prisma");
    await prisma.$disconnect();
  } catch (error) {
    console.error("[Server] Failed to close database pool", error);
  }
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
server.on("error", (error) => {
  console.error("[Server] HTTP server error", error);
  process.exitCode = 1;
});
server.listen(port, hostname, () => {
  console.log(`[Server] Listening on http://${hostname}:${port}`);
});
}

void startServer();
