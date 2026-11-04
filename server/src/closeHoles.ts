// closeHoles — the last pass on every generated model.
//
// A hole is exact, not a judgement: an edge only one face uses. Weld the points
// that sit in the same place, walk the open edges into loops, and close each
// loop with triangles between its own rim points. No new points are made, so a
// patch takes its texture and normals from the rim, and only the index list of
// the file grows. Same file in, same file out, every time.
import { saveSealReport, sealJob, sealSettings, unreportedJobs, unsealedJobs } from './jobsRepo';
import { publicR2Url, uploadToR2 } from './r2';

const SAME = 1e5;          // points closer than this fraction of a unit are one point
const PASSES = 3;

interface Edge { a: number; b: number; }
interface Used extends Edge { n: number; }
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

/** the open edges of a triangle list, in the direction their face runs them */
function openEdges(idx: number[], weld: Int32Array): Edge[] {
  const uses = new Map<number, Used>();
  for (let t = 0; t < idx.length; t += 3) {
    const f = [idx[t], idx[t + 1], idx[t + 2]];
    if (weld[f[0]] === weld[f[1]] || weld[f[1]] === weld[f[2]] || weld[f[0]] === weld[f[2]]) continue;
    for (let e = 0; e < 3; e++) {
      const a = f[e], b = f[(e + 1) % 3], k = pair(weld[a], weld[b]);
      const seen = uses.get(k);
      if (seen) seen.n++; else uses.set(k, { n: 1, a, b });
    }
  }
  return [...uses.values()].filter((e) => e.n === 1);
}

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

/** close one loop: repeatedly cut the sharpest corner off the rim */
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

/** What the pass found and did to one model, as the Pipeline page shows it. */
export interface SealReport {
  holes: number; closed: number; maxRim: number;
  rims: { tiny: number; small: number; medium: number; large: number; tooBig: number };
  openBefore: number; openAfter: number; facesBefore: number; facesAfter: number;
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
    openBefore: 0, openAfter: 0, facesBefore: 0, facesAfter: 0, ms: 0, at: new Date().toISOString(),
  };
  for (const m of g.meshes || []) for (const p of m.primitives) {
    if (p.indices === undefined || (p.mode ?? 4) !== 4) continue;
    const pos = positions(g, bin, p.attributes.POSITION);
    const idx = indices(g, bin, p.indices);
    const weld = weldOf(pos);
    const open = openEdges(idx, weld);
    report.openBefore += open.length;
    report.facesBefore += idx.length / 3;
    for (const l of loopsOf(open, weld)) {
      report.holes++;
      const n = l.length, r = report.rims;
      if (n > maxRim) r.tooBig++; else if (n <= 8) r.tiny++; else if (n <= 30) r.small++; else if (n <= 100) r.medium++; else r.large++;
    }
    for (let pass = 0; pass < PASSES; pass++) {
      const holes = loopsOf(openEdges(idx, weld), weld).filter((l) => l.length >= 3 && l.length <= maxRim);
      if (!holes.length) break;
      for (const l of holes) { for (const v of fill(l, pos)) idx.push(v); patched++; }
    }
    report.openAfter += openEdges(idx, weld).length;
    report.facesAfter += idx.length / 3;
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    const data = Buffer.from(Uint32Array.from(idx).buffer);
    g.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length, target: 34963 });
    g.accessors.push({ bufferView: g.bufferViews.length - 1, componentType: 5125, count: idx.length, type: 'SCALAR' });
    p.indices = g.accessors.length - 1;
    chunks.push(data);
    length += data.length;
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
