import type {
  SupercomputerModelRequest,
  ValidationRule,
  ValidationResult,
} from "./supercomputer-api-types";

const MODEL_REQUEST_RULES: ValidationRule[] = [
  {
    field: "model",
    required: true,
    type: "string",
    min: 1,
    max: 100,
  },
  {
    field: "temperature",
    type: "number",
    min: 0,
    max: 2,
  },
  {
    field: "max_tokens",
    type: "number",
    min: 1,
    max: 32000,
  },
  {
    field: "top_p",
    type: "number",
    min: 0,
    max: 1,
  },
  {
    field: "stream",
    type: "boolean",
  },
];

export function validateModelRequest(request: unknown): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!request || typeof request !== "object") {
    return {
      valid: false,
      errors: [{ field: "request", message: "Request must be an object" }],
    };
  }

  const req = request as Record<string, unknown>;

  const hasPrompt = typeof req.prompt === "string" && req.prompt.trim().length > 0;
  const hasMessages =
    Array.isArray(req.messages) &&
    req.messages.every(
      (msg) =>
        msg &&
        typeof msg === "object" &&
        typeof (msg as { role: unknown }).role === "string" &&
        typeof (msg as { content: unknown }).content === "string",
    );

  if (!hasPrompt && !hasMessages) {
    errors.push({
      field: "prompt/messages",
      message: "Either prompt or messages must be provided",
    });
  }

  for (const rule of MODEL_REQUEST_RULES) {
    const value = req[rule.field];

    if (rule.required && (value === undefined || value === null)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} is required`,
      });
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (rule.type) {
      let validType = false;
      switch (rule.type) {
        case "string":
          validType = typeof value === "string";
          break;
        case "number":
          validType = typeof value === "number" && !isNaN(value);
          break;
        case "boolean":
          validType = typeof value === "boolean";
          break;
        case "object":
          validType = typeof value === "object" && value !== null && !Array.isArray(value);
          break;
        case "array":
          validType = Array.isArray(value);
          break;
      }

      if (!validType) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be of type ${rule.type}`,
        });
        continue;
      }
    }

    if (rule.min !== undefined) {
      if (typeof value === "number" && value < rule.min) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min}`,
        });
      }
      if (typeof value === "string" && value.length < rule.min) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at least ${rule.min} characters`,
        });
      }
    }

    if (rule.max !== undefined) {
      if (typeof value === "number" && value > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max}`,
        });
      }
      if (typeof value === "string" && value.length > rule.max) {
        errors.push({
          field: rule.field,
          message: `${rule.field} must be at most ${rule.max} characters`,
        });
      }
    }

    if (rule.pattern && typeof value === "string" && !rule.pattern.test(value)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} has invalid format`,
      });
    }

    if (rule.enum && typeof value === "string" && !rule.enum.includes(value)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} must be one of: ${rule.enum.join(", ")}`,
      });
    }

    if (rule.validator && !rule.validator(value)) {
      errors.push({
        field: rule.field,
        message: `${rule.field} failed custom validation`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function sanitizeModelRequest(request: SupercomputerModelRequest): SupercomputerModelRequest {
  const sanitized: SupercomputerModelRequest = {
    model: request.model.trim(),
  };

  if (request.prompt !== undefined) {
    sanitized.prompt = request.prompt.trim();
  }

  if (request.messages !== undefined) {
    sanitized.messages = request.messages.map((msg) => ({
      role: msg.role,
      content: msg.content.trim(),
    }));
  }

  if (request.temperature !== undefined) {
    sanitized.temperature = Math.max(0, Math.min(2, request.temperature));
  }

  if (request.max_tokens !== undefined) {
    sanitized.max_tokens = Math.max(1, Math.min(32000, request.max_tokens));
  }

  if (request.top_p !== undefined) {
    sanitized.top_p = Math.max(0, Math.min(1, request.top_p));
  }

  if (request.stream !== undefined) {
    sanitized.stream = request.stream;
  }

  if (request.parameters !== undefined) {
    sanitized.parameters = request.parameters;
  }

  return sanitized;
}
