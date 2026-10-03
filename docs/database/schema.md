# StockPanic India — Database Schema

| | |
| --- | --- |
| **Version** | **1.0 — APPROVED** |
| **Date** | 2026-10-02 |
| **Owner** | Architect (WORKFLOW §5) |
| **Status** | ✅ **Approved 2026-10-02 — [D-028](../../DECISION_LOG.md).** Verified on PostgreSQL 17.11 (schema.md §8). Changes require a new migration and decision. |
| **DDL** | [`migrations/0001_initial.sql`](migrations/0001_initial.sql) |
| **Tests** | [`tests/0001_constraints_test.sql`](tests/0001_constraints_test.sql) |
| **Partitioning** | [`partitioning.md`](partitioning.md) |
| **Inputs** | Architecture v1.0 (D-026): ADR-001 (ISIN), ADR-004 (Postgres for everything); PRD-001…007 v1.0 with amendments D-021, D-022, D-025 |

> WORKFLOW §5's rule for this phase: *a rule enforced by a foreign key survives engineers who never read this repository; a rule enforced by a comment does not.* This document lists every rule the schema enforces, **and every rule it doesn't**, so nothing is assumed enforced when it isn't.

---

## 1. Conventions

| Convention | Rule |
| --- | --- |
| **Engine** | PostgreSQL 17 or later (identity columns on partitioned tables need 17). Extensions: `btree_gist`, `pg_trgm`, `citext`. |
| **Row IDs** | `bigint GENERATED ALWAYS AS IDENTITY`, internal only. |
| **Public IDs** | Application-generated ULIDs with a type prefix (`st_`, `it_`, `us_`, `cm_`, `al_`), format-checked by `is_public_id()`. Public IDs appear in URLs and APIs; row IDs never do. |
| **Instruments** | Keyed by **ISIN** (`isin_code` domain, Indian format `IN` + 9 + check digit). Never by symbol (ADR-001). |
| **Time** | `timestamptz` everywhere, stored UTC. IST is a presentation and scheduling concern. |
| **Validity periods** | `daterange` with `EXCLUDE USING gist` so two versions can never overlap (GUARDRAILS §4.2). |
| **Enumerations** | Postgres enums for closed sets fixed by PRDs; `CHECK` lists for small sets; reference tables where operators may extend (event types). |
| **Names** | Singular table names; no column or table may contain the word *tone* or *sentiment* (§2.3). |

---

## 2. Rules Enforced by the Database

### 2.1 GUARDRAILS §4.1 — ISIN is the instrument key

| Mechanism | Where |
| --- | --- |
| `isin_code` domain with format check | Every ISIN column |
| Every instrument reference is a foreign key to `instrument(isin)` | `instrument_code`, `instrument_name`, `instrument_alias`, `instrument_group_link`, `story_tag`, `watchlist_entry` |
| No table has a foreign key to a symbol or scrip code | Schema review; symbols appear only in `instrument_code` |

### 2.2 GUARDRAILS §4.2 — temporally versioned mappings

| Mechanism | Where |
| --- | --- |
| `valid daterange`, non-empty, bounded below | All four mapping tables |
| `EXCLUDE (exchange =, code =, valid &&)` — a code means one company at any moment | `instrument_code` |
| `EXCLUDE (isin =, exchange =, valid &&)` — a company has one code per exchange at any moment | `instrument_code` |
| `EXCLUDE (isin =, kind =, valid &&)` and equivalents | names, aliases, group links |
| As-of lookup: `valid @> <date>` | Tested: old symbol before a rename, new symbol after |

### 2.3 GUARDRAILS §4.3 / D-014 — no AI tone storage

| Mechanism | Where |
| --- | --- |
| **Event trigger `no_tone_columns`** rejects any `CREATE TABLE`, `ALTER TABLE`, `CREATE VIEW` or `CREATE MATERIALIZED VIEW` producing a table, view or column whose name contains *tone* or *sentiment* as a whole word | Database-wide, from migration 0001 onward |
| Summaries can only reference filings (`story_summary.source_item_id → filing_detail`) and have no tone field | `story_summary` |

This closes erratum **E-6** in the strongest form available: the research's "tone→ticker structurally unrepresentable" cannot be met by schema shape alone (`docs/q4.md` §2.1), but with no tone storage at all (D-014), **a tone column cannot be created** without first dropping the event trigger, a deliberate superuser action visible in migration review.

Directional user votes (`vote_directional.direction`) are user opinion, aggregated per story by design (D-011, GUARDRAILS §4.3 as amended), and are not affected.

### 2.4 Other structural rules

| Rule | Source | Mechanism |
| --- | --- | --- |
| An item belongs to exactly one story | PRD-002 §4 | `story_item` primary key on `item_id` |
| A story's primary item is one of its own items | PRD-002 US-002.6 AC-5 | Composite FK `story(id, primary_item_id) → story_item(story_id, item_id)`, deferred |
| A live story has a primary item; a merged story has none | PRD-002 US-002.7 | `CHECK ((merged_into IS NULL) = (primary_item_id IS NOT NULL))` |
| Stories never move in the stream | PRD-001 US-001.1 AC-4 | Trigger: `first_seen_at` immutable |
| Every live story has ≥ 1 event type | PRD-004 US-004.1 AC-1 | Deferred constraint triggers on `story` insert and `story_event_type` delete |
| Exactly-once ingestion | ingestion.md §3, §4 | `UNIQUE (source_id, dedup_key)` on `item`; `UNIQUE (exchange, announcement_id)` on `filing_detail` |
| No source ingests without a recorded access basis | PRD-002 US-002.5 AC-1/AC-7 | `CHECK` on `source.enabled` |
| Excerpts only where permitted | PRD-002 C-002.8 | Trigger on `item` |
| English-only items | Product Definition N14 | `CHECK (language = 'en')` |
| Filing sources are tier 1 | PRD-002 §1 | `CHECK` on `source` |
| Non-model tags are certain; model tags carry a calibration version | entity-resolution.md §5 | `CHECK`s on `story_tag` |
| Model tags below τ are never shown | PRD-002 C-002.3 | `story_tag_display` view reads τ from `setting` |
| Summaries only of filings; ≤ 100 words | PRD-004 US-004.4 (D-025) | FK to `filing_detail`; generated `word_count` with `CHECK ≤ 100` |
| One directional vote per user per story | PRD-005 C-005.8 | Primary key `(story_id, user_id)` |
| `wrong_stock` names the disputed ISIN | PRD-005 §9.2 | `CHECK (detail ? 'isin')` |
| Counts exclude discounted votes | PRD-005 US-005.6 AC-2 | Trigger-maintained `story_vote_count` |
| One alert per story per user, ever | PRD-003 NFR-003.6 | Partial unique index |
| Alert channels are email or push only | PRD-003 US-003.6 | `CHECK` on array |
| Replies stay on their parent's story; depth ≤ 3 | PRD-006 US-006.2 | Composite self-FK; depth trigger |
| Comment length 1–2,000; removed comments carry a reason and no body | PRD-006 | `CHECK`s on `comment` |
| Legal takedowns cite a grievance | PRD-006 §5 | `CHECK` on `takedown` |
| Grievance deadlines (24 h / 36 h / 15 days) | PRD-006 US-006.8 | Trigger sets due dates |
| Users confirm age and consent | PRD-007 C-007.6, US-007.4 | `NOT NULL` columns |
| Username format; reserved names, NSE symbols and held names unavailable | PRD-007 US-007.2 | Domain + trigger |
| Operators have 2FA | PRD-007 US-007.5 | `CHECK (role = 'user' OR totp_enabled)` |
| One trial per account | PRD-007 US-007.7 | `trial` primary key on `user_id` |
| At most one live subscription per user | PRD-007 | Partial unique index |
| Unread marker never moves backwards | PRD-001 §4.3 | Trigger on `stream_seen` |
| OTP attempts ≤ 5 | PRD-007 US-007.1 AC-3 | `CHECK` |
| Audit log is append-only | GUARDRAILS §4.8 | Trigger rejects UPDATE/DELETE; app role has no UPDATE/DELETE; no direct partition access |
| Taxonomy and tier limits are migration-managed | PRD-004 AC-6; PRD-007 §2.1 | App role has no write on `event_type`, `plan_entitlement` |

---

## 3. Rules Enforced in Application Code (not by the schema)

Listed so they are not mistaken for structural guarantees. Each has a PRD test.

| Rule | Why not in the schema | Source |
| --- | --- | --- |
| Watchlist size, alert budget and saved-view limits by tier | Tier is derived (trial, subscription, time); a trigger would duplicate business logic | PRD-007 §2.1 |
| Summaries only for alert-default event types | Event types can change after summarisation | D-025 |
| Vote eligibility (verified email, 7-day account) and rate limits | Depend on time and request context | PRD-005 US-005.5 |
| Directional voting kill switch | Read from `setting` by every surface; the schema stores the switch, not its effect | PRD-005 US-005.7 |
| No directional-vote input to Trending, alerts or summaries | A query-level property | PRD-001 C-001.2, PRD-003 C-003.3 |
| AI spend cap | Accounting over `ai_call` | D-025 |
| No personal identifiers in `audit_log` rows | Content of JSON fields | §6 |
| Merge rules for votes and comments | Multi-table transaction logic | deduplication.md §6 |

---

## 4. Table Catalogue

| Area | Tables |
| --- | --- |
| Registry | `instrument`, `instrument_code`, `instrument_name`, `instrument_alias`, `instrument_group_link`, `trading_session` |
| Ingestion | `source`, `source_health`, `raw_inbox`, `item`, `filing_detail`, `item_revision`, `reconciliation_run` |
| Stories | `story`, `story_item`, `story_tag`, `story_unresolved_mention`, `story_event_type`, `event_type`, `lsh_band` |
| AI | `story_summary`, `ai_call` (partitioned) |
| Users and billing | `app_user`, `reserved_username`, `username_hold`, `user_session`, `email_code`, `plan_entitlement`, `trial`, `subscription`, `invoice` |
| Personalisation and alerts | `watchlist_entry`, `stream_seen`, `saved_view`, `alert_settings`, `alert_event_type_pref`, `push_subscription`, `alert`, `alert_budget_usage`, `digest`, `digest_item` |
| Votes | `vote_directional`, `vote_quality`, `story_vote_count` |
| Comments and grievances | `comment`, `comment_revision`, `removed_content`, `comment_report`, `grievance`, `takedown` |
| Platform | `setting`, `live_event` (partitioned), `audit_log` (partitioned), `ip_log` (partitioned), `schema_migrations` |
| Views | `story_tag_display`, `user_tier`, `ai_spend_month` |

**Migration 0002** (Backend B2) adds `job` (Postgres queue, ADR-004), `source_fetch_state` (conditional-request validators, next fetch, last new item), `source.adapter` (adapter config; enabled sources must have one) and `source_health.tracking_since`. Indexes: Q24 `job_runnable (queue, priority DESC, run_after, id)` for the next runnable job; Q25 `job_locked` for the stuck-lock sweep. **Migration 0003** (Backend B3) adds `tag_method` value `rule` (exact-name / curated-alias tags, confidence 1) and `item_analysis` (per-item event types, tags, unresolved mentions, numbers, shingles, rules version) — the input to story recomputation and an audit record. **Migration 0004** (Backend B5) adds `pending_signup` (verified identity awaiting username and consent), `data_export`, and `app_user.deletion_comments` (required once deletion is requested). **Migration 0005** (Backend B6) adds indexes Q26 `alert_held_for_digest`, Q27 `watchlist_user_recent` (tier limit after a downgrade) and Q28 `push_subscription_user`.

---

## 5. Query Patterns and Indexes

WORKFLOW §5: every index is justified by a named query.

| # | Query (source) | Index |
| --- | --- | --- |
| Q1 | Latest stream page: newest live stories, keyset by `(first_seen_at, id)` (PRD-001 §4.1) | `story_stream (first_seen_at DESC, id DESC) WHERE merged_into IS NULL` |
| Q2 | Watchlist stream: stories tagged to any of a user's ISINs, newest first (PRD-001 US-001.3 AC-4) | `story_tag_isin_time (isin, story_first_seen_at DESC, story_id DESC)` — merge of per-ISIN ordered scans |
| Q3 | Company timeline (PRD-004 §6.2) | `story_tag_isin_time` |
| Q4 | Event-type filter (PRD-001 US-001.3 AC-2) | `story_event_type_code_time (code, story_first_seen_at DESC, story_id DESC)` |
| Q5 | Important / Bullish / Bearish views (PRD-005 §4) | `story_vote_count` PK joined to Q1's scan; thresholds applied as filters |
| Q6 | Clustering candidates by ISIN, last 48 h (deduplication.md §4.1) | `story_tag_isin_time` |
| Q7 | Clustering candidates by LSH band; expiry sweep | `lsh_band` PK `(band_hash, story_id)`; `lsh_band_expiry` |
| Q8 | Exactly-once ingest (ingestion.md §6) | `item UNIQUE (source_id, dedup_key)`; `filing_detail UNIQUE (exchange, announcement_id)` |
| Q9 | As-of resolution of a scrip code or symbol (entity-resolution.md §3) | GiST exclusion index on `instrument_code (exchange, code, valid)` |
| Q10 | Instrument search by partial name, alias, symbol, code (PRD-003 US-003.1) | trigram GIN on `instrument_alias.alias_norm`, `lower(instrument_name.name)`, `instrument_code.code` |
| Q11 | Users to alert for an ISIN (alerts, system overview §2 step 7) | `watchlist_alert_targets (isin) INCLUDE (user_id) WHERE alerts_enabled` |
| Q12 | Alert history (PRD-003 §5.5) | `alert_history (user_id, created_at DESC)` |
| Q13 | Comments on a story; replies to a comment (PRD-006 §7) | `comment_story (story_id, created_at)`; `comment_replies` |
| Q14 | Profile page: a user's visible comments (PRD-006 US-006.10) | `comment_profile (user_id, created_at DESC) WHERE state = 'visible'` |
| Q15 | Vote-burst and new-account abuse detection (PRD-005 US-005.6) | `vote_directional_recent (cast_at DESC)`; `vote_directional_user` |
| Q16 | Report queues for duplicate / wrong stock / spam (PRD-002 US-002.11) | `vote_quality_reports (kind, cast_at DESC) WHERE kind IN (...)` |
| Q17 | Grievance queue by deadline (PRD-006 US-006.8) | `grievance_queue (status, resolve_due_at) WHERE status IN ('open','acknowledged')` |
| Q18 | Audit trail for an entity (operator console) | `audit_log_entity (entity_type, entity_id, at DESC)` |
| Q19 | Live-channel replay after `Last-Event-ID` (ADR-005) | `live_event` PK `(id, created_at)`; daily partitions keep it small |
| Q20 | Sign-in code check (PRD-007 US-007.1) | `email_code_lookup (email, created_at DESC) WHERE used_at IS NULL` |
| Q21 | Active sessions for "sign out everywhere" (PRD-007) | `user_session_user (user_id) WHERE revoked_at IS NULL` |
| Q22 | Unprocessed vendor push payloads (ingestion.md §3) | `raw_inbox_unprocessed (received_at) WHERE processed_at IS NULL` |
| Q23 | Retention purges (PRD-006, PRD-005) | `removed_content_purge`, `comment_revision_purge`; partition drops for `ip_log` |

`story_tag` and `story_event_type` carry a copy of the story's `first_seen_at` so Q2–Q4 can be answered from one index in order. The copy is safe because `first_seen_at` is immutable (§2.4) and filled by trigger.

---

## 6. Roles and Privacy

| Role | Used by | Privileges |
| --- | --- | --- |
| Owner (superuser on the self-managed host) | Migrations; partition creation and drops; retention jobs | All |
| `stockpanic_app` (login roles inherit it) | `web`, `live`, `worker` | `SELECT/INSERT/UPDATE/DELETE` on tables and views, except: no `UPDATE/DELETE` on `audit_log`, `ip_log`; no writes to `event_type`, `plan_entitlement`, `reserved_username`; **no direct access to any partition** |

**Personal data placement** (supports PRD-007 §1.4 deletion without editing the audit log):

- Email, Google identity and username live **only** in `app_user` (and `username_hold`). Account deletion erases them there.
- `audit_log` rows identify actors by internal `actor_id` only, so they become pseudonymous once the account is erased. Application code must not write emails or IPs into `before`/`after` JSON (§3).
- IP addresses go to `ip_log`, linked by `audit_id`; its monthly partitions are dropped after 180 days (PRD-005 OQ-005.6).
- `grievance.complainant_email` is retained for the grievance record (PRD-006); retention to be set in the Security phase.

---

## 7. Migration Path

| Rule | Detail |
| --- | --- |
| Files | `migrations/NNNN_kebab_slug.sql` (REPOSITORY_STRUCTURE §5), applied in order, each in one transaction, recorded in `schema_migrations` |
| Direction | **Forward-only.** A mistake is fixed by a new migration, never by editing an applied one |
| Breaking changes | Expand → migrate → contract across separate releases (add new column/table; backfill; switch reads; drop old later) |
| Timing | Outside the deploy freeze (08:45–15:45 IST trading days, system overview M6) |
| Safety | Base backup taken before every migration (ADR-003); migration and constraint tests run in CI against a real PostgreSQL 17 before merge |
| Partitions | Created ahead by the scheduler (`ensure_monthly_partitions`, `ensure_daily_partitions`), not by migrations (partitioning.md) |
| Event trigger | Changing or dropping `no_tone_columns` requires a migration that cites a new decision superseding D-014 |

---

## 8. Verification Status

| Item | Status |
| --- | --- |
| Check | Result (2026-10-02, throwaway `postgres:17` container, PostgreSQL 17.11) |
| --- | --- |
| `0001_initial.sql` applied to an empty database | ✅ Exit 0; 75 tables (including partitions), 3 views, event trigger `no_tone_columns` enabled |
| `0001_constraints_test.sql` | ✅ **56 passed, 0 failed** on a fresh database |
| App-role smoke test (writes through partitioned parents; vote upsert; kill-switch setting update; spend view) | ✅ |

**Defect found by the tests and fixed before any real deployment:** the `vote_quality` check for `wrong_stock` reports passed when `detail` was NULL (a NULL `CHECK` counts as satisfied), so a report could omit the disputed ISIN. Fixed with `coalesce(detail ? 'isin', false)`; all other `CHECK`s were re-scanned for the same pattern. Because 0001 had never been applied to any real database, it was corrected in place; once applied anywhere real, the forward-only rule (§7) applies.

WORKFLOW DoD item 9 ("verified, not asserted") is met for the schema. Query plans on real volumes remain unmeasured (§9).

---

## 9. Limits

| Limit | Detail |
| --- | --- |
| **Plans unmeasured** | Constraints are verified by execution (§8); index effectiveness is not, until real data exists. |
| **Sizing assumed** | Index choices follow the query patterns; no query plan has been measured on real volumes. |
| **Queue tables deferred** | Owned by the queue library (Backend phase). |
| **Grievance contact retention unset** | To be decided in the Security phase. |
| **Cluster-wide role creation** | Migration 0001 creates the `stockpanic_app` role, which is cluster-wide, while the runner's advisory lock is per database. **Never migrate two databases on one PostgreSQL server concurrently** (e.g. staging and production sharing a server). Found in Backend B3 when parallel test suites raced; tests now run serially. 0001 is frozen (D-028), so this is handled operationally rather than by editing it. |
| **Event-trigger scope** | Catches names, not meaning: a column called `mood` would pass. Migration review remains a control. |
