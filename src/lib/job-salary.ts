export interface JobSalaryBase {
  "@type": "MonetaryAmount";
  currency: "CNY";
  value: {
    "@type": "QuantitativeValue";
    minValue?: number;
    maxValue?: number;
    value?: number;
    unitText: "MONTH";
  };
}

const SALARY_UNITS: Record<string, number> = {
  k: 1000,
  千: 1000,
  万: 10000,
  元: 1,
};

function toAmount(raw: string, unit?: string): number {
  const value = Number(raw);
  const multiplier = unit ? (SALARY_UNITS[unit] ?? 1) : 1;
  return Math.round(value * multiplier);
}

export function parseJobSalary(salary: string | null | undefined): { baseSalary?: JobSalaryBase } {
  if (!salary) return {};

  const normalized = salary
    .replace(/\s+/g, "")
    .replace(/[—–~～至]/g, "-")
    .toLowerCase();
  if (normalized.includes("面议") || normalized.includes("negotiable")) {
    return {};
  }

  const range = normalized.match(/(\d+(?:\.\d+)?)(k|千|万|元)?-(\d+(?:\.\d+)?)(k|千|万|元)?/);
  if (range) {
    const [, rawMin, minUnit, rawMax, maxUnit] = range;
    const minValue = toAmount(rawMin, minUnit || maxUnit);
    const maxValue = toAmount(rawMax, maxUnit || minUnit);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
      return {};
    }
    const [low, high] = minValue <= maxValue ? [minValue, maxValue] : [maxValue, minValue];
    return {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          minValue: low,
          maxValue: high,
          unitText: "MONTH",
        },
      },
    };
  }

  const single = normalized.match(/(\d+(?:\.\d+)?)(k|千|万|元)/);
  if (single) {
    const [, raw, unit] = single;
    const value = toAmount(raw, unit);
    if (!Number.isFinite(value)) {
      return {};
    }
    return {
      baseSalary: {
        "@type": "MonetaryAmount",
        currency: "CNY",
        value: {
          "@type": "QuantitativeValue",
          value,
          unitText: "MONTH",
        },
      },
    };
  }

  return {};
}

export function toIsoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function addDays(value: Date | string | null | undefined, days: number): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
