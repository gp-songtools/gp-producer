export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly kind: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The model returned something unusable (truncated, no tool call, malformed JSON, schema mismatch). */
export class BlueprintError extends Error {
  constructor(
    message: string,
    readonly problems: string[] = [],
  ) {
    super(message);
    this.name = 'BlueprintError';
  }
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Turns an Anthropic error response into something a person can act on. */
export function friendlyAnthropicError(status: number, type: string, message: string, model: string): string {
  switch (status) {
    case 401:
      return 'Anthropic rejected the API key. Check it in Settings.';
    case 403:
      return `Anthropic denied access: ${message}`;
    case 404:
      return `Anthropic doesn't know the model "${model}". Pick another in Settings.`;
    case 413:
      return 'The request was too large for Anthropic. Try trimming the lyrics or audio brief.';
    case 429:
      return 'Anthropic is rate limiting this key. Wait a moment and try again.';
    case 529:
      return 'Anthropic is overloaded right now. Try again shortly.';
    default:
      return status >= 500 ? `Anthropic had a server error (${status}). Try again shortly.` : `Anthropic error (${type}): ${message}`;
  }
}

export const NETWORK_MESSAGE =
  "Couldn't reach Anthropic. Check your connection, and that an ad blocker or network policy isn't blocking api.anthropic.com.";
