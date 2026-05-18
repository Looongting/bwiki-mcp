import type { SmwQueryResult } from '../types.js';
import { ApiError } from '../utils/errors.js';
import { fetchWithRetry } from '../utils/network.js';
import { WikiClient } from './api-client.js';

export async function executeSmwQuery(
  client: WikiClient,
  query: string,
  format = 'table',
  limit = 50
): Promise<SmwQueryResult> {
  await client.ensureAuthenticated();

  // Use SMW's API module: ?action=ask
  const params = new URLSearchParams({
    action: 'ask',
    query: query,
    format: 'json',
    formatversion: '2',
    api_version: '3',
  });

  if (limit) params.set('limit', String(Math.min(limit, 500)));

  const resp = await fetchWithRetry(client.apiUrl, {
    body: params,
    headers: { Cookie: client.authManager.cookieHeader },
  });

  const data = await resp.json() as any;

  if (data.error) {
    // Fallback: try via parse with SMW query
    if (data.error.code === 'unknown_action' || data.error.code === 'badvalue') {
      return executeSmwQueryViaParse(client, query, format, limit);
    }
    throw new ApiError(`SMW query failed: ${data.error.info}`);
  }

  const results = data.query?.results || [];
  const errors: string[] = [];

  if (data.query?.errors) {
    for (const err of data.query.errors) {
      errors.push(typeof err === 'string' ? err : err.message || '');
    }
  }

  return {
    results: Object.values(results).map((r: any) => r.fulltext || r),
    format,
    count: Object.keys(results).length,
    errors,
    raw: JSON.stringify(data.query),
  };
}

async function executeSmwQueryViaParse(
  client: WikiClient,
  query: string,
  format: string,
  limit: number
): Promise<SmwQueryResult> {
  const wikitext = `{{#ask: ${query} |format=${format} |limit=${limit}}}`;

  const params = new URLSearchParams({
    action: 'parse',
    text: wikitext,
    contentmodel: 'wikitext',
    format: 'json',
    formatversion: '2',
    prop: 'text',
  });

  const resp = await fetchWithRetry(client.apiUrl, {
    body: params,
    headers: { Cookie: client.authManager.cookieHeader },
  });

  const data = await resp.json() as any;

  if (data.error) {
    throw new ApiError(`SMW parse fallback failed: ${data.error.info}`);
  }

  const html = data?.parse?.text || '';
  const errors: string[] = [];

  // Try to extract errors from rendered output
  const errorMatch = html.match(/<[^>]*class="[^"]*smw-error[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
  if (errorMatch) {
    for (const match of errorMatch) {
      errors.push(match.replace(/<[^>]*>/g, '').trim());
    }
  }

  return {
    results: [],
    format,
    count: 0,
    errors,
    raw: html,
  };
}
