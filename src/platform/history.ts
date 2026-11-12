// Some documents refuse history.pushState / replaceState: a page loaded from a blob: URL, an about:srcdoc frame,
// a sandboxed frame without an origin. There the router's first navigation would throw and leave a blank page.
// When the browser refuses, change the #hash instead, which every document allows. Where the calls work (almost
// everywhere) this changes nothing. Imported before the router is created.
type Method = 'pushState' | 'replaceState';

if (typeof history !== 'undefined') {
  for (const name of ['pushState', 'replaceState'] as Method[]) {
    const native = history[name];
    if (typeof native !== 'function') continue;
    history[name] = function (this: History, data: unknown, unused: string, url?: string | URL | null) {
      try {
        return native.call(this, data, unused, url);
      } catch (e) {
        const hash = url == null ? null : String(url).split('#')[1];
        if (hash == null) throw e;
        if (location.hash.slice(1) !== hash) location.hash = hash;
      }
    } as History[Method];
  }
}

export {};
