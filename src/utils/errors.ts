export class MediaWikiError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'MediaWikiError';
  }
}

export class AuthError extends MediaWikiError {
  constructor(message: string) {
    super(message, 'auth_error');
    this.name = 'AuthError';
  }
}

export class ApiError extends MediaWikiError {
  constructor(message: string, public readonly statusCode?: number) {
    super(message, 'api_error');
    this.name = 'ApiError';
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class BrowserError extends Error {
  constructor(message: string, public readonly url?: string) {
    super(message);
    this.name = 'BrowserError';
  }
}
