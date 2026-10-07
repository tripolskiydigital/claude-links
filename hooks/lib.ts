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

/** The text cut to `max` characters, with an ellipsis unless `ellipsis` is false; whole when it fits. */
export function truncate(text: string, max: number, ellipsis = true): string {
  const chars = [...text]
  if (chars.length <= max) return text
  return ellipsis ? `${chars.slice(0, Math.max(1, max - 1)).join('')}…` : chars.slice(0, max).join('')
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
 * «Recent» and «All», with the gaps between them.
 */
const CONTROLS_CELLS = 40
/** The favicon and the chip's padding and gap, in cells. */
const CHIP_CHROME_CELLS = 4

/**
 * How many characters of a link's name fit when the bar's `count` links share
 * the room the controls leave: one link takes it all, four a quarter each.
 */
export function labelBudget(bodyColumns: number, count = BAR_LINKS): number {
  const block = Math.max(24, bodyColumns - CONTROLS_CELLS)
  return Math.max(6, Math.floor(block / Math.max(1, count)) - CHIP_CHROME_CELLS)
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

/** A plain desktop button's height in CSS pixels (measured: 20): a bar chip's icon is centred in it. */
export const BUTTON_HEIGHT = 20

/**
 * A link's icon: its favicon, or its host's first letter on a square of the
 * host's color; `height` taller than the box centres it in that height.
 */
export function faviconSvg(uri: string | null | undefined, host: string, height = ICON_BOX): string {
  const pad = (ICON_BOX - ICON_SIZE) / 2
  const top = (height - ICON_SIZE) / 2
  const box = `x="${pad}" y="${top}" width="${ICON_SIZE}" height="${ICON_SIZE}"`
  let body: string
  if (uri != null && uri !== '') {
    body = `<image href="${escapeXml(uri)}" ${box} preserveAspectRatio="xMidYMid meet"/>`
  } else {
    const name = host.replace(/^www\./, '')
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
    const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase()
    const mid = ICON_BOX / 2
    const midY = height / 2
    body =
      `<rect ${box} rx="4" fill="${PALETTE[hash % PALETTE.length]}"/>` +
      `<text x="${mid}" y="${midY}" font-size="10" font-weight="600" font-family="-apple-system, Helvetica, Arial, sans-serif" text-anchor="middle" dominant-baseline="central" fill="#fff">${escapeXml(letter)}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_BOX}" height="${height}" viewBox="0 0 ${ICON_BOX} ${height}">${body}</svg>`
}

/** The image types a favicon may come as, by curl's content type. */
export function faviconMime(contentType: string): string | null {
  const type = contentType.split(';')[0]!.trim().toLowerCase()
  if (type === 'image/vnd.microsoft.icon' || type === 'image/x-icon' || type === 'image/ico') return 'image/x-icon'
  return /^image\/(png|gif|jpeg|webp|svg\+xml)$/.test(type) ? type : null
}

export type SortBy = 'title' | 'url'
export type SortDir = 'asc' | 'desc'

/** What a sort compares: the name (or the short URL when none), or the short URL; any case. */
function sortKey(link: PinnedLink, by: SortBy): string {
  return (by === 'title' ? labelOf(link) : shortUrl(link.url)).toLowerCase()
}

/** The list sorted by name or link, A→Z or Z→A, numbers in their order; ties keep their place. */
export function sortLinks(list: readonly PinnedLink[], by: SortBy, dir: SortDir): PinnedLink[] {
  const sign = dir === 'asc' ? 1 : -1
  return list
    .map((link, i) => ({ link, i }))
    .sort((a, b) => {
      const order = sortKey(a.link, by).localeCompare(sortKey(b.link, by), undefined, { numeric: true })
      return order !== 0 ? sign * order : a.i - b.i
    })
    .map(e => e.link)
}

/** How the list stands sorted by `by`, if it does: the arrow a header shows comes from the list itself. */
export function sortedAs(list: readonly PinnedLink[], by: SortBy): SortDir | null {
  if (list.length < 2) return null
  const same = (other: PinnedLink[]) => other.every((l, i) => l === list[i])
  if (same(sortLinks(list, by, 'asc'))) return 'asc'
  if (same(sortLinks(list, by, 'desc'))) return 'desc'
  return null
}

/** Whether a pinned link answers a search: its name or its short URL holds the text, any case. */
export function matches(link: PinnedLink, query: string): boolean {
  const q = query.trim().toLowerCase()
  return q === '' || labelOf(link).toLowerCase().includes(q) || shortUrl(link.url).toLowerCase().includes(q)
}

/** Rows an entry of the «All» pane takes: its name, then its URL and buttons. */
export const ENTRY_ROWS = 2

/** Where an entry dragged `dy` rows from `from` lands in a list of `count`. */
export function dropIndexY(from: number, dy: number, count: number, rows = ENTRY_ROWS): number {
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / rows)))
}


/** What a page's head says about it: its title and the icons it declares, best first. */
export type PageMeta = { title: string; icons: string[] }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»' }

/** Decodes the HTML entities a title holds: named ones, `&#39;`, `&#x27;`. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m === null ? null : (m[2] ?? m[3] ?? m[4] ?? '')
}

/**
 * Reads a page's `<title>` and its `<link rel="icon">`s, resolved against
 * `base` (the URL the page came from). Icons rank SVG first, then the small
 * ones (≤ 64px), then the rest, then Apple's touch icon.
 */
export function parseHead(html: string, base: string): PageMeta {
  const head = html.slice(0, 200_000)
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)
  const title = titleMatch === null ? '' : decodeEntities(titleMatch[1]!).replace(/\s+/g, ' ').trim()
  const ranked: { href: string; rank: number }[] = []
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = (attr(tag, 'rel') ?? '').toLowerCase()
    const href = attr(tag, 'href')
    if (href === null || href === '' || !/\bicon\b/.test(rel)) continue
    let url: string
    try {
      url = new URL(decodeEntities(href), base).href
    } catch {
      continue
    }
    const type = (attr(tag, 'type') ?? '').toLowerCase()
    const size = Number(/(\d+)x\d+/.exec(attr(tag, 'sizes') ?? '')?.[1] ?? 0)
    const rank = rel.includes('apple')
      ? 4
      : type.includes('svg') || /\.svg(\?|$)/i.test(url)
        ? 0
        : size > 0 && size <= 64
          ? 1
          : size === 0
            ? 2
            : 3
    ranked.push({ href: url, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank)
  return { title, icons: [...new Set(ranked.map(r => r.href))] }
}
