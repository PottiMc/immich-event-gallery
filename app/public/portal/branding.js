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

// Colors: show the hex code, preview the colors live and offer a way back to the default.
// The shades follow src/portal/theme.tsx.
;(function () {
  const form = document.getElementById('farben-form')
  const preview = document.querySelector('.adm-pv')
  if (!form || !preview) return

  const rgb = function (hex) {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const toHex = function (c) {
    return '#' + c.map(function (v) { return Math.round(v).toString(16).padStart(2, '0') }).join('')
  }
  const mix = function (a, b, amount) {
    const x = rgb(a)
    const y = rgb(b)
    return toHex(x.map(function (v, i) { return v + (y[i] - v) * amount }))
  }
  const luminance = function (hex) {
    const c = rgb(hex).map(function (v) {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const contrast = function (a, b) {
    const l = [luminance(a), luminance(b)].sort(function (x, y) { return y - x })
    return (l[0] + 0.05) / (l[1] + 0.05)
  }
  const readableOn = function (bg) {
    return contrast('#ffffff', bg) >= contrast('#1a1612', bg) ? '#ffffff' : '#1a1612'
  }
  const value = function (key) { return form.elements[key].value.toLowerCase() }

  const update = function () {
    const accent = value('accent')
    const button = value('button')
    const bg = value('background')
    const text = value('text')
    const light = luminance(bg) > 0.4
    const vars = {
      '--eg-gold': accent,
      '--eg-accent-rgb': rgb(accent).join(', '),
      '--eg-gold-light': mix(accent, text, 0.25),
      '--eg-line': 'rgba(' + rgb(accent).join(', ') + ', 0.28)',
      '--eg-berry': button,
      '--eg-on-button': readableOn(button),
      '--eg-bg': bg,
      '--eg-surface': mix(bg, text, 0.045),
      '--eg-surface-2': mix(bg, text, 0.09),
      '--eg-text': text,
      '--eg-muted': mix(text, bg, 0.27),
      '--eg-field': light ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.35)'
    }
    Object.keys(vars).forEach(function (name) { preview.style.setProperty(name, vars[name]) })
    form.querySelectorAll('[data-hex-for]').forEach(function (code) { code.textContent = value(code.dataset.hexFor) })
    form.querySelectorAll('[data-default-for]').forEach(function (button) {
      button.hidden = value(button.dataset.defaultFor) === button.dataset.default
    })
  }

  form.addEventListener('input', update)
  form.addEventListener('click', function (e) {
    const button = e.target.closest('[data-default-for]')
    if (!button) return
    form.elements[button.dataset.defaultFor].value = button.dataset.default
    update()
  })
  update()
})()
