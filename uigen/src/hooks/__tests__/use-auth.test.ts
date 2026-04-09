import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// --- Mocks ---

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
vi.mock("@/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  signUp: (...args: unknown[]) => mockSignUp(...args),
}));

const mockGetAnonWorkData = vi.fn();
const mockClearAnonWork = vi.fn();
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: () => mockGetAnonWorkData(),
  clearAnonWork: () => mockClearAnonWork(),
}));

const mockGetProjects = vi.fn();
vi.mock("@/actions/get-projects", () => ({
  getProjects: () => mockGetProjects(),
}));

const mockCreateProject = vi.fn();
vi.mock("@/actions/create-project", () => ({
  createProject: (...args: unknown[]) => mockCreateProject(...args),
}));

// --- Helpers ---

function renderAuth() {
  return renderHook(() => useAuth());
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no anon work, no existing projects
  mockGetAnonWorkData.mockReturnValue(null);
  mockGetProjects.mockResolvedValue([]);
  mockCreateProject.mockResolvedValue({ id: "new-project-id" });
});

// ─── signIn ───────────────────────────────────────────────────────────────────

describe("signIn", () => {
  test("calls signIn action with provided credentials", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "password123");
  });

  test("returns the result from the signIn action", async () => {
    const actionResult = { success: false, error: "Invalid credentials" };
    mockSignIn.mockResolvedValue(actionResult);

    const { result } = renderAuth();
    const returned = await act(() =>
      result.current.signIn("user@example.com", "bad-password")
    );

    expect(returned).toEqual(actionResult);
  });

  test("sets isLoading to true during the request and false after", async () => {
    let resolveSignIn!: (v: unknown) => void;
    mockSignIn.mockReturnValue(new Promise((r) => (resolveSignIn = r)));

    const { result } = renderAuth();

    act(() => {
      result.current.signIn("user@example.com", "password123");
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => resolveSignIn({ success: false }));
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signIn action throws", async () => {
    mockSignIn.mockRejectedValue(new Error("Network error"));

    const { result } = renderAuth();
    await act(() =>
      result.current.signIn("user@example.com", "password").catch(() => {})
    );

    expect(result.current.isLoading).toBe(false);
  });

  test("does not redirect when signIn fails", async () => {
    mockSignIn.mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "wrong"));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ─── signUp ───────────────────────────────────────────────────────────────────

describe("signUp", () => {
  test("calls signUp action with provided credentials", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderAuth();
    await act(() => result.current.signUp("new@example.com", "password123"));

    expect(mockSignUp).toHaveBeenCalledWith("new@example.com", "password123");
  });

  test("returns the result from the signUp action", async () => {
    const actionResult = { success: false, error: "Email already registered" };
    mockSignUp.mockResolvedValue(actionResult);

    const { result } = renderAuth();
    const returned = await act(() =>
      result.current.signUp("new@example.com", "password123")
    );

    expect(returned).toEqual(actionResult);
  });

  test("sets isLoading to true during the request and false after", async () => {
    let resolveSignUp!: (v: unknown) => void;
    mockSignUp.mockReturnValue(new Promise((r) => (resolveSignUp = r)));

    const { result } = renderAuth();

    act(() => {
      result.current.signUp("new@example.com", "password123");
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => resolveSignUp({ success: false }));
    expect(result.current.isLoading).toBe(false);
  });

  test("resets isLoading to false even when signUp action throws", async () => {
    mockSignUp.mockRejectedValue(new Error("Network error"));

    const { result } = renderAuth();
    await act(() =>
      result.current.signUp("new@example.com", "password123").catch(() => {})
    );

    expect(result.current.isLoading).toBe(false);
  });

  test("does not redirect when signUp fails", async () => {
    mockSignUp.mockResolvedValue({ success: false, error: "Email already registered" });

    const { result } = renderAuth();
    await act(() => result.current.signUp("new@example.com", "password123"));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

// ─── post sign-in: anon work transfer ─────────────────────────────────────────

describe("post sign-in flow: anonymous work", () => {
  test("creates a project from anon work and redirects to it on signIn success", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: { "/index.tsx": { type: "file", content: "code" } },
    });
    mockCreateProject.mockResolvedValue({ id: "anon-project-id" });

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hello" }],
        data: { "/index.tsx": { type: "file", content: "code" } },
      })
    );
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
  });

  test("creates a project from anon work and redirects to it on signUp success", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: {},
    });
    mockCreateProject.mockResolvedValue({ id: "anon-project-id" });

    const { result } = renderAuth();
    await act(() => result.current.signUp("new@example.com", "password123"));

    expect(mockCreateProject).toHaveBeenCalled();
    expect(mockClearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-project-id");
  });

  test("skips anon work transfer when messages array is empty", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
    mockGetProjects.mockResolvedValue([{ id: "existing-project" }]);

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-project");
  });

  test("skips anon work transfer when getAnonWorkData returns null", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue(null);
    mockGetProjects.mockResolvedValue([{ id: "existing-project" }]);

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockClearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-project");
  });

  test("does not call getProjects when anon work is transferred", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetAnonWorkData.mockReturnValue({
      messages: [{ role: "user", content: "hello" }],
      fileSystemData: {},
    });
    mockCreateProject.mockResolvedValue({ id: "anon-project-id" });

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockGetProjects).not.toHaveBeenCalled();
  });
});

// ─── post sign-in: existing projects ─────────────────────────────────────────

describe("post sign-in flow: existing projects", () => {
  test("redirects to most recent project when user has existing projects", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([
      { id: "recent-project" },
      { id: "older-project" },
    ]);

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockPush).toHaveBeenCalledWith("/recent-project");
  });

  test("uses the first project in the returned list (most recent)", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([{ id: "project-a" }, { id: "project-b" }]);

    const { result } = renderAuth();
    await act(() => result.current.signUp("user@example.com", "password123"));

    expect(mockPush).toHaveBeenCalledWith("/project-a");
    expect(mockPush).not.toHaveBeenCalledWith("/project-b");
  });
});

// ─── post sign-in: new project creation ───────────────────────────────────────

describe("post sign-in flow: new project creation", () => {
  test("creates a new project when no existing projects exist", async () => {
    mockSignIn.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "brand-new-project" });

    const { result } = renderAuth();
    await act(() => result.current.signIn("user@example.com", "password123"));

    expect(mockCreateProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new-project");
  });

  test("redirects to the newly created project id", async () => {
    mockSignUp.mockResolvedValue({ success: true });
    mockGetProjects.mockResolvedValue([]);
    mockCreateProject.mockResolvedValue({ id: "fresh-project-id" });

    const { result } = renderAuth();
    await act(() => result.current.signUp("new@example.com", "password123"));

    expect(mockPush).toHaveBeenCalledWith("/fresh-project-id");
  });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe("initial state", () => {
  test("isLoading starts as false", () => {
    const { result } = renderAuth();
    expect(result.current.isLoading).toBe(false);
  });

  test("exposes signIn and signUp functions", () => {
    const { result } = renderAuth();
    expect(typeof result.current.signIn).toBe("function");
    expect(typeof result.current.signUp).toBe("function");
  });
});
