/*
This function is in its own file so that *if desired* someone can replace the entire
function with their own custom one, by replacing the invalidRequestHandler.js file
through a Docker volume mount.
 */

import { Response } from 'express-serve-static-core'
import { getConfigOption } from './config/access'
import { log } from './utils/log'
import { h } from 'preact'
import { renderPage } from './view/render'
import { NotFound } from './portal/views'

/**
 * Send a 404. Browsers navigating to a page get the branded "not found" page
 * instead of a blank screen; image/API requests still get an empty body.
 */
function sendNotFound (res: Response) {
  const accept = String(res.req?.headers?.accept || '')
  if (res.req?.method === 'GET' && accept.includes('text/html')) {
    res.status(404).send(renderPage(h(NotFound, {})))
  } else {
    res.status(404).send()
  }
}

/**
 * Respond to any request that IPP would otherwise serve content for but cannot
 * (bad share key, password failure, unknown asset, etc.). Behavior is driven
 * by `ipp.customInvalidResponse` config; if unset, falls back to
 * `defaultResponse` (typically 404).
 *
 * Accepted values for the configured response (and `defaultResponse`):
 *   - `number` - HTTP status code to send with an empty body.
 *   - `null`   - drop the TCP connection without sending anything.
 *   - `string` starting with `http` - 302 redirect to that URL.
 *   - anything else - send an empty 404 (the ultimate fallback).
 *
 * Operators can replace this file entirely via a Docker volume mount to
 * customise the behavior; the function signature is the public contract.
 */
export function respondToInvalidRequest (res: Response, defaultResponse: number | string | null, logMessage = '') {
  let method = getConfigOption('ipp.customInvalidResponse', false)
  if (method === false) {
    // No custom method specified, use the default
    method = defaultResponse
  }
  logMessage = logMessage ? ' - ' + logMessage : ''

  if (typeof method === 'number') {
    // Respond with an HTTP status code
    log('Return status ' + method + logMessage)
    if (method === 404) sendNotFound(res)
    else res.status(method).send()
  } else if (method === null) {
    // Drop the connection without responding
    log('Dropping connection' + logMessage)
    res.destroy()
  } else if (typeof method === 'string' && method.startsWith('http')) {
    // Redirect to another URL
    res.redirect(method)
  } else {
    // Fallback to 404
    log('Return status 404' + logMessage)
    sendNotFound(res)
  }
}
