import { loadConfig } from "./config.js";
import { ProviderNotConfiguredError } from "./errors.js";
import { createAnalysisEngine, type AnalysisEngine } from "./analysis/engine.js";
import { ArchiveDatabase } from "./database.js";
import { XClient } from "./x-client.js";
import type { DaemonStatus, ProviderHealth } from "./provider-types.js";

interface RuntimeSnapshot {
  ready: boolean;
  status: DaemonStatus;
  provider: ProviderHealth;
  databasePath: string;
}

let runtimePromise: Promise<Runtime> | null = null;

function createInitialHealth(configured: boolean): ProviderHealth {
  return {
    configured,
    status: configured ? "error" : "misconfigured",
    lastError: configured ? "Provider probe has not run yet." : null
  };
}

export class Runtime {
  private analysisEnginePromise: Promise<AnalysisEngine> | null = null;

  constructor(
    readonly config: ReturnType<typeof loadConfig>,
    readonly database: ArchiveDatabase,
    readonly xClient: XClient | null,
    private readonly providerHealth: ProviderHealth
  ) {}

  async bootstrap() {
    if (!this.xClient) {
      this.providerHealth.configured = false;
      this.providerHealth.status = "misconfigured";
      this.providerHealth.lastError = null;
      return;
    }

    try {
      await this.xClient.probe();
      this.providerHealth.configured = true;
      this.providerHealth.status = "ready";
      this.providerHealth.lastError = null;
    } catch (error) {
      this.providerHealth.configured = true;
      this.providerHealth.status = "error";
      this.providerHealth.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  getXClient() {
    if (!this.xClient) {
      throw new ProviderNotConfiguredError();
    }
    return this.xClient;
  }

  async getAnalysisEngine() {
    if (!this.analysisEnginePromise) {
      this.analysisEnginePromise = Promise.resolve(createAnalysisEngine(this.config));
    }
    return this.analysisEnginePromise;
  }

  getSnapshot(): RuntimeSnapshot {
    const status: DaemonStatus = this.providerHealth.status === "ready" ? "ready" : "misconfigured";
    return {
      ready: status === "ready",
      status,
      provider: this.providerHealth,
      databasePath: this.config.databasePath
    };
  }

  async close() {
    this.database.close();
  }
}

export async function getRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const config = loadConfig();
      const database = new ArchiveDatabase(config.databasePath);
      const providerHealth = createInitialHealth(!!config.xCredentials);
      const xClient = config.xCredentials ? new XClient(config.xCredentials) : null;
      const runtime = new Runtime(config, database, xClient, providerHealth);
      await runtime.bootstrap();
      return runtime;
    })();
  }

  return runtimePromise;
}

export async function getRuntimeSnapshot() {
  return (await getRuntime()).getSnapshot();
}

export async function shutdownRuntime() {
  if (runtimePromise) {
    const runtime = await runtimePromise;
    await runtime.close();
  }
  runtimePromise = null;
}
