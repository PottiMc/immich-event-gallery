// Admin page: copy buttons. Texts come from data attributes on <body>.
document.addEventListener('click', async function (e) {
  const btn = e.target.closest('[data-copy]')
  if (!btn) return
  try {
    await navigator.clipboard.writeText(btn.getAttribute('data-copy'))
    const old = btn.textContent
    btn.textContent = document.body.dataset.copied
    setTimeout(function () { btn.textContent = old }, 1500)
  } catch (err) {
    window.prompt(document.body.dataset.copyPrompt, btn.getAttribute('data-copy'))
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

// Statistics: apply the filter as soon as a choice changes
document.querySelectorAll('form[data-autosubmit]').forEach(function (form) {
  form.classList.add('st-js')
  form.addEventListener('change', function () { form.submit() })
})

// Statistics: ask before deleting
document.addEventListener('submit', function (e) {
  const message = e.target.getAttribute && e.target.getAttribute('data-confirm')
  if (message && !window.confirm(message)) e.preventDefault()
})

// Statistics: tooltip above the chart bars (hover with the mouse, tap on touch screens)
const statsTip = document.getElementById('st-tip')
if (statsTip) {
  let active = null
  const hide = function () {
    if (active) active.classList.remove('st-hover')
    active = null
    statsTip.hidden = true
  }
  document.addEventListener('pointerover', function (e) {
    const col = e.target.closest('.st-col')
    if (!col) return hide()
    if (col === active) return
    if (active) active.classList.remove('st-hover')
    active = col
    col.classList.add('st-hover')
    statsTip.textContent = col.getAttribute('data-tip')
    statsTip.hidden = false
    const bar = col.getBoundingClientRect()
    const plot = col.closest('.st-plot').getBoundingClientRect()
    const width = statsTip.offsetWidth
    const left = Math.min(Math.max(bar.left + bar.width / 2 - width / 2, 8), window.innerWidth - width - 8)
    statsTip.style.left = left + 'px'
    statsTip.style.top = Math.max(plot.top - statsTip.offsetHeight - 6, 8) + 'px'
  })
  window.addEventListener('scroll', hide, { passive: true })
}
