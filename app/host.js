// Host bridge (optional). Left as it is, the tracker runs on its own: it saves to this browser's storage and
// loads prices through `npm run dev` / `npm start`, or straight from Yahoo Finance where the runtime allows it.
//
// An app platform (for example a Meta Muse space) connects its own storage and a server-side fetch by defining
// window.portfolioHost here, or on a same-origin page that shows the app in a frame. Nothing else in the app
// changes. Every member is optional. Full contract: docs/HOSTING.md
//
// window.portfolioHost = {
//   name: 'Muse space storage',
//   // return the saved state (a JSON object or string), or null the first time
//   async loadState() { return null; },
//   // persist the whole state (a plain JSON object); called about 350 ms after every change
//   async saveState(state) {},
//   // GET an https://query1|query2.finance.yahoo.com URL on the server side and return the parsed JSON
//   async fetchJson(url) { const r = await fetch(url); return r.json(); },
// };
