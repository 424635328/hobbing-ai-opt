import type {
  AlgorithmExecutionContext,
  AlgorithmExecutionResult,
  AlgorithmPermission,
} from "./dynamic-algorithm-types";
import type { DecisionVector, ObjectiveVector } from "./hobbing-model";

export interface SandboxExecutionOptions {
  timeout?: number;
  maxMemory?: number;
  allowedGlobals?: string[];
}

const DEFAULT_GLOBALS = [
  "Math",
  "Array",
  "Object",
  "Number",
  "String",
  "Boolean",
  "Date",
  "JSON",
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
];

const FORBIDDEN_PATTERNS = [
  /eval\s*\(/g,
  /Function\s*\(/g,
  /\bwindow\b/g,
  /\bdocument\b/g,
  /\bglobalThis\b/g,
  /\bprocess\b/g,
  /\brequire\b/g,
  /\bimport\s*\(/g,
  /\bXMLHttpRequest\b/g,
  /\bfetch\b/g,
  /\bWebSocket\b/g,
  /\bsetTimeout\b/g,
  /\bsetInterval\b/g,
  /\bclearTimeout\b/g,
  /\bclearInterval\b/g,
];

export class AlgorithmSandbox {
  private executionLogs: string[] = [];
  private readonly permissions: AlgorithmPermission;

  constructor(permissions: AlgorithmPermission) {
    this.permissions = permissions;
  }

  validateCode(code: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.permissions.canUseEval) {
      for (const pattern of FORBIDDEN_PATTERNS) {
        const matches = code.match(pattern);
        if (matches) {
          errors.push(`Forbidden pattern found: ${pattern.toString()}`);
        }
      }
    }

    if (!code.includes("function") && !code.includes("=>")) {
      warnings.push("No function definition found in code");
    }

    if (code.includes("this.")) {
      warnings.push("Usage of 'this' may have unexpected behavior in sandbox");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  createSafeGlobalContext(): Record<string, unknown> {
    const safeGlobals: Record<string, unknown> = {};

    for (const name of DEFAULT_GLOBALS) {
      if (typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>)[name]) {
        safeGlobals[name] = (globalThis as Record<string, unknown>)[name];
      }
    }

    safeGlobals.console = {
      log: (...args: unknown[]) => {
        this.executionLogs.push(`[LOG] ${args.map((a) => String(a)).join(" ")}`);
      },
      warn: (...args: unknown[]) => {
        this.executionLogs.push(`[WARN] ${args.map((a) => String(a)).join(" ")}`);
      },
      error: (...args: unknown[]) => {
        this.executionLogs.push(`[ERROR] ${args.map((a) => String(a)).join(" ")}`);
      },
    };

    return safeGlobals;
  }

  async executeAlgorithm(
    code: string,
    context: AlgorithmExecutionContext,
    parameters: Record<string, unknown>,
    options?: SandboxExecutionOptions,
  ): Promise<AlgorithmExecutionResult> {
    const startTime = Date.now();
    this.executionLogs = [];

    const validation = this.validateCode(code);
    if (!validation.valid) {
      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: validation.errors.join(", "),
        logs: this.executionLogs,
      };
    }

    const timeout = options?.timeout || this.permissions.maxExecutionTime;

    try {
      const result = await this.executeWithTimeout(
        code,
        context,
        parameters,
        timeout,
      );

      return {
        success: true,
        archiveX: result.archiveX || [],
        archiveF: result.archiveF || [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: result.feCount || 0,
        },
        logs: this.executionLogs,
      };
    } catch (error) {
      return {
        success: false,
        archiveX: [],
        archiveF: [],
        stats: {
          executionTime: Date.now() - startTime,
          feCount: 0,
        },
        error: error instanceof Error ? error.message : String(error),
        logs: this.executionLogs,
      };
    }
  }

  private async executeWithTimeout(
    code: string,
    context: AlgorithmExecutionContext,
    parameters: Record<string, unknown>,
    timeout: number,
  ): Promise<{
    archiveX: DecisionVector[];
    archiveF: ObjectiveVector[];
    feCount: number;
  }> {
    const safeGlobals = this.createSafeGlobalContext();
    let feCount = 0;

    const executionWrapper = `
      ${code}
      
      if (typeof runAlgorithm === 'function') {
        return runAlgorithm(params, context);
      } else if (typeof main === 'function') {
        return main(params, context);
      } else {
        throw new Error('No entry function found (expected runAlgorithm or main)');
      }
    `;

    const func = new Function(
      "params",
      "context",
      "feCounter",
      ...Object.keys(safeGlobals),
      executionWrapper,
    );

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Algorithm execution timed out"));
      }, timeout);

      try {
        const feCounter = {
          increment: () => { feCount++; },
          getCount: () => feCount,
        };

        const result = func(
          parameters,
          context,
          feCounter,
          ...Object.values(safeGlobals),
        );

        clearTimeout(timeoutId);
        resolve({
          archiveX: result.archiveX || [],
          archiveF: result.archiveF || [],
          feCount,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  getLogs(): string[] {
    return [...this.executionLogs];
  }

  clearLogs(): void {
    this.executionLogs = [];
  }
}

export function createSandbox(permissions: AlgorithmPermission): AlgorithmSandbox {
  return new AlgorithmSandbox(permissions);
}
