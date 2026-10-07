import type { ClientModule } from 'claude-code'

/** What the hooks module hands the field: its text, the hint, and whether it is the one typed into. */
type Props = { value: string; placeholder: string; isActive: boolean }
type State = { value: string }

const wired = new WeakSet<object>()

/**
 * The «All» pane's search field, drawn by the mod so it can be as wide as the
 * pane and keep a plain border: grey, white while typed into. A click takes
 * the keys; every change is posted to the hooks module, which filters.
 */
const SearchField: ClientModule<Props, State> = (props, surface) => {
  const value = surface.state?.value ?? props.value
  if (!wired.has(surface)) {
    wired.add(surface)
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ kind: 'focus' })
    })
    surface.onKey(event => {
      if (event.ctrl === true || event.meta === true) return
      const now = surface.state?.value ?? props.value
      let next = now
      if (event.key === 'backspace' || event.key === 'delete') next = [...now].slice(0, -1).join('')
      else if (event.key === 'space') next = `${now} `
      else if ([...event.key].length === 1) next = now + event.key
      else return
      surface.setState({ value: next })
      surface.post({ kind: 'search', value: next })
    })
  }
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
      <Text dimColor>⌕</Text>
    </Box>
  )
}

export default SearchField
