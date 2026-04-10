# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an e-commerce data utilities project that provides query functions for a SQLite database. The project uses TypeScript with ESM modules (`"type": "module"` in package.json).

## Database Schema

The SQLite database contains tables for a complete e-commerce system including:

- customers, addresses, customer_segments, customer_activity_log
- products, categories, inventory, warehouses
- orders, order_items
- reviews
- promotions

See `src/schema.ts` for the complete schema definition.

## Development Commands

```bash
# Install dependencies and initialize
npm run setup

# Run the main entry point
npx tsx src/main.ts

# Run the Claude Agent SDK example
npm run sdk
```

## Working with Queries

**Critical: All database queries must be placed in `src/queries/`.**

The project uses two sqlite packages:

- `sqlite3` — the native SQLite driver
- `sqlite` — a promise-based wrapper around sqlite3 (this is what query functions receive as `db`)

All query functions accept a `Database` instance from the `sqlite` package and return Promises:

```typescript
import { Database } from "sqlite";

// Single row
export function getCustomerByEmail(db: Database, email: string): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM customers WHERE email = ?`, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// Multiple rows — use db.all() instead of db.get()
```

## Hooks

Hooks run automatically on file operations (configured in `.claude/settings.json`; see `.claude/settings.example.json` for the schema):

- **PreToolUse (Write|Edit|MultiEdit):** `hooks/query_hook.js` — uses the Claude Agent SDK to detect duplicate query logic in `src/queries/` and blocks the write with feedback if duplication is found.
- **PostToolUse (Write|Edit|MultiEdit):** Runs `prettier` on the modified file, then `hooks/tsc.js` which runs `tsc --noEmit` and exits with code 2 (blocking) if there are TypeScript errors.
- **PreToolUse (Read):** `hooks/read_hook.js` — blocks any attempt to read `.env`.

Fix TypeScript errors before they accumulate — the tsc hook will surface them immediately after each file write.
