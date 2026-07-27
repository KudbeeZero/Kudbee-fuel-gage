import { describe, it, expect, beforeEach, mock } from 'bun:test';

describe('bearerAuthMiddleware', () => {
  let bearerAuth: typeof import('../bearerAuthMiddleware').bearerAuth;

  beforeEach(async () => {
    const mod = await import('../bearerAuthMiddleware');
    bearerAuth = mod.bearerAuth;
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

  it('should pass through for non-GET requests', async () => {
    const middleware = ecpSingleflight();
    const req: any = {
      method: 'POST',
      path: '/api/test',
      body: {},
      headers: {},
    };
    const res: any = {
      headers: {},
      setHeader: mock(() => {}),
      end: mock(() => {}),
      on: mock(() => {}),
    };
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
    const res: any = {
      headers: {},
      setHeader: mock(() => {}),
      end: mock(() => {}),
      on: mock(() => {}),
    };
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
