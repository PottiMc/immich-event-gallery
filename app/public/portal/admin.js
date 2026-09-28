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
