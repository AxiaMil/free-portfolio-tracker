// In a Meta Muse space every `x.style` in the app goes through Muse's __tunnel, which turns values into strings
// (null into ''). src/platform/style-tunnel.ts gives plain objects, such as the chart library's shapes, their own
// `style` back, and leaves page elements to Muse. The tunnel below copies the behaviour of Muse's (Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownsPageStyle, repairStyleTunnel } from '../src/platform/style-tunnel.ts';

function museTunnel() {
  const cache = new WeakMap<object, unknown>();
  function setStyle(el: any, name: string, value: unknown) {
    const v = value == null ? '' : String(value);
    try { el.style[name] = v; } catch { /* as Muse */ }
  }
  function getStyle(el: any) {
    if (el == null) return el;
    const real = el.style;
    if (real == null || typeof real !== 'object') return real;
    let proxy = cache.get(real);
    if (proxy) return proxy;
    proxy = new Proxy(real, {
      get: (t, k) => Reflect.get(t, k, t),
      set: (t, k, v) => { if (typeof k === 'string') { setStyle(el, k, v); return true; } return Reflect.set(t, k, v, t); },
    });
    cache.set(real, proxy);
    return proxy;
  }
  return { getStyle, setStyle, fetch() {} } as Record<string, any>;
}

/** a chart shape: its colours and sizes live in a plain `style` object */
const shape = () => ({ style: { fill: '#8B7BFF' as unknown, stroke: null as unknown, lineWidth: 1 as unknown, strokeNoScale: false as unknown } });
/** a page element, as far as the tunnel can tell */
const element = () => ({ nodeType: 1, style: {} as Record<string, unknown> });

test('the problem: through Muse\'s tunnel, a shape\'s "no fill" becomes an empty colour and numbers become text', () => {
  const t = museTunnel();
  const s = shape();
  t.setStyle(s, 'fill', null);
  t.getStyle(s).lineWidth = 2;
  t.getStyle(s).strokeNoScale = false;
  assert.equal(s.style.fill, ''); // the chart library fills '' with the last colour it used
  assert.equal(s.style.lineWidth, '2');
  assert.equal(s.style.strokeNoScale, 'false'); // a non-empty string: true
});

test('after the repair, shapes keep their own values', () => {
  const scope: Record<string, unknown> = { __tunnel: museTunnel() };
  assert.equal(repairStyleTunnel(scope), true);
  const t = scope.__tunnel as any;
  const s = shape();
  t.setStyle(s, 'fill', null);
  assert.equal(s.style.fill, null);
  assert.equal(t.getStyle(s), s.style, 'the real object, not a proxy');
  t.getStyle(s).lineWidth = 2;
  t.getStyle(s).strokeNoScale = false;
  t.setStyle(s, 'stroke', '#4CC9F0');
  assert.deepEqual(s.style, { fill: null, stroke: '#4CC9F0', lineWidth: 2, strokeNoScale: false });
  assert.equal(t.getStyle(null), null);
  assert.equal(t.getStyle(undefined), undefined);
  assert.equal(t.getStyle('text'), undefined);
  t.setStyle({}, 'fill', null); // an object without a style: nothing to set, no error
});

test('page elements still go through Muse', () => {
  const scope: Record<string, unknown> = { __tunnel: museTunnel() };
  repairStyleTunnel(scope);
  const t = scope.__tunnel as any;
  const el = element();
  t.setStyle(el, 'width', 12);
  t.setStyle(el, 'color', null);
  assert.deepEqual(el.style, { width: '12', color: '' });
  assert.notEqual(t.getStyle(el), el.style, 'Muse\'s proxy');
  t.getStyle(el).height = 5;
  assert.equal(el.style.height, '5');
  assert.equal(typeof t.fetch, 'function', 'the rest of the tunnel is untouched');
});

test('repairing twice changes nothing, and no tunnel means nothing to do', () => {
  const scope: Record<string, unknown> = { __tunnel: museTunnel() };
  repairStyleTunnel(scope);
  const first = (scope.__tunnel as any).getStyle;
  assert.equal(repairStyleTunnel(scope), true);
  assert.equal((scope.__tunnel as any).getStyle, first);
  assert.equal(repairStyleTunnel({}), false);
  assert.equal(repairStyleTunnel({ __tunnel: { fetch() {} } }), false);
});

test('a frozen tunnel is replaced by a repaired one that keeps the rest', () => {
  const frozen = Object.freeze(museTunnel());
  const scope: Record<string, unknown> = { __tunnel: frozen };
  assert.equal(repairStyleTunnel(scope), true);
  const t = scope.__tunnel as any;
  assert.notEqual(t, frozen);
  assert.equal(t.fetch, frozen.fetch);
  const s = shape();
  t.setStyle(s, 'fill', null);
  assert.equal(s.style.fill, null);
});

test('what counts as a page element', () => {
  assert.equal(ownsPageStyle(element()), true);
  assert.equal(ownsPageStyle({ nodeType: 3 }), true);
  assert.equal(ownsPageStyle(shape()), false);
  assert.equal(ownsPageStyle(null), false);
  assert.equal(ownsPageStyle('div'), false);
});
