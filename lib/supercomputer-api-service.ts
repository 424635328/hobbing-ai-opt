import { getSupercomputerApiConfig, maskApiKey } from "./supercomputer-config";
import { validateModelRequest, sanitizeModelRequest } from "./supercomputer-validator";
import { canMakeRequest, getRateLimitInfo } from "./supercomputer-rate-limiter";
import logger from "./supercomputer-logger";
import type {
  SupercomputerModelRequest,
  SupercomputerModelResponse,
  SupercomputerApiErrorResponse,
} from "./supercomputer-api-types";

class SupercomputerApiService {
  private createErrorResponse(
    code: string,
    message: string,
    details?: unknown,
  ): SupercomputerApiErrorResponse {
    return {
      error: {
        code,
        message,
        details,
      },
    };
  }

  async callModelApi(
    request: SupercomputerModelRequest,
  ): Promise<{
    success: boolean;
    data?: SupercomputerModelResponse;
    error?: SupercomputerApiErrorResponse;
    status: number;
  }> {
    const startTime = Date.now();
    let responseStatus = 200;

    try {
      const config = getSupercomputerApiConfig();
      logger.info("Initializing API call", {
        apiUrl: config.apiUrl,
        apiKey: maskApiKey(config.apiKey),
        timeout: config.timeout,
      });

      const validation = validateModelRequest(request);
      if (!validation.valid) {
        logger.warn("Request validation failed", validation.errors);
        return {
          success: false,
          error: this.createErrorResponse(
            "invalid_request",
            "Invalid request parameters",
            validation.errors,
          ),
          status: 400,
        };
      }

      const sanitizedRequest = sanitizeModelRequest(request);
      logger.debug("Request sanitized", sanitizedRequest);

      if (!canMakeRequest(config.rateLimit, config.rateLimitWindow)) {
        const rateInfo = getRateLimitInfo(config.rateLimit, config.rateLimitWindow);
        logger.warn("Rate limit exceeded", rateInfo);
        return {
          success: false,
          error: this.createErrorResponse(
            "rate_limit_exceeded",
            `Rate limit exceeded. ${rateInfo.remaining} requests remaining. Reset at ${new Date(rateInfo.resetTime).toISOString()}`,
            rateInfo,
          ),
          status: 429,
        };
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      try {
        logger.info("Sending request to supercomputer API", {
          model: sanitizedRequest.model,
          endpoint: "/chat/completions",
        });

        const response = await fetch(`${config.apiUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify(sanitizedRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        responseStatus = response.status;

        const responseTime = Date.now() - startTime;
        logger.info("Received response", {
          status: response.status,
          responseTime,
        });

        const responseData = await response.json();

        if (!response.ok) {
          logger.error("API returned error", {
            status: response.status,
            data: responseData,
          });

          let errorCode = "internal_error";
          if (response.status === 401) {
            errorCode = "authentication_failed";
          } else if (response.status === 404) {
            errorCode = "model_not_found";
          } else if (response.status === 429) {
            errorCode = "rate_limit_exceeded";
          } else if (response.status === 503) {
            errorCode = "service_unavailable";
          }

          return {
            success: false,
            error: {
              error: {
                code: errorCode,
                message: responseData?.error?.message || `API request failed with status ${response.status}`,
                details: responseData,
              },
            },
            status: response.status,
          };
        }

        logger.logRequest({
          method: "POST",
          endpoint: "/chat/completions",
          requestBody: sanitizedRequest,
          responseStatus: response.status,
          responseTime,
        });

        return {
          success: true,
          data: responseData as SupercomputerModelResponse,
          status: response.status,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error instanceof Error && error.name === "AbortError") {
        logger.error("Request timeout", error);
        logger.logRequest({
          method: "POST",
          endpoint: "/chat/completions",
          requestBody: request,
          responseStatus: 408,
          responseTime,
          error: "Request timeout",
        });
        return {
          success: false,
          error: this.createErrorResponse(
            "timeout",
            "Request timeout - the supercomputer API took too long to respond",
          ),
          status: 408,
        };
      }

      logger.error("Network error", error);
      logger.logRequest({
        method: "POST",
        endpoint: "/chat/completions",
        requestBody: request,
        responseStatus: 503,
        responseTime,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        error: this.createErrorResponse(
          "network_error",
          "Network error - failed to connect to supercomputer API",
          error instanceof Error ? error.message : error,
        ),
        status: 503,
      };
    }
  }

  async checkHealth(): Promise<{
    healthy: boolean;
    message: string;
    latency?: number;
  }> {
    const startTime = Date.now();

    try {
      const config = getSupercomputerApiConfig();
      logger.info("Checking API health", { apiUrl: config.apiUrl });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${config.apiUrl}/models`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (response.ok) {
        logger.info("API health check passed", { latency });
        return {
          healthy: true,
          message: "Supercomputer API is healthy",
          latency,
        };
      }

      logger.warn("API health check failed", { status: response.status });
      return {
        healthy: false,
        message: `API returned status ${response.status}`,
        latency,
      };
    } catch (error) {
      logger.error("API health check error", error);
      return {
        healthy: false,
        message: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }
}

const service = new SupercomputerApiService();

export default service;
