// Portal: "Remove photos" dialog. Step 1 picks the photos from a thumbnail
// grid, step 2 asks for the reason and contact details, and the request is
// POSTed as JSON to /share/<key>/removal-request, which e-mails the operator.

import { state } from './state.js'
import { msg } from './i18n.js'

export function initRemovalRequest () {
  const openBtn = document.getElementById('eg-removal-open')
  const dialog = document.getElementById('eg-removal-dialog') as HTMLDialogElement | null
  const grid = document.getElementById('eg-removal-grid')
  const stepSelect = document.getElementById('eg-removal-step-select')
  const form = document.getElementById('eg-removal-form') as HTMLFormElement | null
  const done = document.getElementById('eg-removal-done')
  const countEl = document.getElementById('eg-removal-count')
  const nextBtn = document.getElementById('eg-removal-next') as HTMLButtonElement | null
  const submitBtn = document.getElementById('eg-removal-submit') as HTMLButtonElement | null
  const errorEl = document.getElementById('eg-removal-error')
  if (!openBtn || !dialog || !grid || !stepSelect || !form || !done || !nextBtn || !submitBtn || !errorEl) return

  const endpoint = dialog.dataset.endpoint || ''
  const max = Number(dialog.dataset.max) || 50
  const selected = new Set<string>()
  let gridBuilt = false

  function showStep (step: 'select' | 'form' | 'done') {
    stepSelect!.hidden = step !== 'select'
    form!.hidden = step !== 'form'
    done!.hidden = step !== 'done'
    dialog!.scrollTop = 0
  }

  function updateCount () {
    if (countEl) countEl.textContent = msg.selected(selected.size)
    nextBtn!.disabled = selected.size === 0
  }

  // Thumbnails are only loaded once the dialog is opened
  function buildGrid () {
    if (gridBuilt) return
    gridBuilt = true
    state.items.forEach((item, index) => {
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'eg-removal-tile'
      tile.setAttribute('aria-pressed', 'false')
      tile.setAttribute('aria-label', msg.photoNumber(index + 1))
      const img = document.createElement('img')
      img.src = item.thumbnailUrl
      img.alt = ''
      img.loading = 'lazy'
      img.decoding = 'async'
      const number = document.createElement('span')
      number.className = 'eg-removal-number'
      number.textContent = String(index + 1)
      tile.append(img, number)
      tile.addEventListener('click', () => {
        if (selected.has(item.id)) {
          selected.delete(item.id)
        } else if (selected.size >= max) {
          // A toast would sit behind the modal dialog
          if (countEl) countEl.textContent = msg.removalMax(max)
          return
        } else {
          selected.add(item.id)
        }
        tile.setAttribute('aria-pressed', String(selected.has(item.id)))
        updateCount()
      })
      grid!.appendChild(tile)
    })
  }

  openBtn.addEventListener('click', () => {
    buildGrid()
    if (!done.hidden) {
      // Fresh start after a sent request
      selected.clear()
      grid.querySelectorAll('[aria-pressed="true"]').forEach(el => el.setAttribute('aria-pressed', 'false'))
      form.reset()
      updateCount()
    }
    showStep('select')
    errorEl.hidden = true
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  })
  // Click on the backdrop closes the dialog
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })
  nextBtn.addEventListener('click', () => {
    if (selected.size) showStep('form')
  })
  document.getElementById('eg-removal-back')?.addEventListener('click', () => showStep('select'))

  // Only runs once the browser's own checks (required, minlength, email) pass
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorEl.hidden = true
    const data = new FormData(form)
    const body = {
      assets: Array.from(selected),
      reason: data.get('reason'),
      details: data.get('details'),
      name: data.get('name'),
      email: data.get('email'),
      confirm: data.get('confirm') === 'on'
    }
    submitBtn.disabled = true
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok && result.ok) {
        showStep('done')
      } else {
        errorEl.textContent = typeof result.error === 'string' ? result.error : msg.removalFailed
        errorEl.hidden = false
      }
    } catch (err) {
      errorEl.textContent = msg.removalFailed
      errorEl.hidden = false
    } finally {
      submitBtn.disabled = false
    }
  })

  updateCount()
}
