import type { ApiRequestLog } from "./supercomputer-api-types";

interface LogEntry {
  id: string;
  timestamp: number;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  data?: unknown;
}

class SupercomputerLogger {
  private logs: LogEntry[] = [];
  private requestLogs: ApiRequestLog[] = [];
  private maxLogs: number = 1000;
  private maxRequestLogs: number = 500;

  private log(level: LogEntry["level"], message: string, data?: unknown): void {
    const entry: LogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      level,
      message,
      data,
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (process.env.NODE_ENV !== "production") {
      const prefix = `[Supercomputer API] [${level.toUpperCase()}]`;
      if (data) {
        console.log(prefix, message, data);
      } else {
        console.log(prefix, message);
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  debug(message: string, data?: unknown): void {
    this.log("debug", message, data);
  }

  info(message: string, data?: unknown): void {
    this.log("info", message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log("warn", message, data);
  }

  error(message: string, data?: unknown): void {
    this.log("error", message, data);
  }

  logRequest(requestLog: Omit<ApiRequestLog, "id" | "timestamp">): void {
    const entry: ApiRequestLog = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...requestLog,
    };

    this.requestLogs.push(entry);

    if (this.requestLogs.length > this.maxRequestLogs) {
      this.requestLogs.shift();
    }

    this.info(`API Request: ${requestLog.method} ${requestLog.endpoint}`, {
      status: requestLog.responseStatus,
      duration: requestLog.responseTime,
      error: requestLog.error,
    });
  }

  getLogs(level?: LogEntry["level"]): LogEntry[] {
    if (level) {
      return this.logs.filter((log) => log.level === level);
    }
    return [...this.logs];
  }

  getRequestLogs(): ApiRequestLog[] {
    return [...this.requestLogs];
  }

  clearLogs(): void {
    this.logs = [];
    this.requestLogs = [];
    this.info("Logs cleared");
  }

  getStats(): {
    totalLogs: number;
    totalRequests: number;
    errorCount: number;
    successCount: number;
  } {
    const errorCount = this.requestLogs.filter((log) => log.error || (log.responseStatus && log.responseStatus >= 400)).length;
    const successCount = this.requestLogs.filter((log) => !log.error && log.responseStatus && log.responseStatus < 400).length;

    return {
      totalLogs: this.logs.length,
      totalRequests: this.requestLogs.length,
      errorCount,
      successCount,
    };
  }
}

const logger = new SupercomputerLogger();

export default logger;
