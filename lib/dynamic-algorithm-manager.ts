import { getAlgorithmRegistry } from "./algorithm-registry";
import { createSandbox, AlgorithmSandbox } from "./algorithm-sandbox";
import { getCodeQualityChecker } from "./algorithm-code-quality";
import type {
  AlgorithmMetadata,
  AlgorithmExecutionRequest,
  AlgorithmExecutionResult,
} from "./dynamic-algorithm-types";

export class DynamicAlgorithmManager {
  private registry = getAlgorithmRegistry();
  private sandboxes: Map<string, AlgorithmSandbox> = new Map();
  private activeExecutions: Set<string> = new Set();

  async registerAlgorithm(
    metadata: Partial<AlgorithmMetadata>,
    code: string,
  ): Promise<{ success: boolean; metadata?: AlgorithmMetadata; error?: string }> {
    try {
      const qualityChecker = getCodeQualityChecker();
      const qualityResult = qualityChecker.analyzeAndFormat(code, metadata);

      if (!qualityResult.success) {
        return {
          success: false,
          error: `Code quality check failed: ${qualityResult.issues.map((i) => i.message).join(", ")}`,
        };
      }

      const finalCode = qualityResult.formattedCode || code;
      const result = this.registry.registerAlgorithm(metadata, finalCode);

      if (result.success && result.metadata) {
        const sandbox = createSandbox(result.metadata.permissions);
        this.sandboxes.set(result.metadata.id, sandbox);
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to register algorithm",
      };
    }
  }

  async executeAlgorithm(
    request: AlgorithmExecutionRequest,
  ): Promise<AlgorithmExecutionResult> {
    const startTime = Date.now();

    if (this.activeExecutions.has(request.context.jobId)) {
      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: "Job is already executing",
      };
    }

    const loadResult = this.registry.loadAlgorithm({
      algorithmId: request.algorithmId,
      version: request.version,
      validate: true,
    });

    if (!loadResult.success || !loadResult.metadata) {
      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: loadResult.error || "Failed to load algorithm",
      };
    }

    const registryEntry = this.registry.getAlgorithm(request.algorithmId);
    if (!registryEntry) {
      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: "Algorithm not found in registry",
      };
    }

    let sandbox = this.sandboxes.get(request.algorithmId);
    if (!sandbox) {
      sandbox = createSandbox(loadResult.metadata.permissions);
      this.sandboxes.set(request.algorithmId, sandbox);
    }

    this.activeExecutions.add(request.context.jobId);

    try {
      const result = await sandbox.executeAlgorithm(
        registryEntry.code,
        request.context,
        request.parameters,
        {
          timeout: loadResult.metadata.permissions.maxExecutionTime,
          maxMemory: loadResult.metadata.permissions.maxMemoryUsage,
        },
      );

      this.registry.recordExecution(
        request.algorithmId,
        result.success,
        result.stats.executionTime,
      );

      return {
        ...result,
        logs: result.logs,
      };
    } catch (error) {
      this.registry.recordExecution(request.algorithmId, false, Date.now() - startTime);

      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: error instanceof Error ? error.message : String(error),
        logs: sandbox.getLogs(),
      };
    } finally {
      this.activeExecutions.delete(request.context.jobId);
    }
  }

  unloadAlgorithm(algorithmId: string): boolean {
    const success = this.registry.unloadAlgorithm(algorithmId);
    if (success) {
      this.sandboxes.delete(algorithmId);
    }
    return success;
  }

  getAlgorithm(algorithmId: string): AlgorithmMetadata | null {
    const entry = this.registry.getAlgorithm(algorithmId);
    return entry ? entry.metadata : null;
  }

  listAlgorithms(filters?: {
    status?: string;
    source?: string;
    category?: string;
    tag?: string;
  }): AlgorithmMetadata[] {
    return this.registry.listAlgorithms(filters);
  }

  getSystemStats() {
    return {
      ...this.registry.getStats(),
      activeExecutions: this.activeExecutions.size,
      registeredSandboxes: this.sandboxes.size,
    };
  }

  getMonitorEvents(limit?: number) {
    return this.registry.getMonitorEvents(limit);
  }
}

let managerInstance: DynamicAlgorithmManager | null = null;

export function getDynamicAlgorithmManager(): DynamicAlgorithmManager {
  if (!managerInstance) {
    managerInstance = new DynamicAlgorithmManager();
  }
  return managerInstance;
}
