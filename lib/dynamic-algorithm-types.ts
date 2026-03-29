import type { DecisionVector, ObjectiveVector } from "./hobbing-model";

export type AlgorithmStatus = "draft" | "registered" | "active" | "deprecated" | "archived";
export type AlgorithmRuntime = "browser-worker" | "node-worker" | "sandbox";
export type AlgorithmFormat = "typescript" | "javascript" | "webassembly";

export interface AlgorithmVersion {
  version: string;
  createdAt: string;
  createdBy?: string;
  changes: string[];
  codeHash: string;
  isActive: boolean;
}

export interface AlgorithmExecutionContext {
  jobId: string;
  algorithmId: string;
  version: string;
  startTime: number;
  timeout?: number;
  maxMemory?: number;
  maxCpu?: number;
}

export interface AlgorithmExecutionResult {
  success: boolean;
  archiveX: DecisionVector[];
  archiveF: ObjectiveVector[];
  stats: {
    executionTime: number;
    feCount: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
  error?: string;
  logs?: string[];
}

export interface AlgorithmPermission {
  canAccessFileSystem: boolean;
  canAccessNetwork: boolean;
  canUseEval: boolean;
  maxExecutionTime: number;
  maxMemoryUsage: number;
  allowedImports: string[];
}

export interface AlgorithmMetadata {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  versions: AlgorithmVersion[];
  author?: string;
  source: "builtin" | "uploaded" | "ai-generated";
  format: AlgorithmFormat;
  runtime: AlgorithmRuntime;
  status: AlgorithmStatus;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  categories: string[];
  
  inputSpec: {
    parameters: Array<{
      name: string;
      type: "number" | "string" | "boolean" | "array" | "object";
      required: boolean;
      defaultValue?: unknown;
      description?: string;
      min?: number;
      max?: number;
      enum?: string[];
    }>;
  };
  
  outputSpec: {
    fields: Array<{
      name: string;
      type: "number" | "string" | "array" | "object";
      description?: string;
      format?: string;
    }>;
  };
  
  performance?: {
    averageExecutionTime?: number;
    successRate?: number;
    popularity?: number;
  };
  
  dependencies?: string[];
  compatibility?: {
    minimumEngineVersion?: string;
    requiredFeatures?: string[];
  };
  
  permissions: AlgorithmPermission;
  securityLevel: "low" | "medium" | "high" | "critical";
}

export interface AlgorithmRegistryEntry {
  metadata: AlgorithmMetadata;
  code: string;
  compiledCode?: string;
  sourceMap?: string;
}

export interface AlgorithmLoadRequest {
  algorithmId: string;
  version?: string;
  validate?: boolean;
}

export interface AlgorithmLoadResponse {
  success: boolean;
  metadata?: AlgorithmMetadata;
  error?: string;
  warnings?: string[];
}

export interface AlgorithmExecutionRequest {
  algorithmId: string;
  version?: string;
  context: AlgorithmExecutionContext;
  parameters: Record<string, unknown>;
}

export interface AlgorithmMonitorEvent {
  type: "load" | "unload" | "execute" | "error" | "warning";
  timestamp: string;
  algorithmId: string;
  version: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AlgorithmRegistryStats {
  totalAlgorithms: number;
  activeAlgorithms: number;
  totalExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
}

export const DEFAULT_ALGORITHM_PERMISSIONS: AlgorithmPermission = {
  canAccessFileSystem: false,
  canAccessNetwork: false,
  canUseEval: false,
  maxExecutionTime: 5 * 60 * 1000,
  maxMemoryUsage: 256 * 1024 * 1024,
  allowedImports: [],
};

export const DEFAULT_ALGORITHM_METADATA: Partial<AlgorithmMetadata> = {
  source: "uploaded",
  format: "typescript",
  runtime: "browser-worker",
  status: "draft",
  tags: [],
  categories: [],
  performance: {},
  dependencies: [],
  compatibility: {},
  permissions: DEFAULT_ALGORITHM_PERMISSIONS,
  securityLevel: "medium",
};
