// Password page of a /share/<key> link: verify via /share/unlock, then reload.
// Texts come from data attributes, in the page language.
document.getElementById('unlock').addEventListener('submit', async function (e) {
  e.preventDefault()
  const form = this
  const error = document.getElementById('unlock-error')
  const button = form.querySelector('button')
  const data = Object.fromEntries(new FormData(form).entries())
  button.disabled = true
  try {
    const res = await fetch('/share/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    if (res.ok) {
      window.location.reload()
      return
    }
    const body = await res.json().catch(function () { return {} })
    error.textContent = body.error || form.dataset.msgFailed
  } catch (err) {
    error.textContent = form.dataset.msgOffline
  }
  error.hidden = false
  button.disabled = false
})
