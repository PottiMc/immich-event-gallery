// Password page of a /share/<key> link: verify via /share/unlock, then reload
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
    error.textContent = body.error || 'Das hat leider nicht geklappt. Bitte versuch es noch einmal.'
  } catch (err) {
    error.textContent = 'Keine Verbindung. Bitte versuch es noch einmal.'
  }
  error.hidden = false
  button.disabled = false
})
