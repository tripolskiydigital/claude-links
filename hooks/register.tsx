import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register, RenderChildren, RenderElement } from 'claude-code'

import type { Draft, Lang, PinnedLink, Scope } from '../types'
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
  move,
  normalizeUrl,
  recentLinks,
  shortUrl,
  truncate,
} from './lib'

type Engine = EngineInterface

const EMPTY_DRAFT: Draft = { url: '', title: '', scope: 'project', edit: null }

const recent = atom({ plugin: 'links-bar', key: 'recent' } as const, [])
const projectLinks = atom({ plugin: 'links-bar', key: 'projectLinks' } as const, [])
const sessionLinks = atom({ plugin: 'links-bar', key: 'sessionLinks' } as const, [])
const scope = atom({ plugin: 'links-bar', key: 'scope' } as const, 'project')
const section = atom({ plugin: 'links-bar', key: 'section' } as const, null)
const draft = atom({ plugin: 'links-bar', key: 'draft' } as const, EMPTY_DRAFT)
const favicons = atom({ plugin: 'links-bar', key: 'favicons' } as const, {})
const projectName = atom({ plugin: 'links-bar', key: 'projectName' } as const, '')
const lang = atom({ plugin: 'links-bar', key: 'lang' } as const, 'en')
const paneOpen = atom({ plugin: 'links-bar', key: 'paneOpen' } as const, false)

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

async function loadPins($: Engine): Promise<void> {
  for (const s of ['project', 'session'] as const) await setPins($, s, await pinsOf($, s))
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

/**
 * Asks the site for /favicon.ico, then (for a public host) Google's favicon
 * service, which knows the icons a page declares in its HTML. curl writes the
 * picture to the temp folder; it is kept as a data URI.
 */
async function fetchFavicon($: Engine, origin: string, host: string): Promise<string | null> {
  const tmp = `${((await $.env.get('TMPDIR')) ?? '/tmp/').replace(/\/?$/, '/')}links-bar-${host.replace(/[^\w.-]/g, '_')}.icon`
  const sources = [`${origin}/favicon.ico`]
  if (!isPrivateHost(host)) {
    sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`)
  }
  for (const source of sources) {
    try {
      const got = await $.process.run(
        [
          'curl',
          '-sL',
          '--max-time',
          '6',
          '--max-filesize',
          String(MAX_FAVICON_BYTES),
          '-o',
          tmp,
          '-w',
          '%{http_code} %{content_type}',
          source,
        ],
        { timeoutMs: 10_000 },
      )
      const [code, ...type] = got.stdout.trim().split(' ')
      const mime = faviconMime(type.join(' '))
      if (got.exitCode !== 0 || code !== '200' || mime === null) continue
      const stat = await $.fs.stat(tmp)
      if (stat.size === 0 || stat.size > MAX_FAVICON_BYTES) continue
      const { base64 } = await $.fs.read(tmp, { as: 'bytes' })
      return `data:${mime};base64,${base64}`
    } catch {
      // curl missing, a timeout, an unreadable file: try the next source.
    }
  }
  return null
}

async function loadFavicon($: Engine, url: string, host: string): Promise<void> {
  const key = `favicon:${host}`
  const stored = asStoredFavicon(await $.store.get(key))
  const now = await $.clock.now()
  let uri: string | null
  if (stored !== null && (stored.uri !== '' || now - stored.at < FAVICON_RETRY_MS)) {
    uri = stored.uri === '' ? null : stored.uri
  } else {
    uri = await fetchFavicon($, new URL(url).origin, host)
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
  await update($, draft, () => ({ ...EMPTY_DRAFT, scope: sc }))
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
  $.ui.toast(
    next.length > BAR_LINKS
      ? t(l, 'pinnedHidden', { max: BAR_LINKS })
      : t(l, s === 'project' ? 'pinnedProject' : 'pinnedSession', { name: labelOf(link) }),
  )
  return true
}

async function unpin($: Engine, s: Scope, index: number): Promise<void> {
  await savePins($, s, (await pinsOf($, s)).filter((_, j) => j !== index))
}

async function reorder($: Engine, s: Scope, index: number, delta: number): Promise<void> {
  await savePins($, s, move(await pinsOf($, s), index, delta))
}

async function closeDraft($: Engine): Promise<void> {
  await update($, draft, () => EMPTY_DRAFT)
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
      ? EMPTY_DRAFT
      : { url: link.url, title: link.title, scope: s, edit: { scope: s, index } },
  )
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
  /** The desktop's rows start transparent, so a hover has a color to paint over. */
  base: { backgroundColor?: string }
  hover: string
  /** A Button inside a hovered row: the row's fill is enough. */
  quiet: { hover?: { backgroundColor: string } }
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
    base: isTerminal ? {} : { backgroundColor: 'transparent' },
    hover: isTerminal ? 'userMessageBackground' : 'rgba(128, 128, 128, 0.14)',
    quiet: isTerminal ? {} : { hover: { backgroundColor: 'transparent' } },
    icons,
  }
}

function linkIcon(k: Kit, url: string) {
  if (k.Svg === undefined) return null
  const { Svg } = k
  const host = hostOf(url)
  return <Svg source={faviconSvg(k.icons[host], host)} alt={host} width={ICON_BOX} height={ICON_BOX} />
}

/** A link's row in the pane: favicon, name (opens it), its URL dim when it has a name, then `actions`. */
function linkRow(
  $: Engine,
  k: Kit,
  key: string,
  link: PinnedLink,
  width: number,
  actions: RenderChildren,
  isDim = false,
) {
  const { Box, Text, Button } = k
  return (
    <Box
      key={key}
      flexDirection="row"
      alignItems="center"
      justifyContent="space-between"
      columnGap={1}
      {...k.base}
      hover={{ backgroundColor: k.hover }}
    >
      <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={1}>
        {linkIcon(k, link.url)}
        <Button
          key={`${key}-open`}
          label={truncate(labelOf(link), width)}
          plain
          {...(isDim ? { dimColor: true } : {})}
          {...k.quiet}
          onPress={() => void openUrl($, link.url)}
        />
        {link.title !== '' && (
          <Text dimColor wrap="truncate">
            {shortUrl(link.url)}
          </Text>
        )}
      </Box>
      <Box flexDirection="row" flexShrink={0} columnGap={1}>
        {actions}
      </Box>
    </Box>
  )
}

/** The add / edit form: link, name, scope, save. */
function draftForm($: Engine, k: Kit, d: Draft, l: Lang) {
  const { Box, Text, Button, Input } = k
  return (
    <Box flexDirection="column" rowGap={1}>
      {Input !== undefined && (
        <Input
          key="draft-url"
          placeholder={t(l, 'urlPlaceholder')}
          value={d.url}
          autoFocus
          onInput={value => void update($, draft, now => ({ ...now, url: value }))}
          onSubmit={value => void submitDraft($, { url: value })}
        />
      )}
      {Input !== undefined && (
        <Input
          key="draft-title"
          placeholder={t(l, 'titlePlaceholder')}
          value={d.title}
          onInput={value => void update($, draft, now => ({ ...now, title: value }))}
          onSubmit={value => void submitDraft($, { title: value })}
        />
      )}
      <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={1} flexWrap="wrap">
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Text dimColor>{t(l, 'pinTo')}</Text>
          {(['project', 'session'] as const).map(s => (
            <Button
              key={`draft-${s}`}
              label={t(l, s)}
              {...(d.scope === s ? { variant: 'primary' as const } : {})}
              onPress={() => void update($, draft, now => ({ ...now, scope: s }))}
            />
          ))}
        </Box>
        <Box flexDirection="row" alignItems="center" columnGap={1}>
          <Button key="draft-cancel" label={t(l, 'cancel')} onPress={() => void closeDraft($)} />
          <Button
            key="draft-save"
            label={t(l, d.edit !== null ? 'saveEdit' : 'save')}
            variant="primary"
            onPress={() => void submitDraft($, {})}
          />
        </Box>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadLang($)
    const stored = await $.store.get('scope')
    if (stored === 'project' || stored === 'session') await update($, scope, () => stored)
    const root = await $.session.root()
    await update($, projectName, () => root.split('/').filter(Boolean).at(-1) ?? root)
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

    const [rec, pLinks, sLinks, sc, sec, d, icons, l, isPaneOpen] = await Promise.all([
      read($, recent),
      read($, projectLinks),
      read($, sessionLinks),
      read($, scope),
      read($, section),
      read($, draft),
      read($, favicons),
      read($, lang),
      read($, paneOpen),
    ])
    const k = kitOf($.ui.resolve(e), e.surface, icons)
    const { Box, Text, Button } = k
    const budget = labelBudget(e.props.bodyColumns)

    const links = sc === 'project' ? pLinks : sLinks
    const onBar = links.slice(0, BAR_LINKS)
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
          return (
            <Box
              key={`chip-${i}`}
              position="relative"
              flexDirection="row"
              alignItems="center"
              flexShrink={0}
              {...k.base}
              hover={{ backgroundColor: k.hover }}
            >
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
    const recentList = (
      <Box
        position="absolute"
        bottom={2}
        right={0}
        display="none"
        hover={{ display: 'flex' }}
        flexDirection="column"
        minWidth={32}
        paddingX={1}
        borderStyle="round"
        borderColor="inactive"
        backgroundColor="userMessageBackground"
      >
        <Text dimColor>{t(l, 'recentTitle')}</Text>
        {rec.length === 0 && <Text dimColor>{t(l, 'recentEmpty')}</Text>}
        {rec.map((link, i) => {
          const inProject = pLinks.some(p => p.url === link.url)
          const inSession = sLinks.some(p => p.url === link.url)
          return (
            <Box flexDirection="row" alignItems="center" justifyContent="space-between" columnGap={2}>
              <Box flexDirection="row" alignItems="center" columnGap={1}>
                {linkIcon(k, link.url)}
                <Button
                  key={`recent-${i}-open`}
                  label={truncate(labelOf(link), recentWidth)}
                  plain
                  onPress={() => void openUrl($, link.url)}
                />
              </Box>
              <Box flexDirection="row" alignItems="center" columnGap={1} flexShrink={0}>
                <Button
                  key={`recent-project-${i}`}
                  label={inProject ? `✓ ${t(l, 'project')}` : t(l, 'pinProject')}
                  plain
                  dimColor
                  onPress={() => void (inProject || pin($, 'project', link))}
                />
                <Button
                  key={`recent-session-${i}`}
                  label={inSession ? `✓ ${t(l, 'session')}` : t(l, 'pinSession')}
                  plain
                  dimColor
                  onPress={() => void (inSession || pin($, 'session', link))}
                />
              </Box>
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
          {draftForm($, k, d, l)}
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

  // «All»: every pinned link of the project and the session, in a side pane.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [pLinks, sLinks, d, icons, pname, l] = await Promise.all([
      read($, projectLinks),
      read($, sessionLinks),
      read($, draft),
      read($, favicons),
      read($, projectName),
      read($, lang),
    ])
    const k = kitOf($.ui.resolve(e), e.surface, icons)
    const { Box, Text, Button } = k
    const width = Math.max(16, e.props.bodyColumns - 36)
    const groups: [Scope, PinnedLink[], string][] = [
      ['project', pLinks, t(l, 'projectSection', { name: pname })],
      ['session', sLinks, t(l, 'sessionSection')],
    ]

    return (
      <Box flexDirection="column" rowGap={1}>
        <Text dimColor>{t(l, 'barHint', { max: BAR_LINKS })}</Text>
        {groups.map(([s, list, title]) => (
          <Box key={`group-${s}`} flexDirection="column">
            <Text bold>{`${title} · ${list.length}`}</Text>
            {list.length === 0 && <Text dimColor>{t(l, 'none')}</Text>}
            {list.map((link, i) => {
              const isEdited = d.edit?.scope === s && d.edit.index === i
              const row = linkRow(
                $,
                k,
                `all-${s}-${i}`,
                link,
                width,
                [
                  <Button key={`all-up-${s}-${i}`} label="↑" plain onPress={() => void reorder($, s, i, -1)} />,
                  <Button key={`all-down-${s}-${i}`} label="↓" plain onPress={() => void reorder($, s, i, 1)} />,
                  <Button key={`all-edit-${s}-${i}`} label="✎" plain onPress={() => void editPin($, s, i, link)} />,
                  <Button
                    key={`all-move-${s}-${i}`}
                    label={t(l, s === 'project' ? 'moveSession' : 'moveProject')}
                    plain
                    onPress={() =>
                      void pin($, s === 'project' ? 'session' : 'project', link, { scope: s, index: i })
                    }
                  />,
                  <Button key={`all-unpin-${s}-${i}`} label="✕" plain onPress={() => void unpin($, s, i)} />,
                ],
                i >= BAR_LINKS,
              )
              return isEdited ? (
                <Box key={`all-edit-box-${s}-${i}`} flexDirection="column" rowGap={1}>
                  {row}
                  <Box paddingLeft={2} paddingBottom={1}>
                    {draftForm($, k, d, l)}
                  </Box>
                </Box>
              ) : (
                row
              )
            })}
          </Box>
        ))}
      </Box>
    )
  })
}
