export type Scope = 'project' | 'session'
export type Lang = 'en' | 'ru' | 'uk' | 'de' | 'fr' | 'it' | 'es'

/** A link pinned to a project or a session; `title` empty when none was given. */
export type PinnedLink = { url: string; title: string }

/** A link seen in the session's transcript, newest first; `title` from a markdown link. */
export type RecentLink = { url: string; title: string }

/** What the band shows under its row. */
export type Section = 'add' | null

/** The add form: the fields as typed, the scope picked, and the pin edited, if any. */
export type Draft = {
  url: string
  title: string
  scope: Scope
  edit: { scope: Scope; index: number } | null
}

/** A link being dragged: on the bar or in the «All» pane, in which list, from where to where. */
export type Drag = { where: 'bar' | 'pane'; scope: Scope; from: number; to: number }

declare module 'claude-code' {
  interface PluginState {
    'links-bar': {
      recent: RecentLink[]
      projectLinks: PinnedLink[]
      sessionLinks: PinnedLink[]
      scope: Scope
      section: Section
      draft: Draft
      /** Favicons by host: a data URI, or null when the site has none we can read. */
      favicons: Record<string, string | null>
      lang: Lang
      /** Whether the «All» pane is open: the button is lit while it is. */
      paneOpen: boolean
      /** The «All» pane's search text. */
      search: string
      /** Whether the search field holds the keys (its border is white then). */
      searchActive: boolean
      drag: Drag | null
    }
  }
}
