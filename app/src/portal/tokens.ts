import crypto from 'crypto'
import { deriveKey } from './settings'

/**
 * Stateless QR access token for a shared link. Bound to key + password, so
 * changing the password in Immich (or deleting the link) invalidates every QR
 * code for it at once. Kept free of Immich imports so the gallery builder can
 * use it without an import cycle.
 */
export function accessToken (key: string, password: string): string {
  return crypto.createHmac('sha256', deriveKey('access-token'))
    .update(key + '\n' + password)
    .digest('base64url')
    .slice(0, 24)
}
