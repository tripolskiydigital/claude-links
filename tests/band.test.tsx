import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const BAND = {
  plugin: 'links-bar',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 160 } as never,
} as const

const PINS = Array.from({ length: 6 }, (_, i) => ({ url: `https://site${i}.com/page`, title: i === 0 ? 'A rather long name for the first pinned link' : '' }))

/** Clicks one of the mod's text fields and types into it, key by key. */
async function typeInto(
  ui: { pointer: (e: never) => Promise<void>; key: (e: never) => Promise<void> },
  field: string,
  text: string,
): Promise<void> {
  await ui.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: field } as never)
  for (const key of [...text]) await ui.key({ key: key === ' ' ? 'space' : key, in: field } as never)
}

function stubs(
  on: Parameters<TestBody>[1],
  ran: string[],
  store: Record<string, unknown>,
  below: object = { type: 'Box' },
) {
  mock.env(on, { HOME: '/Users/t', TMPDIR: '/tmp/' })
  mock.store(on, store)
  mock.clock(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  // What is drawn beneath the plugin: the engine's own empty band, unless a test says.
  on('ui.render', { component: 'AbovePrompt' }, () => below as never)
  on('session.root', () => ({ value: '/p/alpha' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.messages', () => ({
    value: [{ role: 'user' as const, text: 'look at [Kan](https://kanban.slavic.digital/b)', toolUses: [] }],
  }))
  on('process.run', ($, e) => {
    ran.push(e.argv.join(' '))
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
}

test('the bar shows four pinned links of the scope and opens one', async ($, on) => {
  const ran: string[] = []
  stubs(on, ran, { 'project:/p/alpha': PINS, scope: 'project' })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'chip-3' })).toBeDefined()
    expect(await ui.find({ key: 'chip-4' })).toBeUndefined()
    // A chip is a button: a press opens its link.
    await ui.press({ key: 'open-1' })
    await ui.unmount()
  }
  expect(ran.filter(r => r.startsWith('open '))).toEqual(['open https://site1.com/page', 'open https://site1.com/page'])
})

test('a recent link pins to the session, a typed one to the project', async ($, on) => {
  const ran: string[] = []
  const opened: string[] = []
  stubs(on, ran, {})
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Nothing pinned yet in either scope.
  expect(await ui.find({ key: 'chip-0' })).toBeUndefined()

  await ui.press({ key: 'recent-session-0' })
  // Pinned there now: the cell is ✓, and a press would unpin it.
  expect(await ui.find({ key: 'recent-edit-0' })).toBeDefined()
  // ✎ opens the form under the bar on that pin; a new name is saved.
  await ui.press({ key: 'recent-edit-0' })
  await typeInto(ui, 'draft-title', ' board')
  await ui.press({ key: 'draft-save' })
  expect(await ui.find({ key: 'draft-save' })).toBeUndefined()

  await ui.press({ key: 'add' })
  await typeInto(ui, 'draft-title', 'Макет')
  await typeInto(ui, 'draft-url', 'figma.com/file/x')
  await ui.press({ key: 'draft-save' })
  // The form closed and the project's bar holds the typed link.
  expect(await ui.find({ key: 'draft-save' })).toBeUndefined()
  expect(await ui.find({ key: 'chip-0' })).toBeDefined()

  await ui.press({ key: 'scope-session' })
  expect(await ui.find({ key: 'chip-0' })).toBeDefined()

  // An entry of «Recent» opens from the list shown over the button.
  await ui.press({ key: 'recent-0-open' })

  // «All» is a side pane.
  await ui.press({ key: 'all' })
  expect(opened).toEqual(['links-bar'])
  await ui.unmount()

  const pane = await $.ui.mount({
    plugin: 'links-bar',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'links-bar',
    props: { title: 'All links', isFocused: true, bodyColumns: 70 } as never,
  })
  expect(await pane.find({ key: 'all-project-0-open' })).toBeDefined()
  expect(await pane.find({ key: 'all-session-0-open' })).toBeDefined()

  // ✎ opens the form under the row; a new name is saved in place.
  await pane.press({ key: 'all-edit-project-0' })
  await typeInto(pane, 'draft-title', ' v2')
  await pane.press({ key: 'draft-save' })
  expect(await pane.find({ key: 'draft-save' })).toBeUndefined()

  // ✕ unpins.
  await pane.press({ key: 'all-unpin-session-0' })
  expect(await pane.find({ key: 'all-session-0-open' })).toBeUndefined()
  await pane.unmount()

  // Opened from the «Recent» list; the bar's chips are Links the app opens.
  expect(ran.filter(r => r.startsWith('open '))).toEqual(['open https://kanban.slavic.digital/b'])
})

test('a row another plugin drew in the band stays above the links', async ($, on) => {
  const ran: string[] = []
  stubs(on, ran, { 'project:/p/alpha': PINS }, { type: 'Box', props: { key: 'tabs-row' }, children: ['project tabs'] })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ key: 'tabs-row' })).toBeDefined()
  expect(await ui.find({ key: 'chip-0' })).toBeDefined()
  await ui.unmount()
})

test('pinned links reorder by dragging in the pane, and sort from the header', async ($, on) => {
  const ran: string[] = []
  stubs(on, ran, { 'project:/p/alpha': PINS.slice(0, 3) })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  const pane = await $.ui.mount({
    plugin: 'links-bar',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'links-bar',
    props: { title: 'All links', isFocused: true, bodyColumns: 70 } as never,
  })
  // Three rows down in the pane (name, URL, gap): one entry down.
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'drag-pane-project-0' })
  await pane.pointer({ type: 'up', x: 0, y: 3, button: 'left', in: 'drag-pane-project-0' })
  await pane.press({ key: 'all-project-0-open' })

  // Sorting by link puts site0, site1, site2 back in order.
  await pane.press({ key: 'sort-project-url' })
  await pane.press({ key: 'all-project-0-open' })

  // The search keeps the pinned links that match.
  await pane.pointer({ type: 'down', x: 2, y: 1, button: 'left', in: 'search' })
  for (const key of [...'site2']) await pane.key({ key, in: 'search' })
  expect(await pane.find({ key: 'all-project-2-open' })).toBeDefined()
  expect(await pane.find({ key: 'all-project-0-open' })).toBeUndefined()
  await pane.unmount()

  expect(ran.filter(r => r.startsWith('open '))).toEqual([
    // Dragged one down: site1 leads; sorted by link: site0 leads again.
    'open https://site1.com/page',
    'open https://site0.com/page',
  ])
})

test('only the pressed sort is lit, though the list stands sorted both ways', async ($, on) => {
  const ran: string[] = []
  // Sorted by name and by link alike.
  stubs(on, ran, { 'project:/p/alpha': [{ url: 'https://a.io', title: 'A' }, { url: 'https://b.io', title: 'B' }] })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)
  const pane = await $.ui.mount({
    plugin: 'links-bar',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'links-bar',
    props: { title: 'All links', isFocused: true, bodyColumns: 70 } as never,
  })
  const variant = async (key: string) => ((await pane.find({ key })) as { props?: { variant?: string } } | undefined)?.props?.variant
  expect(await variant('sort-project-title')).toBeUndefined()
  expect(await variant('sort-project-url')).toBeUndefined()

  await pane.press({ key: 'sort-project-url' })
  expect(await variant('sort-project-url')).toBe('primary')
  expect(await variant('sort-project-title')).toBeUndefined()
  await pane.unmount()
})

test('fields: ⌘A then typing replaces, ⌘V pastes the clipboard, ⌘C copies', async ($, on) => {
  const copied: string[] = []
  const opened: string[] = []
  mock.env(on, { HOME: '/Users/t', TMPDIR: '/tmp/' })
  mock.store(on, {})
  mock.clock(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' }) as never)
  on('session.root', () => ({ value: '/p/alpha' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.messages', () => ({ value: [] }))
  on('process.run', ($, e) => {
    if (e.argv[0] === 'open') opened.push(e.argv.join(' '))
    return {
    value: {
      exitCode: e.argv[0] === 'pbpaste' ? 0 : 1,
      stdout: e.argv[0] === 'pbpaste' ? 'https://pasted.dev/x\n' : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }
  })
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'add' })
  await typeInto(ui, 'draft-title', 'old')
  await ui.key({ key: 'a', meta: true, in: 'draft-title' })
  await ui.key({ key: 'N', in: 'draft-title' })
  await ui.key({ key: 'c', meta: true, in: 'draft-title' })
  expect(copied).toEqual(['N'])

  await ui.pointer({ type: 'down', x: 1, y: 1, button: 'left', in: 'draft-url' })
  await ui.key({ key: 'v', meta: true, in: 'draft-url' })
  await ui.press({ key: 'draft-save' })
  // Saved as typed: the name «N» over the selection, the pasted link.
  const chip = (await ui.find({ key: 'open-0' })) as { props?: { label?: string } } | undefined
  expect(chip?.props?.label?.endsWith('N')).toBe(true)
  await ui.press({ key: 'open-0' })
  await ui.unmount()
  expect(opened).toEqual(['open https://pasted.dev/x'])
})

test('a link pinned with no name takes its page title', async ($, on) => {
  mock.env(on, { HOME: '/Users/t', TMPDIR: '/tmp/' })
  mock.store(on, {})
  mock.clock(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' }) as never)
  on('session.root', () => ({ value: '/p/alpha' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.messages', () => ({ value: [] }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  // The page comes through the host's http call.
  on('http.fetch', () => ({
    value: {
      status: 200,
      ok: true,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      text: '<html><head><title>Site &amp; Co</title></head></html>',
    },
  }) as never)
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'add' })
  await typeInto(ui, 'draft-url', 'site.io')
  await ui.press({ key: 'draft-save' })
  const chip = (await ui.find({ key: 'open-0' })) as { props?: { label?: string } } | undefined
  expect(chip?.props?.label?.endsWith('Site & Co')).toBe(true)
  await ui.unmount()
})

test('fields read control characters as chords and type no unprintable ones', async ($, on) => {
  const copied: string[] = []
  mock.env(on, { HOME: '/Users/t', TMPDIR: '/tmp/' })
  mock.store(on, {})
  mock.clock(on)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' }) as never)
  on('session.root', () => ({ value: '/p/alpha' }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.messages', () => ({ value: [] }))
  on('process.run', ($, e) => ({
    value: {
      exitCode: e.argv[0] === 'pbpaste' ? 0 : 1,
      // UTF-8 only when asked for it, as pbpaste writes on a Cyrillic Mac.
      stdout: e.argv[0] === 'pbpaste' ? (e.init?.env?.['__CF_USER_TEXT_ENCODING']?.includes('8000100') ? 'pasted' : '\uFFFD') : '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  await $.session.start({ cwd: '/p/alpha', surface: 'desktop', isInteractive: true } as never)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'add' })
  await typeInto(ui, 'draft-title', 'abc')
  // ⌘X as \x18 cuts,  (an arrow's private-use code) types nothing, ⌘V as \x16 pastes.
  await ui.key({ key: '\x18', in: 'draft-title' })
  await ui.key({ key: '', in: 'draft-title' })
  await ui.key({ key: '\x16', in: 'draft-title' })
  await typeInto(ui, 'draft-url', 'x.io')
  await ui.press({ key: 'draft-save' })
  const chip = (await ui.find({ key: 'open-0' })) as { props?: { label?: string } } | undefined
  expect(copied).toEqual(['abc'])
  expect(chip?.props?.label?.endsWith('pasted')).toBe(true)
  await ui.unmount()
})
