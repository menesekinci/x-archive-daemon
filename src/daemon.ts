import { createDaemonServer } from "./daemon/server.js";

async function main() {
  const daemon = createDaemonServer();
  await daemon.start();
  process.stdout.write(`x-archive-daemon listening on http://${daemon.host}:${daemon.port}\n`);

  const shutdown = async () => {
    await daemon.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
