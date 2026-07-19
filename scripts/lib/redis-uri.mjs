export function buildRedisUri(config) {
  const {
    url,
    host = '127.0.0.1',
    port = 6379,
    password,
    token,
    db = 0,
    tls = false
  } = config;

  if (url && url.trim().length > 0) {
    try {
      const parsed = new URL(url);
      if (token && token.trim().length > 0 && !parsed.password) {
        parsed.password = token;
      }
      if (password && password.trim().length > 0 && !parsed.password) {
        parsed.password = password;
      }
      if (parsed.pathname === '/' || !parsed.pathname) {
        parsed.pathname = `/${db}`;
      }
      return parsed.toString();
    } catch {
      // Fall through to manual construction
    }
  }

  const auth = token || password;
  const protocol = tls ? 'rediss' : 'redis';
  const hostPart = host || '127.0.0.1';
  const portPart = port || 6379;

  if (auth) {
    return `${protocol}://:${encodeURIComponent(auth)}@${hostPart}:${portPart}/${db}`;
  }
  return `${protocol}://${hostPart}:${portPart}/${db}`;
}

export function getRedisConfigFromEnv() {
  return {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD,
    token: process.env.REDIS_TOKEN,
    db: process.env.REDIS_DB,
    tls: process.env.REDIS_TLS === 'true' || process.env.REDIS_TLS === '1'
  };
}
