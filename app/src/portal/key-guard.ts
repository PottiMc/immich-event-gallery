/*
 * Guard for the routes that take a share key from the URL (/share/<key>, its
 * photos, metadata and downloads). Each of them asks Immich about the key, so
 * a flood of made-up keys would put load on Immich and its database.
 *
 * Keys in the API key owner's link list (cached, see listSharedLinks) always
 * pass, so guests are never slowed down, not even many of them behind one
 * Wi-Fi. Unknown keys go to Immich as before, but a request that ends in 404
 * counts as a failure: after 20 per IP within 10 minutes, or 300 in total,
 * further unknown keys get a 404 straight away without asking Immich.
 */

import { NextFunction, Request, Response } from 'express-serve-static-core'
import { respondToInvalidRequest } from '../invalidRequestHandler'
import { log } from '../utils/log'
import { listSharedLinks } from './links'
import { clientIp, throttleKey } from './security'
import { LoginThrottle } from './throttle'

/** Keys the portal knows, or undefined if the list is unavailable. */
export type KnownKeys = () => Promise<Set<string> | undefined>

export function newKeyThrottle () {
  return new LoginThrottle({
    maxFailures: 20,
    windowMs: 10 * 60_000,
    blockMs: 15 * 60_000,
    globalMaxFailures: 300,
    globalBlockMs: 5 * 60_000
  })
}

async function ownerKeys (): Promise<Set<string> | undefined> {
  const list = await listSharedLinks()
  return list.ok ? new Set(list.links.map(link => link.key)) : undefined
}

export function createShareKeyGuard (knownKeys: KnownKeys = ownerKeys, throttle = newKeyThrottle()) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.params.key
    knownKeys().catch(() => undefined).then(known => {
      // List unavailable: Immich decides alone, and nobody is counted
      if (!known || !key || known.has(key)) return next()

      const ip = throttleKey(clientIp(req))
      const gate = throttle.check(ip)
      if (!gate.allowed) {
        respondToInvalidRequest(res, 404, 'Unknown share key, lookups paused for ' + (gate.global ? 'everyone' : ip))
        return
      }
      res.once('finish', () => {
        if (res.statusCode !== 404) return
        const after = throttle.fail(ip)
        if (!after.allowed) {
          log.warn('Portal: unknown share keys - ' + (after.global ? 'all clients' : ip) + ' paused for ' + after.retryAfterSec + 's')
        }
      })
      next()
    }, next)
  }
}

export const shareKeyGuard = createShareKeyGuard()
