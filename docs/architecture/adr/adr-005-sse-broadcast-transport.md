# ADR-005 — Live channel: broadcast shared events over SSE; fetch personal state over HTTP

| | |
| --- | --- |
| **Status** | Proposed (2026-10-02) |
| **Deciders** | Architect / CTO |
| **Implements** | PRD-001 US-001.2, US-001.6, US-001.7; WORKFLOW §4 exit ("transport decisions justified on personalisation, not freshness") |

## Context

WORKFLOW §4 requires the transport choice to be justified on **personalisation**, following the reference study's finding `[RE §30.7]`: *broadcast what is identical for everyone; poll what differs per user.* CryptoPanic pushes prices (shared) over a WebSocket and polls its feed, because its feed is filtered per user on the server `[RE §14.1]`.

Our case differs in one important way. Every story event (`story.created`, `story.updated`), session change and source-health change is **the same for every user**. The personal parts of the stream — which view is active, watchlist membership, event-type filters, unread state, the user's own votes, tier limits — can all be applied **on the client** to a shared event, or fetched per user over HTTP. The public stream contains nothing private, so client-side filtering exposes nothing.

## Decision

1. **Shared events are broadcast.** One SSE endpoint in `apps/live` sends identical payloads to every connected client: `story.created`, `story.updated`, `session.changed`, `source.health` (PRD-001 §4.2). Clients decide whether an event belongs in their current view (PRD-001 §4.2: "The client applies filters locally").
2. **Personal state is fetched, not pushed.** The user's watchlist ISINs, unread marker, own votes, entitlements and the comment-reply dot are loaded over HTTP on page load; the reply dot is re-polled every 60 s. Nothing per-user travels on the live channel.
3. **Per-user notifications use their own channels**: alerts by email and browser push (PRD-003), not the live channel.
4. **SSE, not WebSocket.** The channel is one-way; votes and comments are ordinary HTTP requests. SSE works through proxies, reconnects natively, and carries `Last-Event-ID` for gap-free catch-up from the 24 h `live_events` table (ADR-004; PRD-001 US-001.2 AC-4).
5. Heartbeat every 15 s; clients treat 10 s of silence after a missed heartbeat as "Reconnecting…".

## Consequences

- Fan-out cost is one serialisation per event regardless of user count: the property that lets one small `apps/live` process hold thousands of connections (system overview §6, to be load-tested).
- Event volume is small (peak ~10/s at market open), so broadcasting every story to every client costs little bandwidth.
- If the stream ever became personalised **on the server** (e.g. per-user ranking), this decision must be revisited: by the RE §30.7 rule, that content would move to per-user fetching.

## Alternatives

| Option | Rejected because |
| --- | --- |
| Poll the stream per user (CryptoPanic's feed model) | Our stream isn't server-personalised, so polling multiplies identical requests by the number of users for no gain, and adds up to a poll interval of delay against the 5 s target. |
| WebSocket | Bidirectional capability unused; more failure modes through proxies; no native resume. |
| Per-user server-side filtered push | Exactly the fan-out RE §30.7 warns against: a different payload per connection. |
