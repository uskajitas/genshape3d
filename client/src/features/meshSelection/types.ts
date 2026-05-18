import type * as THREE from 'three';

export type MeshSelectionMode = 'select' | 'paint';

export interface MeshSelectionSettings {
  enabled: boolean;
  mode: MeshSelectionMode;
  range: number;
  boundary: number;
  feather: number;
}

export interface MeshSelectionSummary {
  meshName: string;
  seedFaceIndex: number;
  faceCount: number;
  mode: MeshSelectionMode;
}

export interface MeshSelectionOptions extends MeshSelectionSettings {
  onChange?: (selection: MeshSelectionSummary | null) => void;
}

export interface FaceGraph {
  indices: number[];
  faceCount: number;
  neighbors: number[][];
  normals: THREE.Vector3[];
}
