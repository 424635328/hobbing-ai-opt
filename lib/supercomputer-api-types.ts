export interface SupercomputerApiConfig {
  apiKey: string;
  apiUrl: string;
  timeout: number;
  rateLimit: number;
  rateLimitWindow: number;
}

export interface SupercomputerModelRequest {
  model: string;
  prompt?: string;
  messages?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  parameters?: Record<string, unknown>;
}

export interface SupercomputerModelResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
    };
    text?: string;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SupercomputerApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface SupercomputerApiErrorResponse {
  error: SupercomputerApiError;
}

export const SupercomputerErrorCode = {
  INVALID_REQUEST: "invalid_request",
  AUTHENTICATION_FAILED: "authentication_failed",
  RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
  MODEL_NOT_FOUND: "model_not_found",
  INVALID_PARAMETER: "invalid_parameter",
  TIMEOUT: "timeout",
  NETWORK_ERROR: "network_error",
  INTERNAL_ERROR: "internal_error",
  SERVICE_UNAVAILABLE: "service_unavailable",
} as const;

export type SupercomputerErrorCode = typeof SupercomputerErrorCode[keyof typeof SupercomputerErrorCode];

export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
  window: number;
}

export interface ApiRequestLog {
  id: string;
  timestamp: number;
  method: string;
  endpoint: string;
  requestBody?: unknown;
  responseStatus?: number;
  responseTime?: number;
  error?: string;
}

export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: "string" | "number" | "boolean" | "object" | "array";
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: string[];
  validator?: (value: unknown) => boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
  }>;
}
