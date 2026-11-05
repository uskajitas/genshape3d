// closeHoles — the last pass on every generated model.
//
// A hole is exact, not a judgement: an edge used an odd number of times. One use
// is a plain rim; three is a rim running along a seam where a third face joins.
// Counted that way a rim can never stop halfway, every one is a closed ring. Weld
// the points that sit in the same place, walk the open edges into loops, and close
// each loop with a patch shaped by the surface around it (see patchHole). Faces with
// new points, or that would stretch the paint, read one colour from beside the rim
// (see flatten). Same file in, same file out, every time.
import { saveSealReport, sealJob, sealSettings, unreportedJobs, unsealedJobs } from './jobsRepo';
import { publicR2Url, uploadToR2 } from './r2';
import { patchHole, type V } from './patchHole';

const SAME = 1e5;          // points closer than this fraction of a unit are one point
const PASSES = 3;
const LONG_RIM = 120;      // rims longer than this start from the rough covering
const SMEAR_TIMES = 3;      // a patch stretching its texture this many times the model's usual rate

interface Edge { a: number; b: number; }
interface Used { n: number; net: number; up: Edge | null; down: Edge | null; }
type Ints = Uint8Array | Uint16Array | Uint32Array;

function readGlb(buf: Buffer) {
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
  const start = 20 + jsonLen + 8;
  return { json, bin: buf.subarray(start, start + buf.readUInt32LE(20 + jsonLen)) };
}

function positions(g: any, bin: Buffer, i: number): Float32Array {
  const a = g.accessors[i], v = g.bufferViews[a.bufferView];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || 12;
  const out = new Float32Array(a.count * 3);
  for (let n = 0; n < a.count; n++) for (let k = 0; k < 3; k++) out[n * 3 + k] = bin.readFloatLE(off + n * stride + k * 4);
  return out;
}

function indices(g: any, bin: Buffer, i: number): number[] {
  const a = g.accessors[i], v = g.bufferViews[a.bufferView];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const size = a.componentType === 5125 ? 4 : a.componentType === 5123 ? 2 : 1;
  const out = new Array<number>(a.count);
  for (let n = 0; n < a.count; n++) {
    const at = off + n * size;
    out[n] = size === 4 ? bin.readUInt32LE(at) : size === 2 ? bin.readUInt16LE(at) : bin[at];
  }
  return out;
}

function weldOf(pos: Float32Array): Int32Array {
  const ids = new Map<string, number>(), weld = new Int32Array(pos.length / 3);
  for (let i = 0; i < weld.length; i++) {
    const k = `${Math.round(pos[i * 3] * SAME)},${Math.round(pos[i * 3 + 1] * SAME)},${Math.round(pos[i * 3 + 2] * SAME)}`;
    let id = ids.get(k);
    if (id === undefined) { id = ids.size; ids.set(k, id); }
    weld[i] = id;
  }
  return weld;
}

const pair = (u: number, v: number) => (u < v ? u * 4294967296 + v : v * 4294967296 + u);

/** how many faces use each edge, and which way they run it */
function edgeUses(idx: number[], weld: Int32Array): Used[] {
  const uses = new Map<number, Used>();
  for (let t = 0; t < idx.length; t += 3) {
    const f = [idx[t], idx[t + 1], idx[t + 2]];
    if (weld[f[0]] === weld[f[1]] || weld[f[1]] === weld[f[2]] || weld[f[0]] === weld[f[2]]) continue;
    for (let e = 0; e < 3; e++) {
      const a = f[e], b = f[(e + 1) % 3], k = pair(weld[a], weld[b]), up = weld[a] < weld[b];
      let seen = uses.get(k);
      if (!seen) { seen = { n: 0, net: 0, up: null, down: null }; uses.set(k, seen); }
      seen.n++;
      seen.net += up ? 1 : -1;
      if (up) seen.up ??= { a, b }; else seen.down ??= { a, b };
    }
  }
  return [...uses.values()];
}

/** the open edges: used an odd number of times, in the direction most faces run them */
const openOf = (uses: Used[]): Edge[] => uses.filter((e) => e.n % 2 === 1).map((e) => (e.net > 0 ? e.up! : e.down!));
const openEdges = (idx: number[], weld: Int32Array) => openOf(edgeUses(idx, weld));
const seams = (uses: Used[]) => uses.filter((e) => e.n > 2).length;

/** walk open edges into closed loops; a rim that touches itself splits in two */
function loopsOf(edges: Edge[], weld: Int32Array): Edge[][] {
  const from = new Map<number, Edge[]>();
  for (const e of edges) { const u = weld[e.a]; if (!from.has(u)) from.set(u, []); from.get(u)!.push(e); }
  const used = new Set<Edge>(), loops: Edge[][] = [];
  for (const start of edges) {
    if (used.has(start)) continue;
    const path: Edge[] = [], at = new Map<number, number>();
    let e: Edge | undefined = start;
    while (e) {
      used.add(e);
      const u: number = weld[e.a], v: number = weld[e.b];
      at.set(u, path.length);
      path.push(e);
      if (at.has(v)) {
        const loop = path.splice(at.get(v)!);
        for (const x of loop) at.delete(weld[x.a]);
        loops.push(loop);
      }
      e = (from.get(v) || []).find((x) => !used.has(x));
    }
  }
  // What is left runs against its neighbours: faces wound the other way. Walk
  // those by touch instead of by direction, and let most of the rim decide which
  // way the patch faces.
  const inLoop = new Set(loops.flat());
  const rest = edges.filter((e) => !inLoop.has(e));
  const touch = new Map<number, Edge[]>();
  const add = (k: number, e: Edge) => { if (!touch.has(k)) touch.set(k, []); touch.get(k)!.push(e); };
  for (const e of rest) { add(weld[e.a], e); add(weld[e.b], e); }
  const walked = new Set<Edge>();
  for (const start of rest) {
    if (walked.has(start)) continue;
    const path: (Edge & { forward: boolean })[] = [], at = new Map<number, number>();
    let e: Edge | undefined = start, u = weld[start.a];
    while (e) {
      walked.add(e);
      const forward: boolean = weld[e.a] === u;
      const v: number = forward ? weld[e.b] : weld[e.a];
      at.set(u, path.length);
      path.push({ a: forward ? e.a : e.b, b: forward ? e.b : e.a, forward });
      if (at.has(v)) {
        const loop = path.splice(at.get(v)!);
        for (const x of loop) at.delete(weld[x.a]);
        loops.push(loop.filter((x) => x.forward).length * 2 < loop.length
          ? loop.reverse().map((x) => ({ a: x.b, b: x.a }))
          : loop);
      }
      u = v;
      e = (touch.get(v) || []).find((x) => !walked.has(x));
    }
  }
  return loops;
}

/** a rough covering for a rim too long to search: repeatedly cut the sharpest corner off */
function fill(loop: Edge[], pos: Float32Array): number[] {
  const ring = loop.map((e) => e.a).reverse();   // a patch runs the rim the other way
  const P = (i: number) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const sub = (a: number[], b: number[]) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = P(ring[i]), b = P(ring[(i + 1) % ring.length]);
    n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const out: number[] = [], left = ring.slice();
  while (left.length > 3) {
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < left.length; i++) {
      const p = P(left[(i + left.length - 1) % left.length]), c = P(left[i]), q = P(left[(i + 1) % left.length]);
      const u = sub(p, c), v = sub(q, c);
      const lu = Math.hypot(...u) || 1e-12, lv = Math.hypot(...v) || 1e-12;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot(u, v) / (lu * lv))));
      const score = (dot(cross(v, u), n) >= 0 ? angle : angle + Math.PI * 2) + i * 1e-9;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    const l = left.length;
    out.push(left[(best + l - 1) % l], left[best], left[(best + 1) % l]);
    left.splice(best, 1);
  }
  out.push(left[0], left[1], left[2]);
  return out;
}

/** one accessor's raw items, whatever its stride */
function items(g: any, bin: Buffer, i: number): { size: number; data: Buffer } {
  const a = g.accessors[i], v = g.bufferViews[a.bufferView];
  const parts = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
  const size = parts * ({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 } as Record<number, number>)[a.componentType];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || size;
  const data = Buffer.alloc(a.count * size);
  for (let n = 0; n < a.count; n++) bin.copy(data, n * size, off + n * stride, off + n * stride + size);
  return { size, data };
}

/** A patch reuses its rim's UVs, and a rim can touch unrelated pieces of the texture
 *  sheet, so the triangle between them drags those colours across the hole. Each
 *  such triangle gets its own three points, all reading one spot inside a piece of
 *  the sheet next to the rim: one clean colour, no stretch. Answers the points to
 *  copy, as [source point, u, v]; idx is rewritten to use them. */
function flatten(idx: number[], from: number, pos: Float32Array, uv: Float32Array | null, points: number, rimOf: Map<number, number>): [number, number, number][] {
  const far = (a: Float32Array, i: number, j: number, n: number) => {
    let d = 0;
    for (let k = 0; k < n; k++) d += (a[i * n + k] - a[j * n + k]) ** 2;
    return Math.sqrt(d);
  };
  const rates: number[] = [];
  const inside = new Map<number, [number, number]>();
  if (uv) for (let t = 0; t < from; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const size = far(pos, a, b, 3);
    if (size > 0) rates.push(far(uv, a, b, 2) / size);
    const mid: [number, number] = [(uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3, (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3];
    for (const v of [a, b, c]) if (!inside.has(v)) inside.set(v, mid);
  }
  rates.sort((x, y) => x - y);
  const limit = (rates[rates.length >> 1] || 0) * SMEAR_TIMES;
  const copies: [number, number, number][] = [];
  for (let t = from; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const stretched = tri.some((v) => v >= points) || (!!uv && tri.some((v, i) => {
      const w = tri[(i + 1) % 3], size = far(pos, v, w, 3);
      return size > 0 ? far(uv, v, w, 2) / size > limit : far(uv, v, w, 2) > 0;
    }));
    if (!stretched) continue;
    const source = tri.map((v) => (v < points ? v : rimOf.get(v)!));
    const spot = source.map((v) => inside.get(v)).find(Boolean) || (uv ? [uv[source[0] * 2], uv[source[0] * 2 + 1]] : [0, 0]);
    tri.forEach((v, i) => { idx[t + i] = points + copies.length; copies.push([v, spot[0], spot[1]]); });
  }
  return copies;
}

const pointAt = (pos: Float32Array, v: number): V => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];

const normalOf = (a: V, b: V, c: V): V => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
};

/** the surface around the holes: who touches whom, how big faces are, which way they face */
function worldOf(idx: number[], pos: Float32Array, weld: Int32Array) {
  const links = new Map<number, Set<number>>(), one = new Map<number, number>();
  const normal = new Map<number, V>(), total = new Map<number, [number, number]>();
  for (let t = 0; t < idx.length; t += 3) {
    const f = [idx[t], idx[t + 1], idx[t + 2]];
    const n = normalOf(pointAt(pos, f[0]), pointAt(pos, f[1]), pointAt(pos, f[2]));
    const l = Math.hypot(...n) || 1;
    const unit: V = [n[0] / l, n[1] / l, n[2] / l];
    for (let e = 0; e < 3; e++) {
      const x = f[e], y = f[(e + 1) % 3], wx = weld[x], wy = weld[y];
      if (wx === wy) continue;
      one.set(wx, x);
      one.set(wy, y);
      if (!links.has(wx)) links.set(wx, new Set());
      if (!links.has(wy)) links.set(wy, new Set());
      links.get(wx)!.add(wy);
      links.get(wy)!.add(wx);
      if (!normal.has(pair(wx, wy))) normal.set(pair(wx, wy), unit);
      const length = Math.hypot(pos[x * 3] - pos[y * 3], pos[x * 3 + 1] - pos[y * 3 + 1], pos[x * 3 + 2] - pos[y * 3 + 2]);
      for (const w of [wx, wy]) { const s = total.get(w) || [0, 0]; s[0] += length; s[1]++; total.set(w, s); }
    }
  }
  return { links, one, normal, size: (w: number) => { const s = total.get(w); return s ? s[0] / s[1] : 0; } };
}

/** the smooth normal of each new point, from the patch faces that use it */
function normalsOf(idx: number[], from: number, pos: Float32Array, points: number): Float32Array {
  const out = new Float32Array(pos.length - points * 3);
  for (let t = from; t < idx.length; t += 3) {
    const n = normalOf(pointAt(pos, idx[t]), pointAt(pos, idx[t + 1]), pointAt(pos, idx[t + 2]));
    for (let k = 0; k < 3; k++) {
      const w = idx[t + k];
      if (w >= points) for (let i = 0; i < 3; i++) out[(w - points) * 3 + i] += n[i];
    }
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
  return out;
}

/** What the pass found and did to one model, as the Pipeline page shows it. */
export interface SealReport {
  holes: number; closed: number; maxRim: number;
  rims: { tiny: number; small: number; medium: number; large: number; tooBig: number };
  openBefore: number; openAfter: number; facesBefore: number; facesAfter: number;
  seamsBefore: number; seamsAfter: number;   // edges shared by three faces or more
  flattened: number;   // patch triangles reading one colour from beside the rim
  pointsAdded: number; // new points inside patches
  ms: number; at: string; error?: string;
}

/** The file with its holes closed, and the report. No glb means nothing changed;
 *  null means this pass cannot read the file. */
export function sealGlb(buf: Buffer, maxRim: number): { glb: Buffer | null; report: SealReport } | null {
  const began = Date.now();
  if (buf.length < 32 || buf.toString('ascii', 0, 4) !== 'glTF') return null;
  const { json: g, bin } = readGlb(buf);
  if ((g.extensionsUsed || []).some((e: string) => /meshopt|draco/i.test(e))) return null;
  const chunks: Buffer[] = [Buffer.from(bin)];
  let length = bin.length, patched = 0;
  const report: SealReport = {
    holes: 0, closed: 0, maxRim, rims: { tiny: 0, small: 0, medium: 0, large: 0, tooBig: 0 },
    openBefore: 0, openAfter: 0, facesBefore: 0, facesAfter: 0, seamsBefore: 0, seamsAfter: 0, flattened: 0, pointsAdded: 0, ms: 0, at: new Date().toISOString(),
  };
  for (const m of g.meshes || []) for (const p of m.primitives) {
    if (p.indices === undefined || (p.mode ?? 4) !== 4) continue;
    let pos = positions(g, bin, p.attributes.POSITION);
    const idx = indices(g, bin, p.indices);
    let weld = weldOf(pos);
    const points = pos.length / 3;
    const rimOf = new Map<number, number>();   // each new point, and the rim point nearest it
    const original = idx.length;
    const usesBefore = edgeUses(idx, weld);
    const open = openOf(usesBefore);
    report.openBefore += open.length;
    report.seamsBefore += seams(usesBefore);
    report.facesBefore += idx.length / 3;
    for (const l of loopsOf(open, weld)) {
      report.holes++;
      const n = l.length, r = report.rims;
      if (n > maxRim) r.tooBig++; else if (n <= 8) r.tiny++; else if (n <= 30) r.small++; else if (n <= 100) r.medium++; else r.large++;
    }
    for (let pass = 0; pass < PASSES; pass++) {
      const holes = loopsOf(openEdges(idx, weld), weld).filter((l) => l.length >= 3 && l.length <= maxRim);
      if (!holes.length) break;
      const world = worldOf(idx, pos, weld);
      const added: number[] = [];
      let next = pos.length / 3;
      for (const l of holes) {
        const ring = l.map((e) => e.a).reverse();
        const at = new Map(ring.map((v, i) => [v, i]));
        const rough = ring.length > LONG_RIM ? fill(l, pos) : [];
        const faces: number[][] = [];
        for (let i = 0; i < rough.length; i += 3) faces.push([at.get(rough[i])!, at.get(rough[i + 1])!, at.get(rough[i + 2])!]);
        const inHole = new Set(ring.map((v) => weld[v]));
        const made = patchHole({
          points: ring.map((v) => pointAt(pos, v)),
          outside: ring.map((v, i) => world.normal.get(pair(weld[v], weld[ring[(i + 1) % ring.length]])) || [0, 0, 0]),
          faceSize: ring.map((v) => world.size(weld[v])),
          around: ring.map((v) => [...(world.links.get(weld[v]) || [])].filter((u) => !inHole.has(u)).map((u) => pointAt(pos, world.one.get(u)!))),
          rough: faces.length ? faces : undefined,
        });
        const id = (i: number) => (i < ring.length ? ring[i] : next + i - ring.length);
        for (const f of made.faces) idx.push(id(f[0]), id(f[1]), id(f[2]));
        made.points.slice(ring.length).forEach((q, i) => {
          added.push(q[0], q[1], q[2]);
          const nearest = ring[made.nearest[i]];
          rimOf.set(next + i, nearest < points ? nearest : rimOf.get(nearest)!);
        });
        next += made.points.length - ring.length;
        patched++;
      }
      if (added.length) {
        const grown = new Float32Array(pos.length + added.length);
        grown.set(pos);
        grown.set(added, pos.length);
        const welded = new Int32Array(grown.length / 3);
        welded.set(weld);
        let id = 0;
        for (let i = 0; i < weld.length; i++) if (weld[i] > id) id = weld[i];
        for (let i = weld.length; i < welded.length; i++) welded[i] = ++id;
        pos = grown;
        weld = welded;
      }
    }
    const usesAfter = edgeUses(idx, weld);
    report.openAfter += openOf(usesAfter).length;
    report.seamsAfter += seams(usesAfter);
    report.facesAfter += idx.length / 3;
    const add = (data: Buffer, target: number, accessor: object) => {
      const pad = (4 - (length % 4)) % 4;
      if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
      g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target });
      g.accessors.push({ ...accessor, bufferView: g.bufferViews.length - 1 });
      chunks.push(data);
      length += data.length;
      return g.accessors.length - 1;
    };
    const uvAt = p.attributes.TEXCOORD_0;
    if (idx.length > original) {
      let uv: Float32Array | null = null;
      if (uvAt !== undefined && g.accessors[uvAt].componentType === 5126) {
        uv = new Float32Array(g.accessors[uvAt].count * 2);
        const { data: uvData } = items(g, bin, uvAt);
        for (let n = 0; n < uv.length; n++) uv[n] = uvData.readFloatLE(n * 4);
      }
      const facing = normalsOf(idx, original, pos, points);
      const copies = flatten(idx, original, pos, uv, points, rimOf);
      report.flattened += copies.length / 3;
      report.pointsAdded += pos.length / 3 - points;
      if (copies.length) for (const name of Object.keys(p.attributes)) {
        const at = p.attributes[name], { size, data } = items(g, bin, at), old = g.accessors[at];
        const more = Buffer.alloc(copies.length * size);
        copies.forEach(([v, u, w], n) => {
          const write = (values: ArrayLike<number>, from: number) => { for (let k = 0; k < 3; k++) more.writeFloatLE(values[from + k], n * size + k * 4); };
          if (name === 'TEXCOORD_0' && uv) { more.writeFloatLE(u, n * size); more.writeFloatLE(w, n * size + 4); }
          else if (name === 'POSITION') write(pos, v * 3);
          else if (name === 'NORMAL' && v >= points) write(facing, (v - points) * 3);
          else { const from = v < points ? v : rimOf.get(v)!; data.copy(more, n * size, from * size, (from + 1) * size); }
        });
        const { byteOffset, sparse, ...rest } = old;
        if (name === 'POSITION') {
          rest.min = [0, 1, 2].map((k) => { let m = Infinity; for (let i = k; i < pos.length; i += 3) m = Math.min(m, pos[i]); return m; });
          rest.max = [0, 1, 2].map((k) => { let m = -Infinity; for (let i = k; i < pos.length; i += 3) m = Math.max(m, pos[i]); return m; });
        }
        p.attributes[name] = add(Buffer.concat([data, more]), 34962, { ...rest, count: old.count + copies.length });
      }
    }
    p.indices = add(Buffer.from(Uint32Array.from(idx).buffer), 34963, { componentType: 5125, count: idx.length, type: 'SCALAR' });
  }
  report.closed = patched;
  report.ms = Date.now() - began;
  if (!patched) return { glb: null, report };
  g.buffers[0].byteLength = length;
  const binOut = Buffer.concat([...chunks, Buffer.alloc((4 - (length % 4)) % 4)]);
  let text = Buffer.from(JSON.stringify(g));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12);
  head.write('glTF'); head.writeUInt32LE(2, 4); head.writeUInt32LE(28 + text.length + binOut.length, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(text.length, 0); jsonHead.write('JSON', 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binOut.length, 0); binHead.write('BIN\0', 4);
  return { glb: Buffer.concat([head, jsonHead, text, binHead, binOut]), report };
}

const SWEEP_MS = 30_000;

const failed = (error: string) => ({ holes: 0, closed: 0, error, at: new Date().toISOString() }) as SealReport;

async function fileOf(url: string): Promise<Buffer> {
  const r = await fetch(publicR2Url(url));
  if (!r.ok) throw new Error(`could not read the model (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/** A new sealed file for a finished model; the original stays where it is.
 *  Any failure answers with the original, so a job can never be lost to this. */
export async function sealedResult(resultUrl: string, maxRim: number): Promise<{ url: string; report: SealReport }> {
  try {
    const sealed = sealGlb(await fileOf(resultUrl), maxRim);
    if (!sealed) return { url: resultUrl, report: failed('not a model this pass can read') };
    if (!sealed.glb) return { url: resultUrl, report: sealed.report };
    const { url } = await uploadToR2(sealed.glb, 'sealed.glb', 'model/gltf-binary');
    console.log(`[closeHoles] ${sealed.report.closed} holes closed`);
    return { url, report: sealed.report };
  } catch (e: any) {
    console.warn('[closeHoles]', e?.message || e);
    return { url: resultUrl, report: failed(String(e?.message || e)) };
  }
}

/** Every finished model goes through here, whichever way it was finished. */
export function startSealing(): void {
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const { enabled, maxRim } = await sealSettings();
      if (enabled) for (const job of await unsealedJobs()) {
        const { url, report } = await sealedResult(job.resultUrl, maxRim);
        await sealJob(job.id, url, job.resultUrl, report);
      }
      // models sealed before reports existed: the pass gives the same answer again
      for (const job of await unreportedJobs()) {
        const again = sealGlb(await fileOf(job.rawResultUrl), maxRim);
        await saveSealReport(job.id, again ? again.report : failed('not a model this pass can read'));
      }
    } catch (e: any) {
      console.warn('[closeHoles] sweep', e?.message || e);
    } finally { busy = false; }
  }, SWEEP_MS);
}
