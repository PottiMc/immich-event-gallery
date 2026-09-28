// Admin page: copy buttons
document.addEventListener('click', async function (e) {
  const btn = e.target.closest('[data-copy]')
  if (!btn) return
  try {
    await navigator.clipboard.writeText(btn.getAttribute('data-copy'))
    const old = btn.textContent
    btn.textContent = 'Kopiert ✓'
    setTimeout(function () { btn.textContent = old }, 1500)
  } catch (err) {
    window.prompt('Zum Kopieren:', btn.getAttribute('data-copy'))
  }
})

// Admin page: fold out QR code and further actions of a share
document.addEventListener('click', function (e) {
  const toggle = e.target.closest('.adm-toggle')
  if (!toggle) return
  const panel = document.getElementById(toggle.getAttribute('aria-controls'))
  if (!panel) return
  const open = toggle.getAttribute('aria-expanded') !== 'true'
  toggle.setAttribute('aria-expanded', String(open))
  panel.hidden = !open
})
