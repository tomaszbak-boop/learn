# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time init: install deps + Prisma generate + DB migrations
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest test suite
npm run db:reset     # Reset database (destructive)
```

Run a single test file: `npx vitest run src/lib/__tests__/file-system.test.ts`

## Architecture

UIGen is an AI-powered React component generator. Users describe components in a chat interface; Claude generates them via tool calls that mutate an in-memory virtual file system, with live preview rendered in a sandboxed iframe.

### Request Flow

1. User message → `/api/chat` (streaming endpoint)
2. Claude uses `str_replace_editor` / `file_manager` tools to create/edit files
3. Tool calls are forwarded to the client via the AI SDK stream
4. `FileSystemContext` handles tool call results, updating the `VirtualFileSystem` in memory
5. `PreviewFrame` detects FS changes and re-renders the component via Babel JSX transform
6. On stream completion, project state (messages + FS) is serialized to SQLite

### Key Files

| File | Role |
|------|------|
| `src/app/api/chat/route.ts` | Streaming AI endpoint; executes tools server-side, persists projects |
| `src/lib/file-system.ts` | `VirtualFileSystem` class — in-memory file tree (core data structure) |
| `src/lib/contexts/file-system-context.tsx` | React context wrapping VirtualFS; handles tool call callbacks |
| `src/lib/contexts/chat-context.tsx` | Chat state using Vercel AI SDK `useChat` |
| `src/lib/transform/jsx-transformer.ts` | Babel standalone + import map → browser-executable HTML |
| `src/components/preview/PreviewFrame.tsx` | Sandboxed iframe that renders transformed component output |
| `src/lib/provider.ts` | Returns real Anthropic model or `MockLanguageModel` when no API key |
| `src/lib/tools/` | AI tool definitions (`str_replace_editor`, `file_manager`) |
| `src/lib/prompts/generation.tsx` | System prompt for component generation |
| `src/lib/auth.ts` | JWT session management (HTTP-only cookies, 7-day expiry) |
| `src/actions/index.ts` | Server Actions: `signUp`, `signIn`, `signOut`, `getUser` |

### State Management

- No global state library — React Context only
- `ChatContext`: wraps `useChat` from `@ai-sdk/react`, drives streaming messages; passes serialized FS state in every request body
- `FileSystemContext`: owns the `VirtualFileSystem` instance; exposes `handleToolCall` which the AI SDK calls client-side as tool results stream in; increments `refreshTrigger` to signal `PreviewFrame` to re-render
- Tool execution is **dual**: tools run server-side in `route.ts` (mutating a throwaway VFS for DB persistence) and their results are also streamed to the client where `handleToolCall` mutates the live in-browser VFS

### Anonymous User Flow

- Anonymous work is tracked in `sessionStorage` via `src/lib/anon-work-tracker.ts`
- On sign-in/sign-up, the pending session data (messages + FS) is transferred to the newly created project
- Authenticated users always redirect to `/{projectId}`; `src/app/page.tsx` auto-creates a project on first login

### Authentication

- JWT in HTTP-only cookies; `src/lib/auth.ts` handles creation/verification
- Anonymous users get in-memory sessions; only authenticated users get DB persistence
- `src/middleware.ts` guards `/api/projects` and `/api/filesystem` routes

### Database

SQLite via Prisma. Two models: `User` (email/bcrypt password) and `Project` (messages + FS state both stored as serialized JSON strings). Schema at `prisma/schema.prisma`.

### Mock Provider

When `ANTHROPIC_API_KEY` is absent, `src/lib/provider.ts` returns a `MockLanguageModel` that simulates file creation tool calls with static component code — useful for development without API costs.

## Environment

- `ANTHROPIC_API_KEY` — required for real AI generation (app falls back to mock without it)
- JWT secret defaults to a dev key; set `JWT_SECRET` in production
