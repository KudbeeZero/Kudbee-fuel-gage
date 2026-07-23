export interface Point3D {
  x: number;
  y: number;
  z: number;
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function scale(v: number[], s: number): number[] {
  return v.map((vi) => vi * s);
}

function vectorSub(a: number[], b: number[]): number[] {
  return a.map((ai, i) => ai - (b[i] ?? 0));
}

function vectorAdd(a: number[], b: number[]): number[] {
  return a.map((ai, i) => ai + (b[i] ?? 0));
}

function matVecMul(vectors: number[][], v: number[]): number[] {
  const dim = v.length;
  const result = new Array(dim).fill(0);
  for (let i = 0; i < vectors.length; i++) {
    const row = vectors[i] ?? [];
    const r = row.length;
    for (let j = 0; j < dim; j++) {
      result[j] = (result[j] ?? 0) + (j < r ? (row[j] ?? 0) : 0) * (v[j] ?? 0);
    }
  }
  return result;
}

function matVecMulT(vectors: number[][], v: number[]): number[] {
  const n = vectors.length;
  const result = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const row = vectors[i] ?? [];
    const len = Math.min(row.length, v.length);
    let sum = 0;
    for (let j = 0; j < len; j++) sum += (row[j] ?? 0) * (v[j] ?? 0);
    result[i] = sum;
  }
  return result;
}

function covarianceVecMul(vectors: number[][], v: number[]): number[] {
  const Xv = matVecMulT(vectors, v);
  return matVecMul(vectors, Xv).map((vi) => vi / vectors.length);
}

function powerIteration(vectors: number[][], dim: number, maxIter: number, tol: number): number[] {
  let v = new Array(dim).fill(0).map(() => Math.random() * 2 - 1);
  const vNorm = norm(v);
  if (vNorm === 0) {
    v[0] = 1;
  } else {
    v = scale(v, 1 / vNorm);
  }

  for (let iter = 0; iter < maxIter; iter++) {
    const Cv = covarianceVecMul(vectors, v);
    const CvNorm = norm(Cv);
    if (CvNorm === 0) break;
    const nextV = scale(Cv, 1 / CvNorm);
    const diff = norm(vectorSub(nextV, v));
    v = nextV;
    if (diff < tol) break;
  }

  return v;
}

function deflate(vectors: number[][], eigenvectors: number[][]): number[][] {
  let deflated = vectors;
  for (const ev of eigenvectors) {
    const evNorm = norm(ev);
    if (evNorm === 0) continue;
    const unitEv = scale(ev, 1 / evNorm);
    deflated = deflated.map((row) => {
      const len = Math.min(row.length, unitEv.length);
      let proj = 0;
      for (let j = 0; j < len; j++) proj += (row[j] ?? 0) * (unitEv[j] ?? 0);
      return row.map((ri, j) => ri - proj * (j < unitEv.length ? (unitEv[j] ?? 0) : 0));
    });
  }
  return deflated;
}

function padOrSlice(vector: number[], targetDim: number): number[] {
  if (vector.length === targetDim) return vector;
  if (vector.length < targetDim) {
    return [...vector, ...new Array(targetDim - vector.length).fill(0)];
  }
  return vector.slice(0, targetDim);
}

function scaleToRange(points: { x: number; y: number; z: number }[]): { x: number; y: number; z: number }[] {
  if (points.length <= 1) return points;

  let minX = Infinity; let maxX = -Infinity;
  let minY = Infinity; let maxY = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const rangeZ = maxZ - minZ || 1;

  return points.map((p) => ({
    x: ((p.x - minX) / rangeX) * 2 - 1,
    y: ((p.y - minY) / rangeY) * 2 - 1,
    z: ((p.z - minZ) / rangeZ) * 2 - 1,
  }));
}

function project(v: number[], components: number[][]): { x: number; y: number; z: number } {
  const x = components[0] ? dot(v, components[0]) : 0;
  const y = components[1] ? dot(v, components[1]) : 0;
  const z = components[2] ? dot(v, components[2]) : 0;
  return { x, y, z };
}

export function projectTo3D(vectors: number[][]): Point3D[] {
  if (!vectors || vectors.length === 0) return [];

  const lengths = vectors.map((v) => v.length);
  const maxDim = lengths.length > 0 ? Math.max(...lengths) : 0;
  if (maxDim <= 0 || !Number.isFinite(maxDim)) return vectors.map(() => ({ x: 0, y: 0, z: 0 }));

  const normalized = vectors.map((v) => padOrSlice(v, maxDim));

  if (normalized.length === 1) {
    return [{ x: 0, y: 0, z: 0 }];
  }

  const n = normalized.length;
  const mean = new Array(maxDim).fill(0);
  for (const row of normalized) {
    for (let j = 0; j < maxDim; j++) {
      mean[j] = (mean[j] ?? 0) + (row[j] ?? 0) / n;
    }
  }

  const centered = normalized.map((row) => row.map((v, j) => v - mean[j]));

  const effectiveDim = Math.min(maxDim, 3);
  const eigenvectors: number[][] = [];

  let current = centered;
  for (let i = 0; i < effectiveDim; i++) {
    const ev = powerIteration(current, maxDim, 100, 1e-7);
    eigenvectors.push(ev);
    current = deflate(current, [ev]);
  }

  const projections = normalized.map((row) => project(row, eigenvectors));
  return scaleToRange(projections);
}
