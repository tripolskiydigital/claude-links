// Renders the README's screenshots with demo links, in English and in
// Russian, and the plugin's icon.
//
// The favicons (and the letter drawn for a site without one) come from the
// mod's own drawing code (hooks/lib.ts) and the words from its translations
// (hooks/i18n.ts); the page around them follows Claude Desktop's dark theme.
// Run from the repository root:
//
//   node docs/demo/render.ts
//
// Needs Node 23.6+ (TypeScript type stripping) and Google Chrome.

import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { t } from '../../hooks/i18n.ts'
import { BUTTON_HEIGHT, ICON_BOX, faviconSvg, shortUrl } from '../../hooks/lib.ts'

type Lang = 'en' | 'ru'

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

/** Made-up favicons for the demo sites. */
const PEN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#7c3aed"/><path d="M9 23l2-6 9-9 4 4-9 9z" fill="#f5f3ff"/><path d="M9 23l6-2" stroke="#7c3aed" stroke-width="1.5"/></svg>`
const ROCKET = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0f766e"/><path d="M16 6c4 3 5 8 3 13h-6c-2-5-1-10 3-13z" fill="#ecfeff"/><circle cx="16" cy="13" r="2" fill="#0f766e"/><path d="M13 19l-3 4h4M19 19l3 4h-4" fill="#ecfeff"/></svg>`
const BOOK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2563eb"/><path d="M8 9h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H8zM24 9h-5a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h5z" fill="#eff6ff"/></svg>`
const BOARD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ea580c"/><rect x="8" y="9" width="4" height="14" rx="1.5" fill="#fff7ed"/><rect x="14" y="9" width="4" height="9" rx="1.5" fill="#fff7ed"/><rect x="20" y="9" width="4" height="11" rx="1.5" fill="#fff7ed"/></svg>`

type Demo = { url: string; title: Record<Lang, string>; icon: string | null }

const DESIGN: Demo = { url: 'https://canvas.design/file/checkout-flow', title: { en: 'Checkout design', ru: 'Макет оформления заказа' }, icon: svgUri(PEN) }
const STAGING: Demo = { url: 'https://staging.northwind.dev/', title: { en: 'Staging', ru: 'Стенд' }, icon: svgUri(ROCKET) }
const DOCS: Demo = { url: 'https://docs.northwind.dev/api/payments', title: { en: 'Payments API', ru: 'API платежей' }, icon: svgUri(BOOK) }
const BOARD_LINK: Demo = { url: 'https://board.northwind.dev/sprint/42', title: { en: 'Sprint board', ru: 'Доска спринта' }, icon: svgUri(BOARD) }
const ISSUE: Demo = { url: 'https://github.com/northwind/shop/issues/318', title: { en: '', ru: '' }, icon: null }
const LOGS: Demo = { url: 'https://logs.northwind.dev/checkout?since=1h', title: { en: 'Checkout logs', ru: 'Логи оформления' }, icon: null }

const PROJECT = [DESIGN, STAGING, DOCS, BOARD_LINK]
const SESSION = [ISSUE]
const RECENT = [ISSUE, LOGS, DOCS, STAGING, DESIGN]

const hostOf = (url: string) => new URL(url).host
const labelOf = (d: Demo, l: Lang) => d.title[l] || shortUrl(d.url)

const escape = (text: string) => text.replace(/[<>&"]/g, c => `&#${c.charCodeAt(0)};`)
const img = (svg: string, width: number, height: number) =>
  `<img src="${svgUri(svg)}" width="${width}" height="${height}" alt="">`
const icon = (d: Demo, height = ICON_BOX) => img(faviconSvg(d.icon, hostOf(d.url), height), ICON_BOX, height)

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; background: #151515; color: #e8e6e3; color-scheme: dark;
  font: 14px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
img { display: block; }
.frame { padding: 22px 26px 26px; }
.reply { color: #d4d2cc; font-size: 15px; line-height: 1.6; max-width: 820px; margin: 0 0 18px 6px; }
.reply code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: #232322; padding: 1px 5px; border-radius: 5px; }
.band { position: relative; background: #212121; border-radius: 14px; padding: 9px 10px; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.left, .right { display: flex; align-items: center; gap: 8px; }
.btn { background: #2b2b2a; color: #e3e1dc; border-radius: 7px; padding: 3px 10px; font-size: 14px; white-space: nowrap; }
.btn.primary { background: #ecebe7; color: #1a1a19; }
.btn.plain { background: none; color: #8f8e89; }
.btn.dim { color: #8f8e89; }
.scope { display: flex; gap: 6px; }
.chip { position: relative; display: flex; align-items: center; height: ${BUTTON_HEIGHT + 6}px; padding: 0 9px 0 4px; border-radius: 7px; gap: 4px; white-space: nowrap; }
.chip.hover { background: rgba(128,128,128,0.16); }
.chip span { color: #e8e6e3; }
.prompt { margin-top: 10px; border: 1px solid #343433; border-radius: 16px; background: #1d1d1d; height: 96px; padding: 14px 18px; color: #6f6e69; font-size: 15px; }
.card { position: absolute; background: #1d1d1d; border: 1px solid #3a3a39; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
.tip { left: 0; bottom: ${BUTTON_HEIGHT + 14}px; padding: 8px 12px; white-space: nowrap; }
.tip .u, .muted { color: #8f8e89; }
.recent { right: 92px; bottom: ${BUTTON_HEIGHT + 14}px; padding: 10px 12px 8px; width: 520px; }
.rrow { display: grid; grid-template-columns: 1fr 76px 76px 26px; align-items: center; height: 30px; border-radius: 6px; }
.rrow.head { height: 24px; color: #8f8e89; }
.rrow.hl { background: rgba(128,128,128,0.12); }
.rrow .n { display: flex; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; }
.rrow .c { text-align: center; color: #e8e6e3; }
.rrow .c.d { color: #8f8e89; }
.form { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.field { flex: 1; min-width: 0; height: 34px; border: 1px solid #4a4945; border-radius: 9px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; color: #e8e6e3; white-space: nowrap; overflow: hidden; }
.field.active { border-color: #ecebe7; }
.field .ph { color: #6f6e69; }
.caret { display: inline-block; width: 1.5px; height: 17px; background: #ecebe7; margin-left: 1px; vertical-align: -3px; }
.pane { width: 470px; background: #191918; border-left: 1px solid #2a2a29; min-height: 100vh; padding: 0 18px 24px; }
.pane .head { display: flex; align-items: center; justify-content: space-between; height: 52px; border-bottom: 1px solid #262625; margin: 0 -18px 14px; padding: 0 22px; color: #d5d3ce; font-weight: 600; }
.pane .x { color: #8f8e89; font-weight: 400; font-size: 18px; }
.group { display: flex; align-items: center; justify-content: space-between; margin: 16px 0 10px; font-weight: 650; }
.group .btns { display: flex; gap: 6px; font-weight: 400; }
.entry { display: flex; gap: 10px; border: 1px solid #3a3a39; border-radius: 12px; padding: 8px 10px; margin-bottom: 10px; }
.entry.hover { background: rgba(128,128,128,0.12); }
.entry .side { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 22px; padding-top: 2px; }
.entry .grip { color: #6f6e69; font-size: 13px; line-height: 1; }
.entry .main { flex: 1; min-width: 0; }
.entry .top { display: flex; justify-content: space-between; align-items: center; height: 24px; }
.entry .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry .name.dim { color: #8f8e89; }
.entry .acts { display: flex; gap: 14px; color: #d5d3ce; padding-left: 10px; }
.entry .url { color: #8f8e89; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; height: 22px; }
`

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`

function chip(d: Demo, l: Lang, opts: { hover?: boolean; tip?: boolean } = {}): string {
  const tip = opts.tip
    ? `<div class="card tip"><div>${escape(labelOf(d, l))}</div><div class="u">${escape(shortUrl(d.url))}</div></div>`
    : ''
  return `<div class="chip${opts.hover ? ' hover' : ''}">${icon(d, BUTTON_HEIGHT)}<span>${escape(labelOf(d, l))}</span>${tip}</div>`
}

function bar(l: Lang, opts: { hover?: number; tip?: boolean; add?: boolean; allLit?: boolean; recentLit?: boolean } = {}): string {
  const chips = PROJECT.map((d, i) => chip(d, l, { hover: opts.hover === i, tip: opts.tip === true && opts.hover === i })).join('')
  return `<div class="bar"><div class="left"><div class="scope"><span class="btn">${t(l, 'project')}</span><span class="btn plain">${t(l, 'session')}</span></div><span class="btn${opts.add ? ' primary' : ''}">+</span>${chips}</div><div class="right"><span class="btn">${t(l, 'recent')}</span><span class="btn${opts.allLit ? ' primary' : ''}">${t(l, 'all')} · ${PROJECT.length + SESSION.length}</span></div></div>`
}

const REPLY: Record<Lang, string> = {
  en: 'Done: the checkout now offers Apple Pay when the browser supports it. The design is in <code>canvas.design</code>, and it is live on staging.',
  ru: 'Готово: оформление заказа теперь предлагает Apple Pay, если браузер его поддерживает. Макет — в <code>canvas.design</code>, изменения уже на стенде.',
}
const PROMPT: Record<Lang, string> = { en: 'Reply to Claude…', ru: 'Ответьте Claude…' }

function barScene(l: Lang): string {
  // Room between the reply and the band for the card over the hovered chip.
  return `<div class="frame"><p class="reply">${REPLY[l]}</p><div style="height:74px"></div><div class="band">${bar(l, { hover: 1, tip: true })}</div><div class="prompt">${PROMPT[l]}</div></div>`
}

function recentScene(l: Lang): string {
  const rows = RECENT.map((d, i) => {
    const inProject = PROJECT.includes(d)
    const inSession = SESSION.includes(d)
    return `<div class="rrow${i === 1 ? ' hl' : ''}"><div class="n">${icon(d)}<span>${escape(labelOf(d, l))}</span></div><div class="c${inProject ? '' : ' d'}">${inProject ? '✓' : '📌'}</div><div class="c${inSession ? '' : ' d'}">${inSession ? '✓' : '📌'}</div><div class="c d">${inProject || inSession ? '✎' : ''}</div></div>`
  }).join('')
  const list = `<div class="card recent"><div class="rrow head"><div>${t(l, 'recentTitle')}</div><div class="c d">${t(l, 'project')}</div><div class="c d">${t(l, 'session')}</div><div></div></div>${rows}</div>`
  return `<div class="frame"><div style="height:200px"></div><div class="band">${bar(l)}${list}</div><div class="prompt">${PROMPT[l]}</div></div>`
}

function addScene(l: Lang): string {
  const form = `<div class="form"><div class="field"><span>${l === 'en' ? 'Release notes' : 'Заметки к релизу'}</span></div><div class="field active"><span>northwind.dev/releases/2.4<span class="caret"></span></span></div><span class="btn primary">${t(l, 'project')}</span><span class="btn dim">${t(l, 'session')}</span><span class="btn">${t(l, 'cancel')}</span><span class="btn primary">${t(l, 'saveEdit')}</span></div>`
  return `<div class="frame"><div class="band">${bar(l, { add: true })}${form}</div><div class="prompt">${PROMPT[l]}</div></div>`
}

function entry(d: Demo, l: Lang, opts: { hover?: boolean; dim?: boolean } = {}): string {
  return `<div class="entry${opts.hover ? ' hover' : ''}"><div class="side">${icon(d)}<span class="grip">⠿</span></div><div class="main"><div class="top"><span class="name${opts.dim ? ' dim' : ''}">${escape(labelOf(d, l))}</span><span class="acts"><span>✎</span><span>✕</span></span></div><div class="url">${escape(shortUrl(d.url))}</div></div></div>`
}

function paneScene(l: Lang): string {
  const search = `<div class="field"><span class="ph">${t(l, 'search')}</span><span>🔍</span></div>`
  const sorts = `<div class="btns"><span class="btn primary">${t(l, 'byTitle')} ↓</span><span class="btn dim">${t(l, 'byUrl')} ↓</span></div>`
  const project = [...PROJECT].sort((a, b) => labelOf(a, l).localeCompare(labelOf(b, l)))
  return `<div class="pane"><div class="head"><span>${t(l, 'allTitle')}</span><span class="x">✕</span></div>${search}
<div class="group"><span>${t(l, 'project')} (${project.length})</span>${sorts}</div>${project.map((d, i) => entry(d, l, { hover: i === 1 })).join('')}
<div class="group"><span>${t(l, 'sessionSection')} (${SESSION.length})</span></div>${SESSION.map(d => entry(d, l)).join('')}</div>`
}

/** The plugin's listing icon: a bar of three link chips, the middle one lit, with a chain link. */
function iconPage(): string {
  const css = `
html, body { margin: 0; width: 512px; height: 512px; background: #1d1c1b; }
.icon { width: 512px; height: 512px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(120% 120% at 30% 15%, #34322e 0%, #1d1c1b 60%, #141413 100%); }
.band { display: flex; flex-direction: column; gap: 22px; padding: 30px; width: 392px; border-radius: 44px; background: #121211;
  box-shadow: inset 0 0 0 2px #2b2a27; }
.c { display: flex; align-items: center; gap: 22px; height: 84px; padding: 0 22px; border-radius: 22px; }
.c.lit { background: #2b2a27; }
.sq { width: 52px; height: 52px; border-radius: 15px; flex: none; display: flex; align-items: center; justify-content: center; }
.bar { height: 16px; border-radius: 8px; background: #8f8e89; flex: 1; }
.c.lit .bar { background: #ecebe7; }
`
  const link = `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`
  const c = (color: string, opts: { lit?: boolean; short?: boolean; glyph?: string }) =>
    `<div class="c${opts.lit ? ' lit' : ''}"><span class="sq" style="background:${color}">${opts.glyph ?? ''}</span><span class="bar"${opts.short ? ' style="flex:0 0 120px"' : ''}></span></div>`
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="icon"><div class="band">${c('#7c3aed', {})}${c('#0f766e', { lit: true, glyph: link })}${c('#2563eb', { short: true })}</div></div></body></html>`
}

const SCENES: { name: string; html: string; width: number; height: number; out: string }[] = []
for (const l of ['en', 'ru'] as const) {
  SCENES.push(
    { name: `bar-${l}`, html: page(barScene(l)), width: 1100, height: 350, out: `docs/screenshots/${l}/bar.png` },
    { name: `recent-${l}`, html: page(recentScene(l)), width: 1100, height: 400, out: `docs/screenshots/${l}/recent.png` },
    { name: `add-${l}`, html: page(addScene(l)), width: 1100, height: 210, out: `docs/screenshots/${l}/add.png` },
    { name: `pane-${l}`, html: page(paneScene(l)), width: 470, height: 640, out: `docs/screenshots/${l}/pane.png` },
  )
}
SCENES.push({ name: 'icon', html: iconPage(), width: 512, height: 512, out: '.claude-plugin/icon.png' })

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const htmlDir = join(root, 'docs/demo/out')
mkdirSync(htmlDir, { recursive: true })

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
for (const scene of SCENES) {
  mkdirSync(dirname(join(root, scene.out)), { recursive: true })
  const html = join(htmlDir, `${scene.name}.html`)
  writeFileSync(html, scene.html)
  execFileSync(CHROME, [
    '--headless=new',
    '--hide-scrollbars',
    '--force-dark-mode',
    '--force-device-scale-factor=2',
    `--window-size=${scene.width},${scene.height}`,
    `--screenshot=${join(root, scene.out)}`,
    `file://${html}`,
  ], { stdio: 'ignore' })
  console.log(scene.out)
}
