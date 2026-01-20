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
 * Count working days in a given month based on applicable days
 * @param month 1-indexed month (1 = January)
 * @param year Full year (e.g., 2024)
 * @param applicableDays Array of day abbreviations that count as working days
 * @returns Number of applicable days in the month
 */
export function countWorkingDays(
  month: number,
  year: number,
  applicableDays: DayAbbrev[]
): number {
  const daysToCount = applicableDays.map(d => dayMap[d]);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const weekDay = new Date(year, month - 1, day).getDay();
    if (daysToCount.includes(weekDay)) {
      count++;
    }
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
 * @returns Calculated monthly value
 */
export function calculateMonthlyBenefitValue(
  value: number,
  valueType: 'monthly' | 'daily',
  applicableDays: DayAbbrev[],
  month: number,
  year: number
): number {
  if (valueType === 'monthly') {
    return value;
  }

  const workingDays = countWorkingDays(month, year, applicableDays);
  return value * workingDays;
}

/**
 * Get a formatted description of the benefit calculation
 * @param value Base value
 * @param valueType 'monthly' or 'daily'
 * @param applicableDays Array of days
 * @param month 1-indexed month
 * @param year Full year
 * @returns Description string like "R$ 8,00 x 22 dias = R$ 176,00"
 */
export function getBenefitCalculationDescription(
  value: number,
  valueType: 'monthly' | 'daily',
  applicableDays: DayAbbrev[],
  month: number,
  year: number
): string {
  if (valueType === 'monthly') {
    return 'Valor mensal fixo';
  }

  const workingDays = countWorkingDays(month, year, applicableDays);
  const total = value * workingDays;

  const formatCurrency = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return `${formatCurrency(value)} × ${workingDays} dias = ${formatCurrency(total)}`;
}
