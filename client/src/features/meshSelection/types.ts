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
  meshId: string;
  meshName: string;
  seedFaceIndex: number;
  faceCount: number;
  faceIndices: number[];
  mode: MeshSelectionMode;
}

export interface MeshSelectionZone {
  id: string;
  name: string;
  meshId: string;
  meshName: string;
  faceIndices: number[];
  color: string;
}

export interface MeshSelectionOptions extends MeshSelectionSettings {
  zones?: MeshSelectionZone[];
  /** Zone currently being edited — rendered emphasized in the viewport. */
  activeZoneId?: string | null;
  clearSignal?: number;
  onChange?: (selection: MeshSelectionSummary | null) => void;
}

export interface FaceGraph {
  indices: number[];
  faceCount: number;
  neighbors: number[][];
  normals: THREE.Vector3[];
}
