// Entry of the one-file build (app/portfolio-tracker.js): the whole app with its styles and fonts in one classic
// script, for hosts that take a single bundle. Nothing else is fetched. Any page can load it, in <head> or <body>:
// it adds the viewport tag if the page has none, mounts into #app (created when missing) and reads an optional
// window.portfolioHost bridge defined before it (docs/HOSTING.md).
import { start } from './boot.ts';

function viewport() {
  if (document.querySelector('meta[name="viewport"]')) return;
  const m = document.createElement('meta');
  m.name = 'viewport';
  m.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  document.head.appendChild(m);
}

function run() {
  viewport();
  let el = document.getElementById('app');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app';
    document.body.appendChild(el);
  }
  start(el);
}

if (document.body) run();
else document.addEventListener('DOMContentLoaded', run, { once: true });
