/**
 * There's a bug in Firefox, where click events are dispatched to the wrong target element.
 * This happens when libraries use setPointerCapture, a la our Monaco Editor.
 *
 * Here's the repro scenario:
 *
 * 1. Click inside our Monaco Editor, start dragging your cursor
 * 2. Release your cursor over a Nav item
 * 3. Firefox will trigger a "click" event on the Nav item!
 *
 * It _should_ have triggered a click event on the Monaco Editor, not the nav item.
 *
 * Root cause
 *
 * Monaco editor uses `setPointerCapture` for drag and drop operations.
 * When Monaco releases the pointer, Firefox needs to decide where the click happened.
 * It incorrectly decides the click happened wherever the mouse ended up.
 *
 * The fix
 *
 * In Firefox we track the target ourselves. if the `mouseUp` target and the `click`
 * target aren't the same, we ignore it.
 *
 * @see https://github.com/microsoft/monaco-editor/issues/4379
 * @see https://bugzilla.mozilla.org/show_bug.cgi?id=1556240
 * @see https://github.com/w3c/pointerevents/issues/356
 */
export default function patchFirefoxClicks() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return;
  }

  if (!navigator.userAgent.includes('Firefox')) {
    return;
  }

  if ((window as any).__instant_patchFirefoxClicks) {
    return;
  }

  (window as any).__instant_patchFirefoxClicks = true;

  let lastTarget: EventTarget | null = null;

  const handleMouseUp = (e: Event) => {
    lastTarget = e.target;
  };

  const handleClick = (e: Event) => {
    // Allows clicking labels to toggle checkbox in firefox still
    if (e.target instanceof HTMLInputElement) {
      if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
        return;
      }
    }
    if (lastTarget !== e.target) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
    lastTarget = null;
  };

  /**
   * Note: `capture` phase is important here.
   *
   * We trigger our listener in the `capture` phase, as this will happen before
   * React itself will read the event.
   */
  document.addEventListener('mouseup', handleMouseUp, { capture: true });
  document.addEventListener('click', handleClick, { capture: true });

  return () => {
    (window as any).__instant_patchFirefoxClicks = false;
    document.removeEventListener('mouseup', handleMouseUp, { capture: true });
    document.removeEventListener('click', handleClick, { capture: true });
  };
}
