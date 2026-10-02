# StockPanic India — Partitioning and Retention

| | |
| --- | --- |
| **Version** | 0.1 — **DRAFT** |
| **Date** | 2026-10-02 |
| **Owner** | Architect (WORKFLOW §5) |
| **Status** | 🟡 Draft. Not yet executed (schema.md §8). |
| **DDL** | [`migrations/0001_initial.sql`](migrations/0001_initial.sql) §13–§15 |

---

## 1. What Is Partitioned, and Why

Only tables that grow without bound **and** have time-based retention or time-ordered access. Everything else stays unpartitioned: system overview §6 estimates 5–10 GB/year, which one Postgres instance handles without partitioning.

| Table | Scheme | Why | Retention |
| --- | --- | --- | --- |
| `audit_log` | Range on `at`, **monthly** | Largest and fastest-growing table; append-only; queried by entity and recent time | Kept (GUARDRAILS §4.8). Old partitions may later move to cheaper storage; never deleted without a decision |
| `ip_log` | Range on `at`, **monthly** | IP addresses must disappear after 180 days (PRD-005 OQ-005.6) — dropping a partition is instant and leaves no row-level edits | **Drop partitions older than 180 days** (whole months past the window) |
| `ai_call` | Range on `called_at`, **monthly** | Every AI request and response; spend reporting by month (D-025) | Kept 24 months `[ASSUMPTION]`, then dropped |
| `live_event` | Range on `created_at`, **daily** | Replay buffer for reconnecting clients (ADR-005) | **Drop partitions older than 2 days** (24 h needed, one day of margin) |

### Not partitioned (with reason)

| Table | Reason |
| --- | --- |
| `item`, `story`, `story_*` | Millions of rows per year, not hundreds of millions; indexed by time already; no retention |
| `vote_*`, `comment`, `alert` | Small; per-story and per-user access |
| `lsh_band` | Short-lived rows swept by `expires_at` index |

---

## 2. Partition Lifecycle

| Step | Who | When |
| --- | --- | --- |
| Create partitions ahead: **3 months** for monthly tables, **3 days** for `live_event` | Scheduler (C7) calls `ensure_monthly_partitions()` / `ensure_daily_partitions()` as the owner role | Daily at 02:00 IST |
| Drop expired partitions (`ip_log` > 180 days, `live_event` > 2 days, `ai_call` > 24 months) | Scheduler, owner role | Daily at 02:30 IST |
| Check default partitions are empty | Scheduler | Daily; alert if any row is found |
| Migration 0001 creates the first set (current + 3 months; today + 3 days) | Migration | Once |

### Default partitions

Each partitioned table has a `DEFAULT` partition as a safety net, so an insert never fails because the scheduler fell behind. A row landing in a default partition means partition creation has failed. The scheduler alerts, and the operator moves the rows into a proper partition before creating it (Postgres refuses to create a partition whose range overlaps rows in the default).

### Privileges

The application role reads and writes partitioned tables **only through the parent** (schema.md §6). Partitions created later by the scheduler get no grants, which is correct: privileges on the parent govern access through it.

---

## 3. Market-Session Considerations

| Concern | Handling |
| --- | --- |
| Partition boundaries are UTC midnights | IST trading day 09:15–15:30 = 03:45–10:00 UTC, so no trading session crosses a daily boundary |
| Partition maintenance during market hours | Scheduled at 02:00–02:30 IST, outside every session |
| Results-season growth | Monthly partitions absorb 3–5× volume; no change needed at estimated sizes |

---

## 4. Limits

| Limit | Detail |
| --- | --- |
| **`ai_call` retention is an assumption** | 24 months chosen for spend history and evaluation; revisit with the Security phase. |
| **No archive tier yet** | Old `audit_log` partitions stay in the primary database; an archive (e.g. detach + dump to object storage) is future work, needing its own decision. |
| **Unexecuted** | Partition functions have not been run (schema.md §8). |
