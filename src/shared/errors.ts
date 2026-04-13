/**
 * Unified error hierarchy for OpenTerm.
 *
 * All custom errors extend AppError, which ensures `instanceof` works
 * correctly across bundler boundaries via Object.setPrototypeOf.
 */

export class AppError extends Error {
  readonly code: string

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, { cause: options?.cause } as ErrorOptions)
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = this.constructor.name
    this.code = code
  }
}

export class ConnectionError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'CONNECTION_ERROR', options)
  }
}

export class SSHError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'SSH_ERROR', options)
  }
}

export class AgentError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'AGENT_ERROR', options)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, 'DATABASE_ERROR', options)
  }
}

/**
 * Type guard: checks if an unknown value is an AppError (or subclass).
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

/**
 * Safely extract an error message from an unknown thrown value.
 *
 * Handles: Error instances, strings, objects with message property,
 * and fallback to generic message.
 */
export function getErrorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error != null && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'An unexpected error occurred'
}
