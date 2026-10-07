import type { ClientModule } from 'claude-code'

/**
 * What the hooks module hands a field: its text, the hint, whether it holds
 * the keys, a glyph at its end, and `rev`, bumped when the hooks module
 * replaces the text (a form reset or opened on another link).
 */
type Props = { value: string; placeholder: string; isActive: boolean; icon: string; rev: number }
/** The text as typed, whether it is all selected (⌘A), and the props it was typed against. */
type State = { value: string; isSelected: boolean; rev: number }

/** Each instance's latest props and the values it posted lately, for its listeners. */
const latest = new WeakMap<object, Props>()
const posted = new WeakMap<object, string[]>()

/**
 * A one-line text field the mod draws, so it can take the width it is given
 * and keep a plain border: grey, white while typed into. A click takes the
 * keys; every change, Enter, and ⌘C / ⌘X / ⌘V are posted to the hooks module
 * (which holds the clipboard). ⌘A selects all, ⌘⌫ clears.
 */
const TextField: ClientModule<Props, State> = (props, surface) => {
  const isNew = !latest.has(surface)
  latest.set(surface, props)
  const sent = posted.get(surface) ?? []
  posted.set(surface, sent)

  // The props win when the hooks module put a text the field never posted
  // (a paste, a reset): an echo of an earlier keystroke is not a change.
  const s = surface.state
  const isOwn = s !== undefined && s.rev === props.rev && (props.value === s.value || sent.includes(props.value))
  const view: State = isOwn ? s : { value: props.value, isSelected: false, rev: props.rev }

  if (isNew) {
    const now = (): State => {
      const p = latest.get(surface) ?? props
      const st = surface.state
      const own = st !== undefined && st.rev === p.rev && (p.value === st.value || (posted.get(surface) ?? []).includes(p.value))
      return own ? st : { value: p.value, isSelected: false, rev: p.rev }
    }
    const change = (state: State, value: string) => {
      const list = posted.get(surface) ?? []
      list.push(value)
      if (list.length > 40) list.shift()
      surface.setState({ ...state, value, isSelected: false })
      surface.post({ kind: 'change', value })
    }
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ kind: 'focus' })
    })
    surface.onKey(event => {
      const st = now()
      if (event.meta === true || event.ctrl === true) {
        const key = event.key.toLowerCase()
        if (key === 'a') surface.setState({ ...st, isSelected: true })
        else if (key === 'c') surface.post({ kind: 'copy', value: st.value })
        else if (key === 'x') {
          surface.post({ kind: 'copy', value: st.value })
          change(st, '')
        } else if (key === 'v') surface.post({ kind: 'paste', value: st.value, isSelected: st.isSelected })
        else if (key === 'backspace' || key === 'delete') change(st, '')
        return
      }
      if (event.key === 'return') {
        surface.post({ kind: 'submit', value: st.value })
        return
      }
      const base = st.isSelected ? '' : st.value
      if (event.key === 'backspace' || event.key === 'delete') change(st, st.isSelected ? '' : [...st.value].slice(0, -1).join(''))
      else if (event.key === 'space') change(st, `${base} `)
      else if ([...event.key].length === 1) change(st, base + event.key)
    })
  }

  const { Box, Text } = surface.elements
  const caret = props.isActive ? '▏' : ''
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingX={1}
      borderStyle="round"
      borderColor={props.isActive ? 'text' : 'inactive'}
    >
      {view.value === '' ? (
        <Text dimColor wrap="truncate-end">{`${caret}${props.placeholder}`}</Text>
      ) : view.isSelected && props.isActive ? (
        <Text inverse wrap="truncate-end">
          {view.value}
        </Text>
      ) : (
        <Text wrap="truncate-end">{`${view.value}${caret}`}</Text>
      )}
      {props.icon !== '' && <Text>{props.icon}</Text>}
    </Box>
  )
}

export default TextField
