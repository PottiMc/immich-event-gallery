/*
 * Outgoing e-mail over SMTP, shared by the removal requests and the
 * newsletter sign-up. Configured through environment variables:
 *
 *   SMTP_HOST      relay; empty = no e-mail at all
 *   SMTP_PORT      default 587
 *   SMTP_SECURITY  starttls | ssl | none (also "keine"); default: 465 -> ssl,
 *                  otherwise starttls. The older SMTP_SECURE=true|false still works.
 *   SMTP_USER, SMTP_PASS
 *   SMTP_FROM      sender address, may be "Name <address>"
 *   SMTP_NAME      display name of the sender (default: the brand name)
 *
 * Every send opens its own connection and waits for the previous one, so the
 * relay never sees parallel logins from the portal.
 */

import crypto from 'crypto'
import nodemailer, { SendMailOptions, Transporter } from 'nodemailer'
import { log } from '../utils/log'
import { isLang } from '../shared/i18n'
import { defaultLang, Lang, t } from './i18n'
import { brandName } from './settings'

export const MAX_EMAIL = 200
const TIMEOUT_MS = 25_000

/*
 * Strict on purpose: no spaces or control characters anywhere, so an address
 * can never smuggle extra header lines into a mail.
 */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/

export function isValidEmail (value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_EMAIL && EMAIL.test(value)
}

/** "j***@example.com" for the log. */
export function maskEmail (email: string): string {
  const at = email.lastIndexOf('@')
  if (at < 1) return '***'
  return email[0] + '***' + email.slice(at)
}

export type SmtpSecurity = 'starttls' | 'ssl' | 'none'

export interface MailConfig {
  host: string
  port: number
  security: SmtpSecurity
  user: string
  hasPassword: boolean
  fromAddress: string
  fromName: string
}

/** "Name <address>" or a bare address. */
export function parseFrom (raw: string): { name: string, address: string } {
  const match = raw.trim().match(/^(.*?)\s*<([^<>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"(.*)"$/, '$1'), address: match[2].trim() }
  return { name: '', address: raw.trim() }
}

function security (port: number): SmtpSecurity {
  const value = (process.env.SMTP_SECURITY || '').trim().toLowerCase()
  if (value === 'ssl' || value === 'tls') return 'ssl'
  if (value === 'starttls') return 'starttls'
  if (value === 'none' || value === 'keine' || value === 'off') return 'none'
  if (process.env.SMTP_SECURE) return process.env.SMTP_SECURE === 'true' ? 'ssl' : 'starttls'
  return port === 465 ? 'ssl' : 'starttls'
}

export function mailConfig (): MailConfig {
  const port = Number(process.env.SMTP_PORT) || 587
  const from = parseFrom(process.env.SMTP_FROM || process.env.SMTP_USER || '')
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port,
    security: security(port),
    user: process.env.SMTP_USER || '',
    hasPassword: !!process.env.SMTP_PASS,
    fromAddress: from.address,
    fromName: (process.env.SMTP_NAME || '').trim() || from.name || brandName()
  }
}

/** E-mail works when a relay and a valid sender address are set. */
export function mailEnabled (): boolean {
  const config = mailConfig()
  return !!config.host && isValidEmail(config.fromAddress)
}

/** Language of mails to the operator. */
export function operatorLang (): Lang {
  const lang = process.env.REMOVAL_REQUEST_LANG
  return isLang(lang) ? lang : defaultLang()
}

/** "smtp.example.com:587 (starttls), from info@example.com" - never the password. */
export function describeMailConfig (config = mailConfig()): string {
  return `${config.host}:${config.port} (${config.security}), from ${config.fromName} <${config.fromAddress}>, ` +
    `login ${config.user && config.hasPassword ? 'set' : 'MISSING'}`
}

/** One log line at startup. */
export function logMailConfig () {
  const config = mailConfig()
  if (!config.host) {
    log('E-mail: off (SMTP_HOST not set)')
  } else if (!isValidEmail(config.fromAddress)) {
    log.warn('E-mail: off - SMTP_FROM is not a valid address (' + config.host + ':' + config.port + ')')
  } else {
    log('E-mail: ' + describeMailConfig(config))
  }
}

type Transport = Pick<Transporter, 'sendMail'>
let fakeTransport: Transport | undefined

/** Tests swap in a fake transport. */
export function setMailTransport (fake: Transport | undefined) {
  fakeTransport = fake
}

function transport (config: MailConfig): Transport {
  if (fakeTransport) return fakeTransport
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === 'ssl',
    requireTLS: config.security === 'starttls',
    ignoreTLS: config.security === 'none',
    auth: config.user ? { user: config.user, pass: process.env.SMTP_PASS || '' } : undefined,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS
  })
}

export interface OutgoingMail {
  to: string
  replyTo?: string
  subject: string
  text: string
  html?: string
}

let queue: Promise<unknown> = Promise.resolve()

/** Send one mail (text and optionally HTML). Throws on failure. */
export function sendMail (mail: OutgoingMail): Promise<void> {
  const run = async () => {
    const config = mailConfig()
    if (!config.host || !isValidEmail(config.fromAddress)) throw new Error('E-mail is not configured')
    const domain = config.fromAddress.split('@')[1]
    const options: SendMailOptions = {
      from: { name: config.fromName, address: config.fromAddress },
      to: mail.to,
      replyTo: mail.replyTo,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      date: new Date(),
      messageId: `<${crypto.randomUUID()}@${domain}>`,
      headers: { 'Auto-Submitted': 'auto-generated' }
    }
    await transport(config).sendMail(options)
  }
  const result = queue.then(run, run)
  // Keep the queue going whatever happens to this mail
  queue = result.catch(() => undefined)
  return result
}

export type MailErrorKind = 'auth' | 'sender' | 'recipient' | 'unreachable' | 'tls' | 'other'

/** Sort an SMTP error into a few causes an operator can act on. */
export function mailErrorKind (error: unknown): MailErrorKind {
  const e = (error && typeof error === 'object' ? error : {}) as { code?: string, command?: string, responseCode?: number, message?: string }
  const message = String(e.message || '')
  if (e.code === 'EAUTH' || e.responseCode === 535) return 'auth'
  if (/wrong version number|ssl3_get_record|tls|certificate|self.signed/i.test(message) || e.code === 'ETLS') return 'tls'
  if (e.command === 'MAIL FROM') return 'sender'
  if (e.command === 'RCPT TO' || e.code === 'EENVELOPE') return 'recipient'
  if (['ECONNECTION', 'ETIMEDOUT', 'EDNS', 'ESOCKET', 'ECONNREFUSED', 'ENOTFOUND'].includes(e.code || '') ||
    /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout/i.test(message)) return 'unreachable'
  return 'other'
}

/** Readable text for the log and the admin page. */
export function mailErrorText (error: unknown, lang: Lang = operatorLang()): string {
  const m = t(lang).mail
  const detail = error instanceof Error ? error.message : String(error)
  return m.errors[mailErrorKind(error)] + ' (' + detail.slice(0, 200) + ')'
}
