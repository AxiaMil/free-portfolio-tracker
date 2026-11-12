// The space's whole front end: connect the bridge, then run the prebuilt app.
// portfolio-tracker.js is the repository's app/portfolio-tracker.js copied byte for byte: the complete app (code,
// styles and fonts) in one classic script that loads nothing else. It mounts itself into #app.
// The order of these two imports matters: the bridge must exist before the app starts.
import './host';
import './portfolio-tracker.js';
