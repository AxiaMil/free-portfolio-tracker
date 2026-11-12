// Meta Muse's space builder rewrites every `x.style` in the space's code, the chart library's included:
//   x.style.p = v  ->  __tunnel.setStyle(x, 'p', v)        any other x.style  ->  __tunnel.getStyle(x)
// so that it can check what a page writes into CSS. Its setStyle turns the value into a string (null into '') for
// every object, not only page elements. The chart library keeps each shape's colours and sizes in a plain object
// that is also called `style`, so "no fill" (null) became '' and was drawn as a fill in the last colour used, and
// numbers and booleans became text. Charts then showed solid boxes behind their labels, filled label lines, and
// could fail to draw.
//
// This gives plain objects their own `style` back. Page elements (and CSS rules) still go through Muse.
// It runs before any other code of the app (boot.ts imports it first) and does nothing outside Muse.
//
// This file never writes `x.style` itself: Muse rewrites this file too, and that would call back into the tunnel.

type StyleTunnel = {
  getStyle?: (x: unknown) => unknown;
  setStyle?: (x: unknown, name: string, value: unknown) => unknown;
  __plainObjectsNative?: boolean;
};

const STYLE = 'style';
const styleOf = (x: object): unknown => Reflect.get(x, STYLE);

/** an object whose `style` is real CSS: an element of any document, or a CSS rule */
export function ownsPageStyle(x: unknown): boolean {
  if (x == null || typeof x !== 'object') return false;
  if (typeof Reflect.get(x, 'nodeType') === 'number') return true;
  try {
    return typeof CSSStyleDeclaration !== 'undefined' && styleOf(x) instanceof CSSStyleDeclaration;
  } catch {
    return true; // can't tell: leave it to Muse
  }
}

/** true when the tunnel was found and repaired (now or before) */
export function repairStyleTunnel(scope: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): boolean {
  const tunnel = scope.__tunnel as StyleTunnel | undefined;
  if (!tunnel || typeof tunnel !== 'object') return false;
  if (tunnel.__plainObjectsNative) return true;
  const { getStyle, setStyle } = tunnel;
  if (typeof getStyle !== 'function' || typeof setStyle !== 'function') return false;
  const repaired: StyleTunnel = {
    getStyle(x) {
      if (ownsPageStyle(x)) return getStyle.call(tunnel, x);
      return x == null ? x : styleOf(Object(x));
    },
    setStyle(x, name, value) {
      if (ownsPageStyle(x)) return setStyle.call(tunnel, x, name, value);
      const target = styleOf(Object(x));
      if (target != null && (typeof target === 'object' || typeof target === 'function')) Reflect.set(target, name, value);
    },
    __plainObjectsNative: true,
  };
  try {
    Object.assign(tunnel, repaired);
    if (tunnel.getStyle === repaired.getStyle) return true;
  } catch { /* a frozen tunnel: replace it below */ }
  try {
    // defined, not assigned: assigning over a frozen prototype's property fails
    const own = Object.fromEntries(Object.entries(repaired).map(([k, value]) => [k, { value, enumerable: true }]));
    scope.__tunnel = Object.create(tunnel, own);
    return (scope.__tunnel as StyleTunnel).__plainObjectsNative === true;
  } catch {
    return false;
  }
}

repairStyleTunnel();
