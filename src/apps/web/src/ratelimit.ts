// Per-key fixed-window counters held in memory (D-053). Used for unauthenticated endpoints where no
// account exists to count against. Nothing is stored, so no IP addresses are kept; with several API
// processes each enforces its own window, so the effective limit is the limit × processes.

export class WindowLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #hits = new Map<string, { start: number; n: number }>();

  constructor(limit: number, windowMs: number) {
    this.#limit = limit;
    this.#windowMs = windowMs;
  }

  // True when the request is allowed (and counted).
  allow(key: string, now: number = Date.now()): boolean {
    if (this.#hits.size > 50_000) for (const [k, v] of this.#hits) if (now - v.start >= this.#windowMs) this.#hits.delete(k);
    const cur = this.#hits.get(key);
    if (!cur || now - cur.start >= this.#windowMs) {
      this.#hits.set(key, { start: now, n: 1 });
      return true;
    }
    cur.n++;
    return cur.n <= this.#limit;
  }
}

// Sign-in codes: per email (OTP_MAX_PER_HOUR) and per client, so one client can't use us to mail many inboxes.
export const codeRequestsPerIp = new WindowLimiter(20, 3600_000);
// Public grievance form: a flood would bury real complaints that carry legal deadlines.
export const grievancesPerIp = new WindowLimiter(5, 3600_000);
