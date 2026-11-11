import { createApp } from 'vue';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import vuetify from './plugins/vuetify.ts';
import './styles/app.scss';
import App from './App.vue';
import { router } from './router.ts';
import { init } from './store.ts';
import './charts.ts';

createApp(App).use(vuetify).use(router).mount('#app');
init();
