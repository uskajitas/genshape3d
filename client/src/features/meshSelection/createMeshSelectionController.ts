import * as THREE from 'three';
import { buildSelectionOverlayGeometry, getFaceGraph, growFaceSelection } from './geometry';
import type { MeshSelectionOptions } from './types';

const DEFAULT_OPTIONS: MeshSelectionOptions = {
  enabled: false,
  mode: 'select',
  range: 32,
  boundary: 70,
  feather: 12,
};

export interface MeshSelectionController {
  setMeshes(meshes: THREE.Mesh[]): void;
  updateOptions(options: MeshSelectionOptions): void;
  clear(): void;
  dispose(): void;
}

export const createMeshSelectionController = (
  scene: THREE.Scene,
  camera: THREE.Camera,
  domElement: HTMLElement,
  options: MeshSelectionOptions,
): MeshSelectionController => {
  let meshes: THREE.Mesh[] = [];
  let currentOptions = { ...DEFAULT_OPTIONS, ...options };
  let overlay: THREE.Mesh | null = null;
  let pointerDown: { x: number; y: number } | null = null;
  let currentHit: { mesh: THREE.Mesh; seedFaceIndex: number } | null = null;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const material = new THREE.MeshBasicMaterial({
    color: 0x8b5cf6,
    transparent: true,
    opacity: 0.58,
    depthTest: false,
    side: THREE.DoubleSide,
  });

  const clear = () => {
    if (overlay) {
      scene.remove(overlay);
      overlay.geometry.dispose();
      overlay = null;
    }
    currentHit = null;
    currentOptions.onChange?.(null);
  };

  const setHighlight = (mesh: THREE.Mesh, seedFaceIndex: number) => {
    const graph = getFaceGraph(mesh.geometry);
    if (!graph || seedFaceIndex < 0 || seedFaceIndex >= graph.faceCount) {
      clear();
      return;
    }

    const selectedFaces = growFaceSelection(
      graph,
      seedFaceIndex,
      currentOptions.range,
      currentOptions.boundary,
    );

    if (overlay) {
      scene.remove(overlay);
      overlay.geometry.dispose();
    }

    overlay = new THREE.Mesh(buildSelectionOverlayGeometry(mesh, graph, selectedFaces), material);
    overlay.renderOrder = 999;
    scene.add(overlay);
    currentHit = { mesh, seedFaceIndex };

    currentOptions.onChange?.({
      meshName: mesh.name || 'mesh',
      seedFaceIndex,
      faceCount: selectedFaces.size,
      mode: currentOptions.mode,
    });
  };

  const onPointerDown = (event: PointerEvent) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!currentOptions.enabled || !pointerDown) return;
    const dx = Math.abs(event.clientX - pointerDown.x);
    const dy = Math.abs(event.clientY - pointerDown.y);
    pointerDown = null;
    if (dx > 4 || dy > 4) return;

    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(meshes, false)[0];
    if (!hit || hit.faceIndex === undefined) {
      clear();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setHighlight(hit.object as THREE.Mesh, hit.faceIndex);
  };

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    setMeshes(nextMeshes) {
      meshes = nextMeshes;
    },
    updateOptions(nextOptions) {
      currentOptions = { ...currentOptions, ...nextOptions };
      if (!currentOptions.enabled) {
        clear();
      } else if (currentHit) {
        setHighlight(currentHit.mesh, currentHit.seedFaceIndex);
      }
    },
    clear,
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
      clear();
      material.dispose();
    },
  };
};
