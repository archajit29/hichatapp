/**
 * Standard Error Code Enumeration
 */
export enum ErrorCode {
  VALIDATION_ERROR = "VALIDATION_ERROR",
  AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR",
  AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR",
  UNAUTHORIZED = "AUTHENTICATION_ERROR",
  FORBIDDEN = "AUTHORIZATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT_ERROR",
  CONFLICT_ERROR = "CONFLICT_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  CRYPTO_ERROR = "CRYPTO_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  INTERNAL_SERVER_ERROR = "INTERNAL_SERVER_ERROR",
  REFRESH_TOKEN_REUSE_DETECTED = "REFRESH_TOKEN_REUSE_DETECTED",
  CSRF_ERROR = "CSRF_ERROR",
}

/**
 * Options interface for AppError supporting optional cause and details
 */
export interface AppErrorOptions {
  cause?: unknown;
  details?: any;
}

/**
 * Base Application Error Class with Error Cause Chaining (Phase 11.1)
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: any;
  public override readonly cause?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    isOperational = true,
    optionsOrDetails?: AppErrorOptions | any
  ) {
    const isOptionsObj =
      optionsOrDetails &&
      typeof optionsOrDetails === "object" &&
      ("cause" in optionsOrDetails || "details" in optionsOrDetails);

    const cause = isOptionsObj ? optionsOrDetails.cause : undefined;
    const details = isOptionsObj ? optionsOrDetails.details : optionsOrDetails;

    // Invoke Error constructor with cause if provided
    super(message, cause !== undefined ? { cause } : undefined);

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Traverse the cause chain and return an array of all causal errors from immediate cause to root cause.
   */
  public getCauseChain(): Array<{ name: string; message: string; stack?: string }> {
    const chain: Array<{ name: string; message: string; stack?: string }> = [];
    let current: any = this.cause;
    const visited = new Set<any>();

    while (current && !visited.has(current)) {
      visited.add(current);
      if (current instanceof Error) {
        chain.push({
          name: current.name || "Error",
          message: current.message,
          stack: current.stack,
        });
        current = current.cause;
      } else {
        chain.push({
          name: "UnknownCause",
          message: typeof current === "object" ? JSON.stringify(current) : String(current),
        });
        break;
      }
    }

    return chain;
  }

  /**
   * Returns the deepest (root) cause in the error chain, or undefined if no cause exists.
   */
  public getRootCause(): unknown {
    let current: any = this;
    const visited = new Set<any>();

    while (current?.cause && !visited.has(current.cause)) {
      visited.add(current.cause);
      current = current.cause;
    }

    return current !== this ? current : undefined;
  }
}

/**
 * 400 Bad Request - Validation Error
 */
export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(
    message = "Invalid or missing input parameters",
    fieldsOrDetails?: Record<string, string> | AppErrorOptions | any
  ) {
    let fields: Record<string, string> | undefined = undefined;
    let details: any = undefined;

    if (fieldsOrDetails && typeof fieldsOrDetails === "object") {
      if ("fields" in fieldsOrDetails) {
        fields = fieldsOrDetails.fields;
        details = fieldsOrDetails;
      } else if (!("cause" in fieldsOrDetails) && !("details" in fieldsOrDetails)) {
        fields = fieldsOrDetails;
        details = { fields };
      } else {
        details = fieldsOrDetails;
        fields = fieldsOrDetails.details?.fields;
      }
    }

    super(message, 400, "VALIDATION_ERROR", true, details);
    this.fields = fields;
  }
}

/**
 * 401 Unauthorized - Authentication Error
 */
export class AuthenticationError extends AppError {
  constructor(message = "Authentication required or invalid credentials", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 401, "AUTHENTICATION_ERROR", true, optionsOrDetails);
  }
}

/**
 * 401 Unauthorized - Refresh Token Reuse / Theft Error
 */
export class RefreshTokenReuseError extends AppError {
  constructor(
    message = "Refresh token reuse detected. All active sessions have been terminated for security.",
    optionsOrDetails?: AppErrorOptions | any
  ) {
    super(message, 401, "REFRESH_TOKEN_REUSE_DETECTED", true, optionsOrDetails);
  }
}

/**
 * 403 Forbidden - Authorization Error
 */
export class AuthorizationError extends AppError {
  constructor(message = "You do not have permission to access this resource", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 403, "AUTHORIZATION_ERROR", true, optionsOrDetails);
  }
}

/**
 * 403 Forbidden - CSRF Attack Detected Error
 */
export class CsrfError extends AppError {
  constructor(message = "Invalid or missing CSRF token", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 403, ErrorCode.CSRF_ERROR, true, optionsOrDetails);
  }
}

/**
 * 404 Not Found - Resource Not Found Error
 */
export class NotFoundError extends AppError {
  constructor(message = "Requested resource not found", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 404, "NOT_FOUND", true, optionsOrDetails);
  }
}

/**
 * 409 Conflict - Resource Conflict Error (e.g. username already taken)
 */
export class ConflictError extends AppError {
  constructor(message = "Resource conflict or already exists", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 409, "CONFLICT_ERROR", true, optionsOrDetails);
  }
}

/**
 * 429 Too Many Requests - Rate Limit Error
 */
export class RateLimitError extends AppError {
  constructor(message = "Too many requests. Please try again later", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 429, "RATE_LIMIT_EXCEEDED", true, optionsOrDetails);
  }
}

/**
 * 400 Bad Request - Cryptographic Operation / Key Error
 */
export class CryptoError extends AppError {
  constructor(message = "Cryptographic operation failed or invalid key format", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 400, "CRYPTO_ERROR", true, optionsOrDetails);
  }
}

/**
 * 500 Internal Server Error - Database Query Error
 */
export class DatabaseError extends AppError {
  constructor(message = "Database operation failed", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 500, "DATABASE_ERROR", true, optionsOrDetails);
  }
}

/**
 * 500 Internal Server Error - Generic / Unhandled System Error
 */
export class InternalServerError extends AppError {
  constructor(message = "An unexpected internal server error occurred", optionsOrDetails?: AppErrorOptions | any) {
    super(message, 500, "INTERNAL_SERVER_ERROR", false, optionsOrDetails);
  }
}
