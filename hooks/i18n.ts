import type { Lang } from '../types'

type Strings = {
  project: string
  session: string
  recent: string
  all: string
  allTitle: string
  add: string
  recentTitle: string
  recentEmpty: string
  urlPlaceholder: string
  titlePlaceholder: string
  pinTo: string
  save: string
  saveEdit: string
  cancel: string
  badUrl: string
  pinnedProject: string
  pinnedSession: string
  pinnedHidden: string
  alreadyProject: string
  alreadySession: string
  projectSection: string
  sessionSection: string
  none: string
  search: string
  noMatches: string
  byTitle: string
  byUrl: string
  sortAsc: string
  sortDesc: string
  emptyProject: string
  emptySession: string
  moveProject: string
  moveSession: string
  openFailed: string
}

const STRINGS: Record<Lang, Strings> = {
  en: {
    project: 'Project',
    session: 'Session',
    recent: 'Recent',
    all: 'All',
    allTitle: 'All links',
    add: 'Add a link',
    recentTitle: 'Recent links',
    recentEmpty: 'No links in this session yet.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Name (optional)',
    pinTo: 'Pin to:',
    save: 'Pin',
    saveEdit: 'Save',
    cancel: 'Cancel',
    badUrl: 'That is not a link: {url}',
    pinnedProject: 'Pinned to the project: {name}',
    pinnedSession: 'Pinned to the session: {name}',
    pinnedHidden: 'Pinned. The bar shows the first {max}: reorder them in «All».',
    alreadyProject: 'Already pinned to the project',
    alreadySession: 'Already pinned to the session',
    projectSection: 'Project · {name}',
    sessionSection: 'This session',
    none: 'Nothing pinned.',
    search: 'Search pinned links',
    noMatches: 'Nothing found.',
    byTitle: 'Name',
    byUrl: 'Link',
    sortAsc: 'A→Z',
    sortDesc: 'Z→A',
    emptyProject: 'No project links pinned',
    emptySession: 'No session links pinned',
    moveProject: '→ Project',
    moveSession: '→ Session',
    openFailed: 'Could not open the link: {error}',
  },
  ru: {
    project: 'Проект',
    session: 'Сессия',
    recent: 'Последние',
    all: 'Все',
    allTitle: 'Все ссылки',
    add: 'Добавить ссылку',
    recentTitle: 'Последние ссылки',
    recentEmpty: 'В этой сессии пока нет ссылок.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Название (необязательно)',
    pinTo: 'Закрепить в:',
    save: 'Закрепить',
    saveEdit: 'Сохранить',
    cancel: 'Отмена',
    badUrl: 'Это не похоже на ссылку: {url}',
    pinnedProject: 'Закреплено в проекте: {name}',
    pinnedSession: 'Закреплено в сессии: {name}',
    pinnedHidden: 'Закреплено. На панели видны первые {max} — порядок меняется в «Все».',
    alreadyProject: 'Уже закреплена в проекте',
    alreadySession: 'Уже закреплена в сессии',
    projectSection: 'Проект · {name}',
    sessionSection: 'Эта сессия',
    none: 'Ничего не закреплено.',
    search: 'Поиск по закреплённым ссылкам',
    noMatches: 'Ничего не найдено.',
    byTitle: 'Название',
    byUrl: 'Ссылка',
    sortAsc: 'А→Я',
    sortDesc: 'Я→А',
    emptyProject: 'Нет ссылок проекта',
    emptySession: 'Нет ссылок сессии',
    moveProject: '→ Проект',
    moveSession: '→ Сессия',
    openFailed: 'Не удалось открыть ссылку: {error}',
  },
  uk: {
    project: 'Проєкт',
    session: 'Сесія',
    recent: 'Останні',
    all: 'Усі',
    allTitle: 'Усі посилання',
    add: 'Додати посилання',
    recentTitle: 'Останні посилання',
    recentEmpty: 'У цій сесії ще немає посилань.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Назва (необовʼязково)',
    pinTo: 'Закріпити в:',
    save: 'Закріпити',
    saveEdit: 'Зберегти',
    cancel: 'Скасувати',
    badUrl: 'Це не схоже на посилання: {url}',
    pinnedProject: 'Закріплено в проєкті: {name}',
    pinnedSession: 'Закріплено в сесії: {name}',
    pinnedHidden: 'Закріплено. На панелі видно перші {max} — порядок змінюється в «Усі».',
    alreadyProject: 'Уже закріплено в проєкті',
    alreadySession: 'Уже закріплено в сесії',
    projectSection: 'Проєкт · {name}',
    sessionSection: 'Ця сесія',
    none: 'Нічого не закріплено.',
    search: 'Пошук закріплених посилань',
    noMatches: 'Нічого не знайдено.',
    byTitle: 'Назва',
    byUrl: 'Посилання',
    sortAsc: 'А→Я',
    sortDesc: 'Я→А',
    emptyProject: 'Немає посилань проєкту',
    emptySession: 'Немає посилань сесії',
    moveProject: '→ Проєкт',
    moveSession: '→ Сесія',
    openFailed: 'Не вдалося відкрити посилання: {error}',
  },
  de: {
    project: 'Projekt',
    session: 'Sitzung',
    recent: 'Zuletzt',
    all: 'Alle',
    allTitle: 'Alle Links',
    add: 'Link hinzufügen',
    recentTitle: 'Letzte Links',
    recentEmpty: 'In dieser Sitzung gibt es noch keine Links.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Name (optional)',
    pinTo: 'Anheften an:',
    save: 'Anheften',
    saveEdit: 'Speichern',
    cancel: 'Abbrechen',
    badUrl: 'Das ist kein Link: {url}',
    pinnedProject: 'Am Projekt angeheftet: {name}',
    pinnedSession: 'An der Sitzung angeheftet: {name}',
    pinnedHidden: 'Angeheftet. Die Leiste zeigt die ersten {max}: Reihenfolge unter «Alle» ändern.',
    alreadyProject: 'Schon am Projekt angeheftet',
    alreadySession: 'Schon an der Sitzung angeheftet',
    projectSection: 'Projekt · {name}',
    sessionSection: 'Diese Sitzung',
    none: 'Nichts angeheftet.',
    search: 'Angeheftete Links durchsuchen',
    noMatches: 'Nichts gefunden.',
    byTitle: 'Name',
    byUrl: 'Link',
    sortAsc: 'A→Z',
    sortDesc: 'Z→A',
    emptyProject: 'Keine Projekt-Links angeheftet',
    emptySession: 'Keine Sitzungs-Links angeheftet',
    moveProject: '→ Projekt',
    moveSession: '→ Sitzung',
    openFailed: 'Link ließ sich nicht öffnen: {error}',
  },
  fr: {
    project: 'Projet',
    session: 'Session',
    recent: 'Récents',
    all: 'Tous',
    allTitle: 'Tous les liens',
    add: 'Ajouter un lien',
    recentTitle: 'Liens récents',
    recentEmpty: 'Aucun lien dans cette session pour le moment.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Nom (facultatif)',
    pinTo: 'Épingler dans :',
    save: 'Épingler',
    saveEdit: 'Enregistrer',
    cancel: 'Annuler',
    badUrl: 'Ce n’est pas un lien : {url}',
    pinnedProject: 'Épinglé au projet : {name}',
    pinnedSession: 'Épinglé à la session : {name}',
    pinnedHidden: 'Épinglé. La barre montre les {max} premiers : réordonnez-les dans « Tous ».',
    alreadyProject: 'Déjà épinglé au projet',
    alreadySession: 'Déjà épinglé à la session',
    projectSection: 'Projet · {name}',
    sessionSection: 'Cette session',
    none: 'Rien d’épinglé.',
    search: 'Rechercher dans les liens épinglés',
    noMatches: 'Aucun résultat.',
    byTitle: 'Nom',
    byUrl: 'Lien',
    sortAsc: 'A→Z',
    sortDesc: 'Z→A',
    emptyProject: 'Aucun lien de projet épinglé',
    emptySession: 'Aucun lien de session épinglé',
    moveProject: '→ Projet',
    moveSession: '→ Session',
    openFailed: 'Impossible d’ouvrir le lien : {error}',
  },
  it: {
    project: 'Progetto',
    session: 'Sessione',
    recent: 'Recenti',
    all: 'Tutti',
    allTitle: 'Tutti i link',
    add: 'Aggiungi un link',
    recentTitle: 'Link recenti',
    recentEmpty: 'Ancora nessun link in questa sessione.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Nome (facoltativo)',
    pinTo: 'Fissa in:',
    save: 'Fissa',
    saveEdit: 'Salva',
    cancel: 'Annulla',
    badUrl: 'Questo non è un link: {url}',
    pinnedProject: 'Fissato nel progetto: {name}',
    pinnedSession: 'Fissato nella sessione: {name}',
    pinnedHidden: 'Fissato. La barra mostra i primi {max}: riordinali in «Tutti».',
    alreadyProject: 'Già fissato nel progetto',
    alreadySession: 'Già fissato nella sessione',
    projectSection: 'Progetto · {name}',
    sessionSection: 'Questa sessione',
    none: 'Niente di fissato.',
    search: 'Cerca nei link fissati',
    noMatches: 'Nessun risultato.',
    byTitle: 'Nome',
    byUrl: 'Link',
    sortAsc: 'A→Z',
    sortDesc: 'Z→A',
    emptyProject: 'Nessun link di progetto fissato',
    emptySession: 'Nessun link di sessione fissato',
    moveProject: '→ Progetto',
    moveSession: '→ Sessione',
    openFailed: 'Impossibile aprire il link: {error}',
  },
  es: {
    project: 'Proyecto',
    session: 'Sesión',
    recent: 'Recientes',
    all: 'Todos',
    allTitle: 'Todos los enlaces',
    add: 'Añadir un enlace',
    recentTitle: 'Enlaces recientes',
    recentEmpty: 'Aún no hay enlaces en esta sesión.',
    urlPlaceholder: 'https://…',
    titlePlaceholder: 'Nombre (opcional)',
    pinTo: 'Fijar en:',
    save: 'Fijar',
    saveEdit: 'Guardar',
    cancel: 'Cancelar',
    badUrl: 'Eso no es un enlace: {url}',
    pinnedProject: 'Fijado en el proyecto: {name}',
    pinnedSession: 'Fijado en la sesión: {name}',
    pinnedHidden: 'Fijado. La barra muestra los primeros {max}: reordénalos en «Todos».',
    alreadyProject: 'Ya está fijado en el proyecto',
    alreadySession: 'Ya está fijado en la sesión',
    projectSection: 'Proyecto · {name}',
    sessionSection: 'Esta sesión',
    none: 'Nada fijado.',
    search: 'Buscar en los enlaces fijados',
    noMatches: 'No se encontró nada.',
    byTitle: 'Nombre',
    byUrl: 'Enlace',
    sortAsc: 'A→Z',
    sortDesc: 'Z→A',
    emptyProject: 'No hay enlaces de proyecto fijados',
    emptySession: 'No hay enlaces de sesión fijados',
    moveProject: '→ Proyecto',
    moveSession: '→ Sesión',
    openFailed: 'No se pudo abrir el enlace: {error}',
  },
}

export type Key = keyof Strings

export const LANGS = Object.keys(STRINGS) as Lang[]

/** The interface language for a desktop locale (`ru-RU`, `de`): one of LANGS, English otherwise. */
export function langOf(locale: string | undefined): Lang {
  const prefix = locale?.toLowerCase().split(/[-_]/)[0]
  return LANGS.find(lang => lang === prefix) ?? 'en'
}

/** A string of the interface in `lang`, its `{name}` slots filled. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in vars ? String(vars[name]) : slot,
  )
}
