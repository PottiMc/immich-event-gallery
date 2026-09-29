/*
 * The page behind the link in the newsletter confirmation e-mail. Works
 * without JavaScript: the question is a plain form that posts back.
 */

import { Lang, t } from './i18n'
import { brandName } from './settings'
import { BrandHead, CenteredPage } from './views'

export type NewsletterPageState = 'question' | 'done' | 'expired' | 'throttled'

export interface NewsletterPageProps {
  lang: Lang
  state: NewsletterPageState
  /** For the confirm form (state "question") */
  token: string
  email: string
  /** Address for "write me an e-mail" on the expired page */
  contact: string
}

export function NewsletterPage (props: NewsletterPageProps) {
  const m = t(props.lang)
  const n = m.newsletter
  const brand = brandName(props.lang)
  return (
    <html lang={m.htmlLang}>
      <head>
        <BrandHead lang={props.lang} title={n.pageTitle + ' – ' + brand}/>
      </head>
      <CenteredPage lang={props.lang}>
        <section class="eg-card eg-newsletter-page">
          {props.state === 'question' && <>
            <h1>{n.pageTitle}</h1>
            <p class="eg-lead">{n.question(brand, <strong>{props.email}</strong>)}</p>
            <form method="post" action={'/newsletter/' + props.token} class="eg-form">
              <button type="submit" class="eg-button eg-button-block">{n.confirmButton}</button>
            </form>
            <p class="eg-hint">{n.questionHint}</p>
          </>}
          {props.state === 'done' && <>
            <h1>{n.doneHeading}</h1>
            <p class="eg-lead">{n.doneText}</p>
          </>}
          {props.state === 'expired' && <>
            <h1>{n.expiredHeading}</h1>
            <p class="eg-lead">
              {n.expiredText(props.contact ? <a href={'mailto:' + props.contact}>{n.expiredMailLink}</a> : n.expiredMailLink)}
            </p>
          </>}
          {props.state === 'throttled' && <>
            <h1>{n.pageTitle}</h1>
            <p class="eg-error" role="alert">{n.confirmThrottled}</p>
          </>}
        </section>
      </CenteredPage>
    </html>
  )
}
