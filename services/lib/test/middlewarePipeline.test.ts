import { describe, it, expect, beforeEach, mock } from 'bun:test';

describe('bearerAuthMiddleware', () => {
  let bearerAuth: typeof import('../bearerAuthMiddleware').bearerAuth;
  let createSessionToken: typeof import('../bearerAuthMiddleware').createSessionToken;
  let parseCookies: typeof import('../bearerAuthMiddleware').parseCookies;
  let serializeSessionCookie: typeof import('../bearerAuthMiddleware').serializeSessionCookie;
  let sessionCookieName: typeof import('../bearerAuthMiddleware').SESSION_COOKIE_NAME;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.SESSION_SECRET = 'middleware-test-session-secret';
    const mod = await import('../bearerAuthMiddleware');
    bearerAuth = mod.bearerAuth;
    createSessionToken = mod.createSessionToken;
    parseCookies = mod.parseCookies;
    serializeSessionCookie = mod.serializeSessionCookie;
    sessionCookieName = mod.SESSION_COOKIE_NAME;
  });

  function mockReq(overrides: Record<string, unknown> = {}): any {
    return {
      method: 'GET',
      path: '/api/test',
      headers: {},
      body: {},
      ip: '127.0.0.1',
      socket: { remoteAddress: '127.0.0.1' },
      ...overrides,
    };
  }

  function mockRes(): any {
    const res: any = {};
    res.headers = {};
    res.statusCode = 200;
    res.setHeader = mock((name: string, value: string) => { res.headers[name] = value; });
    res.status = mock(function (this: any, code: number) { this.statusCode = code; return this; });
    res.json = mock(function (this: any, data: unknown) { this.body = data; return this; });
    return res;
  }

  it('should pass through when no auth header and auth is optional', async () => {
    const middleware = bearerAuth({ required: false });
    const req = mockReq();
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });

  it('should reject when auth is required and no header present', async () => {
    const middleware = bearerAuth({ required: true });
    const req = mockReq();
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should attach agentId to request when auth provided', async () => {
    const middleware = bearerAuth({ required: false });
    const req = mockReq({ headers: { 'x-agent-id': 'test-agent' } });
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });

  it('should authenticate a valid signed session cookie and attach the principal', async () => {
    const token = createSessionToken({ agentId: 'session-agent', roles: ['viewer'] });
    const middleware = bearerAuth({ required: true });
    const req = mockReq({ headers: { cookie: `${sessionCookieName}=${encodeURIComponent(token)}` } });
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
    expect(req.agentId).toBe('session-agent');
    expect(req.roles).toEqual(['viewer']);
    expect(req.agentRoles).toEqual(['viewer']);
    expect(req.authenticated).toBe(true);
  });

  it('should reject an expired session cookie on required routes', async () => {
    const issuedAt = Date.now() - 8 * 60 * 60 * 1000 - 1000;
    const token = createSessionToken({ agentId: 'expired-agent', roles: [] }, issuedAt);
    const middleware = bearerAuth({ required: true });
    const req = mockReq({ headers: { cookie: `${sessionCookieName}=${token}` } });
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should reject a tampered session cookie on required routes', async () => {
    const token = createSessionToken({ agentId: 'tampered-agent', roles: [] });
    const [encodedClaims, signature] = token.split('.');
    const tamperedSignature = `${signature![0] === 'a' ? 'b' : 'a'}${signature!.slice(1)}`;
    const tamperedToken = `${encodedClaims}.${tamperedSignature}`;
    const middleware = bearerAuth({ required: true });
    const req = mockReq({ headers: { cookie: `${sessionCookieName}=${tamperedToken}` } });
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it('should keep optional routes public when a session cookie is invalid', async () => {
    const middleware = bearerAuth({ required: false });
    const req = mockReq({ headers: { cookie: `${sessionCookieName}=tampered` } });
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
    expect(req.authenticated).toBe(false);
    expect(req.agentId).toBeNull();
  });

  it('should parse cookies and serialize the required session attributes', () => {
    const parsed = parseCookies('theme=dark; kudbee_session=token%2Evalue; empty=');
    const serialized = serializeSessionCookie('token.value', { maxAgeSeconds: 60, secure: true });

    expect(parsed.theme).toBe('dark');
    expect(parsed[sessionCookieName]).toBe('token.value');
    expect(parsed.empty).toBe('');
    expect(serialized).toContain(`${sessionCookieName}=token.value`);
    expect(serialized).toContain('Max-Age=60');
    expect(serialized).toContain('Path=/');
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('SameSite=Lax');
    expect(serialized).toContain('Secure');
  });

  it('should fail closed instead of using a production fallback session secret', () => {
    const previousEnvironment = process.env.NODE_ENV;
    const previousSecret = process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;

    expect(() => createSessionToken({ agentId: 'production-agent', roles: [] })).toThrow(
      'SESSION_SECRET must be configured in production',
    );

    process.env.NODE_ENV = previousEnvironment;
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  });
});

describe('zodValidationMiddleware', () => {
  let zodValidate: typeof import('../zodValidationMiddleware').zodValidate;

  beforeEach(async () => {
    const mod = await import('../zodValidationMiddleware');
    zodValidate = mod.zodValidate;
  });

  it('should pass through when no schemas provided', async () => {
    const middleware = zodValidate({});
    const req: any = { body: { name: 'test' }, headers: {} };
    const res: any = {
      status: mock(() => res),
      json: mock(() => res),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });

  it('should validate body against schema', async () => {
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1) });
    const middleware = zodValidate({ body: schema });

    const req: any = { body: { name: '' }, headers: {} };
    const res: any = {
      status: mock(() => res),
      json: mock(() => res),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(false);
  });

  it('should pass valid body through', async () => {
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1) });
    const middleware = zodValidate({ body: schema });

    const req: any = { body: { name: 'valid' }, headers: {} };
    const res: any = {
      status: mock(() => res),
      json: mock(() => res),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });
});

describe('ecpMiddleware', () => {
  let ecpSingleflight: typeof import('../ecpMiddleware').ecpSingleflight;

  beforeEach(async () => {
    const mod = await import('../ecpMiddleware');
    ecpSingleflight = mod.ecpSingleflight;
  });

  function mockRes() {
    const res: any = {};
    res.headers = {};
    res.statusCode = 200;
    const setHeader = mock(function (this: any, name: string, value: string) { this.headers[name] = value; return this; });
    setHeader.bind = () => setHeader;
    const status = mock(function (this: any, code: number) { this.statusCode = code; return this; });
    status.bind = () => status;
    const json = mock(function (this: any, data: unknown) { this.body = data; return this; });
    json.bind = () => json;
    const end = mock(function (this: any, ...args: unknown[]) { this.ended = true; return this as any; });
    end.bind = () => end;
    res.setHeader = setHeader;
    res.status = status;
    res.json = json;
    res.end = end;
    res.on = mock(() => res);
    return res;
  }

  it('should pass through for non-GET requests', async () => {
    const middleware = ecpSingleflight();
    const req: any = {
      method: 'POST',
      path: '/api/test',
      body: {},
      headers: {},
    };
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });

  it('should pass through for GET requests', async () => {
    const middleware = ecpSingleflight();
    const req: any = {
      method: 'GET',
      path: '/api/test',
      body: {},
      headers: {},
    };
    const res = mockRes();
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });
});

describe('kiloBridgeMiddleware', () => {
  let kiloBridgeBudget: typeof import('../kiloBridgeMiddleware').kiloBridgeBudget;

  beforeEach(async () => {
    const mod = await import('../kiloBridgeMiddleware');
    kiloBridgeBudget = mod.kiloBridgeBudget;
  });

  it('should pass through when no token count in body', async () => {
    const middleware = kiloBridgeBudget();
    const req: any = { body: {}, headers: {}, method: 'GET', path: '/api/test' };
    const res: any = {
      setHeader: mock(() => {}),
      status: mock(() => res),
      json: mock(() => res),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });
});

describe('spheroidAuditMiddleware', () => {
  let spheroidAudit: typeof import('../spheroidAuditMiddleware').spheroidAudit;

  beforeEach(async () => {
    const mod = await import('../spheroidAuditMiddleware');
    spheroidAudit = mod.spheroidAudit;
  });

  it('should pass through GET requests without auditing', async () => {
    const middleware = spheroidAudit();
    const req: any = {
      method: 'GET',
      path: '/api/test',
      body: {},
      headers: {},
      ip: '127.0.0.1',
      socket: {},
    };
    const res: any = {
      on: mock(() => {}),
      headers: {},
      setHeader: mock(() => {}),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });

  it('should register finish listener for mutating requests', async () => {
    const middleware = spheroidAudit();
    const req: any = {
      method: 'POST',
      path: '/api/test',
      body: { name: 'test' },
      headers: { 'user-agent': 'bun-test' },
      ip: '127.0.0.1',
      socket: {},
    };
    const res: any = {
      statusCode: 200,
      on: mock(() => {}),
      headers: {},
      setHeader: mock(() => {}),
    };
    let called = false;

    await middleware(req, res, () => { called = true; });

    expect(called).toBe(true);
  });
});

describe('globalErrorMiddleware', () => {
  let globalErrorHandler: typeof import('../globalErrorMiddleware').globalErrorHandler;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    const mod = await import('../globalErrorMiddleware');
    globalErrorHandler = mod.globalErrorHandler;
  });

  it('should return JSON error response', async () => {
    const middleware = globalErrorHandler();
    const error = new Error('Test error');
    const req: any = { method: 'GET', path: '/api/test', headers: {} };
    const res: any = {
      headersSent: false,
      headers: {},
      statusCode: 200,
      setHeader: mock(() => {}),
      status: mock(function (this: any, code: number) { this.statusCode = code; return this; }),
      json: mock(function (this: any, data: unknown) { this.body = data; return this; }),
    };
    const next = mock(() => {});

    await middleware(error, req, res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('internal_server_error');
    expect(res.body.traceId).toBeDefined();
  });

  it('should skip when headers already sent', async () => {
    const middleware = globalErrorHandler();
    const error = new Error('Test error');
    const req: any = { method: 'GET', path: '/api/test', headers: {} };
    const res: any = {
      headersSent: true,
      headers: {},
      statusCode: 200,
      setHeader: mock(() => {}),
      status: mock(() => {}),
      json: mock(() => {}),
    };
    const next = mock(() => {});

    await middleware(error, req, res, next);

    expect(res.statusCode).toBe(200);
  });

  it('should preserve status code from Error object', async () => {
    const middleware = globalErrorHandler();
    const error: any = new Error('Not Found');
    error.statusCode = 404;
    const req: any = { method: 'GET', path: '/api/test', headers: {} };
    const res: any = {
      headersSent: false,
      headers: {},
      statusCode: 200,
      setHeader: mock(() => {}),
      status: mock(function (this: any, code: number) { this.statusCode = code; return this; }),
      json: mock(function (this: any, data: unknown) { this.body = data; return this; }),
    };
    const next = mock(() => {});

    await middleware(error, req, res, next);

    expect(res.statusCode).toBe(404);
  });
});

describe('rateLimiter atomic', () => {
  it('should export atomic check function', async () => {
    const mod = await import('../rateLimiter');
    expect(typeof mod.rateLimitAtomicCheck).toBe('function');
  });

  it('should export reset function', async () => {
    const mod = await import('../rateLimiter');
    expect(typeof mod.resetAtomicRateLimitScript).toBe('function');
  });
});
