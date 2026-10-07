import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderChildren, RenderElement } from 'claude-code'

import type { Drag, Draft, Lang, LinkSort, PinnedLink, Scope } from '../types'
import { langOf, t } from './i18n'
import {
  BAR_LINKS,
  ICON_BOX,
  asLinks,
  faviconMime,
  faviconSvg,
  hostOf,
  isPrivateHost,
  labelBudget,
  labelOf,
  chipWidth,
  dropIndexX,
  dropIndexY,
  matches,
  move,
  normalizeUrl,
  parseHead,
  recentLinks,
  shortUrl,
  sortLinks,
  sortedAs,
  truncate,
} from './lib'
import type { PageMeta, SortBy } from './lib'

type Engine = EngineInterface

const EMPTY_DRAFT: Draft = { url: '', title: '', scope: 'project', edit: null, rev: 0 }

const recent = atom({ plugin: 'links-bar', key: 'recent' } as const, [])
const projectLinks = atom({ plugin: 'links-bar', key: 'projectLinks' } as const, [])
const sessionLinks = atom({ plugin: 'links-bar', key: 'sessionLinks' } as const, [])
const scope = atom({ plugin: 'links-bar', key: 'scope' } as const, 'project')
const section = atom({ plugin: 'links-bar', key: 'section' } as const, null)
const draft = atom({ plugin: 'links-bar', key: 'draft' } as const, EMPTY_DRAFT)
const favicons = atom({ plugin: 'links-bar', key: 'favicons' } as const, {})
const lang = atom({ plugin: 'links-bar', key: 'lang' } as const, 'en')
const paneOpen = atom({ plugin: 'links-bar', key: 'paneOpen' } as const, false)
const search = atom({ plugin: 'links-bar', key: 'search' } as const, '')
const activeField = atom({ plugin: 'links-bar', key: 'activeField' } as const, null)
const drag = atom({ plugin: 'links-bar', key: 'drag' } as const, null)
const sorts = atom({ plugin: 'links-bar', key: 'sorts' } as const, { project: null, session: null })

/** Pins and the scope switch are read again this often: another session may have changed them. */
const SYNC_MS = 5_000
/** A favicon past this is not kept: every one lives in the plugin's store (4 MiB in all). */
const MAX_FAVICON_BYTES = 24_000
/** A site with no favicon we could read is asked again after this long. */
const FAVICON_RETRY_MS = 3 * 24 * 60 * 60 * 1000

/** Whether a value differs from the one held, so a quiet refresh writes and redraws nothing. */
function changed(prev: unknown, next: unknown): boolean {
  return JSON.stringify(prev) !== JSON.stringify(next)
}

async function storeKey($: Engine, s: Scope): Promise<string> {
  return s === 'project' ? `project:${await $.session.root()}` : `session:${await $.session.id()}`
}

/** Puts a scope's pins in its value; a write that changes nothing writes nothing. */
async function setPins($: Engine, s: Scope, list: PinnedLink[]): Promise<void> {
  const held = s === 'project' ? await read($, projectLinks) : await read($, sessionLinks)
  if (!changed(held, list)) return
  if (s === 'project') await update($, projectLinks, () => list)
  else await update($, sessionLinks, () => list)
  void ensureFavicons($, list.map(l => l.url))
}

/** A scope's pins as the store holds them: the store, not this session, is the truth. */
async function pinsOf($: Engine, s: Scope): Promise<PinnedLink[]> {
  return asLinks(await $.store.get(await storeKey($, s)))
}

async function savePins($: Engine, s: Scope, list: PinnedLink[]): Promise<void> {
  await $.store.set(await storeKey($, s), list)
  await setPins($, s, list)
}

function asSort(value: unknown): LinkSort | null {
  if (typeof value !== 'object' || value === null) return null
  const { by, dir } = value as Record<string, unknown>
  return (by === 'title' || by === 'url') && (dir === 'asc' || dir === 'desc') ? { by, dir } : null
}

async function loadPins($: Engine): Promise<void> {
  for (const s of ['project', 'session'] as const) await setPins($, s, await pinsOf($, s))
  const stored = {
    project: asSort(await $.store.get(`sort:${await storeKey($, 'project')}`)),
    session: asSort(await $.store.get(`sort:${await storeKey($, 'session')}`)),
  }
  if (changed(await read($, sorts), stored)) await update($, sorts, () => stored)
}

async function refreshRecent($: Engine): Promise<void> {
  const messages = await $.session.messages()
  if ('deny' in messages) return
  const links = recentLinks(messages)
  if (changed(await read($, recent), links)) await update($, recent, () => links)
  void ensureFavicons($, links.map(l => l.url))
}

/** The desktop's settings file: its `locale` is the interface language. */
async function loadLang($: Engine): Promise<Lang> {
  let found: Lang = langOf((await $.env.get('LANG')) ?? undefined)
  try {
    const path = `${(await $.env.get('HOME')) ?? ''}/Library/Application Support/Claude/config.json`
    // The file holds other things (encrypted tokens among them): grep hands back
    // the one `"locale": "…"` pair and nothing else reaches the mod.
    const grep = await $.process.run(['grep', '-o', '-m', '1', '"locale"[[:space:]]*:[[:space:]]*"[^"]*"', path])
    const locale = /"locale"\s*:\s*"([^"]*)"/.exec(grep.stdout)?.[1]
    if (locale !== undefined) found = langOf(locale)
  } catch {
    // No desktop app: the shell's language stands.
  }
  if (found !== (await read($, lang))) await update($, lang, () => found)
  return found
}

// ── Favicons ────────────────────────────────────────────────────────────────

const fetching = new Set<string>()

type StoredFavicon = { uri: string; at: number }

function asStoredFavicon(value: unknown): StoredFavicon | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  return typeof v.uri === 'string' && typeof v.at === 'number' ? { uri: v.uri, at: v.at } : null
}

/** A page fetched past this is cut: its head is what is read. */
const MAX_PAGE_BYTES = 3_000_000

async function tempPath($: Engine, name: string): Promise<string> {
  const dir = ((await $.env.get('TMPDIR')) ?? '/tmp/').replace(/\/?$/, '/')
  return `${dir}links-bar-${name.replace(/[^\w.-]/g, '_').slice(0, 80)}`
}

/** Pages read this load, by URL: a favicon and a title are read off one fetch. */
const pages = new Map<string, Promise<PageMeta | null>>()

/** Fetches a page with curl and reads its title and declared icons; null when it does not answer. */
function fetchPage($: Engine, url: string): Promise<PageMeta | null> {
  const known = pages.get(url)
  if (known !== undefined) return known
  const loading = (async () => {
    try {
      const tmp = await tempPath($, `page-${url}.html`)
      const got = await $.process.run(
        ['curl', '-sL', '--max-time', '8', '--max-filesize', String(MAX_PAGE_BYTES), '-o', tmp, '-w', '%{http_code} %{url_effective}', url],
        { timeoutMs: 12_000 },
      )
      const [code, effective] = got.stdout.trim().split(' ')
      if (got.exitCode !== 0 || code !== '200') return null
      return parseHead(await $.fs.read(tmp), effective ?? url)
    } catch {
      return null
    }
  })()
  pages.set(url, loading)
  return loading
}

/** Downloads one picture with curl; a data URI when it is a small image, else null. */
async function fetchImage($: Engine, source: string, tmp: string): Promise<string | null> {
  try {
    const got = await $.process.run(
      ['curl', '-sL', '--max-time', '6', '--max-filesize', String(MAX_FAVICON_BYTES), '-o', tmp, '-w', '%{http_code} %{content_type}', source],
      { timeoutMs: 10_000 },
    )
    const [code, ...type] = got.stdout.trim().split(' ')
    const mime = faviconMime(type.join(' '))
    if (got.exitCode !== 0 || code !== '200' || mime === null) return null
    const stat = await $.fs.stat(tmp)
    if (stat.size === 0 || stat.size > MAX_FAVICON_BYTES) return null
    const { base64 } = await $.fs.read(tmp, { as: 'bytes' })
    return `data:${mime};base64,${base64}`
  } catch {
    // curl missing, a timeout, an unreadable file.
    return null
  }
}

/**
 * A link's favicon: the icons its page declares (`<link rel="icon">`, SVG
 * first), then the site's /favicon.ico, then, for a public host, Google's
 * favicon service. curl writes each picture to the temp folder.
 */
async function fetchFavicon($: Engine, url: string, host: string): Promise<string | null> {
  const page = await fetchPage($, url)
  const sources = [...(page?.icons ?? []), `${new URL(url).origin}/favicon.ico`]
  if (!isPrivateHost(host)) {
    sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`)
  }
  const tmp = await tempPath($, `${host}.icon`)
  for (const source of sources) {
    const uri = await fetchImage($, source, tmp)
    if (uri !== null) return uri
  }
  return null
}

async function loadFavicon($: Engine, url: string, host: string): Promise<void> {
  // v2: favicons read off the page's head; the first cache held none for such sites.
  const key = `favicon2:${host}`
  const stored = asStoredFavicon(await $.store.get(key))
  const now = await $.clock.now()
  let uri: string | null
  if (stored !== null && (stored.uri !== '' || now - stored.at < FAVICON_RETRY_MS)) {
    uri = stored.uri === '' ? null : stored.uri
  } else {
    uri = await fetchFavicon($, url, host)
    await $.store.set(key, { uri: uri ?? '', at: now })
  }
  await update($, favicons, f => ({ ...f, [host]: uri }))
}

async function ensureFavicons($: Engine, urls: readonly string[]): Promise<void> {
  const known = await read($, favicons)
  for (const url of urls) {
    const host = hostOf(url)
    if (host === '' || host in known || fetching.has(host)) continue
    fetching.add(host)
    void loadFavicon($, url, host).finally(() => fetching.delete(host))
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────

async function openUrl($: Engine, url: string): Promise<void> {
  const { exitCode, stderr } = await $.process.run(['open', url])
  if (exitCode !== 0) $.ui.toast(t(await read($, lang), 'openFailed', { error: stderr.trim() || url }))
}

async function setScope($: Engine, s: Scope): Promise<void> {
  await $.store.set('scope', s)
  await update($, scope, () => s)
}

/** `+`: opens the add form under the bar, empty and set to the bar's scope, or closes it. */
async function toggleAdd($: Engine): Promise<void> {
  const sc = await read($, scope)
  await update($, draft, now => ({ ...EMPTY_DRAFT, scope: sc, rev: now.rev + 1 }))
  await update($, section, now => (now === 'add' ? null : 'add'))
}

/** «All»: opens the side pane, or closes it when it is open. */
async function togglePane($: Engine): Promise<void> {
  if ((await $.ui.panes()).some(pane => pane.id === PANE)) {
    await $.ui.close({ id: PANE })
    await update($, paneOpen, () => false)
    return
  }
  await update($, section, () => null)
  const opened = await $.ui.open({
    id: PANE,
    title: t(await read($, lang), 'allTitle'),
    focus: true,
    closeOnEscape: true,
    columns: 64,
  })
  await update($, paneOpen, () => opened.isPlaced)
}

/**
 * Pins `link` to scope `s`, at the end; with `edit`, replaces that pin (in
 * place when the scope stays). False when the scope already holds the URL.
 */
async function pin(
  $: Engine,
  s: Scope,
  link: PinnedLink,
  edit: Draft['edit'] = null,
): Promise<boolean> {
  const l = await read($, lang)
  const already = () => {
    $.ui.toast(t(l, s === 'project' ? 'alreadyProject' : 'alreadySession'))
    return false
  }
  let list = await pinsOf($, s)
  if (edit !== null) {
    const from = (await pinsOf($, edit.scope)).filter((_, j) => j !== edit.index)
    if (edit.scope === s) {
      if (from.some(p => p.url === link.url)) return already()
      from.splice(edit.index, 0, link)
      await savePins($, s, from)
      return true
    }
    if (list.some(p => p.url === link.url)) return already()
    await savePins($, edit.scope, from)
    list = await pinsOf($, s)
  } else if (list.some(p => p.url === link.url)) {
    return already()
  }
  const next = [...list, link]
  await savePins($, s, next)
  if (link.title === '') void fillTitle($, s, link.url)
  $.ui.toast(
    next.length > BAR_LINKS
      ? t(l, 'pinnedHidden', { max: BAR_LINKS })
      : t(l, s === 'project' ? 'pinnedProject' : 'pinnedSession', { name: labelOf(link) }),
  )
  return true
}

/** A pin made with no name takes its page's title, unless a name was given meanwhile. */
async function fillTitle($: Engine, s: Scope, url: string): Promise<void> {
  const title = (await fetchPage($, url))?.title.slice(0, 120) ?? ''
  if (title === '') return
  const list = await pinsOf($, s)
  const i = list.findIndex(p => p.url === url && p.title === '')
  if (i < 0) return
  await savePins($, s, list.map((p, j) => (j === i ? { url, title } : p)))
}

async function unpin($: Engine, s: Scope, index: number): Promise<void> {
  await savePins($, s, (await pinsOf($, s)).filter((_, j) => j !== index))
}

async function moveTo($: Engine, s: Scope, from: number, to: number): Promise<void> {
  if (from === to) return
  await savePins($, s, move(await pinsOf($, s), from, to - from))
}

/** A header's «Name» / «Link»: sorts the list A→Z, or Z→A when it already stands A→Z. */
async function sortBy($: Engine, s: Scope, by: SortBy): Promise<void> {
  const list = await pinsOf($, s)
  // The pressed sort pressed again reverses; any other press starts A→Z.
  const now = (await read($, sorts))[s]
  const isLit = now !== null && now.by === by && sortedAs(list, by) === now.dir
  const next: LinkSort = { by, dir: isLit && now.dir === 'asc' ? 'desc' : 'asc' }
  await savePins($, s, sortLinks(list, by, next.dir))
  await $.store.set(`sort:${await storeKey($, s)}`, next)
  await update($, sorts, all => ({ ...all, [s]: next }))
}

/** Rows an entry of the «All» pane takes with the gap after it: name, URL, gap. */
const PANE_ENTRY_ROWS = 3

/** The bar's chip widths as last drawn: where a dragged chip lands is read off them. */
let barWidths: number[] = []

/** A drag handle reports: a press starts a drag, moves aim it, the release drops it. */
async function onDrag($: Engine, element: string, data: unknown): Promise<void> {
  const m = /^drag-(bar|pane)-(project|session)-(\d+)$/.exec(element)
  if (m === null || typeof data !== 'object' || data === null) return
  const where = m[1] as Drag['where']
  const s = m[2] as Scope
  const from = Number(m[3])
  const { kind, dx = 0, dy = 0 } = data as { kind?: string; dx?: number; dy?: number }
  const count = (s === 'project' ? await read($, projectLinks) : await read($, sessionLinks)).length
  const to = where === 'bar' ? dropIndexX(from, dx, barWidths) : dropIndexY(from, dy, count, PANE_ENTRY_ROWS)
  if (kind === 'start' || kind === 'move') {
    const next: Drag = { where, scope: s, from, to }
    if (changed(await read($, drag), next)) await update($, drag, () => next)
    return
  }
  if (kind === 'drop') {
    await update($, drag, () => null)
    await moveTo($, s, from, to)
  }
}

async function closeDraft($: Engine): Promise<void> {
  await update($, draft, now => ({ ...EMPTY_DRAFT, rev: now.rev + 1 }))
  await update($, section, () => null)
}

async function submitDraft($: Engine, patch: Partial<Draft>): Promise<void> {
  const d = { ...(await read($, draft)), ...patch }
  const url = normalizeUrl(d.url)
  if (url === null) {
    $.ui.toast(t(await read($, lang), 'badUrl', { url: d.url.trim() || '—' }))
    return
  }
  if (await pin($, d.scope, { url, title: d.title.trim() }, d.edit)) await closeDraft($)
}

/** ✎ in the pane: the form opens under that row, filled in. */
async function editPin($: Engine, s: Scope, index: number, link: PinnedLink): Promise<void> {
  await update($, section, () => null)
  await update($, draft, now =>
    now.edit?.scope === s && now.edit.index === index
      ? { ...EMPTY_DRAFT, rev: now.rev + 1 }
      : { url: link.url, title: link.title, scope: s, edit: { scope: s, index }, rev: now.rev + 1 },
  )
}

/** ✎ in «Recent»: the form under the bar opens on that pin, filled in. */
async function renamePin($: Engine, s: Scope, index: number): Promise<void> {
  const link = (await pinsOf($, s))[index]
  if (link === undefined) return
  await update($, draft, now => ({ url: link.url, title: link.title, scope: s, edit: { scope: s, index }, rev: now.rev + 1 }))
  await update($, section, () => 'add')
}

// ── Drawing ─────────────────────────────────────────────────────────────────

const PANE = 'links-bar'

function isEmptyTree(tree: RenderElement | null | undefined): boolean {
  if (tree == null) return true
  return tree.type === 'Box' && (tree.children === undefined || tree.children.length === 0)
}

type Kit = {
  Box: Elements['desktop']['Box']
  Text: Elements['desktop']['Text']
  Button: Elements['desktop']['Button']
  Svg?: Elements['desktop']['Svg']
  Input?: Elements['desktop']['Input']
  Client?: Elements['desktop']['Client']
  /** The desktop's rows start transparent, so a hover has a color to paint over. */
  base: { backgroundColor?: string }
  hover: string
  /** A Button inside a hovered row: the row's fill is enough. */
  quiet: { hover?: { backgroundColor: string } }
  /** A pane entry's frame: on the desktop a thin rounded grey border, so its hover fill is rounded too. */
  card: { borderStyle?: string; borderColor?: string; paddingX?: number }
  icons: Record<string, string | null>
}

function kitOf(els: ReturnType<EngineInterface['ui']['resolve']>, surface: string, icons: Kit['icons']): Kit {
  const isTerminal = surface === 'terminal'
  return {
    Box: els.Box,
    Text: els.Text,
    Button: els.Button,
    ...('Svg' in els ? { Svg: els.Svg } : {}),
    ...('Input' in els ? { Input: els.Input } : {}),
    ...('Client' in els ? { Client: els.Client } : {}),
    base: isTerminal ? {} : { backgroundColor: 'transparent' },
    hover: isTerminal ? 'userMessageBackground' : 'rgba(128, 128, 128, 0.14)',
    quiet: isTerminal ? {} : { hover: { backgroundColor: 'transparent' } },
    card: isTerminal ? {} : { borderStyle: 'round', borderColor: 'inactive', paddingX: 1 },
    icons,
  }
}

function linkIcon(k: Kit, url: string) {
  if (k.Svg === undefined) return null
  const { Svg } = k
  const host = hostOf(url)
  return <Svg source={faviconSvg(k.icons[host], host)} alt={host} width={ICON_BOX} height={ICON_BOX} />
}

/** A drag handle: a Client that reports the pointer's moves; nothing where the surface has none. */
function dragHandle(k: Kit, key: string, isDragging: boolean, width = 2) {
  if (k.Client === undefined) return null
  const { Client } = k
  return <Client key={key} module="./drag-handle.tsx" props={{ glyph: '⠿', isDragging }} width={width} height={1} />
}

/**
 * A link's entry in the pane: favicon, name (opens it), ✎ and ✕ on the first
 * line; the URL across the whole second line, cut at its end, shown whole in a
 * card under the pointer. On the desktop the entry is a rounded card that
 * lights under the pointer.
 */
function linkRow(
  $: Engine,
  k: Kit,
  key: string,
  link: PinnedLink,
  width: number,
  actions: RenderChildren,
  isDim = false,
  handle: RenderChildren = null,
  isTarget = false,
) {
  const { Box, Text, Button } = k
  const fill = isTarget ? 'userMessageBackground' : undefined
  return (
    <Box
      key={key}
      flexDirection="row"
      columnGap={1}
      {...k.card}
      {...(fill !== undefined ? { backgroundColor: fill } : k.base)}
      hover={{ backgroundColor: fill ?? k.hover }}
    >
      <Box flexDirection="column" alignItems="center" flexShrink={0} width={3}>
        {linkIcon(k, link.url)}
        {handle}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1}>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Button
              key={`${key}-open`}
              label={truncate(labelOf(link), width, false)}
              plain
              {...(isDim ? { dimColor: true } : {})}
              {...k.quiet}
              onPress={() => void openUrl($, link.url)}
            />
          </Box>
          <Box flexDirection="row" alignItems="center" flexShrink={0} columnGap={1}>
            {actions}
          </Box>
        </Box>
        {/* A Button as the name is: the same inset, so both start at one edge. */}
        <Box key={`${key}-url`} position="relative" minWidth={0}>
          <Button
            key={`${key}-url-open`}
            label={truncate(shortUrl(link.url), width + 6)}
            plain
            dimColor
            {...k.quiet}
            onPress={() => void openUrl($, link.url)}
          />
          <Box
            position="absolute"
            top={1}
            left={0}
            display="none"
            hover={{ display: 'flex' }}
            paddingX={1}
            borderStyle="round"
            borderColor="inactive"
            backgroundColor="userMessageBackground"
          >
            <Text>{link.url}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

/** The text fields the mod draws: a field's key is where its posts go. */
const FIELDS = ['search', 'draft-title', 'draft-url'] as const

/**
 * The add / edit form: name, link, Project / Session, Cancel, Save. Under the
 * bar it is one row across the band; in the pane (`isNarrow`) the fields take
 * a row each, the choice and the buttons the last. The fields are the mod's
 * own (text-field.tsx), so they stretch; where a surface has no Client, Input.
 */
function draftForm($: Engine, k: Kit, d: Draft, l: Lang, active: string | null, isNarrow = false) {
  const { Box, Button, Input, Client } = k
  const field = (key: 'draft-title' | 'draft-url', grow: number) => {
    const value = key === 'draft-title' ? d.title : d.url
    const placeholder = t(l, key === 'draft-title' ? 'titlePlaceholder' : 'urlPlaceholder')
    if (Client !== undefined) {
      return (
        <Client
          key={key}
          width={isNarrow ? '100%' : `${grow}%`}
          module="./text-field.tsx"
          props={{ value, placeholder, isActive: active === key, icon: '', rev: d.rev }}
        />
      )
    }
    return Input === undefined ? null : (
      <Input
        key={key}
        placeholder={placeholder}
        value={value}
        onInput={text => void update($, draft, now => (key === 'draft-title' ? { ...now, title: text } : { ...now, url: text }))}
        onSubmit={text => void submitDraft($, key === 'draft-title' ? { title: text } : { url: text })}
      />
    )
  }
  // One height for both: the chosen scope is the desktop's own button, the other dim.
  const scopes = (
    <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
      {(['project', 'session'] as const).map(s => (
        <Button
          key={`draft-${s}`}
          label={t(l, s)}
          {...(d.scope === s ? {} : { dimColor: true })}
          onPress={() => void update($, draft, now => ({ ...now, scope: s }))}
        />
      ))}
    </Box>
  )
  const buttons = (
    <Box flexDirection="row" alignItems="center" justifyContent="flex-end" columnGap={1} flexShrink={0}>
      <Button key="draft-cancel" label={t(l, 'cancel')} onPress={() => void closeDraft($)} />
      <Button key="draft-save" label={t(l, 'saveEdit')} variant="primary" onPress={() => void submitDraft($, {})} />
    </Box>
  )
  if (isNarrow) {
    return (
      <Box flexDirection="column" alignItems="stretch" rowGap={1}>
        {field('draft-title', 1)}
        {field('draft-url', 1)}
        <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1} flexWrap="wrap">
          {scopes}
          {buttons}
        </Box>
      </Box>
    )
  }
  return (
    <Box flexDirection="row" alignItems="center" columnGap={1}>
      {field('draft-title', 28)}
      {field('draft-url', 38)}
      {scopes}
      {buttons}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // A form left open by the last load starts closed: the band always draws.
    await update($, section, () => null)
    await update($, draft, now => ({ ...EMPTY_DRAFT, rev: now.rev + 1 }))
    await loadLang($)
    const stored = await $.store.get('scope')
    if (stored === 'project' || stored === 'session') await update($, scope, () => stored)
    await loadPins($)
    void refreshRecent($)
    $.clock.every(SYNC_MS, () => void loadPins($))
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const result = await next(e)
    $.clock.after(500, () => void refreshRecent($))
    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) void refreshRecent($)
    return next(e)
  })

  // The pane's close mark or Escape closes it too: «All» lights only while it is open.
  on('ui.message', async ($, e, next) => {
    if (e.module.endsWith('drag-handle.tsx')) await onDrag($, e.element, e.data)
    if (e.module.endsWith('text-field.tsx') && typeof e.data === 'object' && e.data !== null) {
      const { kind, value } = e.data as { kind?: string; value?: unknown }
      const text = typeof value === 'string' ? value : null
      if (kind === 'focus' || kind === 'change') await update($, activeField, () => e.element)
      if (e.element === 'search' && text !== null) await update($, search, () => text)
      if (e.element === 'draft-title' && text !== null) await update($, draft, now => ({ ...now, title: text }))
      if (e.element === 'draft-url' && text !== null) await update($, draft, now => ({ ...now, url: text }))
      if (kind === 'submit' && e.element !== 'search') await submitDraft($, {})
    }
    return next(e)
  })

  // The ring moving to another element takes the keys from the mod's fields.
  on('ui.focus', async ($, e, next) => {
    if (!FIELDS.some(f => f === e.element)) await update($, activeField, () => null)
    return next(e)
  })

  on('ui.close', async ($, e, next) => {
    const result = await next(e)
    if (e.id === PANE) await update($, paneOpen, () => false)
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band is one site: what the plugins beneath draw (project tabs, say)
    // stays, and the links row goes under it.
    const below = await next(e)
    if (e.props.hasSurvey) return below

    const [rec, pLinks, sLinks, sc, sec, d, icons, l, isPaneOpen, dragged, typing] = await Promise.all([
      read($, recent),
      read($, projectLinks),
      read($, sessionLinks),
      read($, scope),
      read($, section),
      read($, draft),
      read($, favicons),
      read($, lang),
      read($, paneOpen),
      read($, drag),
      read($, activeField),
    ])
    const k = kitOf($.ui.resolve(e), e.surface, icons)
    const { Box, Text, Button } = k
    const budget = labelBudget(e.props.bodyColumns)
    const barDrag = dragged?.where === 'bar' && dragged.scope === sc ? dragged : null

    const links = sc === 'project' ? pLinks : sLinks
    const onBar = links.slice(0, BAR_LINKS)
    // Read back by a drop on the bar (a module variable: a drawing writes no state).
    barWidths = onBar.map(link => chipWidth(truncate(labelOf(link), budget)) + 2)
    const total = pLinks.length + sLinks.length

    const scopeSwitch = (
      <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
        {/* The chosen scope is the desktop's own (rounded) button; the other one is
            plain and dim. A Box fill behind a button draws square corners. */}
        {(['project', 'session'] as const).map(s =>
          s === sc ? (
            <Button key={`scope-${s}`} label={t(l, s)} onPress={() => void setScope($, s)} />
          ) : (
            <Button key={`scope-${s}`} label={t(l, s)} plain dimColor onPress={() => void setScope($, s)} />
          ),
        )}
      </Box>
    )

    const chips =
      onBar.length === 0 ? (
        <Text dimColor wrap="truncate">
          {t(l, sc === 'project' ? 'emptyProject' : 'emptySession')}
        </Text>
      ) : (
        onBar.map((link, i) => {
          const name = labelOf(link)
          const shown = truncate(name, budget)
          const isMoving = barDrag?.from === i
          const isTarget = barDrag !== null && barDrag.to === i && barDrag.from !== i
          const handle = dragHandle(k, `drag-bar-${sc}-${i}`, isMoving)
          return (
            <Box
              key={`chip-${i}`}
              position="relative"
              flexDirection="row"
              alignItems="center"
              flexShrink={0}
              {...(isTarget ? { backgroundColor: 'userMessageBackground' } : k.base)}
              hover={{ backgroundColor: isTarget ? 'userMessageBackground' : k.hover }}
            >
              {/* Drag the handle along the bar to move the link. */}
              {handle}
              {linkIcon(k, link.url)}
              <Button key={`open-${i}`} label={shown} plain {...k.quiet} onPress={() => void openUrl($, link.url)} />
              {shown !== name && (
                <Box
                  position="absolute"
                  bottom={2}
                  left={0}
                  display="none"
                  hover={{ display: 'flex' }}
                  flexDirection="column"
                  minWidth={Math.min(64, Math.max([...name].length, shortUrl(link.url).length) + 4)}
                  paddingX={1}
                  borderStyle="round"
                  borderColor="inactive"
                  backgroundColor="userMessageBackground"
                >
                  <Text>{name}</Text>
                  <Text dimColor wrap="truncate">
                    {shortUrl(link.url)}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })
      )

    // «Recent» as a tab's recent sessions in the tabs mod: hovering the button
    // shows the list above it, sized to its rows; the pointer may move into it.
    const recentWidth = Math.max(16, Math.min(40, Math.floor(e.props.bodyColumns / 3)))
    // Two columns, «Project» and «Session», named once in the header: 📌 pins the
    // link there, ✓ says it is pinned there and unpins it; ✎ renames a pinned one.
    // Every row is as wide as the header: the name has a column of its own, so the
    // marks stand under their titles whatever the name's length.
    const columnWidth = Math.max([...t(l, 'project')].length, [...t(l, 'session')].length) + 3
    // The window's width is set, not left to its rows, and it fits the band: its
    // right edge at the button's, it opens leftward over the bar.
    const columnsWidth = 2 * columnWidth + 3
    const popupChrome = 2 + 2 + 2
    const nameWidth = Math.max(12, Math.min(recentWidth + 4, e.props.bodyColumns - 4 - columnsWidth - popupChrome))
    const popupWidth = nameWidth + columnsWidth + popupChrome
    const recentButtonWidth = [...t(l, 'recent')].length + 4
    const columns = (cells: [RenderChildren, RenderChildren, RenderChildren]) => (
      <Box flexDirection="row" alignItems="center" flexShrink={0}>
        <Box width={columnWidth} justifyContent="center">
          {cells[0]}
        </Box>
        <Box width={columnWidth} justifyContent="center">
          {cells[1]}
        </Box>
        <Box width={3} justifyContent="center">
          {cells[2]}
        </Box>
      </Box>
    )
    const recentList = (
      <Box
        position="absolute"
        bottom={2}
        left={recentButtonWidth - popupWidth}
        width={popupWidth}
        display="none"
        hover={{ display: 'flex' }}
        flexDirection="column"
        paddingX={1}
        borderStyle="round"
        borderColor="inactive"
        backgroundColor="userMessageBackground"
      >
        <Box flexDirection="row" alignItems="center" columnGap={2}>
          <Box width={nameWidth} flexShrink={0} overflow="hidden">
            <Text dimColor wrap="truncate">
              {t(l, 'recentTitle')}
            </Text>
          </Box>
          {rec.length > 0 &&
            columns([
              <Text dimColor>{t(l, 'project')}</Text>,
              <Text dimColor>{t(l, 'session')}</Text>,
              null,
            ])}
        </Box>
        {rec.length === 0 && <Text dimColor>{t(l, 'recentEmpty')}</Text>}
        {rec.map((link, i) => {
          const projectIndex = pLinks.findIndex(p => p.url === link.url)
          const sessionIndex = sLinks.findIndex(p => p.url === link.url)
          const pinCell = (s: Scope, index: number) =>
            index >= 0 ? (
              <Button key={`recent-${s}-${i}`} label="✓" plain onPress={() => void unpin($, s, index)} />
            ) : (
              <Button key={`recent-${s}-${i}`} label="📌" plain dimColor onPress={() => void pin($, s, link)} />
            )
          // Rename the pin the bar shows now, else the other one.
          const editable: [Scope, number] | null =
            (sc === 'session' ? sessionIndex : projectIndex) >= 0
              ? [sc, sc === 'session' ? sessionIndex : projectIndex]
              : projectIndex >= 0
                ? ['project', projectIndex]
                : sessionIndex >= 0
                  ? ['session', sessionIndex]
                  : null
          return (
            <Box flexDirection="row" alignItems="center" columnGap={2}>
              <Box width={nameWidth} flexShrink={0} flexDirection="row" alignItems="center" columnGap={1} overflow="hidden">
                {linkIcon(k, link.url)}
                <Button
                  key={`recent-${i}-open`}
                  label={truncate(labelOf(link), nameWidth - 4, false)}
                  plain
                  onPress={() => void openUrl($, link.url)}
                />
              </Box>
              {columns([
                pinCell('project', projectIndex),
                pinCell('session', sessionIndex),
                editable !== null ? (
                  <Button
                    key={`recent-edit-${i}`}
                    label="✎"
                    plain
                    dimColor
                    onPress={() => void renamePin($, editable[0], editable[1])}
                  />
                ) : null,
              ])}
            </Box>
          )
        })}
      </Box>
    )

    const bar = (
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1}>
        <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={1}>
          {scopeSwitch}
          {chips}
          <Box key="add-box" flexShrink={0}>
            <Button
              key="add"
              label="+"
              {...(sec === 'add' ? { variant: 'primary' as const } : {})}
              onPress={() => void toggleAdd($)}
            />
          </Box>
        </Box>
        <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
          <Box key="recent-anchor" position="relative" flexShrink={0}>
            <Button key="recent" label={t(l, 'recent')} onPress={() => void refreshRecent($)} />
            {recentList}
          </Box>
          <Button
            key="all"
            label={total > 0 ? `${t(l, 'all')} · ${total}` : t(l, 'all')}
            {...(isPaneOpen ? { variant: 'primary' as const } : {})}
            onPress={() => void togglePane($)}
          />
        </Box>
      </Box>
    )

    const mine =
      sec === 'add' ? (
        <Box flexDirection="column" rowGap={1}>
          {bar}
          {draftForm($, k, d, l, typing)}
        </Box>
      ) : (
        bar
      )
    return isEmptyTree(below) ? mine : (
      <Box flexDirection="column" rowGap={1}>
        {below}
        {mine}
      </Box>
    )
  })

  // «All»: every pinned link of the project and the session, in a side pane:
  // search, sort by name or link, drag by the handle, rename, move, unpin.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [pLinks, sLinks, d, icons, l, query, dragged, typingIn, pressed] = await Promise.all([
      read($, projectLinks),
      read($, sessionLinks),
      read($, draft),
      read($, favicons),
      read($, lang),
      read($, search),
      read($, drag),
      read($, activeField),
      read($, sorts),
    ])
    const k = kitOf($.ui.resolve(e), e.surface, icons)
    const { Box, Text, Button, Input, Client } = k
    // A field of the pane holds the keys only while the pane has the focus.
    const isTyping = e.props.isFocused ? typingIn : null
    // The name has its line to itself, the URL and the buttons the next one.
    const width = Math.max(16, e.props.bodyColumns - 14)
    const isSearching = query.trim() !== ''
    const groups: [Scope, PinnedLink[], string][] = [
      ['project', pLinks, t(l, 'project')],
      ['session', sLinks, t(l, 'sessionSection')],
    ]

    const sortButton = (s: Scope, list: PinnedLink[], by: SortBy) => {
      // Only the pressed sort lights, and only while the list stands in its order
      // (a drag undoes it); two lists may stand sorted both ways at once.
      const sort = pressed[s]
      const dir = sort !== null && sort.by === by && sortedAs(list, by) === sort.dir ? sort.dir : null
      const label = t(l, by === 'title' ? 'byTitle' : 'byUrl')
      // Both are the desktop's own button, so lighting one moves nothing: the
      // pressed sort is primary (lit as «All» is), the other dim. The arrow is
      // the order: ↓ A→Z, what a press gives first; ↑ Z→A.
      return (
        <Button
          key={`sort-${s}-${by}`}
          label={`${label} ${dir === 'desc' ? '↑' : '↓'}`}
          {...(dir === null ? { dimColor: true } : { variant: 'primary' as const })}
          onPress={() => void sortBy($, s, by)}
        />
      )
    }

    return (
      <Box flexDirection="column" rowGap={1}>
        {Client !== undefined ? (
          <Client
            key="search"
            module="./text-field.tsx"
            props={{ value: query, placeholder: t(l, 'search'), isActive: isTyping === 'search', icon: '🔍', rev: 0 }}
            width="100%"
          />
        ) : (
          Input !== undefined && (
            <Input
              key="search"
              placeholder={t(l, 'search')}
              value={query}
              onInput={value => void update($, search, () => value)}
              onSubmit={value => void update($, search, () => value)}
            />
          )
        )}
        {groups.map(([s, list, title]) => {
          const shown = list.map((link, i) => ({ link, i })).filter(({ link }) => matches(link, query))
          const paneDrag = dragged?.where === 'pane' && dragged.scope === s ? dragged : null
          // Dragging needs the whole list in its place: not while searching or editing.
          const canDrag = !isSearching && d.edit === null && list.length > 1
          return (
            <Box key={`group-${s}`} flexDirection="column" rowGap={1}>
              <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1}>
                <Text bold wrap="truncate-end">{`${title} (${list.length})`}</Text>
                {list.length > 1 && (
                  <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
                    {sortButton(s, list, 'title')}
                    {sortButton(s, list, 'url')}
                  </Box>
                )}
              </Box>
              {list.length === 0 && <Text dimColor>{t(l, 'none')}</Text>}
              {list.length > 0 && shown.length === 0 && <Text dimColor>{t(l, 'noMatches')}</Text>}
              {shown.map(({ link, i }) => {
                const isEdited = d.edit?.scope === s && d.edit.index === i
                const row = linkRow(
                  $,
                  k,
                  `all-${s}-${i}`,
                  link,
                  width,
                  [
                    <Button key={`all-edit-${s}-${i}`} label="✎" plain onPress={() => void editPin($, s, i, link)} />,
                    <Button key={`all-unpin-${s}-${i}`} label="✕" plain onPress={() => void unpin($, s, i)} />,
                  ],
                  i >= BAR_LINKS,
                  // One cell wide, so the column centres it under the favicon.
                  canDrag ? dragHandle(k, `drag-pane-${s}-${i}`, paneDrag?.from === i, 1) : null,
                  paneDrag !== null && paneDrag.to === i && paneDrag.from !== i,
                )
                return isEdited ? (
                  <Box key={`all-edit-box-${s}-${i}`} flexDirection="column" rowGap={1}>
                    {row}
                    <Box
                      flexDirection="column"
                      alignItems="stretch"
                      marginLeft={3}
                      marginBottom={1}
                      paddingX={1}
                      paddingY={1}
                      borderStyle="round"
                      borderColor="inactive"
                    >
                      {draftForm($, k, d, l, isTyping, true)}
                    </Box>
                  </Box>
                ) : (
                  row
                )
              })}
            </Box>
          )
        })}
      </Box>
    )
  })
}
