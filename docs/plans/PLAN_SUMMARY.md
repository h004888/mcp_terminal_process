# Kế hoạch triển khai MCP Terminal

## Phase 1 — Security & Stability ✅ DONE
**File:** `docs/plans/2026-07-12-mcp-terminal-phase1-security.md`

## Phase 2 — Multi-Process Management ✅ DONE

| # | Tính năng | Files thay đổi | Trạng thái |
|---|-----------|---------------|-----------|
| 1 | `get_process_status` — CPU, memory, uptime, restart count | `processManager.ts`, `index.ts`, `types.ts` | ✅ |
| 2 | `restart_process` — Stop + start với cùng params | `processManager.ts`, `index.ts` | ✅ |
| 3 | `stop_process_group` — Stop tất cả process trong 1 group | `processManager.ts`, `index.ts` | ✅ |
| 4 | `batch_start` — Start nhiều process từ JSON array | `processManager.ts`, `index.ts` | ✅ |
| 5 | Health checker — Watchdog loop kiểm tra process định kỳ | `processManager.ts`, `index.ts` | ✅ |
