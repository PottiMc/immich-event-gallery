// Texts of the gallery client in the page language (<html lang>), which the
// server picked for this visitor.

import { CLIENT_MESSAGES, isLang } from '../shared/i18n.js'

// No document when a module is imported by the unit tests
const lang = typeof document !== 'undefined' ? document.documentElement.lang : ''
export const msg = CLIENT_MESSAGES[isLang(lang) ? lang : 'en']
