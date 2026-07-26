# KSP Crime AI

Intelligent conversational AI for the KSP Crime Database — KSP Datathon 2026, Challenge 1.

## Structure

- `frontend/` — Next.js chat UI (Catalyst Slate)
- `functions/orchestrator/` — LangGraph multi-agent backend (Catalyst Advanced I/O Function)
- `scripts/seed/` — Synthetic dataset seed script

## Quick Start

1. Install dependencies: `npm install` (from root)
2. Seed the database: `npm run seed`
3. Run the dev server: `npm run dev`

## Environment Variables

See `.env.example` for required variables.
