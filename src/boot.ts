// Starts the app in a page element. Shared by the regular build (main.ts, index.html) and the one-file build
// (single.ts, app/portfolio-tracker.js).
import './platform/style-tunnel.ts'; // first of all: in a Muse space, charts need plain `style` objects (see the file)
import './platform/history.ts'; // before the router, which uses history as soon as it is created
import { createApp } from 'vue';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import vuetify from './plugins/vuetify.ts';
import './styles/app.scss';
import App from './App.vue';
import { router } from './router.ts';
import { init } from './store.ts';
import './charts.ts';

export function start(target: Element | string) {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  try {
    if (!el) throw new Error(`no element ${String(target)} to start in`);
    createApp(App).use(vuetify).use(router).mount(el);
  } catch (e) {
    failed(el ?? document.body, e);
    return;
  }
  init();
}

/** never a silent blank page: say what happened, keep the data safe, offer to try again */
function failed(el: Element, e: unknown) {
  console.error('Portfolio Tracker could not start', e);
  const detail = `${e instanceof Error ? e.message : String(e)} · ${location.protocol}//${location.host || '(no host)'} · ${navigator.userAgent}`;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;font:15px/1.5 system-ui,sans-serif;background:#0F1011;color:#E8E8E8';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:17px;font-weight:600';
  title.textContent = "Portfolio Tracker couldn't start";
  const note = document.createElement('div');
  note.style.cssText = 'color:#9A9A9A;max-width:420px';
  note.textContent = 'Your saved data is not affected.';
  const retry = document.createElement('button');
  retry.textContent = 'Try again';
  retry.style.cssText = 'margin-top:6px;padding:9px 18px;border-radius:10px;border:1px solid #3A3A3A;background:transparent;color:inherit;font:inherit;cursor:pointer';
  retry.onclick = () => location.reload();
  const diag = document.createElement('div');
  diag.style.cssText = 'margin-top:14px;color:#6E6E6E;font-size:11.5px;max-width:560px;word-break:break-word';
  diag.textContent = detail;
  box.append(title, note, retry, diag);
  el.replaceChildren(box);
}
