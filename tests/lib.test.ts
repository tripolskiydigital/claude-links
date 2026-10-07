import { expect, test } from 'claude-code/testing'

import { langOf, t } from '../hooks/i18n'
import {
  dropIndexY,
  labelBudget,
  labelOf,
  matches,
  normalizeUrl,
  parseHead,
  recentLinks,
  shortUrl,
  sortLinks,
  sortedAs,
  truncate,
} from '../hooks/lib'

const msg = (role: 'user' | 'assistant', text: string, urls: string[] = []) => ({
  role,
  text,
  toolUses: urls.map(url => ({ input: { url } })),
})

test('recent links: newest first, each once, titles from markdown, reminders skipped', async () => {
  const links = recentLinks([
    msg('user', 'see https://example.com/a, and <system-reminder>https://hidden.org</system-reminder>'),
    msg('assistant', 'Read [the docs](https://docs.dev/x). Also https://example.com/a.', ['https://fetch.io/p']),
    msg('user', 'and https://www.github.com/'),
  ])
  expect(links).toEqual([
    { url: 'https://www.github.com/', title: '' },
    { url: 'https://fetch.io/p', title: '' },
    { url: 'https://example.com/a', title: '' },
    { url: 'https://docs.dev/x', title: 'the docs' },
  ])
})

test('recent links stop at ten', async () => {
  const text = Array.from({ length: 14 }, (_, i) => `https://s${i}.com`).join(' ')
  const links = recentLinks([msg('user', text)])
  expect(links.length).toBe(10)
  expect(links[0]!.url).toBe('https://s13.com')
})

test('a link without a name shows without https://www.', async () => {
  expect(shortUrl('https://www.example.com/')).toBe('example.com')
  expect(shortUrl('http://example.com/a/b')).toBe('example.com/a/b')
  expect(labelOf({ url: 'https://www.figma.com/file/x', title: '' })).toBe('figma.com/file/x')
  expect(labelOf({ url: 'https://www.figma.com/file/x', title: ' Макет ' })).toBe('Макет')
})

test('typed links gain https, non-links are refused', async () => {
  expect(normalizeUrl('example.com/x')).toBe('https://example.com/x')
  expect(normalizeUrl(' http://localhost:3000 ')).toBe('http://localhost:3000')
  expect(normalizeUrl('hello')).toBeNull()
  expect(normalizeUrl('')).toBeNull()
})

test('a name is cut to a quarter of the links block', async () => {
  expect(truncate('short', 10)).toBe('short')
  expect(truncate('a very long link name', 10)).toBe('a very lo…')
  expect(truncate('a very long link name', 10, false)).toBe('a very lon')
  // 140 cells less 40 of controls: 100 for the links, shared by those on the bar.
  expect(labelBudget(140)).toBe(21)
  expect(labelBudget(140, 2)).toBe(46)
  expect(labelBudget(140, 1)).toBe(96)
  expect(labelBudget(10)).toBe(6)
})

test('the desktop locale picks one of the tabs mod languages, English otherwise', async () => {
  expect(langOf('uk-UA')).toBe('uk')
  expect(langOf('de')).toBe('de')
  expect(langOf('ja-JP')).toBe('en')
  expect(t('fr', 'allTitle')).toBe('Tous les liens')
  expect(t('ru', 'all')).toBe('Все')
})

test('sorting goes by name or by link, without https://www., both ways', async () => {
  const list = [
    { url: 'https://www.zeta.io', title: 'Alpha' },
    { url: 'https://beta.dev/2', title: '' },
    { url: 'http://alpha.org', title: 'Zulu' },
  ]
  expect(sortLinks(list, 'url', 'asc').map(l => l.url)).toEqual([
    'http://alpha.org',
    'https://beta.dev/2',
    'https://www.zeta.io',
  ])
  // A link with no name sorts by its short URL.
  expect(sortLinks(list, 'title', 'asc').map(labelOf)).toEqual(['Alpha', 'beta.dev/2', 'Zulu'])
  expect(sortLinks(list, 'title', 'desc').map(labelOf)).toEqual(['Zulu', 'beta.dev/2', 'Alpha'])
  expect(sortedAs(sortLinks(list, 'url', 'desc'), 'url')).toBe('desc')
  expect(sortedAs([list[1]!, list[0]!, list[2]!], 'url')).toBeNull()
})

test('search looks at the name and the short URL', async () => {
  expect(matches({ url: 'https://www.figma.com/file/x', title: 'Макет' }, 'figma')).toBe(true)
  expect(matches({ url: 'https://www.figma.com/file/x', title: 'Макет' }, 'мак')).toBe(true)
  expect(matches({ url: 'https://www.figma.com/file/x', title: 'Макет' }, 'www')).toBe(false)
})

test('a dragged entry lands where the pointer went', async () => {
  // The pane: two rows an entry.
  expect(dropIndexY(0, 4, 5)).toBe(2)
  expect(dropIndexY(3, -9, 5)).toBe(0)
  expect(dropIndexY(1, 0, 5)).toBe(1)
})

test('a page head gives its title and its icons, SVG first', async () => {
  const html = `<html><head><title>POSMI &mdash; Menú QR &amp; más</title>
    <link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
    <link rel="icon" href="/icon.png?v=1" sizes="512x512" type="image/png"/>
    <link rel="shortcut icon" href="favicon-32.png" sizes="32x32">
    <link rel="icon" href="/icon.svg?x" type="image/svg+xml"/>
    <link rel="stylesheet" href="/a.css"></head>`
  const meta = parseHead(html, 'https://posmi.app/menu/')
  expect(meta.title).toBe('POSMI — Menú QR & más')
  expect(meta.icons).toEqual([
    'https://posmi.app/icon.svg?x',
    'https://posmi.app/menu/favicon-32.png',
    'https://posmi.app/icon.png?v=1',
    'https://posmi.app/apple.png',
  ])
})
