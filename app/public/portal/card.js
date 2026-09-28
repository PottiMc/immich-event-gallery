// Printable card: print button, live editing of title and date, reload when layout or colour changes
(function () {
  var form = document.getElementById('card-form')
  var titleInput = form.elements.titel
  var dateInput = form.elements.datum

  function each (selector, fn) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), fn)
  }

  function update () {
    var title = titleInput.value.trim() || titleInput.placeholder
    var date = dateInput.value.trim()
    each('[data-card="title"]', function (el) { el.textContent = title })
    each('[data-card="date"]', function (el) { el.textContent = date })
    each('.card-date', function (el) { el.hidden = !date })
    document.title = form.dataset.pageTitle + ' – ' + title

    // Keep the edits in the address and the language switch
    var query = new URLSearchParams(new FormData(form)).toString()
    history.replaceState(null, '', '?' + query)
    each('.card-lang a', function (a) { a.href = '?' + query + '&lang=' + a.hreflang })
  }

  titleInput.addEventListener('input', update)
  dateInput.addEventListener('input', update)
  form.addEventListener('change', function (event) {
    if (event.target.name === 'format' || event.target.name === 'dunkel') form.submit()
  })
  document.getElementById('card-print').addEventListener('click', function () { window.print() })
})()
