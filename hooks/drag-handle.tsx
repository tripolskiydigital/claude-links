import type { ClientModule } from 'claude-code'

/** What the hooks module hands a handle: the glyph, and whether its row is the one being moved. */
type Props = { glyph: string; isDragging: boolean }
type State = { isHeld: boolean }

/** Surfaces whose pointer listener is set: one per instance, set on its first draw. */
const wired = new WeakSet<object>()

/**
 * A drag handle. A press takes the pointer until it is let go (the surface
 * holds it, past the region's edges too): every move reports how far it went,
 * in cells, and the release where it ended. The hooks module does the rest.
 */
const DragHandle: ClientModule<Props, State> = (props, surface) => {
  if (!wired.has(surface)) {
    wired.add(surface)
    let start: { x: number; y: number } | null = null
    surface.onPointer(event => {
      if (event.type === 'down' && event.button === 'left') {
        start = { x: event.x, y: event.y }
        surface.setState({ isHeld: true })
        surface.post({ kind: 'start' })
        return
      }
      if (start === null) return
      const dx = event.x - start.x
      const dy = event.y - start.y
      if (event.type === 'move') surface.post({ kind: 'move', dx, dy })
      if (event.type === 'up') {
        start = null
        surface.setState({ isHeld: false })
        surface.post({ kind: 'drop', dx, dy })
      }
    })
  }
  const { Text } = surface.elements
  const isActive = props.isDragging || surface.state?.isHeld === true
  return isActive ? <Text bold>{props.glyph}</Text> : <Text dimColor>{props.glyph}</Text>
}

export default DragHandle
