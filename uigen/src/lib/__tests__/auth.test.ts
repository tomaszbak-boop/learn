// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

// Mock server-only so the module can be imported in tests
vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

async function makeValidToken(payload: object, expiresIn = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// --- createSession ---

test("createSession sets an httpOnly cookie with the JWT", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledOnce();
  const [name, _token, options] = mockCookieStore.set.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(typeof _token).toBe("string");
  expect(_token.split(".")).toHaveLength(3); // valid JWT format
  expect(options.httpOnly).toBe(true);
  expect(options.sameSite).toBe("lax");
  expect(options.path).toBe("/");
});

test("createSession cookie expires in ~7 days", async () => {
  const { createSession } = await import("@/lib/auth");
  const before = Date.now();

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieStore.set.mock.calls[0];
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const diff = (options.expires as Date).getTime() - before;
  expect(diff).toBeGreaterThan(sevenDaysMs - 1000);
  expect(diff).toBeLessThan(sevenDaysMs + 1000);
});

// --- getSession ---

test("getSession returns null when no cookie is present", async () => {
  const { getSession } = await import("@/lib/auth");
  mockCookieStore.get.mockReturnValue(undefined);

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null for an invalid token", async () => {
  const { getSession } = await import("@/lib/auth");
  mockCookieStore.get.mockReturnValue({ value: "not.a.valid.jwt" });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null for an expired token", async () => {
  const { getSession } = await import("@/lib/auth");
  const expiredToken = await makeValidToken(
    { userId: "u1", email: "a@b.com" },
    "-1s"
  );
  mockCookieStore.get.mockReturnValue({ value: expiredToken });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns the session payload for a valid token", async () => {
  const { getSession } = await import("@/lib/auth");
  const token = await makeValidToken({ userId: "user-123", email: "test@example.com" });
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-123");
  expect(session?.email).toBe("test@example.com");
});

// --- deleteSession ---

test("deleteSession removes the auth-token cookie", async () => {
  const { deleteSession } = await import("@/lib/auth");

  await deleteSession();

  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

// --- verifySession ---

function makeRequest(token?: string) {
  const url = "http://localhost/api/test";
  const headers: Record<string, string> = {};
  if (token) {
    headers["cookie"] = `auth-token=${token}`;
  }
  return new NextRequest(url, { headers });
}

test("verifySession returns null when request has no cookie", async () => {
  const { verifySession } = await import("@/lib/auth");

  const result = await verifySession(makeRequest());

  expect(result).toBeNull();
});

test("verifySession returns null for an invalid token in request", async () => {
  const { verifySession } = await import("@/lib/auth");

  const result = await verifySession(makeRequest("bad.token.value"));

  expect(result).toBeNull();
});

test("verifySession returns null for an expired token in request", async () => {
  const { verifySession } = await import("@/lib/auth");
  const expiredToken = await makeValidToken({ userId: "u1", email: "a@b.com" }, "-1s");

  const result = await verifySession(makeRequest(expiredToken));

  expect(result).toBeNull();
});

test("verifySession returns session payload for a valid token in request", async () => {
  const { verifySession } = await import("@/lib/auth");
  const token = await makeValidToken({ userId: "user-456", email: "hello@example.com" });

  const result = await verifySession(makeRequest(token));

  expect(result).not.toBeNull();
  expect(result?.userId).toBe("user-456");
  expect(result?.email).toBe("hello@example.com");
});

test("createSession sets secure: false outside production", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieStore.set.mock.calls[0];
  expect(options.secure).toBe(false); // NODE_ENV is "test" in vitest
});

test("createSession JWT encodes userId and email", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, token] = mockCookieStore.set.mock.calls[0];
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  expect(payload.userId).toBe("user-123");
  expect(payload.email).toBe("test@example.com");
});

test("getSession reads the auth-token cookie by name", async () => {
  const { getSession } = await import("@/lib/auth");
  mockCookieStore.get.mockReturnValue(undefined);

  await getSession();

  expect(mockCookieStore.get).toHaveBeenCalledWith("auth-token");
});

// --- getSession: additional coverage ---

test("getSession returns null for a token signed with the wrong secret", async () => {
  const { getSession } = await import("@/lib/auth");
  const wrongSecret = new TextEncoder().encode("wrong-secret");
  const tamperedToken = await new SignJWT({ userId: "u1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(wrongSecret);
  mockCookieStore.get.mockReturnValue({ value: tamperedToken });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null when cookie value is an empty string", async () => {
  const { getSession } = await import("@/lib/auth");
  mockCookieStore.get.mockReturnValue({ value: "" });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession returns null for a token with nbf in the future", async () => {
  const { getSession } = await import("@/lib/auth");
  const futureNbf = Math.floor(Date.now() / 1000) + 3600; // valid in 1 hour
  const token = await new SignJWT({ userId: "u1", email: "a@b.com" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setNotBefore(futureNbf)
    .setIssuedAt()
    .sign(JWT_SECRET);
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session).toBeNull();
});

test("getSession calls cookies() exactly once", async () => {
  const { cookies } = await import("next/headers");
  const { getSession } = await import("@/lib/auth");
  mockCookieStore.get.mockReturnValue(undefined);

  await getSession();

  expect(cookies).toHaveBeenCalledOnce();
});

test("getSession returns userId and email from the token payload", async () => {
  const { getSession } = await import("@/lib/auth");
  const token = await makeValidToken({ userId: "user-789", email: "name@example.com" });
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();

  expect(session?.userId).toBe("user-789");
  expect(session?.email).toBe("name@example.com");
});

test("getSession payload preserves extra claims stored in the token", async () => {
  const { getSession } = await import("@/lib/auth");
  const token = await makeValidToken({
    userId: "u1",
    email: "a@b.com",
    expiresAt: new Date("2099-01-01").toISOString(),
  });
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = (await getSession()) as any;

  expect(session?.expiresAt).toBe(new Date("2099-01-01").toISOString());
});

// --- createSession: additional coverage ---

test("createSession JWT uses HS256 algorithm", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, token] = mockCookieStore.set.mock.calls[0];
  // Header is the first base64url segment
  const header = JSON.parse(
    Buffer.from(token.split(".")[0], "base64url").toString()
  );
  expect(header.alg).toBe("HS256");
});

test("createSession JWT contains iat and exp claims", async () => {
  const { createSession } = await import("@/lib/auth");
  const before = Math.floor(Date.now() / 1000);

  await createSession("user-123", "test@example.com");

  const [, token] = mockCookieStore.set.mock.calls[0];
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, JWT_SECRET);

  const after = Math.floor(Date.now() / 1000);
  expect(payload.iat).toBeGreaterThanOrEqual(before);
  expect(payload.iat).toBeLessThanOrEqual(after);
  expect(payload.exp).toBeGreaterThan(before + 7 * 24 * 60 * 60 - 5);
  expect(payload.exp).toBeLessThan(after + 7 * 24 * 60 * 60 + 5);
});

test("createSession JWT exp matches cookie expires", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, token, options] = mockCookieStore.set.mock.calls[0];
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, JWT_SECRET);

  const cookieExpiresSeconds = Math.round(
    (options.expires as Date).getTime() / 1000
  );
  // Allow 2-second tolerance for execution time
  expect(Math.abs((payload.exp as number) - cookieExpiresSeconds)).toBeLessThan(2);
});

test("createSession sets cookie path to /", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieStore.set.mock.calls[0];
  expect(options.path).toBe("/");
});

test("createSession sets sameSite to lax", async () => {
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  const [, , options] = mockCookieStore.set.mock.calls[0];
  expect(options.sameSite).toBe("lax");
});

test("createSession encodes special characters in email", async () => {
  const { createSession } = await import("@/lib/auth");
  const email = "user+tag@sub.example.co.uk";

  await createSession("user-abc", email);

  const [, token] = mockCookieStore.set.mock.calls[0];
  const { jwtVerify } = await import("jose");
  const { payload } = await jwtVerify(token, JWT_SECRET);
  expect(payload.email).toBe(email);
});

test("createSession produces a different token when time advances", async () => {
  const { createSession } = await import("@/lib/auth");
  vi.useFakeTimers();

  await createSession("user-123", "test@example.com");
  const [, token1] = mockCookieStore.set.mock.calls[0];

  vi.advanceTimersByTime(1000); // move clock forward 1 s so iat differs
  vi.clearAllMocks();
  await createSession("user-123", "test@example.com");
  const [, token2] = mockCookieStore.set.mock.calls[0];

  expect(token1).not.toBe(token2);
  vi.useRealTimers();
});

test("createSession calls cookies() to get the store", async () => {
  const { cookies } = await import("next/headers");
  const { createSession } = await import("@/lib/auth");

  await createSession("user-123", "test@example.com");

  expect(cookies).toHaveBeenCalledOnce();
});
