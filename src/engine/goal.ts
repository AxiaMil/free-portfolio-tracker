// Goal Tracker maths: day-by-day plan simulation and the month-by-month goal vs actual grid.
// The plan compounds daily at (annual return / 365); contributions land on calendar boundaries
// (1st of each month / quarter / year) and grow by the growth rate once per calendar year.
import type { DayPoint, GoalPlan } from './types.ts';
import { addDays, addMonths, eachDay, lastIndexLE } from './util.ts';

export interface GoalPoint {
  date: string;
  goal: number;
  deposits: number; // starting value + contributions so far
  contribution: number; // contributed on this day
  growthIndex: number; // investment growth only (1 = start)
}

export const DEFAULT_PLAN = (startDate: string, startValue: number): GoalPlan => ({
  startDate,
  years: 10,
  startValue: Math.round(startValue * 100) / 100,
  annualReturn: 8,
  contribution: 0,
  contributionFreq: 'Monthly',
  growthRate: 0,
  growthFreq: 'Year over Year',
});

export function goalEndDate(p: GoalPlan): string {
  const months = Math.max(1, Math.min(600, Math.round((Number(p.years) || 0) * 12)));
  return addMonths(p.startDate, months);
}

function isContributionDay(date: string, freq: GoalPlan['contributionFreq']): boolean {
  if (!date.endsWith('-01')) return false;
  const m = Number(date.slice(5, 7));
  if (freq === 'Monthly') return true;
  if (freq === 'Quarterly') return m % 3 === 1;
  return m === 1;
}

export function planIsValid(p: GoalPlan | null | undefined): p is GoalPlan {
  if (!p) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) && Number(p.years) > 0 && Number(p.years) <= 50 && isFinite(Number(p.startValue)) && isFinite(Number(p.annualReturn)) && Number(p.annualReturn) > -100 && isFinite(Number(p.contribution)) && isFinite(Number(p.growthRate));
}

export function simulateGoal(p: GoalPlan): GoalPoint[] {
  const end = goalEndDate(p);
  const dr = (Number(p.annualReturn) || 0) / 100 / 365;
  const g = (Number(p.growthRate) || 0) / 100;
  const c0 = Number(p.contribution) || 0;
  let v = Number(p.startValue) || 0;
  let dep = v;
  let idx = 1;
  let firstYear: number | null = null;
  const out: GoalPoint[] = [{ date: p.startDate, goal: v, deposits: dep, contribution: 0, growthIndex: 1 }];
  for (const d of eachDay(addDays(p.startDate, 1), end)) {
    let c = 0;
    if (c0 && isContributionDay(d, p.contributionFreq)) {
      const y = Number(d.slice(0, 4));
      if (firstYear == null) firstYear = y;
      c = c0 * Math.pow(1 + g, y - firstYear);
    }
    v = (v + c) * (1 + dr);
    dep += c;
    idx *= 1 + dr;
    out.push({ date: d, goal: v, deposits: dep, contribution: c, growthIndex: idx });
  }
  return out;
}

export function goalEndValue(p: GoalPlan): number {
  const s = simulateGoal(p);
  return s[s.length - 1].goal;
}

/** goal point on/before a date (clamped to the plan range) */
export function goalAt(sim: GoalPoint[], date: string): GoalPoint | null {
  if (!sim.length) return null;
  if (date < sim[0].date) return null;
  const i = Math.min(sim.length - 1, Math.max(0, daysIndex(sim, date)));
  return sim[i];
}

function daysIndex(sim: GoalPoint[], date: string): number {
  return lastIndexLE(sim.map((p) => p.date), date);
}

export type GoalMetric = 'Value' | 'Contribution' | 'Gross Contribution' | 'Return' | 'Cum. Return';

export interface GoalMonthCell {
  goal: Record<GoalMetric, number> | null;
  actual: Partial<Record<GoalMetric, number>> | null;
}

/**
 * Month grid "YYYY-MM" -> goal (plan) and actual (portfolio) figures at each month end.
 * Actual gross contribution and cumulative return are measured from the plan's start date.
 */
export function goalMonthly(p: GoalPlan, sim: GoalPoint[], series: DayPoint[], today: string): { years: number[]; cells: Map<string, GoalMonthCell> } {
  const cells = new Map<string, GoalMonthCell>();
  const simDates = sim.map((x) => x.date);
  const serDates = series.map((x) => x.date);
  const planStart = sim[0]?.date ?? p.startDate;
  const planEnd = sim[sim.length - 1]?.date ?? planStart;
  const first = [planStart, series[0]?.date].filter(Boolean).sort()[0] as string;
  const last = [planEnd, today].sort()[1];
  const startIdx = lastIndexLE(serDates, planStart);
  const startTwr = startIdx >= 0 ? series[startIdx].twrIndex : 1;
  const startFlows = startIdx >= 0 ? series[startIdx].netDeposits : 0;
  let prevGoalIdx = 1;
  let prevTwr: number | null = null;
  let m = `${first.slice(0, 7)}-01`;
  const years = new Set<number>();
  while (m.slice(0, 7) <= last.slice(0, 7)) {
    const key = m.slice(0, 7);
    const monthEnd = addDays(addMonths(m, 1), -1);
    years.add(Number(key.slice(0, 4)));
    const cell: GoalMonthCell = { goal: null, actual: null };
    // plan
    if (monthEnd >= planStart && m <= planEnd) {
      const i = lastIndexLE(simDates, monthEnd);
      const pt = sim[i];
      let contrib = 0;
      for (let j = Math.max(0, lastIndexLE(simDates, addDays(m, -1)) + 1); j <= i; j++) contrib += sim[j].contribution;
      cell.goal = {
        Value: pt.goal,
        Contribution: contrib,
        'Gross Contribution': pt.deposits,
        Return: pt.growthIndex / prevGoalIdx - 1,
        'Cum. Return': pt.growthIndex - 1,
      };
      prevGoalIdx = pt.growthIndex;
    }
    // portfolio
    if (series.length && monthEnd >= series[0].date && m <= today) {
      const i = lastIndexLE(serDates, monthEnd < today ? monthEnd : today);
      const pt = series[i];
      let flows = 0;
      for (let j = Math.max(0, lastIndexLE(serDates, addDays(m, -1)) + 1); j <= i; j++) flows += series[j].flow;
      const act: Partial<Record<GoalMetric, number>> = {
        Value: pt.value,
        Contribution: flows,
        Return: pt.twrIndex / (prevTwr ?? 1) - 1,
      };
      if (monthEnd >= planStart) {
        act['Gross Contribution'] = (Number(p.startValue) || 0) + (pt.netDeposits - startFlows);
        act['Cum. Return'] = startTwr ? pt.twrIndex / startTwr - 1 : 0;
      }
      cell.actual = act;
      prevTwr = pt.twrIndex;
    }
    if (cell.goal || cell.actual) cells.set(key, cell);
    m = addMonths(m, 1);
  }
  return { years: [...years].sort(), cells };
}
