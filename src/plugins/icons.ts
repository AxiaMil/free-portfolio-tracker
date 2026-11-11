// App icons: Lucide outline icons, used through Vuetify's icon system.
// Templates (and Vuetify's own components) keep using `mdi-*` names; each name listed below is drawn with its
// Lucide equivalent. Names that aren't listed (checkbox and radio marks) still use the Material Design font.
import { defineComponent, h, type Component } from 'vue';
import type { IconSet } from 'vuetify';
import {
  ArchiveRestore, ArrowDown, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpDown, Banknote, Briefcase, Calculator, Calendar,
  ChartArea, ChartCandlestick, ChartColumn, ChartLine, ChartPie, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft,
  ChevronsRight, ChevronsUpDown, Circle, CircleAlert, CircleCheck, CircleHelp, CirclePlus, CircleX, ClockAlert, CloudUpload, Copy, CopyPlus,
  Database, Download, Ellipsis, EllipsisVertical, Eye, EyeOff, FileChartColumn, FileSpreadsheet, FileText, Filter, Folder, FolderClock, Gem,
  Coins, House, Image, Info, LayoutDashboard, Lightbulb, List, ListFilter, LoaderCircle, Menu, Minus,
  Paperclip, Palette, Pencil, Pipette, Plus, ReceiptText, RefreshCcw, RefreshCw, Scale, Search, Settings, Share, ShieldHalf, SlidersHorizontal,
  Target, Trash2, TriangleAlert, Wallet, X,
} from 'lucide-vue-next';

const MAP: Record<string, Component> = {
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
      const svg = MAP[name];
      if (svg) return h(props.tag, { class: 'app-icon' }, [h(svg, { size: '100%', strokeWidth: 1.9, 'aria-hidden': 'true' })]);
      return h(props.tag, { class: ['mdi', name] });
    };
  },
});

export const appIcons: IconSet = { component: AppIcon as IconSet['component'] };
