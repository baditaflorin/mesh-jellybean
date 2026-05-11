export type Stats = {
  count: number;
  mean: number;
  median: number;
  trimmedMean: number;
  min: number;
  max: number;
};

export function computeStats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median =
    n % 2 === 1
      ? (sorted[(n - 1) / 2] ?? 0)
      : ((sorted[n / 2 - 1] ?? 0) + (sorted[n / 2] ?? 0)) / 2;

  // Trim 10% from each end (round down). For n < 5, fall back to plain mean.
  const trim = Math.floor(n * 0.1);
  const trimmed = trim > 0 && n - 2 * trim > 0 ? sorted.slice(trim, n - trim) : sorted;
  const trimmedSum = trimmed.reduce((a, b) => a + b, 0);
  const trimmedMean = trimmedSum / trimmed.length;

  return {
    count: n,
    mean,
    median,
    trimmedMean,
    min: sorted[0] ?? 0,
    max: sorted[n - 1] ?? 0,
  };
}

export type Bin = { lo: number; hi: number; count: number };

export function histogramBins(values: number[], n: number): Bin[] {
  if (values.length === 0 || n <= 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) {
    // single-bucket degenerate case
    return [{ lo, hi: hi + 1, count: values.length }];
  }
  const step = (hi - lo) / n;
  const bins: Bin[] = [];
  for (let i = 0; i < n; i++) {
    bins.push({ lo: lo + i * step, hi: lo + (i + 1) * step, count: 0 });
  }
  for (const v of values) {
    let idx = Math.floor((v - lo) / step);
    if (idx < 0) idx = 0;
    if (idx >= n) idx = n - 1;
    const b = bins[idx];
    if (b) b.count++;
  }
  return bins;
}

export function suggestBinCount(n: number): number {
  if (n <= 1) return 1;
  return Math.min(20, Math.max(2, Math.ceil(Math.sqrt(n))));
}
