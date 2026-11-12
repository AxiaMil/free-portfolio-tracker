import 'vuetify/styles';
import { createVuetify } from 'vuetify';
import { aliases } from 'vuetify/iconsets/mdi';
import { appIcons } from './icons.ts';

export default createVuetify({
  icons: { defaultSet: 'mdi', aliases, sets: { mdi: appIcons } },
  theme: {
    defaultTheme: 'trackerDark',
    themes: {
      trackerDark: {
        dark: true,
        colors: {
          background: '#0F1011', surface: '#1D1E21', 'surface-variant': '#28292D', 'on-surface-variant': '#EDEDEC',
          primary: '#4C8DFF', secondary: '#2C2E32', success: '#34D399', error: '#F87171', warning: '#FBBF24', info: '#4CC9F0',
          'on-surface': '#EDEDEC', 'on-background': '#EDEDEC',
        },
      },
      trackerLight: {
        dark: false,
        colors: {
          background: '#F5F3EE', surface: '#FFFFFF', 'surface-variant': '#1A1814', 'on-surface-variant': '#FFFFFF',
          primary: '#2F4FD8', secondary: '#ECE8DF', success: '#15803D', error: '#C0392B', warning: '#B7791F', info: '#0E9AA7',
          'on-surface': '#1A1814', 'on-background': '#1A1814',
        },
      },
    },
  },
  display: { mobileBreakpoint: 'md', thresholds: { xs: 0, sm: 600, md: 960, lg: 1280, xl: 1920, xxl: 2560 } },
  defaults: {
    VBtn: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VSelect: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VAutocomplete: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VCombobox: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTextarea: { variant: 'outlined', density: 'comfortable', hideDetails: 'auto' },
    VTooltip: { location: 'top' },
  },
});
