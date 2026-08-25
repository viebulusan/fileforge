// Runtime companion override: a URL the user pastes in (stored in
// localStorage) beats the build-time env. Lets ANY signed-in device — phone
// included — download through their own machine's connection.
const COMPANION_KEY = 'ff-companion-url'
const ENV_BASE = import.meta.env.VITE_DOWNLOADER_URL ?? ''

export function companionBase() {
  try {
    const custom = (localStorage.getItem(COMPANION_KEY) ?? '').trim().replace(/\/+$/, '')
    if (custom) return custom
  } catch {}
  return ENV_BASE
}

export function setCompanionBase(url) {
  try {
    if (url) localStorage.setItem(COMPANION_KEY, url)
    else localStorage.removeItem(COMPANION_KEY)
  } catch {}
}
