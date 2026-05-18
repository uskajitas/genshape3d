import * as THREE from 'three';
import type { FaceGraph } from './types';

const graphCache = new WeakMap<THREE.BufferGeometry, FaceGraph>();

const vertexKey = (position: THREE.BufferAttribute, index: number): string => {
  const x = Math.round(position.getX(index) * 10000);
  const y = Math.round(position.getY(index) * 10000);
  const z = Math.round(position.getZ(index) * 10000);
  return `${x}:${y}:${z}`;
};

const edgeKey = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;

export const getFaceGraph = (geometry: THREE.BufferGeometry): FaceGraph | null => {
  const cached = graphCache.get(geometry);
  if (cached) return cached;

  const position = geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!position) return null;

  const indexArray = geometry.index
    ? Array.from(geometry.index.array as ArrayLike<number>)
    : Array.from({ length: position.count }, (_, i) => i);

  const faceCount = Math.floor(indexArray.length / 3);
  if (faceCount <= 0) return null;

  const neighbors: number[][] = Array.from({ length: faceCount }, () => []);
  const normals: THREE.Vector3[] = [];
  const edges = new Map<string, number[]>();

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  for (let face = 0; face < faceCount; face++) {
    const ia = indexArray[face * 3];
    const ib = indexArray[face * 3 + 1];
    const ic = indexArray[face * 3 + 2];

    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    normals[face] = ab.subVectors(b, a).cross(ac.subVectors(c, a)).normalize().clone();

    const keys = [vertexKey(position, ia), vertexKey(position, ib), vertexKey(position, ic)];
    for (const [v0, v1] of [[keys[0], keys[1]], [keys[1], keys[2]], [keys[2], keys[0]]]) {
      const key = edgeKey(v0, v1);
      const faces = edges.get(key);
      if (faces) faces.push(face);
      else edges.set(key, [face]);
    }
  }

  edges.forEach(faces => {
    if (faces.length < 2) return;
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        neighbors[faces[i]].push(faces[j]);
        neighbors[faces[j]].push(faces[i]);
      }
    }
  });

  const graph: FaceGraph = { indices: indexArray, faceCount, neighbors, normals };
  graphCache.set(geometry, graph);
  return graph;
};

export const growFaceSelection = (
  graph: FaceGraph,
  seedFaceIndex: number,
  range: number,
  boundary: number,
): Set<number> => {
  const seedNormal = graph.normals[seedFaceIndex];
  if (!seedNormal) return new Set();

  const maxSteps = Math.max(0, Math.round(range / 10));
  const minDot = THREE.MathUtils.lerp(0.18, 0.94, boundary / 100);
  const selected = new Set<number>([seedFaceIndex]);
  const queue: Array<{ face: number; depth: number }> = [{ face: seedFaceIndex, depth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.depth >= maxSteps) continue;

    for (const next of graph.neighbors[item.face] || []) {
      if (selected.has(next)) continue;
      const normal = graph.normals[next];
      if (!normal || seedNormal.dot(normal) < minDot) continue;
      selected.add(next);
      queue.push({ face: next, depth: item.depth + 1 });
    }
  }

  return selected;
};

export const buildSelectionOverlayGeometry = (
  mesh: THREE.Mesh,
  graph: FaceGraph,
  selectedFaces: Iterable<number>,
): THREE.BufferGeometry => {
  const sourcePosition = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const positions: number[] = [];
  const vertex = new THREE.Vector3();

  selectedFaces.forEach(face => {
    for (let i = 0; i < 3; i++) {
      const vertexIndex = graph.indices[face * 3 + i];
      vertex.fromBufferAttribute(sourcePosition, vertexIndex).applyMatrix4(mesh.matrixWorld);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};
