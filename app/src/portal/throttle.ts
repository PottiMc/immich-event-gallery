/*
 * Brute-force protection for the password field, the QR token route and the
 * admin login. In-memory only - fine for a single container.
 *
 * Per IP: after `maxFailures` wrong attempts inside `windowMs` the IP is blocked.
 * Each further block doubles in length (15 min, 30 min, 1 h, ... max 24 h).
 * Globally: if more than `globalMaxFailures` wrong attempts arrive within
 * `windowMs` from anywhere, all attempts pause for `globalBlockMs`. This caps
 * distributed guessing from many IPs.
 *
 * `{ global: false }` keeps a route out of the global counter and block. Used
 * for the QR token route: tokens are unguessable, so QR guests should keep
 * working while someone hammers the password field.
 */

export interface ThrottleOptions {
  maxFailures: number
  windowMs: number
  blockMs: number
  maxBlockMs: number
  globalMaxFailures: number
  globalBlockMs: number
}

export type ThrottleDecision =
  | { allowed: true }
  | { allowed: false, retryAfterSec: number, global: boolean }

interface IpState {
  failures: number[]
  blockedUntil: number
  strikes: number
  lastSeen: number
}

const DEFAULTS: ThrottleOptions = {
  maxFailures: 5,
  windowMs: 15 * 60_000,
  blockMs: 15 * 60_000,
  maxBlockMs: 24 * 60 * 60_000,
  globalMaxFailures: 100,
  globalBlockMs: 5 * 60_000
}

const MAX_TRACKED_IPS = 10_000

export class LoginThrottle {
  private readonly opts: ThrottleOptions
  private readonly ips = new Map<string, IpState>()
  private globalFailures: number[] = []
  private globalBlockedUntil = 0

  constructor (opts: Partial<ThrottleOptions> = {}, private readonly now: () => number = Date.now) {
    this.opts = { ...DEFAULTS, ...opts }
  }

  check (ip: string, { global = true } = {}): ThrottleDecision {
    const now = this.now()
    if (global && this.globalBlockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((this.globalBlockedUntil - now) / 1000), global: true }
    }
    const state = this.ips.get(ip)
    if (state && state.blockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((state.blockedUntil - now) / 1000), global: false }
    }
    return { allowed: true }
  }

  /** Record a wrong attempt. Returns the decision for the *next* attempt. */
  fail (ip: string, { global = true } = {}): ThrottleDecision {
    const now = this.now()
    const windowStart = now - this.opts.windowMs

    if (global) {
      this.globalFailures = this.globalFailures.filter(t => t > windowStart)
      this.globalFailures.push(now)
      if (this.globalFailures.length > this.opts.globalMaxFailures) {
        this.globalBlockedUntil = now + this.opts.globalBlockMs
        this.globalFailures = []
      }
    }

    const state = this.state(ip, now)
    // Strikes decay after a quiet day
    if (now - state.lastSeen > this.opts.maxBlockMs) state.strikes = 0
    state.lastSeen = now
    state.failures = state.failures.filter(t => t > windowStart)
    state.failures.push(now)
    if (state.failures.length >= this.opts.maxFailures) {
      const duration = Math.min(this.opts.blockMs * 2 ** state.strikes, this.opts.maxBlockMs)
      state.blockedUntil = now + duration
      state.strikes++
      state.failures = []
    }
    return this.check(ip, { global })
  }

  /** A correct attempt clears the IP's failure history (but not its strikes). */
  succeed (ip: string): void {
    const state = this.ips.get(ip)
    if (state) state.failures = []
  }

  /** Remaining attempts before the IP gets blocked (for friendly messages). */
  remaining (ip: string): number {
    const state = this.ips.get(ip)
    if (!state) return this.opts.maxFailures
    const windowStart = this.now() - this.opts.windowMs
    return Math.max(0, this.opts.maxFailures - state.failures.filter(t => t > windowStart).length)
  }

  private state (ip: string, now: number): IpState {
    let state = this.ips.get(ip)
    if (!state) {
      if (this.ips.size >= MAX_TRACKED_IPS) this.prune(now)
      state = { failures: [], blockedUntil: 0, strikes: 0, lastSeen: now }
      this.ips.set(ip, state)
    }
    return state
  }

  private prune (now: number): void {
    for (const [ip, state] of this.ips) {
      if (state.blockedUntil < now && now - state.lastSeen > this.opts.windowMs) this.ips.delete(ip)
    }
    // Still full (e.g. under attack): drop the oldest entries
    if (this.ips.size >= MAX_TRACKED_IPS) {
      const oldest = [...this.ips.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      for (const [ip] of oldest.slice(0, Math.ceil(MAX_TRACKED_IPS / 10))) this.ips.delete(ip)
    }
  }
}

/** Human-readable wait time in German, e.g. "3 Minuten" or "2 Stunden". */
export function formatWait (seconds: number): string {
  if (seconds < 90) return 'einer Minute'
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 90) return minutes + ' Minuten'
  const hours = Math.ceil(minutes / 60)
  return hours + ' Stunden'
}
