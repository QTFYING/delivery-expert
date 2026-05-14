const fs = require('node:fs');

async function apiRequest(results, name, input) {
  const headers = { 'Content-Type': 'application/json' };
  if (input.token) {
    headers.Authorization = `Bearer ${input.token}`;
  }
  if (input.cookie) {
    headers.Cookie = input.cookie;
  }

  const response = await fetch(input.url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  const cookie = mergeCookies(input.cookie, getSetCookieHeaders(response));

  if (!response.ok || !parsed || parsed.code !== 0) {
    const error = new Error(`${name} 失败: HTTP ${response.status}`);
    error.response = parsed;
    error.status = response.status;
    throw error;
  }

  results.steps.push({
    name,
    ok: true,
    status: response.status,
    request: {
      method: input.method,
      url: stripBaseUrl(input.url),
      body: input.body ?? null,
    },
    response: summarizeData(parsed.data),
  });

  return {
    status: response.status,
    data: parsed.data,
    cookie,
  };
}

async function expectHttpFailure(results, name, input, expectedStatus) {
  const headers = { 'Content-Type': 'application/json' };
  if (input.token) {
    headers.Authorization = `Bearer ${input.token}`;
  }
  if (input.cookie) {
    headers.Cookie = input.cookie;
  }

  const response = await fetch(input.url, {
    method: input.method,
    headers,
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (response.status !== expectedStatus) {
    throw new Error(`${name} 期望 HTTP ${expectedStatus}，实际 ${response.status}`);
  }

  results.steps.push({
    name,
    ok: true,
    status: response.status,
    request: {
      method: input.method,
      url: stripBaseUrl(input.url),
      body: input.body ?? null,
    },
    response: summarizeData(parsed),
  });
}

function getSetCookieHeaders(response) {
  if (typeof response.headers.getSetCookie === 'function') {
    return response.headers.getSetCookie();
  }
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

function mergeCookies(existingCookie, setCookieHeaders) {
  const jar = new Map();

  if (existingCookie) {
    for (const cookie of existingCookie.split(';')) {
      const [key, ...rest] = cookie.trim().split('=');
      if (!key || rest.length === 0) continue;
      jar.set(key, rest.join('='));
    }
  }

  for (const item of setCookieHeaders) {
    const [pair] = item.split(';');
    const [key, ...rest] = pair.split('=');
    if (!key || rest.length === 0) continue;
    jar.set(key.trim(), rest.join('=').trim());
  }

  return Array.from(jar.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

function summarizeData(data) {
  if (Array.isArray(data)) {
    return {
      type: 'array',
      length: data.length,
      firstItem: data[0] ?? null,
    };
  }
  if (data && typeof data === 'object') {
    return data;
  }
  return data;
}

function stripBaseUrl(url) {
  const match = url.match(/\/api\/.*/);
  return match ? match[0] : url;
}

function sanitizeDatabaseUrl(url) {
  return url.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@');
}

function serializeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    status: error && typeof error === 'object' ? error.status : undefined,
    response: error && typeof error === 'object' ? error.response : undefined,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFromFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    process.env[match[1].trim()] = match[2].trim().replace(/^"|"$/g, '');
  }
}

module.exports = {
  apiRequest,
  expectHttpFailure,
  sanitizeDatabaseUrl,
  serializeError,
  sleep,
  loadEnvFromFile,
};
