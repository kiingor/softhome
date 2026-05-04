// Day abbreviations used in the system
export type DayAbbrev = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

// Map day abbreviations to JS Date weekday numbers (0 = Sunday)
const dayMap: Record<DayAbbrev, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

// Day labels in Portuguese
export const dayLabels: Record<DayAbbrev, string> = {
  sun: 'Dom',
  mon: 'Seg',
  tue: 'Ter',
  wed: 'Qua',
  thu: 'Qui',
  fri: 'Sex',
  sat: 'Sáb',
};

// Default working days (Monday to Friday)
export const defaultWorkingDays: DayAbbrev[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

/**
 * Count working days in a given month based on applicable days,
 * optionally subtracting holidays.
 *
 * @param month 1-indexed month (1 = January)
 * @param year Full year
 * @param applicableDays Array of day abbreviations that count as working days
 * @param holidays Optional array of YYYY-MM-DD strings to exclude from the count
 * @returns Number of applicable days in the month minus matching holidays
 */
export function countWorkingDays(
  month: number,
  year: number,
  applicableDays: DayAbbrev[],
  holidays: string[] = []
): number {
  const daysToCount = applicableDays.map(d => dayMap[d]);
  const daysInMonth = new Date(year, month, 0).getDate();
  const holidaySet = new Set(holidays);
  const monthStr = String(month).padStart(2, '0');
  let count = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (!daysToCount.includes(weekDay)) continue;

    const iso = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
    if (holidaySet.has(iso)) continue;

    count++;
  }

  return count;
}

/**
 * Count holidays of the month that fall on an applicable workday
 * (i.e. holidays that effectively reduce the benefit count).
 */
export function countApplicableHolidays(
  month: number,
  year: number,
  applicableDays: DayAbbrev[],
  holidays: string[] = []
): number {
  if (holidays.length === 0) return 0;
  const daysToCount = applicableDays.map(d => dayMap[d]);
  const monthStr = String(month).padStart(2, '0');
  let count = 0;
  for (const iso of holidays) {
    if (!iso.startsWith(`${year}-${monthStr}-`)) continue;
    const day = Number(iso.slice(8, 10));
    const weekDay = new Date(year, month - 1, day).getDay();
    if (daysToCount.includes(weekDay)) count++;
  }
  return count;
}

/**
 * Calculate the monthly value of a benefit
 * @param value Base value of the benefit
 * @param valueType 'monthly' or 'daily'
 * @param applicableDays Array of days when the benefit applies (for daily type)
 * @param month 1-indexed month
 * @param year Full year
 * @param holidays Optional list of YYYY-MM-DD to subtract from working days
 */
export function calculateMonthlyBenefitValue(
  value: number,
  valueType: 'monthly' | 'daily',
  applicableDays: DayAbbrev[],
  month: number,
  year: number,
  holidays: string[] = []
): number {
  if (valueType === 'monthly') {
    return value;
  }

  const workingDays = countWorkingDays(month, year, applicableDays, holidays);
  return value * workingDays;
}

/**
 * Formatted description of the benefit calculation. When holidays
 * exist in the applicable workdays, surfaces them in the breakdown:
 *   "R$ 8,00 × 20 dias (22 − 2 feriados) = R$ 160,00"
 */
export function getBenefitCalculationDescription(
  value: number,
  valueType: 'monthly' | 'daily',
  applicableDays: DayAbbrev[],
  month: number,
  year: number,
  holidays: string[] = []
): string {
  if (valueType === 'monthly') {
    return 'Valor mensal fixo';
  }

  const workingDays = countWorkingDays(month, year, applicableDays, holidays);
  const holidayCount = countApplicableHolidays(month, year, applicableDays, holidays);
  const baseDays = workingDays + holidayCount;
  const total = value * workingDays;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  if (holidayCount > 0) {
    const plural = holidayCount === 1 ? 'feriado' : 'feriados';
    return `${formatCurrency(value)} × ${workingDays} dias (${baseDays} − ${holidayCount} ${plural}) = ${formatCurrency(total)}`;
  }

  return `${formatCurrency(value)} × ${workingDays} dias = ${formatCurrency(total)}`;
}
