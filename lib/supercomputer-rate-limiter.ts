import type { RateLimitInfo } from "./supercomputer-api-types";

interface RateLimiter {
  checkLimit(): RateLimitInfo;
  consume(): boolean;
  reset(): void;
}

class SlidingWindowRateLimiter implements RateLimiter {
  private windowMs: number;
  private limit: number;
  private requests: number[] = [];

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  private cleanup(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    this.requests = this.requests.filter((timestamp) => timestamp > cutoff);
  }

  checkLimit(): RateLimitInfo {
    this.cleanup();
    const now = Date.now();
    return {
      remaining: Math.max(0, this.limit - this.requests.length),
      resetTime: now + this.windowMs,
      limit: this.limit,
      window: this.windowMs,
    };
  }

  consume(): boolean {
    this.cleanup();
    if (this.requests.length >= this.limit) {
      return false;
    }
    this.requests.push(Date.now());
    return true;
  }

  reset(): void {
    this.requests = [];
  }
}

const rateLimiters = new Map<string, RateLimiter>();

export function getRateLimiter(limit: number, windowMs: number, key = "default"): RateLimiter {
  const cacheKey = `${key}-${limit}-${windowMs}`;
  let limiter = rateLimiters.get(cacheKey);

  if (!limiter) {
    limiter = new SlidingWindowRateLimiter(limit, windowMs);
    rateLimiters.set(cacheKey, limiter);
  }

  return limiter;
}

export function canMakeRequest(limit: number, windowMs: number): boolean {
  const limiter = getRateLimiter(limit, windowMs);
  return limiter.consume();
}

export function getRateLimitInfo(limit: number, windowMs: number): RateLimitInfo {
  const limiter = getRateLimiter(limit, windowMs);
  return limiter.checkLimit();
}

export function resetRateLimiter(limit: number, windowMs: number): void {
  const limiter = getRateLimiter(limit, windowMs);
  limiter.reset();
}
