# Claude Links — a links bar for Claude Desktop

**English** · [Русский](docs/README.ru.md)

A mod for the **Code tab of Claude Desktop** that keeps the links you work with one click away, in a bar above the prompt:

```
[Project] Session   ■ Kan   ■ figma.com/file/x   ■ A rather long na…   +      [Recent] [All · 6]
```

- **Pinned links with favicons**, up to 4 on the bar. Pin a link to the **project** (every session in that folder sees it) or to **this session** only; the small **Project / Session** switch on the left picks which set the bar shows.
- **Short and tidy**: the links share the bar's free room (one takes it all, four a quarter each); a cut name shows in full, with its URL, when you hover it. A link with no name shows as its URL without `https://` and `www.`.
- **+** opens one row: name, link, Project / Session, Cancel, Save. Left without a name, a link takes its page's title.
- **Recent**: hover it for a list, above the button, of the session's 10 latest links, with a **Project** and a **Session** column: 📌 pins a link there, ✓ shows it is pinned (and unpins it), ✎ renames a pinned one.
- **All** opens a side pane (and stays lit while it is open) with every pinned link of the project and the session: search them, sort each list by name or by link (A→Z, again for Z→A), drag them by the ⠿ handle (the first 4 of each list are on the bar), rename (✎), unpin (✕); hover a URL to see it whole.
- **Speaks your language**: English, Deutsch, Français, Italiano, Español, Українська, Русский, following Claude Desktop's language setting; English otherwise.

It is built on Claude Code's **mods** (plugins of function hooks), so it does not patch the Claude app. It shares the band above the prompt: whatever the plugins beneath it draw there (say, [Claude Tabs](https://github.com/tripolskiydigital/claude-tabs)) stays, with the links row below it.

## Requirements

- **Claude Desktop** with mods support (Claude Code engine 2.1.289 or later). It also loads in the terminal `claude`, where it draws a text version.
- `curl` and `open` (macOS) for favicons and for opening links.

## Install

```bash
claude plugin marketplace add tripolskiydigital/claude-links
```

```bash
claude plugin install links-bar@claude-links
```

Then start a new session (or run `/reload-plugins`).

## What it reads, writes and runs

- **Reads** the current session's transcript (`$.session.messages`) to find its links: what you and Claude wrote, and the links tools were called with (WebFetch, a browser's navigate). Tool output is not scanned. It also reads the `locale` field of `~/Library/Application Support/Claude/config.json` through `grep`, so nothing else of that file reaches the mod.
- **Writes** only to its own plugin store: pinned links (`project:<folder>`, `session:<id>`), the chosen switch position, and a favicon cache (`favicon:<host>`, data URIs of at most 24 KB). Favicons are downloaded to the temp folder first.
- **Runs** `pbpaste` only when you press ⌘V in one of the mod's fields (to paste; ⌘C/⌘X write the clipboard through the app), `open <url>` to open a link in your default browser, and `curl` to fetch a pinned or recent link's page (its title and the icons it declares are read from its `<head>`), those icons, then `<site>/favicon.ico`. When a public site has none, it asks Google's favicon service (`https://www.google.com/s2/favicons?domain=<host>`), which sends that host name to Google. Local and private hosts (localhost, `.local`, `.test`, private IP ranges) are never sent there.

## Development

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

Type-check with `tsc -p .` once the engine has loaded the mod (it writes the API's types to `.claude-plugin/types/`).

## License

Apache 2.0, see [LICENSE](LICENSE).
