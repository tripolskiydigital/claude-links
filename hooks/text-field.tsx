import type { ClientModule } from 'claude-code'

/**
 * What the hooks module hands a field: its text, the hint, whether it holds
 * the keys, a glyph at its end, and `rev`, bumped when the hooks module
 * replaces the text (a form reset or opened on another link).
 */
type Props = { value: string; placeholder: string; isActive: boolean; icon: string; rev: number }
type State = { value: string; rev: number }

/** Each instance's latest props, for its key listener, set once on its first draw. */
const latest = new WeakMap<object, Props>()

/**
 * A one-line text field the mod draws, so it can take the width it is given
 * and keep a plain border: grey, white while typed into. A click takes the
 * keys; every change and Enter are posted to the hooks module.
 */
const TextField: ClientModule<Props, State> = (props, surface) => {
  const isNew = !latest.has(surface)
  latest.set(surface, props)
  const current = () => {
    const p = latest.get(surface) ?? props
    const s = surface.state
    return s !== undefined && s.rev === p.rev ? s.value : p.value
  }
  if (isNew) {
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ kind: 'focus' })
    })
    surface.onKey(event => {
      if (event.ctrl === true || event.meta === true) return
      if (event.key === 'return') {
        surface.post({ kind: 'submit', value: current() })
        return
      }
      const now = current()
      let next: string
      if (event.key === 'backspace' || event.key === 'delete') next = [...now].slice(0, -1).join('')
      else if (event.key === 'space') next = `${now} `
      else if ([...event.key].length === 1) next = now + event.key
      else return
      surface.setState({ value: next, rev: (latest.get(surface) ?? props).rev })
      surface.post({ kind: 'change', value: next })
    })
  }
  const value = current()
  const { Box, Text } = surface.elements
  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      alignItems="center"
      paddingX={1}
      borderStyle="round"
      borderColor={props.isActive ? 'text' : 'inactive'}
    >
      {value === '' ? (
        <Text dimColor wrap="truncate-end">{`${props.isActive ? '▏' : ''}${props.placeholder}`}</Text>
      ) : (
        <Text wrap="truncate-end">{`${value}${props.isActive ? '▏' : ''}`}</Text>
      )}
      {props.icon !== '' && <Text>{props.icon}</Text>}
    </Box>
  )
}

export default TextField
