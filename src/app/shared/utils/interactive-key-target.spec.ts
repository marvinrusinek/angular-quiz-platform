import { isInteractiveKeyTarget } from './interactive-key-target';

/** The page-level Enter shortcut must leave events from interactive controls (and their descendants) and editable content alone. */
describe('isInteractiveKeyTarget', () => {
  const make = (html: string): HTMLElement => {
    const root = document.createElement('div');
    root.innerHTML = html;
    document.body.appendChild(root);
    return root;
  };
  afterEach(() => (document.body.innerHTML = ''));

  it.each([
    ['a button', '<button id="t">Go</button>'],
    ['a link', '<a id="t" href="/x">Go</a>'],
    ['an input', '<input id="t" />'],
    ['a textarea', '<textarea id="t"></textarea>'],
    ['a select', '<select id="t"><option>a</option></select>'],
    ['a summary', '<details><summary id="t">more</summary></details>'],
    ['contenteditable text', '<div id="t" contenteditable="true">x</div>'],
    ['an ARIA button', '<div id="t" role="button" tabindex="0">x</div>'],
    ['an ARIA checkbox', '<div id="t" role="checkbox" tabindex="0">x</div>'],
    ['an ARIA tab', '<div id="t" role="tab" tabindex="0">x</div>']
  ])('treats %s as interactive', (_name, html) => {
    expect(isInteractiveKeyTarget(make(html).querySelector('#t'))).toBe(true);
  });

  it.each([
    ['an icon inside a button', '<button><i id="t">x</i></button>'],
    ['an image inside a link', '<a href="/x"><img id="t" alt="" src="x.png"></a>'],
    ['text inside contenteditable', '<div contenteditable="true"><span id="t">x</span></div>'],
    ['inside an ARIA button', '<div role="button"><span id="t">x</span></div>']
  ])('treats %s (a descendant) as interactive', (_name, html) => {
    expect(isInteractiveKeyTarget(make(html).querySelector('#t'))).toBe(true);
  });

  it.each([
    ['the body', () => document.body],
    ['a plain div', () => make('<div id="t">text</div>').querySelector('#t')],
    ['a heading', () => make('<h3 id="t">Question</h3>').querySelector('#t')],
    ['a focusable but non-interactive region', () => make('<div id="t" tabindex="-1">x</div>').querySelector('#t')],
    ['an anchor without href', () => make('<a id="t">x</a>').querySelector('#t')],
    ['the window / document / null', () => window as unknown as EventTarget]
  ])('does not treat %s as interactive', (_name, get) => {
    expect(isInteractiveKeyTarget(get())).toBe(false);
    expect(isInteractiveKeyTarget(null)).toBe(false);
    expect(isInteractiveKeyTarget(undefined)).toBe(false);
  });
});
