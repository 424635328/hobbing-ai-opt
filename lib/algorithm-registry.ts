
import type {
  AlgorithmMetadata,
  AlgorithmRegistryEntry,
  AlgorithmVersion,
  AlgorithmLoadRequest,
  AlgorithmLoadResponse,
  AlgorithmMonitorEvent,
  AlgorithmRegistryStats,
} from "./dynamic-algorithm-types";

function generateAlgorithmId(): string {
  return `dyn_alg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function computeCodeHash(code: string): string {
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

export class AlgorithmRegistry {
  private algorithms: Map<string, AlgorithmRegistryEntry> = new Map();
  private monitorEvents: AlgorithmMonitorEvent[] = [];
  private executionCount: Map<string, number> = new Map();
  private failedCount: Map<string, number> = new Map();
  private executionTimes: Map<string, number[]> = new Map();
  private readonly MAX_EVENTS = 1000;
  private readonly MAX_EXECUTION_TIMES = 100;

  constructor() {
    this.initializeBuiltinAlgorithms();
  }

  private initializeBuiltinAlgorithms(): void {
    const builtinAlgorithms = [
      {
        id: "builtin_mofata",
        name: "mofata",
        displayName: "MOFATA",
        description: "改进海市蜃楼多目标算法",
        version: "1.0.0",
        source: "builtin" as const,
      },
      {
        id: "builtin_mogwo",
        name: "mogwo",
        displayName: "MOGWO",
        description: "多目标灰狼优化算法",
        version: "1.0.0",
        source: "builtin" as const,
      },
      {
        id: "builtin_mopso",
        name: "mopso",
        displayName: "MOPSO",
        description: "多目标粒子群优化算法",
        version: "1.0.0",
        source: "builtin" as const,
      },
    ];

    const now = new Date().toISOString();

    for (const alg of builtinAlgorithms) {
      const metadata: AlgorithmMetadata = {
        id: alg.id,
        name: alg.name,
        displayName: alg.displayName,
        description: alg.description,
        version: alg.version,
        versions: [
          {
            version: alg.version,
            createdAt: now,
            changes: ["Initial version"],
            codeHash: "builtin",
            isActive: true,
          },
        ],
        source: alg.source,
        format: "typescript",
        runtime: "browser-worker",
        status: "active",
        createdAt: now,
        updatedAt: now,
        tags: ["builtin", "optimization"],
        categories: ["multi-objective"],
        inputSpec: {
          parameters: [
            { name: "dimensions", type: "number", required: true, description: "Number of dimensions" },
            { name: "objectives", type: "number", required: true, description: "Number of objectives" },
          ],
        },
        outputSpec: {
          fields: [
            { name: "archiveX", type: "array", description: "Pareto solutions" },
            { name: "archiveF", type: "array", description: "Objective values" },
          ],
        },
        permissions: {
          canAccessFileSystem: false,
          canAccessNetwork: false,
          canUseEval: false,
          maxExecutionTime: 5 * 60 * 1000,
          maxMemoryUsage: 256 * 1024 * 1024,
          allowedImports: [],
        },
        securityLevel: "low",
      };

      this.algorithms.set(alg.id, {
        metadata,
        code: "",
      });
    }
  }

  registerAlgorithm(
    metadata: Partial<AlgorithmMetadata>,
    code: string,
  ): AlgorithmLoadResponse {
    try {
      const now = new Date().toISOString();
      const algorithmId = metadata.id || generateAlgorithmId();
      const codeHash = computeCodeHash(code);
      const version = metadata.version || "1.0.0";

      const existingEntry = this.algorithms.get(algorithmId);
      let versions: AlgorithmVersion[];

      if (existingEntry) {
        versions = existingEntry.metadata.versions.map((v) => ({
          ...v,
          isActive: false,
        }));
      } else {
        versions = [];
      }

      versions.push({
        version,
        createdAt: now,
        changes: metadata.versions?.[0]?.changes || ["New version"],
        codeHash,
        isActive: true,
      });

      const fullMetadata: AlgorithmMetadata = {
        id: algorithmId,
        name: metadata.name || "custom_algorithm",
        displayName: metadata.displayName || metadata.name || "Custom Algorithm",
        description: metadata.description || "Custom optimization algorithm",
        version,
        versions,
        author: metadata.author,
        source: metadata.source || "uploaded",
        format: metadata.format || "typescript",
        runtime: metadata.runtime || "browser-worker",
        status: metadata.status || "registered",
        createdAt: existingEntry?.metadata.createdAt || now,
        updatedAt: now,
        tags: metadata.tags || [],
        categories: metadata.categories || [],
        inputSpec: metadata.inputSpec || { parameters: [] },
        outputSpec: metadata.outputSpec || { fields: [] },
        performance: metadata.performance || {},
        dependencies: metadata.dependencies || [],
        compatibility: metadata.compatibility || {},
        permissions: metadata.permissions || {
          canAccessFileSystem: false,
          canAccessNetwork: false,
          canUseEval: false,
          maxExecutionTime: 5 * 60 * 1000,
          maxMemoryUsage: 256 * 1024 * 1024,
          allowedImports: [],
        },
        securityLevel: metadata.securityLevel || "medium",
      };

      this.algorithms.set(algorithmId, {
        metadata: fullMetadata,
        code,
      });

      this.emitMonitorEvent({
        type: "load",
        algorithmId,
        version,
        message: "Algorithm registered successfully",
      });

      return {
        success: true,
        metadata: fullMetadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to register algorithm",
      };
    }
  }

  loadAlgorithm(request: AlgorithmLoadRequest): AlgorithmLoadResponse {
    const entry = this.algorithms.get(request.algorithmId);

    if (!entry) {
      return {
        success: false,
        error: `Algorithm ${request.algorithmId} not found`,
      };
    }

    let metadata = entry.metadata;

    if (request.version && request.version !== metadata.version) {
      const targetVersion = metadata.versions.find((v) => v.version === request.version);
      if (!targetVersion) {
        return {
          success: false,
          error: `Version ${request.version} not found for algorithm ${request.algorithmId}`,
        };
      }

      metadata = {
        ...metadata,
        version: request.version,
        versions: metadata.versions.map((v) => ({
          ...v,
          isActive: v.version === request.version,
        })),
      };
    }

    if (request.validate) {
      const validation = this.validateAlgorithm(entry);
      if (!validation.success) {
        return {
          success: false,
          error: validation.error,
          warnings: validation.warnings,
        };
      }
    }

    this.emitMonitorEvent({
      type: "load",
      algorithmId: request.algorithmId,
      version: metadata.version,
      message: "Algorithm loaded successfully",
    });

    return {
      success: true,
      metadata,
    };
  }

  unloadAlgorithm(algorithmId: string): boolean {
    const entry = this.algorithms.get(algorithmId);
    if (!entry) {
      return false;
    }

    if (entry.metadata.source === "builtin") {
      entry.metadata.status = "archived";
    } else {
      this.algorithms.delete(algorithmId);
    }

    this.emitMonitorEvent({
      type: "unload",
      algorithmId,
      version: entry.metadata.version,
      message: "Algorithm unloaded",
    });

    return true;
  }

  getAlgorithm(algorithmId: string): AlgorithmRegistryEntry | null {
    return this.algorithms.get(algorithmId) || null;
  }

  listAlgorithms(filters?: {
    status?: string;
    source?: string;
    category?: string;
    tag?: string;
  }): AlgorithmMetadata[] {
    let results = Array.from(this.algorithms.values()).map((e) => e.metadata);

    if (filters?.status) {
      results = results.filter((m) => m.status === filters.status);
    }

    if (filters?.source) {
      results = results.filter((m) => m.source === filters.source);
    }

    if (filters?.category) {
      results = results.filter((m) => m.categories.includes(filters.category!));
    }

    if (filters?.tag) {
      results = results.filter((m) => m.tags.includes(filters.tag!));
    }

    return results;
  }

  updateAlgorithmStatus(algorithmId: string, status: "draft" | "registered" | "active" | "deprecated" | "archived"): boolean {
    const entry = this.algorithms.get(algorithmId);
    if (!entry) {
      return false;
    }

    entry.metadata.status = status;
    entry.metadata.updatedAt = new Date().toISOString();

    this.emitMonitorEvent({
      type: status === "active" ? "load" : "warning",
      algorithmId,
      version: entry.metadata.version,
      message: `Algorithm status changed to ${status}`,
    });

    return true;
  }

  recordExecution(algorithmId: string, success: boolean, executionTime: number): void {
    const count = this.executionCount.get(algorithmId) || 0;
    this.executionCount.set(algorithmId, count + 1);

    if (!success) {
      const failed = this.failedCount.get(algorithmId) || 0;
      this.failedCount.set(algorithmId, failed + 1);
    }

    const times = this.executionTimes.get(algorithmId) || [];
    times.push(executionTime);
    if (times.length > this.MAX_EXECUTION_TIMES) {
      times.shift();
    }
    this.executionTimes.set(algorithmId, times);

    const entry = this.algorithms.get(algorithmId);
    if (entry) {
      const totalExecutions = count + 1;
      const failedExecutions = this.failedCount.get(algorithmId) || 0;
      entry.metadata.performance = {
        ...entry.metadata.performance,
        averageExecutionTime: times.reduce((a, b) => a + b, 0) / times.length,
        successRate: ((totalExecutions - failedExecutions) / totalExecutions) * 100,
        popularity: (entry.metadata.performance?.popularity || 0) + 1,
      };
    }
  }

  getStats(): AlgorithmRegistryStats {
    const totalAlgorithms = this.algorithms.size;
    const activeAlgorithms = Array.from(this.algorithms.values()).filter(
      (e) => e.metadata.status === "active",
    ).length;
    const totalExecutions = Array.from(this.executionCount.values()).reduce((a, b) => a + b, 0);
    const failedExecutions = Array.from(this.failedCount.values()).reduce((a, b) => a + b, 0);
    const allTimes = Array.from(this.executionTimes.values()).flat();
    const averageExecutionTime =
      allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0;

    return {
      totalAlgorithms,
      activeAlgorithms,
      totalExecutions,
      failedExecutions,
      averageExecutionTime,
    };
  }

  getMonitorEvents(limit?: number): AlgorithmMonitorEvent[] {
    const events = [...this.monitorEvents].reverse();
    return limit ? events.slice(0, limit) : events;
  }

  private validateAlgorithm(entry: AlgorithmRegistryEntry): {
    success: boolean;
    error?: string;
    warnings: string[];
  } {
    const warnings: string[] = [];

    if (!entry.code || entry.code.trim().length === 0) {
      return {
        success: false,
        error: "Algorithm code is empty",
        warnings: [],
      };
    }

    if (entry.code.includes("eval(")) {
      warnings.push("Code contains eval(), which may pose security risks");
    }

    if (entry.code.includes("require(") || entry.code.includes("import ")) {
      warnings.push("Code contains imports, verify permissions are properly set");
    }

    return {
      success: true,
      warnings,
    };
  }

  private emitMonitorEvent(event: Omit<AlgorithmMonitorEvent, "timestamp">): void {
    const fullEvent: AlgorithmMonitorEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.monitorEvents.push(fullEvent);

    if (this.monitorEvents.length > this.MAX_EVENTS) {
      this.monitorEvents.shift();
    }
  }
}

let registryInstance: AlgorithmRegistry | null = null;

export function getAlgorithmRegistry(): AlgorithmRegistry {
  if (!registryInstance) {
    registryInstance = new AlgorithmRegistry();
  }
  return registryInstance;
}
