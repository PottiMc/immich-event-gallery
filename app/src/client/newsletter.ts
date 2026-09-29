// Portal: newsletter sign-up. Up to three places on the gallery page share
// one form design:
//   - the band between the photo rows (#eg-newsletter): the layout reserves
//     room for it (see insertBand in layout.ts), this module keeps the layout
//     in step with its height
//   - optionally the same band after the last photo (#eg-newsletter-end),
//     hidden when the first one already sits at the end
//   - optionally a bar fixed to the bottom of the screen (#eg-newsletter-bar)
//     whose button opens the form in a dialog
// Every form posts JSON to /share/<key>/newsletter, which sends the
// confirmation e-mail. A sign-up in one place turns all of them into the note.

import { state } from './state.js'
import { refreshLayout } from './virtualisation.js'

const SENT_KEY = 'eg-newsletter-sent'
const HIDDEN_KEY = 'eg-newsletter-bar-hidden'
// A hidden bar stays away for this long
const HIDE_DAYS = 14

function readStorage (key: string): string | null {
  try { return localStorage.getItem(key) } catch (e) { return null }
}

function writeStorage (key: string, value: string) {
  try { localStorage.setItem(key, value) } catch (e) { /* private mode: only for this page */ }
}

/** Register the band before the first layout, so room is made for it. */
export function initNewsletterBand () {
  const el = document.getElementById('eg-newsletter')
  if (!el || !state.container || !state.items.length) return
  el.classList.add('eg-placed')
  const end = document.getElementById('eg-newsletter-end')
  state.band = {
    el,
    after: Number(el.dataset.after) || 12,
    height: el.offsetHeight,
    top: 0,
    atEnd: false,
    // Short album: the first band is already after the last photo
    onPlace: () => { if (end && state.band) end.hidden = state.band.atEnd }
  }

  let frame: number | undefined
  new ResizeObserver(() => {
    if (!state.band || el.offsetHeight === state.band.height) return
    state.band.height = el.offsetHeight
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(refreshLayout)
  }).observe(el)

  const bar = initStickyBar()
  document.querySelectorAll<HTMLFormElement>('form.eg-newsletter-form').forEach(form => initForm(form, () => {
    writeStorage(SENT_KEY, '1')
    bar?.hide()
  }))
}

/** "On its way to {email} …" with the address in bold, built without innerHTML. */
function sentMessage (template: string, email: string): Node[] {
  const [before, after = ''] = template.split('{email}')
  const strong = document.createElement('strong')
  strong.textContent = email
  return [document.createTextNode(before), strong, document.createTextNode(after)]
}

/** Replace every form on the page with the "sent" note. */
function showSentEverywhere (template: string, email: string) {
  document.querySelectorAll<HTMLElement>('.eg-newsletter-signup').forEach(signup => {
    const form = signup.querySelector('form')
    const done = signup.querySelector<HTMLElement>('.eg-newsletter-done')
    if (!form || !done) return
    done.replaceChildren(...sentMessage(template, email))
    form.hidden = true
    done.hidden = false
  })
}

function initForm (form: HTMLFormElement, onSent: () => void) {
  const errorEl = form.querySelector<HTMLElement>('.eg-newsletter-error')
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (!errorEl || !button) return
  const label = button.textContent || ''
  const texts = form.dataset

  // Only runs once the browser's own checks (required, type=email) pass
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorEl.hidden = true
    const data = new FormData(form)
    const email = String(data.get('email') || '').trim()
    button.disabled = true
    button.textContent = texts.sending || label
    try {
      const res = await fetch(texts.endpoint || '', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: String(data.get('name') || '') })
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok && result.ok) {
        showSentEverywhere(texts.sent || '{email}', email)
        onSent()
      } else {
        errorEl.textContent = typeof result.error === 'string' ? result.error : (texts.failed || '')
        errorEl.hidden = false
      }
    } catch (err) {
      errorEl.textContent = texts.failed || ''
      errorEl.hidden = false
    } finally {
      button.disabled = false
      button.textContent = label
    }
  })
}

/**
 * The bar at the bottom of the screen. Shown once the guest has scrolled a
 * little, while no band is in view; hidden for good after a sign-up and for
 * HIDE_DAYS after the guest closes it.
 */
function initStickyBar (): { hide: () => void } | undefined {
  const bar = document.getElementById('eg-newsletter-bar')
  const dialog = document.getElementById('eg-newsletter-dialog') as HTMLDialogElement | null
  if (!bar || !dialog) return undefined

  const hiddenAt = Number(readStorage(HIDDEN_KEY)) || 0
  let off = readStorage(SENT_KEY) === '1' || Date.now() - hiddenAt < HIDE_DAYS * 24 * 60 * 60_000
  const bandsInView = new Set<Element>()

  function update () {
    const show = !off && !dialog!.open && bandsInView.size === 0 && window.scrollY > window.innerHeight * 0.5
    if (show === !bar!.hidden) return
    bar!.hidden = !show
    document.body.classList.toggle('eg-bar-on', show)
  }
  function hide () {
    off = true
    update()
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) bandsInView.add(entry.target)
        else bandsInView.delete(entry.target)
      }
      update()
    })
    document.querySelectorAll('#eg-newsletter, #eg-newsletter-end').forEach(el => observer.observe(el))
  }

  let frame: number | undefined
  window.addEventListener('scroll', () => {
    if (frame === undefined) frame = requestAnimationFrame(() => { frame = undefined; update() })
  }, { passive: true })

  bar.querySelector('.eg-newsletter-bar-open')?.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    update()
    dialog.querySelector<HTMLInputElement>('input[type="email"]')?.focus()
  })
  bar.querySelector('.eg-newsletter-bar-close')?.addEventListener('click', () => {
    writeStorage(HIDDEN_KEY, String(Date.now()))
    hide()
  })
  // Click on the backdrop closes the dialog
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close() })
  dialog.addEventListener('close', update)

  update()
  return { hide }
}
