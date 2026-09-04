import { createContext, useContext } from 'react';

/**
 * Signals that annotations are being rendered inside the authoring
 * editor rather than the live player. The editor is a static
 * authoring surface: player-only presentation motion (e.g. the pointer
 * "disappear from old spot / reappear at new spot" transition that fires
 * when a hotspot's x/y changes between steps) is spurious there — an
 * editor click or reposition would otherwise flash the message away even
 * though nothing is "advancing". Hosts rendering the player leave this
 * false; the editor wraps its `<Demo>` with the provider set to true.
 */
export const AnnotationEditModeContext = createContext(false);

export function useAnnotationEditMode(): boolean {
  return useContext(AnnotationEditModeContext);
}
