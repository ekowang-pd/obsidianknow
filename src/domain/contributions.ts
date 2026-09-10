export interface ContributionDay {
  date: string;
  count: number;
}

export interface ContributionSummary {
  days: ContributionDay[];
  total: number;
  activeDays: number;
  streak: number;
}

export function buildContributions(timestamps: Date[], now: Date): ContributionSummary {
  const today = startOfLocalDay(now);
  const days = Array.from({ length: 91 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 90 + index);
    return { date: localDate(date), count: 0 };
  });
  const counts = new Map(days.map((day) => [day.date, 0]));

  for (const timestamp of timestamps) {
    if (!Number.isNaN(timestamp.getTime())) {
      const date = localDate(timestamp);
      if (counts.has(date)) {
        counts.set(date, (counts.get(date) ?? 0) + 1);
      }
    }
  }

  for (const day of days) {
    day.count = counts.get(day.date) ?? 0;
  }

  const activeDays = days.filter((day) => day.count > 0).length;
  let streak = 0;
  for (let index = days.length - 1; index >= 0 && days[index].count > 0; index -= 1) {
    streak += 1;
  }

  return {
    days,
    total: days.reduce((sum, day) => sum + day.count, 0),
    activeDays,
    streak
  };
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
