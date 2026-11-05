// patchHole — one patch for one hole, the way Liepa fills them ("Filling Holes in
// Meshes", 2003). Three steps, each one answering to the surface around the hole:
//   triangulate  of all ways to cover the rim, the one that bends least against the
//                neighbouring faces, then the smallest area
//   refine       add points until the faces are the size of the faces around the rim
//   fair         solve for the smoothest surface that leaves the rim the way the
//                neighbouring faces arrive at it
export type V = [number, number, number];

const DP_MOST = 120;      // the best covering costs rim length cubed; past this the rough one starts it
const ROOM = Math.SQRT2;  // a face splits when its centre is this much further from a corner than the local face size
const MOST_POINTS = 6000;
const ROUNDS = 24;
const FAIR_STEPS = 400;
const WANDER = 3;         // a solved patch reaching further than this many rims away is thrown out

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const size = (a: V) => Math.hypot(a[0], a[1], a[2]);
const apart = (a: V, b: V) => size(sub(a, b));

/** the unit normal and the area of a triangle */
function faceOf(a: V, b: V, c: V): { n: V; area: number } {
  const n = cross(sub(b, a), sub(c, a)), l = size(n);
  return { n: l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0], area: l / 2 };
}
const bend = (a: V, b: V) => (size(a) && size(b) ? Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) : 0);

/** the covering of the rim that bends least against what surrounds it; outside[i] is
 *  the normal of the face beyond rim edge i to i+1 */
function triangulate(p: V[], outside: V[]): number[][] {
  const n = p.length;
  if (n === 3) return [[0, 1, 2]];
  const worst = new Float64Array(n * n), area = new Float64Array(n * n), apex = new Int32Array(n * n).fill(-1);
  const normalOver = (i: number, j: number): V => (apex[i * n + j] < 0 ? outside[i] : faceOf(p[i], p[apex[i * n + j]], p[j]).n);
  for (let d = 2; d < n; d++) for (let i = 0; i + d < n; i++) {
    const j = i + d;
    let bestWorst = Infinity, bestArea = Infinity, best = -1;
    for (let k = i + 1; k < j; k++) {
      const f = faceOf(p[i], p[k], p[j]);
      let w = Math.max(worst[i * n + k], worst[k * n + j], bend(f.n, normalOver(i, k)), bend(f.n, normalOver(k, j)));
      if (d === n - 1) w = Math.max(w, bend(f.n, outside[n - 1]));
      if (f.area === 0) w = Math.PI;
      const a = area[i * n + k] + area[k * n + j] + f.area;
      if (w < bestWorst - 1e-6 || (w < bestWorst + 1e-6 && a < bestArea)) { bestWorst = w; bestArea = a; best = k; }
    }
    worst[i * n + j] = bestWorst; area[i * n + j] = bestArea; apex[i * n + j] = best;
  }
  const out: number[][] = [], todo: [number, number][] = [[0, n - 1]];
  while (todo.length) {
    const [i, j] = todo.pop()!, k = apex[i * n + j];
    if (k < 0) continue;
    out.push([i, k, j]);
    todo.push([i, k], [k, j]);
  }
  return out;
}

const key = (a: number, b: number) => (a < b ? a * 67108864 + b : b * 67108864 + a);

/** swap the diagonal of any two faces where the other diagonal gives better shapes */
function relax(p: V[], tris: number[][]): void {
  const edges = new Map<number, number[]>();
  tris.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const k = key(t[e], t[(e + 1) % 3]);
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k)!.push(i);
    }
  });
  const todo = [...edges.keys()];
  let left = tris.length * 20;
  const across = (x: number, a: number, b: number) => {
    const u = sub(p[a], p[x]), v = sub(p[b], p[x]);
    return Math.acos(Math.max(-1, Math.min(1, dot(u, v) / ((size(u) * size(v)) || 1e-30))));
  };
  const swapIn = (k: number, was: number, now: number) => {
    const l = edges.get(k);
    if (l && l.includes(was)) l[l.indexOf(was)] = now;
  };
  while (todo.length && left-- > 0) {
    const k = todo.pop()!, two = edges.get(k);
    if (!two || two.length !== 2) continue;
    const [i, j] = two, t = tris[i], u = tris[j];
    const e = t.findIndex((v, n) => key(v, t[(n + 1) % 3]) === k);
    const a = t[e], b = t[(e + 1) % 3], c = t[(e + 2) % 3], d = u.find((v) => v !== a && v !== b)!;
    if (c === d || edges.has(key(c, d)) || across(c, a, b) + across(d, a, b) <= Math.PI + 1e-9) continue;
    const old = faceOf(p[a], p[b], p[c]).n;
    if (dot(faceOf(p[a], p[d], p[c]).n, old) <= 0 || dot(faceOf(p[d], p[b], p[c]).n, old) <= 0) continue;
    tris[i] = [a, d, c];
    tris[j] = [d, b, c];
    edges.delete(k);
    edges.set(key(c, d), [i, j]);
    swapIn(key(a, d), j, i);
    swapIn(key(b, c), i, j);
    todo.push(key(a, c), key(a, d), key(b, c), key(b, d));
  }
}

/** split faces until each is about the size of the faces around the rim */
function refine(p: V[], local: number[], tris: number[][]): void {
  for (let round = 0; round < ROUNDS && p.length < MOST_POINTS; round++) {
    let split = false;
    for (let t = tris.length - 1; t >= 0 && p.length < MOST_POINTS; t--) {
      const [a, b, c] = tris[t];
      const mid: V = [(p[a][0] + p[b][0] + p[c][0]) / 3, (p[a][1] + p[b][1] + p[c][1]) / 3, (p[a][2] + p[b][2] + p[c][2]) / 3];
      const here = (local[a] + local[b] + local[c]) / 3;
      if (![a, b, c].every((v) => ROOM * apart(mid, p[v]) > Math.max(here, local[v]))) continue;
      const m = p.length;
      p.push(mid);
      local.push(here);
      tris[t] = [a, b, m];
      tris.push([b, c, m], [c, a, m]);
      split = true;
    }
    relax(p, tris);
    if (!split) break;
  }
}

/** Move the new points to the smoothest surface: the bending, as the graph Laplacian
 *  squared, is smallest. The rim and the ring beyond it hold still, so the patch
 *  leaves the rim along the neighbouring faces. Conjugate gradients on the normal
 *  equations. */
function fair(p: V[], rim: number, tris: number[][], around: V[][]): void {
  if (p.length === rim) return;
  const rows = p.length;
  const near: Set<number>[] = p.map(() => new Set<number>());
  for (const t of tris) for (let e = 0; e < 3; e++) { near[t[e]].add(t[(e + 1) % 3]); near[t[(e + 1) % 3]].add(t[e]); }
  const links = near.map((s) => [...s]);
  const degree = links.map((l, r) => l.length + (r < rim ? around[r].length : 0));
  const span = Math.max(...p.slice(0, rim).map((q) => apart(q, p[0])), 1e-12);
  const start = p.map((q) => [...q] as V);
  const sum = (f: Float64Array) => { let s = 0; for (let i = 0; i < f.length; i++) s += f[i] * f[i]; return s; };
  for (let axis = 0; axis < 3; axis++) {
    const x = new Float64Array(rows);
    for (let i = 0; i < rows; i++) x[i] = p[i][axis];
    const fixed = new Float64Array(rows);   // the rim's neighbours outside the patch only add to its row
    for (let r = 0; r < rim; r++) for (const q of around[r]) fixed[r] += q[axis];
    const K = (f: Float64Array) => {        // bending at every row
      const y = new Float64Array(rows);
      for (let r = 0; r < rows; r++) {
        let s = degree[r] * f[r];
        for (const q of links[r]) s -= f[q];
        y[r] = s;
      }
      return y;
    };
    const back = (y: Float64Array) => {     // from the rows back onto the new points
      const g = new Float64Array(rows);
      for (let j = rim; j < rows; j++) {
        let s = degree[j] * y[j];
        for (const q of links[j]) s -= y[q];
        g[j] = s;
      }
      return g;
    };
    const res = K(x);
    for (let i = 0; i < rows; i++) res[i] = fixed[i] - res[i];
    let g = back(res), gg = sum(g);
    const d = g.slice(), first = gg;
    for (let step = 0; step < FAIR_STEPS && gg > first * 1e-14 && gg > 0; step++) {
      const q = K(d);
      for (let i = 0; i < rim; i++) q[i] -= degree[i] * d[i];   // the rim does not move
      const qq = sum(q);
      if (!qq) break;
      const a = gg / qq;
      for (let i = rim; i < rows; i++) x[i] += a * d[i];
      for (let i = 0; i < rows; i++) res[i] -= a * q[i];
      g = back(res);
      const next = sum(g), b = next / gg;
      for (let i = rim; i < rows; i++) d[i] = g[i] + b * d[i];
      gg = next;
    }
    for (let i = rim; i < rows; i++) p[i][axis] = x[i];
  }
  const wandered = p.some((q, i) => i >= rim && (!Number.isFinite(q[0] + q[1] + q[2]) || apart(q, start[i]) > span * WANDER));
  if (wandered) p.forEach((q, i) => { q[0] = start[i][0]; q[1] = start[i][1]; q[2] = start[i][2]; });
}

/** how far a covering faces the same way as the faces around it; below zero it is inside out */
function agreement(p: V[], faces: number[][], outside: V[]): number {
  const m = outside.reduce<V>((s, n) => [s[0] + n[0], s[1] + n[1], s[2] + n[2]], [0, 0, 0]);
  return faces.reduce((s, f) => s + dot(cross(sub(p[f[1]], p[f[0]]), sub(p[f[2]], p[f[0]])), m), 0);
}

export interface Rim {
  points: V[];         // around the hole
  outside: V[];        // normal of the face beyond each rim edge
  faceSize: number[];  // usual edge length at each rim point
  around: V[][];       // each rim point's neighbours outside the hole
  rough?: number[][];  // a covering to start from, for rims too long to search
  turned?: boolean;    // already walked the other way
}

/** the patch: faces over points, the first of which are the rim, in order */
export function patchHole(rim: Rim): { points: V[]; faces: number[][]; nearest: number[] } {
  const n = rim.points.length;
  const points = rim.points.map((q) => [...q] as V);
  const faces = n > DP_MOST && rim.rough ? rim.rough : triangulate(points, rim.outside);
  // walking a rim can start from faces wound the other way; the surface around it decides
  if (agreement(points, faces, rim.outside) < 0 && n <= DP_MOST) {
    const flipped = patchHole({ ...rim, points: rim.points.slice().reverse(), outside: rim.outside.slice(0, -1).reverse().concat(rim.outside[n - 1]), faceSize: rim.faceSize.slice().reverse(), around: rim.around.slice().reverse(), turned: true });
    if (!rim.turned) return { ...flipped, faces: flipped.faces.map((f) => f.map((i) => (i < n ? n - 1 - i : i))), nearest: flipped.nearest.map((i) => n - 1 - i) };
  }
  const local = rim.faceSize.slice();
  relax(points, faces);
  refine(points, local, faces);
  fair(points, n, faces, rim.around);
  relax(points, faces);
  if (agreement(points, faces, rim.outside) < 0) for (const f of faces) f.reverse();
  const nearest = points.slice(n).map((q) => {
    let best = 0, d = Infinity;
    for (let i = 0; i < n; i++) { const e = apart(q, points[i]); if (e < d) { d = e; best = i; } }
    return best;
  });
  return { points, faces, nearest };
}
