/**
 * The control a dialog should give the keyboard back to when it closes: what
 * had focus as it opened or, when that was an item in a menu (gone by then),
 * the button that opened the menu.
 */
export function openerOf(element: Element | null) {
  const menu = element?.closest("[role=menu]");
  const opener = menu ? document.getElementById(menu.getAttribute("aria-labelledby") ?? "") : element;
  return opener instanceof HTMLElement ? opener : null;
}
