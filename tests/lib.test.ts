import { expect, test } from 'claude-code/testing'

import { langOf, t } from '../hooks/i18n'
import { labelBudget, labelOf, normalizeUrl, recentLinks, shortUrl, truncate } from '../hooks/lib'

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
  // 144 cells less 44 of controls: 100 for the links, 25 each, 4 of them icon.
  expect(labelBudget(144)).toBe(21)
  expect(labelBudget(10)).toBe(6)
})

test('the desktop locale picks one of the tabs mod languages, English otherwise', async () => {
  expect(langOf('uk-UA')).toBe('uk')
  expect(langOf('de')).toBe('de')
  expect(langOf('ja-JP')).toBe('en')
  expect(t('fr', 'allTitle')).toBe('Tous les liens')
  expect(t('ru', 'all')).toBe('Все')
})
