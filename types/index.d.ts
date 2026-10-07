export type Scope = 'project' | 'session'
export type Lang = 'en' | 'ru' | 'uk' | 'de' | 'fr' | 'it' | 'es'

/** A link pinned to a project or a session; `title` empty when none was given. */
export type PinnedLink = { url: string; title: string }

/** A link seen in the session's transcript, newest first; `title` from a markdown link. */
export type RecentLink = { url: string; title: string }

/** What the band shows under its row. */
export type Section = 'recent' | 'add' | null

/** The add form: the fields as typed, the scope picked, and the pin edited, if any. */
export type Draft = {
  url: string
  title: string
  scope: Scope
  edit: { scope: Scope; index: number } | null
}

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
      projectName: string
      lang: Lang
    }
  }
}
