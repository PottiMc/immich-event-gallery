// Portal: share button in the lightbox (sends the photo itself
// to WhatsApp & co. via the Web Share API) and the "Share album" dialog with
// QR code on the gallery page.

import { state } from './state.js'
import { msg } from './i18n.js'

const ICON_SHARE = '<svg class="pswp__icn" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18,16.08C17.24,16.08 16.56,16.38 16.04,16.85L8.91,12.7C8.96,12.47 9,12.24 9,12C9,11.76 8.96,11.53 8.91,11.3L15.96,7.19C16.5,7.69 17.21,8 18,8A3,3 0 0,0 21,5A3,3 0 0,0 18,2A3,3 0 0,0 15,5C15,5.24 15.04,5.47 15.09,5.7L8.04,9.81C7.5,9.31 6.79,9 6,9A3,3 0 0,0 3,12A3,3 0 0,0 6,15C6.79,15 7.5,14.69 8.04,14.19L15.16,18.34C15.11,18.55 15.08,18.77 15.08,19C15.08,20.61 16.39,21.91 18,21.91C19.61,21.91 20.92,20.61 20.92,19A2.92,2.92 0 0,0 18,16.08Z"/></svg>'

interface PswpLike {
  currIndex: number
  on: (event: string, cb: () => void) => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LightboxInstance = any

let toastTimer: number | undefined

function toast (message: string) {
  const el = document.getElementById('eg-toast')
  if (!el) return
  el.textContent = message
  el.hidden = false
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => { el.hidden = true }, 2800)
}

function isAbort (e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

/** Browser can share image files (Android Chrome, iOS/macOS Safari, ...) */
function canShareFiles (): boolean {
  try {
    return typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'photo.jpg', { type: 'image/jpeg' })] })
  } catch (e) {
    return false
  }
}

function slug (text: string): string {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || msg.fileBaseName
}

function shareText (index: number): string {
  const portal = state.portal
  if (!portal) return ''
  const number = String(index + 1)
  const total = String(state.items.length)
  return portal.shareTemplate
    .split('{number}').join(number).split('{nr}').join(number)
    .split('{total}').join(total).split('{anzahl}').join(total)
}

function whatsappFallback (text: string) {
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener')
}

// Prepared image files, so navigator.share() can run straight from the tap.
// Safari only allows sharing inside the user gesture; fetching after the tap
// would often lose it.
const pendingFiles = new Map<number, Promise<File | null>>()
const readyFiles = new Map<number, File>()

function prepareFile (index: number): Promise<File | null> {
  const existing = pendingFiles.get(index)
  if (existing) return existing
  const item = state.items[index]
  if (!item || item.type !== 'IMAGE') return Promise.resolve(null)
  const promise = fetch(item.previewUrl, { credentials: 'same-origin' })
    .then(res => res.ok ? res.blob() : null)
    .then(blob => {
      if (!blob) return null
      const type = blob.type || 'image/jpeg'
      const ext = type.includes('webp') ? 'webp' : type.includes('png') ? 'png' : 'jpg'
      const title = state.portal?.title || msg.fileBaseName
      const file = new File([blob], `${slug(title)}-${index + 1}.${ext}`, { type })
      readyFiles.set(index, file)
      // Keep memory in check on long galleries
      if (readyFiles.size > 6) {
        const oldest = readyFiles.keys().next().value
        if (oldest !== undefined && oldest !== index) {
          readyFiles.delete(oldest)
          pendingFiles.delete(oldest)
        }
      }
      return file
    })
    .catch(() => null)
  pendingFiles.set(index, promise)
  promise.then(file => { if (!file) pendingFiles.delete(index) })
  return promise
}

async function shareImage (index: number) {
  const portal = state.portal
  if (!portal) return
  const text = shareText(index)
  const textWithLink = portal.shareUrl ? text + '\n' + portal.shareUrl : text
  const item = state.items[index]

  if (item?.type === 'IMAGE' && canShareFiles()) {
    const ready = readyFiles.get(index)
    if (ready) {
      try {
        await navigator.share({ files: [ready], text: textWithLink })
      } catch (e) {
        if (!isAbort(e)) toast(msg.shareFailed)
      }
      return
    }
    toast(msg.preparingImage)
    const file = await prepareFile(index)
    if (file) {
      try {
        await navigator.share({ files: [file], text: textWithLink })
      } catch (e) {
        if (isAbort(e)) return
        // The gesture expired while loading - the file is ready now
        toast(msg.imageReady)
      }
      return
    }
  }

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text: textWithLink })
    } catch (e) {
      if (!isAbort(e)) whatsappFallback(textWithLink)
    }
    return
  }
  whatsappFallback(textWithLink)
}

/**
 * Lightbox button "Share image". Prepares the current image in the background
 * as soon as a slide is shown.
 */
export function registerShareButton (lightbox: LightboxInstance) {
  if (!state.portal) return
  const filesSupported = canShareFiles()
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'share-button',
      order: 7,
      isButton: true,
      ariaLabel: msg.shareImage,
      title: msg.shareImageTitle,
      html: ICON_SHARE,
      onInit: (el: HTMLElement, pswp: PswpLike) => {
        el.setAttribute('title', msg.shareImageTitle)
        el.addEventListener('click', () => { shareImage(pswp.currIndex) })
        if (filesSupported) {
          const prefetch = () => { prepareFile(pswp.currIndex) }
          prefetch()
          pswp.on('change', prefetch)
        }
      }
    })
  })
}

/** Gallery header button "Share album" with QR code dialog. */
export function initAlbumShare () {
  const portal = state.portal
  const openBtn = document.getElementById('eg-album-share')
  const dialog = document.getElementById('eg-share-dialog') as HTMLDialogElement | null
  if (!portal || !openBtn || !dialog) return

  openBtn.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  })
  // Click on the backdrop closes the dialog
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close()
  })

  document.getElementById('eg-album-share-link')?.addEventListener('click', async () => {
    const text = portal.albumShareText
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: portal.title, text, url: portal.accessUrl })
      } catch (e) {
        if (!isAbort(e)) whatsappFallback(text + '\n' + portal.accessUrl)
      }
    } else {
      whatsappFallback(text + '\n' + portal.accessUrl)
    }
  })

  document.getElementById('eg-album-copy-link')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(portal.accessUrl)
      toast(msg.linkCopied)
    } catch (e) {
      window.prompt(msg.copyLinkPrompt, portal.accessUrl)
    }
  })
}
