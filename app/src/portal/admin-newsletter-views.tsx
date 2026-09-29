/*
 * Newsletter page of the admin server: confirmed sign-ups to carry over into
 * the newsletter tool, and the sign-up settings.
 */

import dayjs from 'dayjs'
import { AdminHeader } from './admin-views'
import { Lang, Messages, t } from './i18n'
import { NewsletterEntry } from './newsletter'
import { NEWSLETTER_AFTER_MAX } from './runtime-settings'
import { BrandHead, STATIC } from './views'

export interface NewsletterAdminProps {
  lang: Lang
  csrf: string
  /** Rows to show: only new ones, or all with `showAll` */
  entries: NewsletterEntry[]
  /** Confirmed and not yet added */
  pending: NewsletterEntry[]
  showAll: boolean
  enabled: boolean
  after: number
  mailOn: boolean
  mailDescription: string
  notify: string
  persistent: boolean
  notice?: string
  error?: string
}

function when (iso: string | null, m: Messages): string {
  return iso ? dayjs(iso).format(m.dateFormat + ' HH:mm') : ''
}

function EntryRow ({ entry, props, m }: { entry: NewsletterEntry, props: NewsletterAdminProps, m: Messages }) {
  const n = m.nlAdmin
  const status = !entry.confirmedAt
    ? n.waiting
    : entry.transferredAt ? n.transferred(when(entry.transferredAt, m)) : n.confirmedNew(when(entry.confirmedAt, m))
  const kind = !entry.confirmedAt ? 'waiting' : entry.transferredAt ? 'done' : 'new'
  const back = props.showAll ? '?alle' : ''
  return (
    <li class={'adm-row nl-row nl-' + kind}>
      <span class="adm-dot" aria-hidden="true"/>
      <div class="adm-row-title">
        <h2>{entry.name || entry.email}</h2>
        <p class="adm-meta">
          {entry.email}{entry.source ? ' · ' + entry.source : ''}
        </p>
        <p class="adm-meta nl-status">
          {status}
          {entry.confirmedAt && <span class="nl-proof"> · {n.requestedAt} {when(entry.requestedAt, m)} · IP {entry.ip || '–'}</span>}
        </p>
      </div>
      <div class="adm-row-actions">
        {entry.confirmedAt && (
          <form method="post" action={'/newsletter/uebertragen' + back}>
            <input type="hidden" name="csrf" value={props.csrf}/>
            <input type="hidden" name="mail" value={entry.email}/>
            <input type="hidden" name="an" value={entry.transferredAt ? '0' : '1'}/>
            <button type="submit" class={'adm-btn' + (entry.transferredAt ? '' : ' adm-btn-primary')}>
              {entry.transferredAt ? n.unmark : n.markOne}
            </button>
          </form>
        )}
        <form method="post" action={'/newsletter/loeschen' + back} data-confirm={n.confirmRemove(entry.email)}>
          <input type="hidden" name="csrf" value={props.csrf}/>
          <input type="hidden" name="mail" value={entry.email}/>
          <button type="submit" class="adm-btn">{n.remove}</button>
        </form>
      </div>
    </li>
  )
}

export function NewsletterAdminPage (props: NewsletterAdminProps) {
  const m = t(props.lang)
  const n = m.nlAdmin
  const pending = props.pending.length
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={n.title + ' – ' + m.admin.title}/>
        <link rel="stylesheet" href={`${STATIC}/portal/admin.css`}/>
      </head>
      <body class="eg-page adm" data-copied={m.admin.copied} data-copy-prompt={m.admin.copyPrompt}>
        <AdminHeader
          lang={props.lang}
          active="newsletter"
          title={n.title}
          subtitle={pending ? n.subtitleNew(pending) : n.subtitleDone}
        />
        <main class="adm-main">
          {props.notice && <p class="adm-saved" role="status">{props.notice}</p>}
          {props.error && <div class="adm-alert" role="alert">{props.error}</div>}

          <section class="adm-help" id="newsletter" aria-labelledby="newsletter-title">
            <h2 id="newsletter-title">
              {n.listHeading}{' '}
              {pending
                ? <span class="adm-badge adm-warn">{n.badgeNew(pending)}</span>
                : <span class="adm-badge adm-ok">{n.badgeDone}</span>}
            </h2>
            <p class="adm-note">{n.intro}</p>
            <div class="adm-actions nl-toolbar">
              {pending > 0 && <>
                <button type="button" class="adm-btn" data-copy={props.pending.map(e => e.email).join('\n')}>{n.copyNew}</button>
                <form method="post" action={'/newsletter/uebertragen' + (props.showAll ? '?alle' : '')}>
                  <input type="hidden" name="csrf" value={props.csrf}/>
                  <input type="hidden" name="alle-neuen" value="1"/>
                  <input type="hidden" name="an" value="1"/>
                  <button type="submit" class="adm-btn adm-btn-primary">{n.markAll}</button>
                </form>
                <a class="adm-btn" href="/api/newsletter.csv?neu=1" download>{n.csvNew}</a>
              </>}
              <a class="adm-btn" href="/api/newsletter.csv" download>{n.csvAll}</a>
              <a class="adm-btn nl-filter" href={props.showAll ? '/newsletter#newsletter' : '/newsletter?alle#newsletter'}>
                {props.showAll ? n.showNew : n.showAll}
              </a>
            </div>
            {props.entries.length
              ? <ul class="adm-list nl-list">{props.entries.map(e => <EntryRow key={e.email} entry={e} props={props} m={m}/>)}</ul>
              : <p class="adm-note nl-empty">{props.showAll ? n.emptyAll : n.emptyNew}</p>}
          </section>

          <section class="adm-help" id="einstellungen" aria-labelledby="nl-settings-title">
            <h2 id="nl-settings-title">{n.settingsHeading}</h2>
            {!props.mailOn && (
              <div class="adm-alert">
                {n.mailOff(<><code>SMTP_HOST</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>SMTP_FROM</code></>)}
              </div>
            )}
            <form method="post" action="/newsletter/einstellungen" class="adm-form">
              <input type="hidden" name="csrf" value={props.csrf}/>
              <label class="adm-choice">
                <input type="checkbox" name="enabled" value="1" checked={props.enabled}/>
                <span>{n.enabled}</span>
              </label>
              <div class="adm-field nl-after">
                <label for="nl-after">{n.after}</label>
                <input id="nl-after" name="after" type="number" min={1} max={NEWSLETTER_AFTER_MAX} value={String(props.after)}
                  aria-describedby="nl-after-hint"/>
                <p class="adm-hint" id="nl-after-hint">{n.afterHint}</p>
              </div>
              <button type="submit" class="adm-btn adm-btn-primary">{n.save}</button>
            </form>
            <p class="adm-note">{n.textsHint(<a href="/branding#texte">{m.admin.tabBranding}</a>)}</p>
            {props.mailOn && <>
              <dl class="adm-image-meta nl-mail">
                <dt>{n.mailStatus}</dt><dd><code>{props.mailDescription}</code></dd>
                <dt>{n.mailNotify}</dt><dd>{props.notify}</dd>
              </dl>
              <form method="post" action="/newsletter/testmail" class="nl-test">
                <input type="hidden" name="csrf" value={props.csrf}/>
                <button type="submit" class="adm-btn">{n.testButton}</button>
              </form>
            </>}
          </section>
        </main>
        <script src={`${STATIC}/portal/admin.js`}/>
      </body>
    </html>
  )
}
