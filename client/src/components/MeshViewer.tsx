import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createMeshSelectionController,
  type MeshSelectionOptions,
} from '../features/meshSelection';
import { ViewGizmo } from './ViewGizmo';

export type ViewMode = 'clay' | 'wireframe' | 'solid';

interface MeshViewerProps {
  url: string;
  viewMode?: ViewMode;
  /** @deprecated use viewMode instead */
  wireframe?: boolean;
  showGrid?: boolean;
  /** Turntable spin. Defaults on (marketing-style preview); tools that need
   *  precise inspection/selection (Material) turn it off. */
  autoRotate?: boolean;
  /** Corner axis-ball navigation widget (same as the Scene editor):
   *  click a ball to snap the view, drag to orbit. */
  showViewGizmo?: boolean;
  meshSelection?: MeshSelectionOptions;
}

const disposeMaterial = (m: THREE.Material): void => {
  for (const k of Object.keys(m) as (keyof THREE.Material)[]) {
    const v = (m as any)[k];
    if (v && typeof v === 'object' && 'isTexture' in v && (v as THREE.Texture).isTexture) {
      (v as THREE.Texture).dispose();
    }
  }
  m.dispose();
};

// Apply a view mode to a single mesh. origMaterial must already be stored.
function applyMode(mesh: THREE.Mesh, mode: ViewMode) {
  const orig = (mesh as any).__origMaterial;
  const cur  = mesh.material;

  // Dispose injected override (anything that isn't the original)
  if (cur !== orig) {
    if (Array.isArray(cur)) cur.forEach(m => (m as THREE.Material).dispose());
    else (cur as THREE.Material).dispose();
  }

  if (mode === 'wireframe') {
    mesh.material = new THREE.MeshBasicMaterial({ color: 0x00d2ff, wireframe: true });
  } else if (mode === 'clay') {
    mesh.material = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.8, metalness: 0 });
  } else {
    mesh.material = orig;
  }
}

const MeshViewer: React.FC<MeshViewerProps> = ({ url, viewMode, wireframe = false, showGrid = true, autoRotate = true, showViewGizmo = false, meshSelection }) => {
  const effectiveMode: ViewMode = viewMode ?? (wireframe ? 'wireframe' : 'solid');

  const mountRef    = useRef<HTMLDivElement>(null);
  const gridRef     = useRef<THREE.GridHelper | null>(null);
  const meshesRef   = useRef<THREE.Mesh[]>([]);
  const controlsRef = useRef<OrbitControls | null>(null);
  const selectionRef = useRef<ReturnType<typeof createMeshSelectionController> | null>(null);
  const selectionOptionsRef = useRef<MeshSelectionOptions>({
    enabled: false,
    mode: 'select',
    range: 32,
    boundary: 70,
    feather: 12,
    clearSignal: 0,
  });
  // Keep a ref that the async loader callback can read without stale closure issues
  const modeRef     = useRef<ViewMode>(effectiveMode);
  modeRef.current   = effectiveMode;
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const gizmoRef = useRef<ViewGizmo | null>(null);
  selectionOptionsRef.current = meshSelection || {
    enabled: false,
    mode: 'select',
    range: 32,
    boundary: 70,
    feather: 12,
    clearSignal: 0,
  };

  // ── Main scene — only re-runs when URL changes ───────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    meshesRef.current = [];
    gridRef.current   = null;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07060f);

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 1, 3);
    cameraRef.current = camera;
    // The gizmo canvas anchors to the mount — it needs a positioning context.
    mount.style.position = 'relative';

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x8b5cf6, 0.9));
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 8, 5); key.castShadow = true; scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.9);
    fill.position.set(-5, 2, -3); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(0, -3, -5); scene.add(rim);
    const top = new THREE.DirectionalLight(0xffffff, 0.5); top.position.set(0, 10, 0); scene.add(top);

    const grid = new THREE.GridHelper(4, 20, 0x1e1b2e, 0x1e1b2e);
    grid.visible = showGrid && modeRef.current !== 'wireframe';
    scene.add(grid);
    gridRef.current = grid;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.05;
    controls.minDistance    = 0.5;
    controls.maxDistance    = 20;
    controls.autoRotate     = autoRotateRef.current;
    controls.autoRotateSpeed = 0.8;
    controls.enabled = !selectionOptionsRef.current.enabled;
    controlsRef.current = controls;

    const selection = createMeshSelectionController(
      scene,
      camera,
      renderer.domElement,
      selectionOptionsRef.current,
    );
    selectionRef.current = selection;

    const loader = new GLTFLoader();
    loader.load(url, gltf => {
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale  = 2 / maxDim;
      model.scale.setScalar(scale);
      model.position.sub(center.multiplyScalar(scale));
      model.position.y += 0.05;

      const collected: THREE.Mesh[] = [];
      model.traverse(child => {
        if (!(child as THREE.Mesh).isMesh) return;
        const mesh = child as THREE.Mesh;
        mesh.castShadow = mesh.receiveShadow = true;
        // Store original before any override
        (mesh as any).__origMaterial = mesh.material;
        // Apply the live mode via ref — avoids stale closure
        applyMode(mesh, modeRef.current);
        collected.push(mesh);
      });
      meshesRef.current = collected;
      selection.setMeshes(collected);

      scene.add(model);
      camera.position.set(0, maxDim * scale * 0.6, maxDim * scale * 2);
      controls.update();
    }, undefined, err => console.error('GLB load error:', err));

    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      gizmoRef.current?.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      controls.dispose();
      controlsRef.current = null;
      cameraRef.current = null;
      selection.dispose();
      selectionRef.current = null;
      meshesRef.current.forEach(mesh => {
        mesh.geometry?.dispose();
        const cur  = mesh.material;
        const orig = (mesh as any).__origMaterial;
        if (Array.isArray(cur))  cur.forEach(m => disposeMaterial(m as THREE.Material));
        else if (cur)            disposeMaterial(cur as THREE.Material);
        if (orig && orig !== cur) {
          if (Array.isArray(orig)) orig.forEach((m: THREE.Material) => disposeMaterial(m));
          else                     disposeMaterial(orig as THREE.Material);
        }
      });
      meshesRef.current = [];
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ── Mode change — re-apply to already-loaded meshes ─────────────────────
  useEffect(() => {
    meshesRef.current.forEach(mesh => {
      if (!(mesh as any).__origMaterial) (mesh as any).__origMaterial = mesh.material;
      applyMode(mesh, effectiveMode);
    });
  }, [effectiveMode]);

  // ── Auto-rotate toggle ───────────────────────────────────────────────────
  useEffect(() => {
    if (controlsRef.current) controlsRef.current.autoRotate = autoRotate;
  }, [autoRotate]);

  // ── Grid visibility ──────────────────────────────────────────────────────
  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid && effectiveMode !== 'wireframe';
  }, [showGrid, effectiveMode]);

  // ── Corner navigation gizmo ──────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!showViewGizmo || !mount || !camera || !controls) return;
    const gizmo = new ViewGizmo(camera, controls, mount);
    gizmoRef.current = gizmo;
    return () => { gizmo.dispose(); gizmoRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showViewGizmo, url]);

  useEffect(() => {
    selectionRef.current?.updateOptions(selectionOptionsRef.current);
  }, [meshSelection]);

  useEffect(() => {
    // Selection mode owns pointer clicks; view mode gives control back to orbit.
    const selection = selectionOptionsRef.current;
    if (controlsRef.current) controlsRef.current.enabled = !selection.enabled;
    const canvas = mountRef.current?.querySelector('canvas');
    if (canvas) canvas.style.cursor = selection.enabled ? 'crosshair' : '';
  }, [meshSelection]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default MeshViewer;
