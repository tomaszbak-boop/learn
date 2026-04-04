# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**UIGen** — an AI-powered React component generator with live preview. Users describe a component in chat; Claude generates code into a virtual file system; the result renders instantly in an iframe sandbox.

## Commands

All commands run from `uigen/`:

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (all tests)
npm run setup        # First-time setup: install + Prisma init + DB migrate
npm run db:reset     # Reset SQLite database
```

To run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

## Architecture

### Three-panel UI
`main-content.tsx` renders a resizable layout: **Chat** | **Preview** | **Code editor**. State flows through two React contexts:
- `FileSystemContext` (`lib/contexts/file-system-context.tsx`) — owns the `VirtualFileSystem` instance and exposes CRUD on virtual files
- `ChatContext` (`lib/contexts/chat-context.tsx`) — owns chat messages and streams from `/api/chat`

### Virtual file system
`lib/file-system.ts` — an in-memory tree (no disk I/O). Serialized to JSON and stored in the `Project.fileSystem` column in SQLite. The preview iframe receives serialized files and uses Babel standalone (`lib/transform/jsx-transformer.ts`) to compile JSX client-side before rendering.

### AI integration
`app/api/chat/route.ts` — streaming POST endpoint using Vercel AI SDK's `streamText()`. Calls Claude Haiku 4.5 (`lib/provider.ts`). Two tools are registered:
- `str_replace_editor` (`lib/tools/str-replace-editor.ts`) — create/modify files
- `file_manager` (`lib/tools/file-manager.ts`) — mkdir/rm/mv

When no `ANTHROPIC_API_KEY` is set, `provider.ts` returns a `MockLanguageModel` for offline development.

### Auth
JWT-based (`lib/auth.ts` + `jose`). Middleware (`middleware.ts`) validates tokens. Anonymous users can work without signing in; `lib/anon-work-tracker.ts` tracks their temporary state. `actions/` contains server actions for login, signup, and project persistence.

### Database
SQLite via Prisma. Two models: `User` and `Project`. `Project` stores `messages` and `fileSystem` as JSON strings. Schema lives in `prisma/schema.prisma`.

### Testing
Vitest + React Testing Library. Tests live alongside source files as `*.test.ts(x)`. Covers chat components, file system logic, contexts, and JSX transformation.

## Key environment variable

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for real AI responses; falls back to mock model if absent |
