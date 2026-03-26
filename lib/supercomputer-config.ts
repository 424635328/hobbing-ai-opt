import type { SupercomputerApiConfig } from "./supercomputer-api-types";

export function getSupercomputerApiConfig(): SupercomputerApiConfig {
  const apiKey = process.env.SUPERCOMPUTER_API_KEY;
  const apiUrl = process.env.SUPERCOMPUTER_API_URL || "https://api.supercomputer.gov.cn/v1";
  const timeout = parseInt(process.env.SUPERCOMPUTER_TIMEOUT || "30000", 10);
  const rateLimit = parseInt(process.env.SUPERCOMPUTER_RATE_LIMIT || "100", 10);
  const rateLimitWindow = parseInt(
    process.env.SUPERCOMPUTER_RATE_LIMIT_WINDOW || "60000",
    10,
  );

  if (!apiKey) {
    throw new Error("SUPERCOMPUTER_API_KEY is not configured in environment variables");
  }

  return {
    apiKey,
    apiUrl,
    timeout,
    rateLimit,
    rateLimitWindow,
  };
}

export function isSupercomputerApiConfigured(): boolean {
  try {
    getSupercomputerApiConfig();
    return true;
  } catch {
    return false;
  }
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return "****";
  }
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
}
