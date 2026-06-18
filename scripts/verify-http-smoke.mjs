#!/usr/bin/env node

const baseUrl = process.env.MIMO_BASE_URL || process.argv[2] || 'http://localhost:18081';
const timeoutMs = Number(process.env.MIMO_SMOKE_TIMEOUT_MS || 8000);
const strict = process.env.MIMO_SMOKE_STRICT === '1';

const checks = [
  {
    name: 'application health endpoint',
    method: 'GET',
    path: '/api/health',
    allowed: strict ? [200] : [200, 503],
  },
  {
    name: 'installation status endpoint',
    method: 'GET',
    path: '/api/install/status',
    allowed: strict ? [200] : [200, 204, 401, 403, 404],
  },
  {
    name: 'LinuxDo Connect redirect endpoint',
    method: 'GET',
    path: '/api/auth/linuxdo/redirect',
    allowed: strict ? [200, 302, 303, 307, 308] : [200, 302, 303, 307, 308, 404],
  },
  {
    name: 'current user endpoint requires login',
    method: 'GET',
    path: '/api/me',
    allowed: [401, 403, 302, 303, 307, 308],
    reject: [500, 502, 503, 504],
  },
  {
    name: 'ASR endpoint rejects unauthenticated request without calling upstream',
    method: 'POST',
    path: '/api/mimo/asr',
    allowed: [400, 401, 403, 404, 422],
    reject: [500, 502, 503, 504],
    body: { file_id: 'smoke-test-placeholder' },
  },
  {
    name: 'TTS endpoint rejects unauthenticated request without calling upstream',
    method: 'POST',
    path: '/api/mimo/tts',
    allowed: [400, 401, 403, 404, 422],
    reject: [500, 502, 503, 504],
    body: { text: 'smoke test', voice_id: 'placeholder' },
  },
  {
    name: 'voice design endpoint rejects unauthenticated request without calling upstream',
    method: 'POST',
    path: '/api/mimo/voice-design',
    allowed: [400, 401, 403, 404, 422],
    reject: [500, 502, 503, 504],
    body: { prompt: 'clear studio narration' },
  },
  {
    name: 'voice clone endpoint rejects unauthenticated request without calling upstream',
    method: 'POST',
    path: '/api/mimo/voice-clone',
    allowed: [400, 401, 403, 404, 422],
    reject: [500, 502, 503, 504],
    body: { sample_id: 'smoke-test-placeholder' },
  },
];

function resolveUrl(path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function request(check) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = { Accept: 'application/json' };
    const init = {
      method: check.method,
      redirect: 'manual',
      signal: controller.signal,
      headers,
    };

    if (check.body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(check.body);
    }

    const response = await fetch(resolveUrl(check.path), init);
    const text = await response.text();
    return {
      ok: true,
      status: response.status,
      location: response.headers.get('location') || '',
      preview: text.replace(/\s+/g, ' ').slice(0, 180),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

const results = [];

for (const check of checks) {
  const result = await request(check);
  if (!result.ok) {
    results.push({
      status: 'FAIL',
      name: check.name,
      path: check.path,
      detail: result.error,
    });
    continue;
  }

  const rejected = check.reject?.includes(result.status);
  const allowed = check.allowed.includes(result.status);
  results.push({
    status: allowed && !rejected ? 'PASS' : 'FAIL',
    name: check.name,
    path: check.path,
    detail: `HTTP ${result.status}${result.location ? ` -> ${result.location}` : ''}`,
    preview: result.preview,
  });
}

for (const result of results) {
  const line = [
    `[${result.status}]`,
    result.name,
    result.path,
    result.detail,
    result.preview ? `| ${result.preview}` : '',
  ].filter(Boolean).join(' ');
  console.log(line);
}

const failed = results.filter((result) => result.status === 'FAIL');
console.log(`\nSummary: ${results.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
  process.exit(1);
}
