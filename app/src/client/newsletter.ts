// Portal: newsletter sign-up band between the photo rows. The layout reserves
// room for it (see insertBand in layout.ts); this module registers it, keeps
// the layout in step with its height and posts the form as JSON to
// /share/<key>/newsletter, which sends the confirmation e-mail.

import { state } from './state.js'
import { refreshLayout } from './virtualisation.js'

/** Register the band before the first layout, so room is made for it. */
export function initNewsletterBand () {
  const el = document.getElementById('eg-newsletter')
  if (!el || !state.container || !state.items.length) return
  el.classList.add('eg-placed')
  state.band = { el, after: Number(el.dataset.after) || 12, height: el.offsetHeight, top: 0 }

  let frame: number | undefined
  new ResizeObserver(() => {
    if (!state.band || el.offsetHeight === state.band.height) return
    state.band.height = el.offsetHeight
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(refreshLayout)
  }).observe(el)

  initForm(el)
}

/** "On its way to {email} …" with the address in bold, built without innerHTML. */
function sentMessage (template: string, email: string): Node[] {
  const [before, after = ''] = template.split('{email}')
  const strong = document.createElement('strong')
  strong.textContent = email
  return [document.createTextNode(before), strong, document.createTextNode(after)]
}

function initForm (band: HTMLElement) {
  const form = band.querySelector('form')
  const errorEl = band.querySelector<HTMLElement>('.eg-newsletter-error')
  const doneEl = band.querySelector<HTMLElement>('.eg-newsletter-done')
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!form || !errorEl || !doneEl || !button) return
  const endpoint = band.dataset.endpoint || ''
  const label = button.textContent || ''

  // Only runs once the browser's own checks (required, type=email) pass
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorEl.hidden = true
    const data = new FormData(form)
    const email = String(data.get('email') || '').trim()
    button.disabled = true
    button.textContent = band.dataset.sending || label
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: String(data.get('name') || '') })
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok && result.ok) {
        doneEl.replaceChildren(...sentMessage(band.dataset.sent || '{email}', email))
        form.hidden = true
        doneEl.hidden = false
      } else {
        errorEl.textContent = typeof result.error === 'string' ? result.error : (band.dataset.failed || '')
        errorEl.hidden = false
      }
    } catch (err) {
      errorEl.textContent = band.dataset.failed || ''
      errorEl.hidden = false
    } finally {
      button.disabled = false
      button.textContent = label
    }
  })
}
