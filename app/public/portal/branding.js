// Branding page: upload a logo or icon as soon as a file is chosen, then reload.
// Texts and the form token come from data attributes on <body>.
document.addEventListener('change', async function (e) {
  const input = e.target
  if (!input.matches || !input.matches('input[type=file][data-slot]') || !input.files.length) return
  const body = document.body.dataset
  const card = input.closest('.adm-image')
  const status = card.querySelector('.adm-image-status')
  const file = input.files[0]
  const show = function (text, error) {
    status.textContent = text
    status.classList.toggle('adm-image-error', !!error)
  }

  if (file.size > Number(body.maxBytes)) {
    show(body.tooLarge, true)
    input.value = ''
    return
  }
  show(body.uploading, false)
  input.disabled = true
  try {
    const res = await fetch('/branding/bild/' + encodeURIComponent(input.dataset.slot), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': body.csrf },
      body: file
    })
    if (res.ok) {
      // A fresh query string on every upload, so the page always reloads (a hash change alone would not)
      window.location.href = '/branding?hochgeladen=' + encodeURIComponent(input.dataset.slot) +
        '&t=' + Date.now() + '#' + card.id
      return
    }
    const answer = await res.json().catch(function () { return {} })
    show(answer.error || body.uploadFailed, true)
  } catch (err) {
    show(body.uploadFailed, true)
  }
  input.disabled = false
  input.value = ''
})
