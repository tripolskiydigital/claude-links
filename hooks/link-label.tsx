import type { ClientModule } from 'claude-code'

/** What the hooks module hands a label: its text and the link a click opens. */
type Props = { label: string; url: string }

const wired = new WeakSet<object>()

/**
 * A bar chip's name as plain text that opens its link on a click. Not a
 * Button, which lights on its own under the pointer, nor a Link, which the
 * app draws blue and underlined: only the chip around it lights.
 */
const LinkLabel: ClientModule<Props> = (props, surface) => {
  if (!wired.has(surface)) {
    wired.add(surface)
    let isDown = false
    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'left') isDown = true
      if (event.type === 'up' && isDown) {
        isDown = false
        // Let go outside the name (a press dragged away) opens nothing; before the
        // first layout the region's size is unknown, and the release counts.
        const isSized = surface.columns > 0
        const inside = !isSized || (event.x >= 0 && event.y >= 0 && event.x < surface.columns && event.y < Math.max(1, surface.rows))
        if (inside) surface.post({ kind: 'open' })
      }
    })
  }
  const { Text } = surface.elements
  return <Text wrap="truncate-end">{props.label}</Text>
}

export default LinkLabel
