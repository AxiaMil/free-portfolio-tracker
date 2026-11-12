// ECharts registration (tree-shaken) + shared chart theme bits.
//
// Charts use vue-echarts' CSP build ('vue-echarts/csp'). The default build defines its <x-vue-echarts> element
// through `new Function(...)`, which strict hosts refuse (Meta Muse won't publish a space whose script builds
// code from a string). The CSP build skips that element and needs this one stylesheet instead.
import 'vue-echarts/csp/style.css';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart, PieChart, TreemapChart, ScatterChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, MarkPointComponent, MarkLineComponent, GraphicComponent, TitleComponent,
} from 'echarts/components';

use([CanvasRenderer, LineChart, BarChart, PieChart, TreemapChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, MarkPointComponent, MarkLineComponent, GraphicComponent, TitleComponent]);

import { palette } from './theme.ts';

// These follow the active theme. They are live ES-module bindings: syncChartTheme() reassigns them and the
// app remounts the current page, so every chart option is rebuilt with the new colours.
export let PALETTE: string[] = palette.series;
export let SECTOR_PALETTE: string[] = palette.sector;
export let AXIS_COLOR = palette.axis;
export let GRID_COLOR = palette.grid;
export const FONT = "'Geist Variable', 'Geist', system-ui, sans-serif";

export const tooltipBase = {
  backgroundColor: palette.tooltipBg,
  borderColor: palette.tooltipBorder,
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: palette.tooltipText, fontFamily: FONT, fontSize: 12.5 },
  extraCssText: 'border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.28);font-variant-numeric:tabular-nums;',
};

export function syncChartTheme() {
  PALETTE = palette.series;
  SECTOR_PALETTE = palette.sector;
  AXIS_COLOR = palette.axis;
  GRID_COLOR = palette.grid;
  tooltipBase.backgroundColor = palette.tooltipBg;
  tooltipBase.borderColor = palette.tooltipBorder;
  tooltipBase.textStyle = { ...tooltipBase.textStyle, color: palette.tooltipText };
  tooltipBase.extraCssText = `border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,${palette.dark ? 0.35 : 0.1});font-variant-numeric:tabular-nums;`;
}
