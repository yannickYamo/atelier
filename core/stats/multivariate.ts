// atelier/core/stats/multivariate.ts — THE FEW MATRIX TOOLS CLOSENESS NEEDS, WRITTEN OUT.
//
// Closeness to an author is a question about a distribution of feature vectors, not about one feature at a
// time (docs/decisions/0010-closeness-is-a-two-sample-test.md). These are the pieces that question needs, small
// enough to read and with no dependency: a covariance that stays invertible when there are fewer pieces than
// features, a distance that respects how features move together, a kernel, its eigenvalues, a two-sample
// statistic with a permutation p-value, and a ridge logistic regression for a classifier two-sample test.
//
// Every function is deterministic for its inputs; anything random takes a seeded generator.

export type Vec = readonly number[];
export type Mat = readonly (readonly number[])[];

export const mean = (xs: Vec): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Column means of a set of rows. */
export function colMeans(rows: Mat): number[] {
  const d = rows[0]?.length ?? 0;
  const m = new Array<number>(d).fill(0);
  for (const r of rows) for (let j = 0; j < d; j++) m[j] += r[j] / rows.length;
  return m;
}

/**
 * LEDOIT–WOLF SHRINKAGE. With n pieces and d features, the sample covariance S is singular whenever n ≤ d
 * (an author's twenty pieces against fifty features), so it cannot be inverted for a distance. The estimate
 * shrinks S toward a scaled identity, μI with μ = trace(S)/d, by the intensity that minimises expected squared
 * error (Ledoit & Wolf, 2004): δ = min(1, b²/d²), d² = ‖S − μI‖², b² = min(d², Σ‖x xᵀ − S‖²/n²).
 */
export function shrunkCovariance(rows: Mat): { cov: number[][]; shrinkage: number } {
  const n = rows.length; const d = rows[0]?.length ?? 0;
  const m = colMeans(rows);
  const x = rows.map((r) => r.map((v, j) => v - m[j]));
  const s: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (const r of x) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) s[i][j] += (r[i] * r[j]) / n;
  const mu = s.reduce((a, row, i) => a + row[i], 0) / (d || 1);
  let d2 = 0;
  for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) d2 += (s[i][j] - (i === j ? mu : 0)) ** 2;
  let b2 = 0;
  for (const r of x) {
    let e = 0;
    for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) e += (r[i] * r[j] - s[i][j]) ** 2;
    b2 += e / (n * n);
  }
  b2 = Math.min(b2, d2);
  const shrinkage = d2 > 0 ? b2 / d2 : 1;
  const cov = s.map((row, i) => row.map((v, j) => (1 - shrinkage) * v + (i === j ? shrinkage * mu : 0)));
  return { cov, shrinkage };
}

/** The inverse of a symmetric positive-definite matrix, by Gauss–Jordan with partial pivoting. */
export function invert(a: Mat): number[][] {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error('matrix is singular');
    [m[c], m[p]] = [m[p], m[c]];
    const piv = m[c][c];
    for (let j = 0; j < 2 * n; j++) m[c][j] /= piv;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c];
      if (f !== 0) for (let j = 0; j < 2 * n; j++) m[r][j] -= f * m[c][j];
    }
  }
  return m.map((row) => row.slice(n));
}

/** √((x − μ)ᵀ P (x − μ)) for a precision matrix P. */
export function mahalanobis(x: Vec, mu: Vec, precision: Mat): number {
  const v = x.map((xi, i) => xi - mu[i]);
  let s = 0;
  for (let i = 0; i < v.length; i++) for (let j = 0; j < v.length; j++) s += v[i] * precision[i][j] * v[j];
  return Math.sqrt(Math.max(0, s));
}

const sqDist = (a: Vec, b: Vec): number => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

/** The median pairwise distance: the usual bandwidth for a Gaussian kernel when nothing else fixes it. */
export function medianBandwidth(rows: Mat): number {
  const ds: number[] = [];
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) ds.push(Math.sqrt(sqDist(rows[i], rows[j])));
  ds.sort((a, b) => a - b);
  const med = ds.length ? ds[Math.floor(ds.length / 2)] : 1;
  return med > 0 ? med : 1;
}

export const gaussian = (a: Vec, b: Vec, h: number): number => Math.exp(-sqDist(a, b) / (2 * h * h));

/** Eigenvalues of a symmetric matrix, by cyclic Jacobi rotations. */
export function symmetricEigenvalues(a: Mat, sweeps = 60): number[] {
  const n = a.length;
  const m = a.map((r) => [...r]);
  for (let s = 0; s < sweeps; s++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += m[p][q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(m[p][q]) < 1e-15) continue;
        const theta = (m[q][q] - m[p][p]) / (2 * m[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1); const sn = t * c;
        for (let k = 0; k < n; k++) {
          const akp = m[k][p]; const akq = m[k][q];
          m[k][p] = c * akp - sn * akq; m[k][q] = sn * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = m[p][k]; const aqk = m[q][k];
          m[p][k] = c * apk - sn * aqk; m[q][k] = sn * apk + c * aqk;
        }
      }
    }
  }
  return m.map((r, i) => r[i]);
}

/**
 * THE VENDI SCORE (Friedman & Dieng, 2023): the exponential of the entropy of the eigenvalues of K/n, for a
 * similarity kernel K with ones on its diagonal. It reads as an effective number of distinct items: n for n
 * texts unlike each other, 1 for n copies of one. Compared between N outputs and N of the author's pieces, it
 * says whether the outputs are as varied as the author.
 */
export function vendi(rows: Mat, h = medianBandwidth(rows)): number {
  const n = rows.length;
  if (n === 0) return 0;
  const k = rows.map((a) => rows.map((b) => gaussian(a, b, h) / n));
  const ev = symmetricEigenvalues(k).filter((l) => l > 1e-12);
  return Math.exp(-ev.reduce((s, l) => s + l * Math.log(l), 0));
}

/** The unbiased squared maximum mean discrepancy between two samples, under a Gaussian kernel of bandwidth h. */
export function mmd2(x: Mat, y: Mat, h: number): number {
  const avg = (a: Mat, b: Mat, same: boolean): number => {
    let s = 0; let n = 0;
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      if (same && i === j) continue;
      s += gaussian(a[i], b[j], h); n += 1;
    }
    return n ? s / n : 0;
  };
  return avg(x, x, true) + avg(y, y, true) - 2 * avg(x, y, false);
}

/**
 * A permutation test for MMD: the share of random relabellings of the pooled sample whose MMD² is at least the
 * observed one. A small p says the two samples come from different distributions.
 */
export function mmdTest(x: Mat, y: Mat, rand: () => number, permutations = 500): { mmd2: number; p: number; bandwidth: number } {
  const pooled = [...x, ...y];
  const h = medianBandwidth(pooled);
  const observed = mmd2(x, y, h);
  let atLeast = 0;
  const idx = pooled.map((_, i) => i);
  for (let t = 0; t < permutations; t++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const a = idx.slice(0, x.length).map((i) => pooled[i]); const b = idx.slice(x.length).map((i) => pooled[i]);
    if (mmd2(a, b, h) >= observed) atLeast += 1;
  }
  return { mmd2: observed, p: (atLeast + 1) / (permutations + 1), bandwidth: h };
}

/** A ridge-penalised logistic regression, fitted by gradient descent. Returns weights and bias. */
export function fitLogistic(rows: Mat, labels: readonly number[], opts: { lambda?: number; steps?: number; rate?: number } = {}): { w: number[]; b: number } {
  const lambda = opts.lambda ?? 1; const steps = opts.steps ?? 400; const rate = opts.rate ?? 0.1;
  const d = rows[0]?.length ?? 0; const n = rows.length;
  const w = new Array<number>(d).fill(0); let b = 0;
  for (let s = 0; s < steps; s++) {
    const gw = new Array<number>(d).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = rows[i].reduce((a, v, j) => a + v * w[j], b);
      const e = 1 / (1 + Math.exp(-z)) - labels[i];
      for (let j = 0; j < d; j++) gw[j] += e * rows[i][j] / n;
      gb += e / n;
    }
    for (let j = 0; j < d; j++) w[j] -= rate * (gw[j] + (lambda * w[j]) / n);
    b -= rate * gb;
  }
  return { w, b };
}

export const logit = (m: { w: readonly number[]; b: number }, x: Vec): number => x.reduce((a, v, j) => a + v * m.w[j], m.b);
