/**
 * Does a keyboard event come from something that already handles its own keys?
 *
 * A page-level shortcut (Enter = Next) must leave such events alone, so a focused control performs its normal keyboard action
 * (a button or link is activated, a field is edited) and is not hijacked. The test covers the control AND its descendants (an
 * icon or text inside a button, an option row's inner elements), and editable content.
 */
const INTERACTIVE_SELECTOR = [
  'button',
  'a[href]',
  'area[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="combobox"]',
  '[role="textbox"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="treeitem"]'
].join(',');

export function isInteractiveKeyTarget(target: EventTarget | null | undefined): boolean {
  const el = target as Element | null | undefined;
  if (!el || typeof el.closest !== 'function') return false;
  try {
    if (el.closest(INTERACTIVE_SELECTOR)) return true;
    // Editable content set by property rather than attribute.
    const html = el as HTMLElement;
    return html.isContentEditable === true;
  } catch {
    return false;
  }
}
