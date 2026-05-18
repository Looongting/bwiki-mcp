import { describe, it, expect } from 'vitest';
import {
  MediaWikiError,
  AuthError,
  ApiError,
  ConfigError,
  BrowserError,
} from '../src/utils/errors.js';

describe('错误类', () => {
  it('MediaWikiError 应有正确的名称', () => {
    const err = new MediaWikiError('test', 'code123');
    expect(err.name).toBe('MediaWikiError');
    expect(err.message).toBe('test');
    expect(err.code).toBe('code123');
  });

  it('AuthError 应继承 MediaWikiError', () => {
    const err = new AuthError('auth failed');
    expect(err).toBeInstanceOf(MediaWikiError);
    expect(err.name).toBe('AuthError');
    expect(err.code).toBe('auth_error');
  });

  it('ApiError 应继承 MediaWikiError', () => {
    const err = new ApiError('api failed', 500);
    expect(err).toBeInstanceOf(MediaWikiError);
    expect(err.name).toBe('ApiError');
    expect(err.code).toBe('api_error');
    expect(err.statusCode).toBe(500);
  });

  it('ConfigError 应为普通 Error', () => {
    const err = new ConfigError('bad config');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ConfigError');
    expect(err.message).toBe('bad config');
  });

  it('BrowserError 应有 url 属性', () => {
    const err = new BrowserError('browser crashed', 'https://example.com');
    expect(err.name).toBe('BrowserError');
    expect(err.url).toBe('https://example.com');
  });

  it('BrowserError 不带 url 也应正常', () => {
    const err = new BrowserError('generic browser error');
    expect(err.url).toBeUndefined();
  });
});
