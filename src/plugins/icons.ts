// App icons: Lucide outline icons, used through Vuetify's icon system.
// Templates (and Vuetify's own components) keep using `mdi-*` names; each name listed below is drawn with its
// Lucide equivalent, and the checkbox / radio marks with the small filled SVGs below. No icon font is loaded.
import { defineComponent, h, type Component } from 'vue';
import type { IconSet } from 'vuetify';
import {
  ArchiveRestore, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, Banknote, Briefcase, Calculator, Calendar,
  ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartPie, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft,
  ChevronsRight, ChevronsUpDown, Circle, CircleAlert, CircleCheck, CircleHelp, CirclePlus, CircleX, ClockAlert, CloudUpload, Copy, CopyPlus,
  Database, Download, Ellipsis, EllipsisVertical, Eye, EyeOff, FileChartColumn, FileSpreadsheet, FileText, Filter, Folder, FolderClock, Gem,
  Coins, House, Image, Info, LayoutDashboard, Lightbulb, List, ListFilter, LoaderCircle, Menu, Minus,
  Paperclip, Palette, Pencil, Pipette, Plus, ReceiptText, RefreshCcw, RefreshCw, Scale, Search, Settings, Share, ShieldHalf, SlidersHorizontal,
  Target, Trash2, TriangleAlert, User, Wallet, X,
} from 'lucide-vue-next';

// filled checkbox and radio marks (the selected state reads at a glance, like the Material originals).
// Shapes are plain data; the vnodes are created on every render (Vue can't reuse vnodes across renders).
type Shape = [tag: string, attrs: Record<string, string | number>];
const svg = (shapes: Shape[]) => defineComponent({
  props: { size: { type: [String, Number], default: 24 }, strokeWidth: { type: [String, Number], default: undefined } },
  setup: (p) => () => h('svg', { width: p.size, height: p.size, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, shapes.map(([tag, attrs]) => h(tag, attrs))),
});
const box: Shape = ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 4, fill: 'currentColor' }];
const ring: Shape = ['circle', { cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9 }];
const CheckboxOn = svg([box, ['path', { d: 'M7.5 12.3l3.1 3.1 5.9-6.6', fill: 'none', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }]]);
const CheckboxPartial = svg([box, ['path', { d: 'M8 12h8', stroke: '#fff', 'stroke-width': 2.2, 'stroke-linecap': 'round' }]]);
const CheckboxOff = svg([['rect', { x: 4, y: 4, width: 16, height: 16, rx: 3.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9 }]]);
const RadioOn = svg([ring, ['circle', { cx: 12, cy: 12, r: 4.5, fill: 'currentColor' }]]);
const RadioOff = svg([ring]);

const MAP: Record<string, Component> = {
  // selection marks
  'mdi-checkbox-marked': CheckboxOn,
  'mdi-checkbox-blank-outline': CheckboxOff,
  'mdi-minus-box': CheckboxPartial,
  'mdi-radiobox-marked': RadioOn,
  'mdi-radiobox-blank': RadioOff,
  // navigation
  'mdi-home': House,
  'mdi-chart-areaspline-variant': ChartArea,
  'mdi-chart-donut': ChartPie,
  'mdi-cash': Coins,
  'mdi-shield-half-full': ShieldHalf,
  'mdi-flag-checkered': Target,
  'mdi-chart-timeline-variant': ChartCandlestick,
  'mdi-scale-balance': Scale,
  'mdi-file-document-multiple': ReceiptText,
  'mdi-card-text': Gem,
  'mdi-cog': Settings,
  'mdi-menu': Menu,
  'mdi-chevron-double-left': ChevronsLeft,
  'mdi-chevron-double-right': ChevronsRight,
  'mdi-help': CircleHelp,
  'mdi-help-circle': CircleHelp,
  'mdi-help-circle-outline': CircleHelp,
  // actions
  'mdi-plus': Plus,
  'mdi-plus-circle-outline': CirclePlus,
  'mdi-minus': Minus,
  'mdi-refresh': RefreshCw,
  'mdi-sync': RefreshCcw,
  'mdi-cached': LoaderCircle,
  'mdi-pencil': Pencil,
  'mdi-delete': Trash2,
  'mdi-close': X,
  'mdi-close-circle': CircleX,
  'mdi-check': Check,
  'mdi-check-circle': CircleCheck,
  'mdi-magnify': Search,
  'mdi-filter': Filter,
  'mdi-filter-variant': ListFilter,
  'mdi-tune-variant': SlidersHorizontal,
  'mdi-export-variant': Share,
  'mdi-download': Download,
  'mdi-tray-arrow-down': Download,
  'mdi-cloud-upload': CloudUpload,
  'mdi-content-copy': Copy,
  'mdi-content-duplicate': CopyPlus,
  'mdi-backup-restore': ArchiveRestore,
  'mdi-eye': Eye,
  'mdi-eye-off': EyeOff,
  'mdi-eyedropper': Pipette,
  'mdi-eyedropper-variant': Pipette,
  'mdi-palette': Palette,
  'mdi-palette-outline': Palette,
  'mdi-paperclip': Paperclip,
  'mdi-dots-vertical': EllipsisVertical,
  'mdi-dots-horizontal': Ellipsis,
  'mdi-swap-vertical': ArrowUpDown,
  'mdi-swap-horizontal': ArrowLeftRight,
  // arrows and chevrons
  'mdi-chevron-right': ChevronRight,
  'mdi-chevron-left': ChevronLeft,
  'mdi-chevron-down': ChevronDown,
  'mdi-chevron-up': ChevronUp,
  'mdi-menu-down': ChevronDown,
  'mdi-menu-up': ChevronUp,
  'mdi-menu-right': ChevronRight,
  'mdi-menu-left': ChevronLeft,
  'mdi-page-first': ChevronsLeft,
  'mdi-page-last': ChevronsRight,
  'mdi-unfold-more-horizontal': ChevronsUpDown,
  'mdi-arrow-up': ArrowUp,
  'mdi-arrow-down': ArrowDown,
  'mdi-arrow-left': ArrowLeft,
  'mdi-arrow-right': ArrowRight,
  'mdi-arrow-right-bold': ArrowRight,
  // status
  'mdi-information': Info,
  'mdi-information-outline': Info,
  'mdi-alert-circle': CircleAlert,
  'mdi-alert-circle-outline': CircleAlert,
  'mdi-alert-outline': TriangleAlert,
  'mdi-clock-alert-outline': ClockAlert,
  'mdi-lightbulb-on-outline': Lightbulb,
  'mdi-circle': Circle,
  // things
  'mdi-chart-line': ChartLine,
  'mdi-chart-bar': ChartColumn,
  'mdi-view-quilt': LayoutDashboard,
  'mdi-cash-multiple': Wallet,
  'mdi-calculator': Calculator,
  'mdi-calendar': Calendar,
  'mdi-briefcase': Briefcase,
  'mdi-database': Database,
  'mdi-database-outline': Database,
  'mdi-file-document-outline': FileText,
  'mdi-file-delimited-outline': FileSpreadsheet,
  'mdi-file-chart': FileChartColumn,
  'mdi-folder-outline': Folder,
  'mdi-folder-clock-outline': FolderClock,
  'mdi-format-list-bulleted': List,
  'mdi-image-outline': Image,
  'mdi-bank': Banknote,
  'mdi-account': User,
};

const AppIcon = defineComponent({
  name: 'AppIcon',
  props: {
    icon: { type: [String, Array, Object, Function], default: '' },
    tag: { type: String, required: true },
  },
  setup(props) {
    return () => {
      const name = typeof props.icon === 'string' ? props.icon : '';
      const icon = MAP[name];
      if (icon) return h(props.tag, { class: 'app-icon' }, [h(icon, { size: '100%', strokeWidth: 1.9, 'aria-hidden': 'true' })]);
      if (import.meta.env.DEV && name) console.warn(`[icons] no icon mapped for ${name}`);
      return h(props.tag, { class: 'app-icon' });
    };
  },
});

export const appIcons: IconSet = { component: AppIcon as IconSet['component'] };
