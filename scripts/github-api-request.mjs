const DEFAULT_CONFIG = {
  maxAttempts: 3,
  timeoutMs: 10000,
  backoffMs: [250, 1000],
  maxDelayMs: 5000
};

function getHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name) || headers.get(name.toLowerCase());
  // plain object
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

function isRetryableStatus(status, headers) {
  if (status === 408 || status === 429) return true;
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  if (status === 403) {
    const remaining = getHeader(headers, "x-ratelimit-remaining");
    if (remaining === "0" || remaining === 0) return true;
    return false;
  }
  return false;
}

function isNonRetryableStatus(status) {
  if (status === 401 || status === 404 || status === 422) return true;
  if (status >= 400 && status < 500) {
    if (status === 408 || status === 429 || status === 403) return false;
    return true;
  }
  return false;
}

function parseRetryAfter(value, nowMs) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && String(seconds) === trimmed) {
    if (seconds < 0) return null;
    return seconds * 1000;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delay = dateMs - nowMs;
    if (delay < 0) return null;
    return delay;
  }
  return null;
}

function parseRateLimitReset(value, nowMs) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "") return null;
  const seconds = Number(trimmed);
  if (Number.isNaN(seconds)) return null;
  const resetMs = seconds * 1000;
  const delay = resetMs - nowMs;
  if (delay < 0) return null;
  return delay;
}

function getDelay(attemptIndex, response, nowMs, config) {
  const headers = response?.headers;
  let delay = null;
  if (headers) {
    const retryAfter = getHeader(headers, "retry-after");
    delay = parseRetryAfter(retryAfter, nowMs);
    if (delay === null) {
      const reset = getHeader(headers, "x-ratelimit-reset");
      delay = parseRateLimitReset(reset, nowMs);
    }
  }
  if (delay === null) {
    delay = config.backoffMs[attemptIndex] ?? config.backoffMs[config.backoffMs.length - 1] ?? 250;
  }
  if (delay > config.maxDelayMs) delay = config.maxDelayMs;
  if (delay < 0) delay = 0;
  return delay;
}

function classifyFinalError(lastError, lastResponse) {
  if (lastError) {
    if (lastError.name === "AbortError") return "timeout";
    return "network";
  }
  if (lastResponse) {
    const status = lastResponse.status;
    const remaining = getHeader(lastResponse.headers, "x-ratelimit-remaining");
    if (status === 429 || (status === 403 && (remaining === "0" || remaining === 0))) return "rate-limit";
    if (status === 408 || status === 500 || status === 502 || status === 503 || status === 504) return "transient";
    if (status >= 400 && status < 500) return "http";
    return "http";
  }
  return "network";
}

export async function withRetry(operation, deps = {}) {
  const sleepImpl = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowImpl = deps.now || (() => Date.now());
  const config = { ...DEFAULT_CONFIG, ...(deps.config || {}) };
  if (deps.backoffMs !== undefined) config.backoffMs = deps.backoffMs;
  if (deps.maxDelayMs !== undefined) config.maxDelayMs = deps.maxDelayMs;
  if (deps.timeoutMs !== undefined) config.timeoutMs = deps.timeoutMs;
  if (deps.maxAttempts !== undefined) config.maxAttempts = deps.maxAttempts;

  let lastResult = null;
  let lastError = null;
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      const result = await operation();
      lastResult = result;
      lastError = null;
      if (result.ok) return result;
      const status = result.status;
      const headers = result.headers;
      if (isRetryableStatus(status, headers)) {
        if (attempt < config.maxAttempts - 1) {
          const delay = getDelay(attempt, result, nowImpl(), config);
          await sleepImpl(delay);
          continue;
        }
        break;
      }
      if (isNonRetryableStatus(status)) return result;
      return result;
    } catch (error) {
      lastError = error;
      lastResult = null;
      if (attempt < config.maxAttempts - 1) {
        const delay = getDelay(attempt, null, nowImpl(), config);
        await sleepImpl(delay);
        continue;
      }
      break;
    }
  }
  const errorType = classifyFinalError(lastError, lastResult);
  if (lastResult) {
    return { ok: false, status: lastResult.status, headers: lastResult.headers, data: null, errorType };
  }
  return { ok: false, status: 0, headers: { get: () => null, has: () => false }, data: { message: lastError ? String(lastError.message || lastError) : "Error de red" }, errorType };
}

export async function resilientFetch(url, options = {}, deps = {}) {
  const fetchImpl = deps.fetch || globalThis.fetch;
  const sleepImpl = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const nowImpl = deps.now || (() => Date.now());
  const config = { ...DEFAULT_CONFIG, ...(deps.config || {}) };
  if (deps.backoffMs !== undefined) config.backoffMs = deps.backoffMs;
  if (deps.maxDelayMs !== undefined) config.maxDelayMs = deps.maxDelayMs;
  if (deps.timeoutMs !== undefined) config.timeoutMs = deps.timeoutMs;
  if (deps.maxAttempts !== undefined) config.maxAttempts = deps.maxAttempts;

  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    let response;
    try {
      const fetchOptions = { ...options, signal: controller.signal };
      response = await fetchImpl(url, fetchOptions);
      clearTimeout(timeoutId);
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      lastResponse = null;
      if (attempt < config.maxAttempts - 1) {
        const delay = getDelay(attempt, null, nowImpl(), config);
        await sleepImpl(delay);
        continue;
      }
      break;
    }

    lastResponse = response;
    lastError = null;

    if (response.ok) {
      return response;
    }

    const status = response.status;
    if (isRetryableStatus(status, response.headers)) {
      if (attempt < config.maxAttempts - 1) {
        const delay = getDelay(attempt, response, nowImpl(), config);
        await sleepImpl(delay);
        continue;
      }
      break;
    }

    if (isNonRetryableStatus(status)) {
      return response;
    }

    return response;
  }

  const errorType = classifyFinalError(lastError, lastResponse);
  if (lastResponse) {
    const sanitized = {
      ok: false,
      status: lastResponse.status,
      headers: {
        get: (name) => (lastResponse.headers?.get ? lastResponse.headers.get(name) : null),
        has: (name) => (lastResponse.headers?.has ? lastResponse.headers.has(name) : false)
      },
      json: async () => null,
      text: async () => "",
      arrayBuffer: async () => Buffer.alloc(0),
      errorType
    };
    return sanitized;
  } else {
    return {
      ok: false,
      status: 0,
      headers: { get: () => null, has: () => false },
      json: async () => null,
      text: async () => "",
      arrayBuffer: async () => Buffer.alloc(0),
      errorType,
      error: lastError
    };
  }
}
