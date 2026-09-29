import { afterEach, describe, expect, it } from 'vitest'
import http from 'http'
import { AddressInfo } from 'net'
import express from 'express'
import { createShareKeyGuard, KnownKeys } from '../src/portal/key-guard'
import { LoginThrottle } from '../src/portal/throttle'

let server: http.Server | undefined

afterEach(() => {
  server?.close()
  server = undefined
})

/**
 * A share route behind the guard. `immichCalls` counts how often the route
 * would have asked Immich; only 'good-key' is a valid share there.
 */
async function start (knownKeys: KnownKeys, throttle: LoginThrottle) {
  const counter = { immichCalls: 0 }
  const app = express()
  app.set('trust proxy', true)
  app.get('/share/:key', createShareKeyGuard(knownKeys, throttle), (req, res) => {
    counter.immichCalls++
    if (req.params.key === 'good-key') res.send('gallery')
    else res.status(404).send()
  })
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server!.once('listening', resolve))
  const base = 'http://127.0.0.1:' + (server!.address() as AddressInfo).port
  const get = (key: string, ip = '203.0.113.1') =>
    fetch(base + '/share/' + key, { headers: { 'x-forwarded-for': ip } }).then(res => res.status)
  return { get, counter }
}

const known: KnownKeys = async () => new Set(['good-key'])
const throttle = (opts: Partial<ConstructorParameters<typeof LoginThrottle>[0]> = {}) =>
  new LoginThrottle({ maxFailures: 3, globalMaxFailures: 100, ...opts })

describe('share key guard', () => {
  it('stops asking Immich about unknown keys from one IP after the limit', async () => {
    const { get, counter } = await start(known, throttle())
    for (let i = 0; i < 3; i++) expect(await get('made-up-' + i)).toBe(404)
    expect(counter.immichCalls).toBe(3)
    expect(await get('made-up-4')).toBe(404)
    expect(counter.immichCalls).toBe(3)
    // Another IP is not affected
    expect(await get('made-up-5', '203.0.113.2')).toBe(404)
    expect(counter.immichCalls).toBe(4)
  })

  it('always lets known keys through, even from a blocked IP', async () => {
    const { get, counter } = await start(known, throttle())
    for (let i = 0; i < 3; i++) await get('made-up-' + i)
    expect(await get('good-key')).toBe(200)
    expect(counter.immichCalls).toBe(4)
  })

  it('does not count unknown keys that Immich accepts', async () => {
    // 'good-key' is valid in Immich, but missing from the (stale) list
    const { get, counter } = await start(async () => new Set(), throttle())
    for (let i = 0; i < 5; i++) expect(await get('good-key')).toBe(200)
    expect(counter.immichCalls).toBe(5)
  })

  it('pauses unknown keys for everyone when many IPs guess', async () => {
    const { get, counter } = await start(known, throttle({ maxFailures: 100, globalMaxFailures: 3 }))
    for (let i = 0; i < 4; i++) await get('made-up-' + i, '198.51.100.' + i)
    expect(counter.immichCalls).toBe(4)
    expect(await get('made-up-x', '198.51.100.99')).toBe(404)
    expect(counter.immichCalls).toBe(4)
    // Guests with a real key keep working
    expect(await get('good-key', '198.51.100.99')).toBe(200)
  })

  it('leaves everything to Immich while the link list is unavailable', async () => {
    const { get, counter } = await start(async () => undefined, throttle())
    for (let i = 0; i < 6; i++) await get('made-up-' + i)
    expect(counter.immichCalls).toBe(6)
  })
})
