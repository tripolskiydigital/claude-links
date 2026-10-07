import type { PinnedLink, RecentLink } from '../types'

/** How many pinned links the bar shows; the rest wait in «All links». */
export const BAR_LINKS = 4
/** How many of the session's latest links the «Recent links» list shows. */
export const RECENT_LINKS = 10

/** What a transcript message gives the scan: its text and its tool calls' arguments. */
export type ScanMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses: readonly { input: Record<string, unknown> }[]
}

const URL_RE = /https?:\/\/[^\s<>"'`()[\]{}|\\^]+/g
const MD_LINK_RE = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)/g
/** Blocks the engine adds to a user message: instructions and reminders, not the person's links. */
const INJECTED_RE = /<(system-reminder|command-[\w-]+|local-command-[\w-]+)>[\s\S]*?<\/\1>/g
/** Tool arguments that hold a link (WebFetch's `url`, a browser's `navigate`). */
const URL_KEY_RE = /^(url|href|link|uri)$/i

/** Cuts what a sentence or markdown leaves stuck to a URL's end. */
export function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?*_~]+$/, '')
}

function isUrl(text: string): boolean {
  try {
    const u = new URL(text)
    const isWeb = u.protocol === 'http:' || u.protocol === 'https:'
    return isWeb && (u.hostname.includes('.') || u.hostname === 'localhost')
  } catch {
    return false
  }
}

/** The links of one piece of text in the order written, with a markdown link's title. */
export function linksIn(text: string): RecentLink[] {
  const clean = text.replace(INJECTED_RE, ' ')
  const titles = new Map<string, string>()
  for (const m of clean.matchAll(MD_LINK_RE)) {
    const url = cleanUrl(m[2]!)
    const title = m[1]!.trim()
    // `[https://x.y](https://x.y)` names nothing.
    if (title !== '' && !/^https?:\/\//.test(title)) titles.set(url, title)
  }
  const found: RecentLink[] = []
  for (const m of clean.matchAll(URL_RE)) {
    const url = cleanUrl(m[0])
    if (isUrl(url)) found.push({ url, title: titles.get(url) ?? '' })
  }
  return found
}

/**
 * The session's latest links, newest first, each once: from what the person
 * and Claude wrote and from the links tools were called with. Tool results are
 * left out: a search or a page dump would bury the links the conversation is about.
 */
export function recentLinks(messages: readonly ScanMessage[], limit = RECENT_LINKS): RecentLink[] {
  const seen: RecentLink[] = []
  for (const message of messages) {
    seen.push(...linksIn(message.text))
    for (const use of message.toolUses) {
      for (const [key, value] of Object.entries(use.input)) {
        if (URL_KEY_RE.test(key) && typeof value === 'string' && isUrl(value)) {
          seen.push({ url: value, title: '' })
        }
      }
    }
  }
  const out: RecentLink[] = []
  const titles = new Map<string, string>()
  for (const link of seen) if (link.title !== '') titles.set(link.url, link.title)
  for (let i = seen.length - 1; i >= 0 && out.length < limit; i--) {
    const link = seen[i]!
    if (out.some(o => o.url === link.url)) continue
    out.push({ url: link.url, title: titles.get(link.url) ?? '' })
  }
  return out
}

/** What the person typed, as a URL: `example.com/x` gains `https://`; null when it is none. */
export function normalizeUrl(input: string): string | null {
  const text = input.trim()
  if (text === '') return null
  const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`
  return isUrl(withScheme) ? withScheme : null
}

/** A URL as the bar writes it: no `https://`, no `www.`, no lone trailing slash. */
export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '')
}

/** A link's name: its title, else its short URL. */
export function labelOf(link: { url: string; title: string }): string {
  return link.title.trim() !== '' ? link.title.trim() : shortUrl(link.url)
}

/** The text cut to `max` characters with an ellipsis; whole when it fits. */
export function truncate(text: string, max: number): string {
  const chars = [...text]
  return chars.length <= max ? text : `${chars.slice(0, Math.max(1, max - 1)).join('')}…`
}

/** A URL's host, `www.` kept (it is what the server answers to); '' for none. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/** Hosts a public favicon service cannot see: only the site itself is asked. */
export function isPrivateHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '')
  return (
    name === 'localhost' ||
    name.endsWith('.localhost') ||
    name.endsWith('.local') ||
    name.endsWith('.test') ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(name)
  )
}

/**
 * Cells the bar's own controls take beside the links: the scope switch, `+`,
 * «Recent links» and «All links», with the gaps between them.
 */
const CONTROLS_CELLS = 62
/** The favicon and the chip's padding, in cells. */
const CHIP_CHROME_CELLS = 4

/**
 * How many characters of a link's name fit in a quarter of the links' block,
 * the block being the band's width less the controls.
 */
export function labelBudget(bodyColumns: number): number {
  const block = Math.max(24, bodyColumns - CONTROLS_CELLS)
  return Math.max(6, Math.floor(block / BAR_LINKS) - CHIP_CHROME_CELLS)
}

/** Moves the entry at `index` by `delta` places, clamped to the list. */
export function move<T>(list: readonly T[], index: number, delta: number): T[] {
  const to = Math.max(0, Math.min(list.length - 1, index + delta))
  const out = [...list]
  const [item] = out.splice(index, 1)
  if (item !== undefined) out.splice(to, 0, item)
  return out
}

/** Reads a stored pin list, dropping whatever is not one. */
export function asLinks(value: unknown): PinnedLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(v =>
    typeof v === 'object' && v !== null && typeof v.url === 'string'
      ? [{ url: v.url, title: typeof v.title === 'string' ? v.title : '' }]
      : [],
  )
}

const PALETTE = ['#d97757', '#6a9bcc', '#788c5d', '#b07ad6', '#c98500', '#3f8f8a', '#c25e7a', '#6b7280']

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`)
}

/** The favicon's square, in CSS pixels, and the row it sits in. */
export const ICON_SIZE = 16
export const ICON_BOX = 20

/** A link's icon: its favicon, or its host's first letter on a square of the host's color. */
export function faviconSvg(uri: string | null | undefined, host: string): string {
  const pad = (ICON_BOX - ICON_SIZE) / 2
  const box = `x="${pad}" y="${pad}" width="${ICON_SIZE}" height="${ICON_SIZE}"`
  let body: string
  if (uri != null && uri !== '') {
    body = `<image href="${escapeXml(uri)}" ${box} preserveAspectRatio="xMidYMid meet"/>`
  } else {
    const name = host.replace(/^www\./, '')
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
    const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()
    const mid = ICON_BOX / 2
    body =
      `<rect ${box} rx="4" fill="${PALETTE[hash % PALETTE.length]}"/>` +
      `<text x="${mid}" y="${mid}" font-size="10" font-weight="600" font-family="-apple-system, Helvetica, Arial, sans-serif" text-anchor="middle" dominant-baseline="central" fill="#fff">${escapeXml(letter)}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_BOX}" height="${ICON_BOX}" viewBox="0 0 ${ICON_BOX} ${ICON_BOX}">${body}</svg>`
}

/** The image types a favicon may come as, by curl's content type. */
export function faviconMime(contentType: string): string | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase()
  if (type === 'image/vnd.microsoft.icon' || type === 'image/x-icon' || type === 'image/ico') return 'image/x-icon'
  return /^image\/(png|gif|jpeg|webp|svg\+xml)$/.test(type) ? type : null
}
