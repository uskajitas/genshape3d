// ─────────────────────────────────────────────────────────────────────────────
// SceneEditor — DCC-style scene composer for GenShape3D assets.
//
// Structure:
//   SceneEditor (outer)  — auth + fetch. Renders SceneEditorInner only once
//                          the scene document is loaded, so the three.js
//                          scaffold always mounts against a real DOM node.
//   SceneEditorInner     — the actual editor: outliner (objects + lights),
//                          viewport, inspector (tabs + accordions).
//
// Navigation (Maya/Blender hybrid):
//   LMB          select object / light
//   Alt+LMB      orbit            (Maya)
//   MMB          orbit            (Blender)
//   Shift+MMB    pan
//   RMB          pan
//   Wheel        zoom
//   W / E / R    move / rotate / scale gizmo
//   F            frame selection (or everything)
//   Ctrl+D       duplicate object
//   Delete       remove selection
//   Ctrl+S       save
//
// The source GLBs are never modified — a scene only stores jobId/resultUrl
// plus a per-node transform. Each GLB is normalized once on load inside a
// wrapper group; the wrapper's transform is what the user edits and saves.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useReducer, useRef, useState } from 'react';
import styled from 'styled-components';
import { Link, Navigate, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useAuth } from '../../context/AuthContext';
import { Dropdown, type DropdownOption } from '../../components/Dropdown';
import {
  scenesApi, Scene, SceneData, SceneLight, SceneEnvironment, SceneCamera,
  LightType, Vec3, migrateSceneData, makeLight,
} from './api';
import {
  Tabs, Accordion, SliderRow, Vec3Row, ColorRow, ToggleRow, MiniBtn, BtnRow, Row, RowLabel,
} from './ui';
import { ViewGizmo } from './viewGizmo';

// Dev-only auth bypass so the editor can be driven without Firebase
// (e.g. browser automation). Inert in production builds: import.meta.env.DEV
// is false there, so DEV_EMAIL is always undefined.
const DEV_EMAIL: string | undefined = import.meta.env.DEV
  ? (import.meta.env.VITE_DEV_EMAIL as string | undefined)
  : undefined;

const LIGHT_ICONS: Record<LightType, string> = { directional: '☀️', point: '💡', spot: '🔦' };

const EXPORT_SIZES: DropdownOption<string>[] = [
  { value: '1920x1080', label: '1080p (1920×1080)' },
  { value: '2560x1440', label: '1440p (2560×1440)' },
  { value: '3840x2160', label: '4K (3840×2160)' },
  { value: '1080x1080', label: 'Square (1080×1080)' },
];

interface PickerJob {
  id: string;
  name?: string;
  status: string;
  resultUrl?: string;
  imageUrl?: string;
}

interface NodeMeta {
  id: string;
  jobId: string;
  name: string;
  resultUrl: string;
  visible: boolean;
  loading: boolean;
}

type Selection = { kind: 'node' | 'light'; id: string } | null;

const meshUrlFor = (resultUrl: string) => `/api/mesh?key=${encodeURIComponent(resultUrl)}`;
const thumbUrlFor = (job: PickerJob) => {
  if (!job.imageUrl) return undefined;
  const key = job.imageUrl.includes('/uploads/')
    ? `uploads/${job.imageUrl.split('/uploads/')[1]}`
    : job.imageUrl;
  return `/api/image?key=${encodeURIComponent(key)}`;
};

// ── Styled shell ─────────────────────────────────────────────────────────────

const Shell = styled.div`
  height: 100vh;
  display: flex; flex-direction: column;
  background: ${p => p.theme.colors.background};
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.9rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  flex-shrink: 0;
`;

const BackLink = styled(Link)`
  font-size: 0.78rem; font-weight: 700;
  color: ${p => p.theme.colors.textMuted};
  text-decoration: none; flex-shrink: 0;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const NameInput = styled.input`
  font: inherit; font-size: 0.9rem; font-weight: 700;
  padding: 0.38rem 0.6rem; border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: ${p => p.theme.colors.text};
  width: 200px;
  &:hover, &:focus { border-color: ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surfaceHigh}; }
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const ModeGroup = styled.div`
  display: flex; gap: 0.25rem; margin-left: 0.5rem;
  padding: 0.25rem; border-radius: 9px;
  background: ${p => p.theme.colors.background};
  border: 1px solid ${p => p.theme.colors.border};
`;

const ModeChip = styled.button<{ $active?: boolean }>`
  font: inherit; font-size: 0.72rem; font-weight: 700;
  padding: 0.3rem 0.7rem; border-radius: 6px; cursor: pointer; border: 0;
  background: ${p => p.$active
    ? `linear-gradient(135deg, ${p.theme.colors.primary}33, ${p.theme.colors.violet}33)`
    : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.text : p.theme.colors.textMuted};
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const Spacer = styled.div`flex: 1;`;

const TopBtn = styled.button<{ $primary?: boolean }>`
  font: inherit; font-size: 0.78rem; font-weight: 600;
  padding: 0.45rem 0.9rem; border-radius: 8px; cursor: pointer; flex-shrink: 0;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$primary ? 'white' : p.theme.colors.text};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

const SaveStatus = styled.span`
  font-size: 0.7rem; color: ${p => p.theme.colors.textMuted}; flex-shrink: 0;
`;

const Body = styled.div`
  flex: 1; display: flex; min-height: 0;
`;

const LeftPanel = styled.aside`
  width: 232px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.75rem;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  overflow-y: auto;
`;

const RightPanel = styled.aside`
  width: 292px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.75rem;
  border-left: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  overflow-y: auto;
`;

const OutlinerRow = styled.div<{ $active?: boolean }>`
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.35rem 0.45rem; border-radius: 7px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : 'transparent'};
  background: ${p => p.$active ? `${p.theme.colors.violet}18` : 'transparent'};
  &:hover { background: ${p => p.$active ? `${p.theme.colors.violet}22` : p.theme.colors.surfaceHigh}; }
`;

const OutlinerIcon = styled.span`
  font-size: 0.72rem; flex-shrink: 0; width: 16px; text-align: center;
`;

const OutlinerLabel = styled.span<{ $dim?: boolean }>`
  flex: 1; min-width: 0; font-size: 0.78rem; font-weight: 600;
  color: ${p => p.$dim ? p.theme.colors.textMuted : p.theme.colors.text};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

const RowAction = styled.button`
  appearance: none; border: 0; background: transparent; cursor: pointer;
  font-size: 0.72rem; line-height: 1; padding: 0.15rem;
  color: ${p => p.theme.colors.textMuted};
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const EmptyHint = styled.div`
  font-size: 0.73rem; color: ${p => p.theme.colors.textMuted}; line-height: 1.5;
`;

const Viewport = styled.div`
  flex: 1; position: relative; min-width: 0;
`;

const ViewportMount = styled.div`
  position: absolute; inset: 0;
  canvas { display: block; }
`;

const ViewportHint = styled.div`
  position: absolute; left: 10px; bottom: 10px;
  font-size: 0.66rem; color: ${p => p.theme.colors.textMuted};
  background: ${p => p.theme.colors.surface}d9;
  padding: 0.28rem 0.55rem; border-radius: 6px;
  pointer-events: none; user-select: none;
`;

const Loading = styled.div`
  min-height: 100vh; display: grid; place-items: center;
  background: ${p => p.theme.colors.background};
  color: ${p => p.theme.colors.textMuted};
  font-size: 0.85rem;
`;

const ModalBackdrop = styled.div`
  position: fixed; inset: 0; z-index: 500;
  background: rgba(8, 6, 16, 0.65);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
`;

const ModalPanel = styled.div`
  width: min(720px, 100%); max-height: 80vh;
  display: flex; flex-direction: column; gap: 1rem;
  background: ${p => p.theme.colors.surface};
  border: 1px solid ${p => p.theme.colors.borderHigh};
  border-radius: 14px;
  padding: 1.25rem;
`;

const ModalHead = styled.div`
  display: flex; align-items: center; gap: 0.75rem;
`;

const ModalTitle = styled.h3`
  margin: 0; flex: 1; font-size: 1rem; color: ${p => p.theme.colors.text};
`;

const AssetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.6rem;
  overflow-y: auto;
`;

const AssetCard = styled.button`
  display: flex; flex-direction: column; padding: 0; overflow: hidden;
  border-radius: 10px; cursor: pointer; font: inherit; text-align: left;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  &:hover { border-color: ${p => p.theme.colors.violet}; }
`;

const AssetThumb = styled.div<{ $url?: string }>`
  width: 100%; aspect-ratio: 1;
  background: ${p => p.theme.colors.surface};
  ${p => p.$url ? `background-image: url(${p.$url}); background-size: cover; background-position: center;` : ''}
  display: flex; align-items: center; justify-content: center;
  font-size: 1.3rem; color: ${p => p.theme.colors.textMuted};
`;

const AssetName = styled.div`
  padding: 0.35rem 0.5rem; font-size: 0.7rem; font-weight: 600;
  color: ${p => p.theme.colors.text};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

// ── Three.js helpers ────────────────────────────────────────────────────────

interface LightRig {
  type: LightType;
  group: THREE.Group;                 // world position of the light; gizmo target
  light: THREE.DirectionalLight | THREE.PointLight | THREE.SpotLight;
  helper: THREE.Object3D & { update?: () => void };
  targetObj: THREE.Object3D;
  handle: THREE.Mesh;
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => {
      if (!m) return;
      for (const k of Object.keys(m) as (keyof THREE.Material)[]) {
        const v = (m as any)[k];
        if (v && typeof v === 'object' && 'isTexture' in v) (v as THREE.Texture).dispose();
      }
      m.dispose();
    });
  });
}

function createLightRig(spec: SceneLight, scene: THREE.Scene): LightRig {
  const group = new THREE.Group();
  group.position.set(...spec.position);
  group.userData.lightId = spec.id;

  let light: LightRig['light'];
  if (spec.type === 'point') light = new THREE.PointLight(spec.color, spec.intensity, 0, 2);
  else if (spec.type === 'spot') light = new THREE.SpotLight(spec.color, spec.intensity);
  else light = new THREE.DirectionalLight(spec.color, spec.intensity);
  group.add(light);

  const targetObj = new THREE.Object3D();
  targetObj.position.set(...spec.target);
  scene.add(targetObj);
  if (light instanceof THREE.DirectionalLight || light instanceof THREE.SpotLight) {
    light.target = targetObj;
  }
  if (light.shadow) {
    light.shadow.mapSize.set(1024, 1024);
    if (light instanceof THREE.DirectionalLight) {
      const c = light.shadow.camera as THREE.OrthographicCamera;
      c.left = -8; c.right = 8; c.top = 8; c.bottom = -8;
      c.near = 0.1; c.far = 40;
    }
  }

  // Clickable handle so lights can be selected in the viewport.
  const handle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12),
    new THREE.MeshBasicMaterial({ color: spec.color, wireframe: true }),
  );
  handle.userData.lightId = spec.id;
  group.add(handle);

  let helper: LightRig['helper'];
  if (light instanceof THREE.PointLight) helper = new THREE.PointLightHelper(light, 0.3);
  else if (light instanceof THREE.SpotLight) helper = new THREE.SpotLightHelper(light);
  else helper = new THREE.DirectionalLightHelper(light as THREE.DirectionalLight, 0.5);
  scene.add(helper);

  scene.add(group);
  return { type: spec.type, group, light, helper, targetObj, handle };
}

function removeLightRig(rig: LightRig, scene: THREE.Scene) {
  scene.remove(rig.group);
  scene.remove(rig.helper);
  scene.remove(rig.targetObj);
  (rig.helper as any).dispose?.();
  rig.handle.geometry.dispose();
  (rig.handle.material as THREE.Material).dispose();
  rig.light.dispose?.();
}

// ── Inner editor ─────────────────────────────────────────────────────────────

const SceneEditorInner: React.FC<{ sceneId: string; email: string; initial: Scene }> = ({ sceneId, email, initial }) => {
  const initialData = useRef<SceneData>(migrateSceneData(initial.sceneData)).current;

  const [name, setName] = useState(initial.name);
  const [nodeList, setNodeList] = useState<NodeMeta[]>([]);
  const [lights, setLights] = useState<SceneLight[]>(initialData.lights);
  const [env, setEnv] = useState<SceneEnvironment>(initialData.environment);
  const [fov, setFov] = useState(initialData.camera.fov);
  const [selection, setSelection] = useState<Selection>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [activeTab, setActiveTab] = useState<'inspector' | 'scene'>('inspector');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [exportSize, setExportSize] = useState('1920x1080');
  const [exportTransparent, setExportTransparent] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerJobs, setPickerJobs] = useState<PickerJob[] | null>(null);
  const [, forceTick] = useReducer((x: number) => x + 1, 0);

  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const nodeGroupsRef = useRef<Map<string, THREE.Group>>(new Map());
  const lightRigsRef = useRef<Map<string, LightRig>>(new Map());
  const sceneReadyRef = useRef(false);
  const [sceneReady, setSceneReady] = useState(false);

  // Latest state/actions for stable event handlers (keyboard, pointer).
  const stateRef = useRef({ selection, transformMode, nodeList, lights });
  stateRef.current = { selection, transformMode, nodeList, lights };
  const actionsRef = useRef<{ [k: string]: (...a: any[]) => void }>({});

  // ── Scaffold (runs exactly once; the mount div always exists here) ────────
  useEffect(() => {
    const mount = mountRef.current!;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialData.environment.background);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      initialData.camera.fov, mount.clientWidth / Math.max(1, mount.clientHeight), 0.01, 1000,
    );
    camera.position.set(...initialData.camera.position);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(
      initialData.environment.ambientColor, initialData.environment.ambientIntensity,
    );
    scene.add(ambient);
    ambientRef.current = ambient;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.ShadowMaterial({ opacity: 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.visible = initialData.environment.showGround;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(20, 40, 0x3a3a44, 0x26262e);
    grid.visible = initialData.environment.showGrid;
    scene.add(grid);
    gridRef.current = grid;

    // ── Navigation: Maya/Blender hybrid ─────────────────────────────────
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(...initialData.camera.target);
    orbit.mouseButtons = {
      LEFT: null as any,               // LMB = select (Alt+LMB switches to orbit)
      MIDDLE: THREE.MOUSE.ROTATE,      // MMB orbit (Blender); Shift+MMB pan
      RIGHT: THREE.MOUSE.PAN,
    };
    orbit.update();
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.85);
    scene.add(transform.getHelper());
    transform.addEventListener('dragging-changed', (e: any) => { orbit.enabled = !e.value; });
    transform.addEventListener('objectChange', () => forceTick());
    transformRef.current = transform;

    let gizmoActive = false;
    transform.addEventListener('mouseDown', () => { gizmoActive = true; });
    transform.addEventListener('mouseUp', () => { setTimeout(() => { gizmoActive = false; }, 0); });

    const setModifiers = (alt: boolean, shift: boolean) => {
      orbit.mouseButtons.LEFT = alt ? THREE.MOUSE.ROTATE : (null as any);
      orbit.mouseButtons.MIDDLE = shift ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
      // While Alt-navigating, the gizmo must not swallow the drag.
      transform.enabled = !alt;
    };
    const onKeyChange = (e: KeyboardEvent) => setModifiers(e.altKey, e.shiftKey);
    window.addEventListener('keydown', onKeyChange);
    window.addEventListener('keyup', onKeyChange);
    const onBlur = () => setModifiers(false, false);
    window.addEventListener('blur', onBlur);

    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    // ── Click select (ignores drags and gizmo interactions) ─────────────
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos: [number, number] | null = null;
    const onPointerDown = (e: PointerEvent) => { downPos = [e.clientX, e.clientY]; };
    const onPointerUp = (e: PointerEvent) => {
      if (!downPos) return;
      const moved = Math.hypot(e.clientX - downPos[0], e.clientY - downPos[1]);
      downPos = null;
      if (moved > 5 || e.button !== 0 || e.altKey || gizmoActive) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [
        ...nodeGroupsRef.current.values(),
        ...[...lightRigsRef.current.values()].map(r => r.handle),
      ];
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length === 0) { setSelection(null); return; }
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.nodeId && !obj.userData.lightId) obj = obj.parent;
      if (obj?.userData.nodeId) setSelection({ kind: 'node', id: obj.userData.nodeId });
      else if (obj?.userData.lightId) setSelection({ kind: 'light', id: obj.userData.lightId });
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    // ── Keyboard shortcuts ──────────────────────────────────────────────
    const isTyping = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const A = actionsRef.current;
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 's') { e.preventDefault(); A.save?.(); }
        if (e.key.toLowerCase() === 'd') { e.preventDefault(); A.duplicateSelected?.(); }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'w': setTransformMode('translate'); break;
        case 'e': setTransformMode('rotate'); break;
        case 'r': setTransformMode('scale'); break;
        case 'f': A.frameSelection?.(); break;
        case 'delete': case 'backspace': A.removeSelected?.(); break;
        case 'escape': setSelection(null); break;
      }
    };
    window.addEventListener('keydown', onKeyDown);

    const handleResize = () => {
      camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    // Corner navigation widget: click an axis ball to snap the view,
    // drag it to orbit (Blender/Maya style).
    const viewGizmo = new ViewGizmo(camera, orbit, mount);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      orbit.update();
      lightRigsRef.current.forEach(rig => rig.helper.update?.());
      renderer.render(scene, camera);
      viewGizmo.render();
    };
    animate();

    sceneReadyRef.current = true;
    setSceneReady(true);

    // Dev-only test hook: lets automated checks force a render and inspect
    // engine state when the page isn't compositing (hidden pane). Stripped
    // from production builds by the DEV guard.
    if (import.meta.env.DEV) {
      (window as any).__sceneEditor = {
        renderOnce: () => { orbit.update(); renderer.render(scene, camera); },
        stats: () => ({
          nodes: nodeGroupsRef.current.size,
          nodeChildren: [...nodeGroupsRef.current.values()].map(g => g.children.length),
          lights: lightRigsRef.current.size,
          camera: camera.position.toArray(),
          target: orbit.target.toArray(),
        }),
        scene, camera, renderer, orbit, viewGizmo,
      };
    }

    return () => {
      if (import.meta.env.DEV) delete (window as any).__sceneEditor;
      cancelAnimationFrame(animId);
      ro.disconnect();
      window.removeEventListener('keydown', onKeyChange);
      window.removeEventListener('keyup', onKeyChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      viewGizmo.dispose();
      orbit.dispose();
      transform.dispose();
      nodeGroupsRef.current.forEach(disposeObject);
      nodeGroupsRef.current.clear();
      lightRigsRef.current.forEach(rig => removeLightRig(rig, scene));
      lightRigsRef.current.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      sceneReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load initial nodes once the scaffold exists ─────────────────────────
  useEffect(() => {
    if (!sceneReady) return;
    initialData.nodes.forEach(n => {
      loadNode(
        n.id, n.jobId, n.name, n.resultUrl, n.position, n.rotation, n.scale, n.visible !== false,
        { legacyPivot: n.pivotCenter !== true },
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady]);

  // ── Reconcile light rigs with light state ───────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !sceneReady) return;
    const rigs = lightRigsRef.current;

    for (const [id, rig] of [...rigs]) {
      const spec = lights.find(l => l.id === id);
      if (!spec || spec.type !== rig.type) {
        removeLightRig(rig, scene);
        rigs.delete(id);
      }
    }
    for (const spec of lights) {
      let rig = rigs.get(spec.id);
      if (!rig) {
        rig = createLightRig(spec, scene);
        rigs.set(spec.id, rig);
      }
      // Position is owned by the three.js side (gizmo edits it live);
      // everything else is owned by React state.
      rig.light.color.set(spec.color);
      rig.light.intensity = spec.intensity;
      rig.light.castShadow = spec.castShadow;
      (rig.handle.material as THREE.MeshBasicMaterial).color.set(spec.color);
      rig.targetObj.position.set(...spec.target);
      if (rig.light instanceof THREE.SpotLight) {
        rig.light.angle = THREE.MathUtils.degToRad(spec.angle ?? 35);
        rig.light.penumbra = spec.penumbra ?? 0.4;
      }
      rig.helper.update?.();
    }
  }, [lights, sceneReady]);

  // ── Environment sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sceneReady) return;
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(env.background);
    if (ambientRef.current) {
      ambientRef.current.color.set(env.ambientColor);
      ambientRef.current.intensity = env.ambientIntensity;
    }
    if (gridRef.current) gridRef.current.visible = env.showGrid;
    if (groundRef.current) groundRef.current.visible = env.showGround;
  }, [env, sceneReady]);

  // ── Camera FOV sync ─────────────────────────────────────────────────────
  useEffect(() => {
    const cam = cameraRef.current;
    if (!cam || !sceneReady) return;
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }, [fov, sceneReady]);

  // ── Gizmo attachment follows selection ──────────────────────────────────
  useEffect(() => {
    const tc = transformRef.current;
    if (!tc) return;
    if (!selection) { tc.detach(); return; }
    const obj = selection.kind === 'node'
      ? nodeGroupsRef.current.get(selection.id)
      : lightRigsRef.current.get(selection.id)?.group;
    if (obj) {
      tc.attach(obj);
      // Rotating/scaling a light rig is meaningless — force translate.
      tc.setMode(selection.kind === 'light' ? 'translate' : transformMode);
    } else {
      tc.detach();
    }
  }, [selection, transformMode, sceneReady]);

  // Auto-switch inspector tab when something gets selected.
  useEffect(() => {
    if (selection) setActiveTab('inspector');
  }, [selection]);

  // ── Node management ─────────────────────────────────────────────────────
  function loadNode(
    nodeId: string, jobId: string, jobName: string, resultUrl: string,
    position: Vec3, rotation: Vec3, scale: Vec3, visible = true,
    opts: { spawn?: boolean; legacyPivot?: boolean } = {},
  ) {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = new THREE.Group();
    group.userData.nodeId = nodeId;
    group.position.set(...position);
    group.rotation.set(...rotation);
    group.scale.set(...scale);
    group.visible = visible;
    scene.add(group);
    nodeGroupsRef.current.set(nodeId, group);
    setNodeList(prev => [...prev, { id: nodeId, jobId, name: jobName, resultUrl, visible, loading: true }]);

    new GLTFLoader().load(meshUrlFor(resultUrl), gltf => {
      if (!nodeGroupsRef.current.has(nodeId)) return; // removed while loading
      const inner = gltf.scene;
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fit = 1.4 / maxDim;
      inner.scale.setScalar(fit);
      // Pivot at the model's geometric CENTER: scaling and rotating happen
      // around the middle of the object, never shifting it (Blender/Maya
      // behaviour). Floor placement is handled below, not by the pivot.
      inner.position.set(-center.x * fit, -center.y * fit, -center.z * fit);
      const halfH = (size.y * fit) / 2;
      if (opts.spawn) {
        // Fresh asset: rest it on the ground plane.
        group.position.y = halfH * group.scale.y;
      } else if (opts.legacyPivot) {
        // Saved before the center-pivot change (bottom pivot): lift by half
        // the height so it still appears exactly where it was saved.
        group.position.y += halfH * group.scale.y;
      }
      inner.traverse(c => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      group.add(inner);
      setNodeList(prev => prev.map(n => n.id === nodeId ? { ...n, loading: false } : n));
    }, undefined, err => {
      console.error('Scene GLB load error:', err);
      setNodeList(prev => prev.map(n => n.id === nodeId ? { ...n, loading: false } : n));
    });
  }

  function addAsset(job: PickerJob) {
    if (!job.resultUrl) return;
    const nodeId = crypto.randomUUID();
    const n = stateRef.current.nodeList.length;
    const position: Vec3 = n === 0 ? [0, 0, 0] : [Math.cos(n * 1.1) * 1.8, 0, Math.sin(n * 1.1) * 1.8];
    loadNode(nodeId, job.id, job.name || 'Untitled asset', job.resultUrl, position, [0, 0, 0], [1, 1, 1], true, { spawn: true });
    setSelection({ kind: 'node', id: nodeId });
    setPickerOpen(false);
  }

  function removeNode(nodeId: string) {
    const scene = sceneRef.current;
    const group = nodeGroupsRef.current.get(nodeId);
    if (scene && group) {
      if (stateRef.current.selection?.id === nodeId) transformRef.current?.detach();
      scene.remove(group);
      disposeObject(group);
      nodeGroupsRef.current.delete(nodeId);
    }
    setNodeList(prev => prev.filter(n => n.id !== nodeId));
    setSelection(sel => (sel?.id === nodeId ? null : sel));
  }

  function duplicateNode(nodeId: string) {
    const meta = stateRef.current.nodeList.find(n => n.id === nodeId);
    const group = nodeGroupsRef.current.get(nodeId);
    if (!meta || !group) return;
    const newId = crypto.randomUUID();
    loadNode(
      newId, meta.jobId, `${meta.name} copy`, meta.resultUrl,
      [group.position.x + 0.8, group.position.y, group.position.z],
      [group.rotation.x, group.rotation.y, group.rotation.z],
      [group.scale.x, group.scale.y, group.scale.z],
      meta.visible,
    );
    setSelection({ kind: 'node', id: newId });
  }

  function toggleNodeVisible(nodeId: string) {
    const group = nodeGroupsRef.current.get(nodeId);
    setNodeList(prev => prev.map(n => {
      if (n.id !== nodeId) return n;
      if (group) group.visible = !n.visible;
      return { ...n, visible: !n.visible };
    }));
  }

  // ── Light management ────────────────────────────────────────────────────
  function addLight(type: LightType) {
    const count = stateRef.current.lights.filter(l => l.type === type).length + 1;
    const spec = makeLight(type, count);
    setLights(prev => [...prev, spec]);
    setSelection({ kind: 'light', id: spec.id });
  }

  function removeLight(id: string) {
    setLights(prev => prev.filter(l => l.id !== id));
    setSelection(sel => (sel?.id === id ? null : sel));
  }

  // ── Camera helpers ──────────────────────────────────────────────────────
  function frameBox(box: THREE.Box3) {
    const cam = cameraRef.current, orbit = orbitRef.current;
    if (!cam || !orbit || box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = (maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))) * 1.5;
    const dir = cam.position.clone().sub(orbit.target).normalize();
    if (!isFinite(dir.lengthSq()) || dir.lengthSq() < 1e-6) dir.set(1, 0.6, 1).normalize();
    cam.position.copy(center.clone().add(dir.multiplyScalar(dist)));
    orbit.target.copy(center);
    orbit.update();
  }

  function frameSelection() {
    const sel = stateRef.current.selection;
    const box = new THREE.Box3();
    if (sel?.kind === 'node') {
      const g = nodeGroupsRef.current.get(sel.id);
      if (g) box.setFromObject(g);
    } else if (sel?.kind === 'light') {
      const rig = lightRigsRef.current.get(sel.id);
      if (rig) box.setFromCenterAndSize(rig.group.position, new THREE.Vector3(1, 1, 1));
    } else {
      nodeGroupsRef.current.forEach(g => box.expandByObject(g));
    }
    frameBox(box);
  }

  function frameAll() {
    const box = new THREE.Box3();
    nodeGroupsRef.current.forEach(g => box.expandByObject(g));
    frameBox(box);
  }

  function cameraPreset(preset: 'front' | 'right' | 'top' | 'threeq') {
    const cam = cameraRef.current, orbit = orbitRef.current;
    if (!cam || !orbit) return;
    const dist = cam.position.distanceTo(orbit.target) || 5;
    const t = orbit.target;
    const dirs: Record<string, Vec3> = {
      front: [0, 0.15, 1],
      right: [1, 0.15, 0],
      top: [0, 1, 0.001],
      threeq: [1, 0.55, 1],
    };
    const d = new THREE.Vector3(...dirs[preset]).normalize().multiplyScalar(dist);
    cam.position.set(t.x + d.x, t.y + d.y, t.z + d.z);
    orbit.update();
  }

  // ── Save / export ───────────────────────────────────────────────────────
  function buildSceneData(): SceneData {
    const nodes: SceneData['nodes'] = stateRef.current.nodeList.map(meta => {
      const g = nodeGroupsRef.current.get(meta.id);
      return {
        id: meta.id,
        jobId: meta.jobId,
        name: meta.name,
        resultUrl: meta.resultUrl,
        position: g ? [g.position.x, g.position.y, g.position.z] : [0, 0, 0],
        rotation: g ? [g.rotation.x, g.rotation.y, g.rotation.z] : [0, 0, 0],
        scale: g ? [g.scale.x, g.scale.y, g.scale.z] : [1, 1, 1],
        visible: meta.visible,
        pivotCenter: true,
      };
    });
    const lightsOut: SceneLight[] = stateRef.current.lights.map(spec => {
      const rig = lightRigsRef.current.get(spec.id);
      return {
        ...spec,
        position: rig
          ? [rig.group.position.x, rig.group.position.y, rig.group.position.z]
          : spec.position,
      };
    });
    const cam = cameraRef.current!, orbit = orbitRef.current!;
    const camera: SceneCamera = {
      position: [cam.position.x, cam.position.y, cam.position.z],
      target: [orbit.target.x, orbit.target.y, orbit.target.z],
      fov: cam.fov,
    };
    return { version: 2, nodes, lights: lightsOut, environment: env, camera };
  }

  function captureThumbnail(): string {
    const renderer = rendererRef.current, scene = sceneRef.current, cam = cameraRef.current;
    if (!renderer || !scene || !cam) return '';
    renderer.render(scene, cam);
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = Math.max(1, Math.round((480 * src.height) / Math.max(1, src.width)));
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await scenesApi.update(sceneId, email, {
        name, sceneData: buildSceneData(), thumbnailUrl: captureThumbnail(),
      });
      setSavedAt(new Date());
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function exportImage() {
    const renderer = rendererRef.current, scene = sceneRef.current, cam = cameraRef.current;
    if (!renderer || !scene || !cam) return;
    const [W, H] = exportSize.split('x').map(Number);
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevAspect = cam.aspect;
    const prevBg = scene.background;
    const prevHelpers: [THREE.Object3D, boolean][] = [];
    // Hide editor-only visuals for the beauty render.
    const editorOnly: (THREE.Object3D | null)[] = [
      gridRef.current,
      transformRef.current?.getHelper() ?? null,
      ...[...lightRigsRef.current.values()].flatMap(r => [r.helper, r.handle]),
    ];
    editorOnly.forEach(o => { if (o) { prevHelpers.push([o, o.visible]); o.visible = false; } });
    if (exportTransparent) scene.background = null;

    renderer.setSize(W, H, false);
    cam.aspect = W / H;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);
    const dataUrl = renderer.domElement.toDataURL('image/png');

    // Restore
    scene.background = prevBg;
    prevHelpers.forEach(([o, v]) => { o.visible = v; });
    renderer.setSize(prevSize.x, prevSize.y, false);
    cam.aspect = prevAspect;
    cam.updateProjectionMatrix();
    renderer.render(scene, cam);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(name || 'scene').replace(/[^a-z0-9-_]+/gi, '_')}_${W}x${H}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function removeSelected() {
    const sel = stateRef.current.selection;
    if (!sel) return;
    if (sel.kind === 'node') removeNode(sel.id);
    else removeLight(sel.id);
  }

  function duplicateSelected() {
    const sel = stateRef.current.selection;
    if (sel?.kind === 'node') duplicateNode(sel.id);
  }

  actionsRef.current = { save, frameSelection, removeSelected, duplicateSelected };

  // ── Asset picker data ───────────────────────────────────────────────────
  useEffect(() => {
    if (!pickerOpen || pickerJobs !== null) return;
    fetch(`/api/jobs?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setPickerJobs((d.jobs || []).filter((j: PickerJob) => j.status === 'done' && j.resultUrl)))
      .catch(() => setPickerJobs([]));
  }, [pickerOpen, pickerJobs, email]);

  // ── Inspector helpers ───────────────────────────────────────────────────
  const selectedNode = selection?.kind === 'node' ? nodeList.find(n => n.id === selection.id) : undefined;
  const selectedGroup = selection?.kind === 'node' ? nodeGroupsRef.current.get(selection.id) : undefined;
  const selectedLight = selection?.kind === 'light' ? lights.find(l => l.id === selection.id) : undefined;
  const selectedRig = selection?.kind === 'light' ? lightRigsRef.current.get(selection.id) : undefined;

  const patchLight = (id: string, patch: Partial<SceneLight>) =>
    setLights(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));

  const groupVec = (g: THREE.Group | undefined, kind: 'position' | 'rotation' | 'scale'): Vec3 => {
    if (!g) return kind === 'scale' ? [1, 1, 1] : [0, 0, 0];
    const v = g[kind];
    return kind === 'rotation'
      ? [THREE.MathUtils.radToDeg(g.rotation.x), THREE.MathUtils.radToDeg(g.rotation.y), THREE.MathUtils.radToDeg(g.rotation.z)]
      : [v.x, v.y, v.z];
  };

  const setGroupVec = (g: THREE.Group | undefined, kind: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, v: number) => {
    if (!g) return;
    const key = (['x', 'y', 'z'] as const)[axis];
    if (kind === 'rotation') g.rotation[key] = THREE.MathUtils.degToRad(v);
    else g[kind][key] = kind === 'scale' ? Math.max(0.01, v) : v;
    forceTick();
  };

  return (
    <Shell>
      <TopBar>
        <BackLink to="/scenes">← Scenes</BackLink>
        <NameInput value={name} onChange={e => setName(e.target.value)} placeholder="Scene name" />
        <ModeGroup>
          <ModeChip $active={transformMode === 'translate'} onClick={() => setTransformMode('translate')} title="Move (W)">Move</ModeChip>
          <ModeChip $active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')} title="Rotate (E)">Rotate</ModeChip>
          <ModeChip $active={transformMode === 'scale'} onClick={() => setTransformMode('scale')} title="Scale (R)">Scale</ModeChip>
        </ModeGroup>
        <Spacer />
        {savedAt && <SaveStatus>Saved {savedAt.toLocaleTimeString()}</SaveStatus>}
        <TopBtn onClick={exportImage} disabled={nodeList.length === 0} title="Render a presentation PNG">Export image</TopBtn>
        <TopBtn $primary onClick={save} disabled={saving} title="Save scene (Ctrl+S)">{saving ? 'Saving…' : 'Save'}</TopBtn>
      </TopBar>

      <Body>
        {/* ── Outliner ── */}
        <LeftPanel>
          <Accordion title="Objects" badge={String(nodeList.length)}>
            {nodeList.length === 0 && (
              <EmptyHint>Add one of your finished 3D generations to start composing.</EmptyHint>
            )}
            {nodeList.map(n => (
              <OutlinerRow
                key={n.id}
                $active={selection?.kind === 'node' && selection.id === n.id}
                onClick={() => setSelection({ kind: 'node', id: n.id })}
              >
                <OutlinerIcon>⬡</OutlinerIcon>
                <OutlinerLabel $dim={!n.visible}>{n.loading ? `${n.name} …` : n.name}</OutlinerLabel>
                <RowAction title={n.visible ? 'Hide' : 'Show'} onClick={e => { e.stopPropagation(); toggleNodeVisible(n.id); }}>
                  {n.visible ? '👁' : '—'}
                </RowAction>
                <RowAction title="Duplicate (Ctrl+D)" onClick={e => { e.stopPropagation(); duplicateNode(n.id); }}>⧉</RowAction>
                <RowAction title="Remove" onClick={e => { e.stopPropagation(); removeNode(n.id); }}>✕</RowAction>
              </OutlinerRow>
            ))}
            <MiniBtn $primary onClick={() => setPickerOpen(true)}>+ Add object</MiniBtn>
          </Accordion>

          <Accordion title="Lights" badge={String(lights.length)}>
            {lights.map(l => (
              <OutlinerRow
                key={l.id}
                $active={selection?.kind === 'light' && selection.id === l.id}
                onClick={() => setSelection({ kind: 'light', id: l.id })}
              >
                <OutlinerIcon>{LIGHT_ICONS[l.type]}</OutlinerIcon>
                <OutlinerLabel>{l.name}</OutlinerLabel>
                <RowAction title="Remove" onClick={e => { e.stopPropagation(); removeLight(l.id); }}>✕</RowAction>
              </OutlinerRow>
            ))}
            <BtnRow>
              <MiniBtn onClick={() => addLight('directional')}>+ Sun</MiniBtn>
              <MiniBtn onClick={() => addLight('point')}>+ Point</MiniBtn>
              <MiniBtn onClick={() => addLight('spot')}>+ Spot</MiniBtn>
            </BtnRow>
          </Accordion>
        </LeftPanel>

        {/* ── Viewport ── */}
        <Viewport>
          <ViewportMount ref={mountRef} />
          <ViewportHint>
            LMB select · Alt+LMB / MMB orbit · Shift+MMB / RMB pan · wheel zoom · W/E/R gizmo · F frame · Ctrl+S save
          </ViewportHint>
        </Viewport>

        {/* ── Inspector ── */}
        <RightPanel>
          <Tabs
            tabs={[{ key: 'inspector', label: 'Inspector' }, { key: 'scene', label: 'Scene' }]}
            active={activeTab}
            onChange={k => setActiveTab(k as 'inspector' | 'scene')}
          />

          {activeTab === 'inspector' && (
            <>
              {!selection && (
                <EmptyHint>
                  Nothing selected. Click an object or a light in the viewport, or pick one in the outliner.
                </EmptyHint>
              )}

              {selectedNode && selectedGroup && (
                <>
                  <Accordion title="Transform">
                    <Vec3Row label="Position" value={groupVec(selectedGroup, 'position')}
                      onChange={(a, v) => setGroupVec(selectedGroup, 'position', a, v)} />
                    <Vec3Row label="Rotation °" value={groupVec(selectedGroup, 'rotation')} step={5}
                      onChange={(a, v) => setGroupVec(selectedGroup, 'rotation', a, v)} />
                    <Vec3Row label="Scale" value={groupVec(selectedGroup, 'scale')} step={0.05}
                      onChange={(a, v) => setGroupVec(selectedGroup, 'scale', a, v)} />
                  </Accordion>
                  <Accordion title="Object">
                    <ToggleRow label="Visible" value={selectedNode.visible} onChange={() => toggleNodeVisible(selectedNode.id)} />
                    <BtnRow>
                      <MiniBtn onClick={() => duplicateNode(selectedNode.id)}>Duplicate</MiniBtn>
                      <MiniBtn onClick={frameSelection}>Frame (F)</MiniBtn>
                      <MiniBtn $danger onClick={() => removeNode(selectedNode.id)}>Remove</MiniBtn>
                    </BtnRow>
                  </Accordion>
                </>
              )}

              {selectedLight && (
                <>
                  <Accordion title={`${selectedLight.name} · ${selectedLight.type}`}>
                    <ColorRow label="Color" value={selectedLight.color}
                      onChange={hex => patchLight(selectedLight.id, { color: hex })} />
                    <SliderRow label="Intensity" value={selectedLight.intensity}
                      min={0} max={selectedLight.type === 'directional' ? 6 : 60} step={0.1}
                      onChange={v => patchLight(selectedLight.id, { intensity: v })} />
                    <ToggleRow label="Shadows" value={selectedLight.castShadow}
                      onChange={v => patchLight(selectedLight.id, { castShadow: v })} />
                    {selectedLight.type === 'spot' && (
                      <>
                        <SliderRow label="Cone °" value={selectedLight.angle ?? 35} min={5} max={80} step={1}
                          format={v => `${Math.round(v)}°`}
                          onChange={v => patchLight(selectedLight.id, { angle: v })} />
                        <SliderRow label="Softness" value={selectedLight.penumbra ?? 0.4} min={0} max={1} step={0.05}
                          onChange={v => patchLight(selectedLight.id, { penumbra: v })} />
                      </>
                    )}
                  </Accordion>
                  <Accordion title="Placement">
                    <Vec3Row label="Position"
                      value={selectedRig
                        ? [selectedRig.group.position.x, selectedRig.group.position.y, selectedRig.group.position.z]
                        : selectedLight.position}
                      onChange={(a, v) => {
                        if (!selectedRig) return;
                        selectedRig.group.position.setComponent(a, v);
                        forceTick();
                      }} />
                    {selectedLight.type !== 'point' && (
                      <Vec3Row label="Aim at" value={selectedLight.target}
                        onChange={(a, v) => {
                          const t = [...selectedLight.target] as Vec3;
                          t[a] = v;
                          patchLight(selectedLight.id, { target: t });
                        }} />
                    )}
                    <BtnRow>
                      <MiniBtn $danger onClick={() => removeLight(selectedLight.id)}>Remove light</MiniBtn>
                    </BtnRow>
                  </Accordion>
                </>
              )}
            </>
          )}

          {activeTab === 'scene' && (
            <>
              <Accordion title="Environment">
                <ColorRow label="Background" value={env.background}
                  onChange={hex => setEnv(e => ({ ...e, background: hex }))} />
                <ColorRow label="Ambient" value={env.ambientColor}
                  onChange={hex => setEnv(e => ({ ...e, ambientColor: hex }))} />
                <SliderRow label="Amb. level" value={env.ambientIntensity} min={0} max={2} step={0.05}
                  onChange={v => setEnv(e => ({ ...e, ambientIntensity: v }))} />
                <ToggleRow label="Grid" value={env.showGrid}
                  onChange={v => setEnv(e => ({ ...e, showGrid: v }))} />
                <ToggleRow label="Floor shadow" value={env.showGround}
                  onChange={v => setEnv(e => ({ ...e, showGround: v }))} />
              </Accordion>

              <Accordion title="Camera">
                <SliderRow label="FOV" value={fov} min={15} max={90} step={1}
                  format={v => `${Math.round(v)}°`} onChange={setFov} />
                <BtnRow>
                  <MiniBtn onClick={() => cameraPreset('front')}>Front</MiniBtn>
                  <MiniBtn onClick={() => cameraPreset('right')}>Right</MiniBtn>
                  <MiniBtn onClick={() => cameraPreset('top')}>Top</MiniBtn>
                  <MiniBtn onClick={() => cameraPreset('threeq')}>¾ view</MiniBtn>
                </BtnRow>
                <BtnRow>
                  <MiniBtn onClick={frameAll}>Frame all</MiniBtn>
                </BtnRow>
              </Accordion>

              <Accordion title="Export">
                <Row>
                  <RowLabel>Size</RowLabel>
                  <Dropdown value={exportSize} options={EXPORT_SIZES} onChange={setExportSize} fullWidth />
                </Row>
                <ToggleRow label="Transparent" value={exportTransparent} onChange={setExportTransparent} />
                <BtnRow>
                  <MiniBtn $primary onClick={exportImage} disabled={nodeList.length === 0}>Export PNG</MiniBtn>
                </BtnRow>
              </Accordion>
            </>
          )}
        </RightPanel>
      </Body>

      {pickerOpen && (
        <ModalBackdrop onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
          <ModalPanel>
            <ModalHead>
              <ModalTitle>Add an object</ModalTitle>
              <TopBtn onClick={() => setPickerOpen(false)}>Close</TopBtn>
            </ModalHead>
            {pickerJobs === null ? (
              <EmptyHint>Loading your assets…</EmptyHint>
            ) : pickerJobs.length === 0 ? (
              <EmptyHint>No finished 3D generations yet. Generate one first, then come back here to add it.</EmptyHint>
            ) : (
              <AssetGrid>
                {pickerJobs.map(job => (
                  <AssetCard key={job.id} onClick={() => addAsset(job)}>
                    <AssetThumb $url={thumbUrlFor(job)}>{!thumbUrlFor(job) && '⬡'}</AssetThumb>
                    <AssetName>{job.name || 'Untitled'}</AssetName>
                  </AssetCard>
                ))}
              </AssetGrid>
            )}
          </ModalPanel>
        </ModalBackdrop>
      )}
    </Shell>
  );
};

// ── Outer: auth + fetch ──────────────────────────────────────────────────────

export const SceneEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user, isAuthenticated } = useAuth();
  const email = user?.email || DEV_EMAIL || '';

  const [scene, setScene] = useState<Scene | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!email || !id) return;
    let cancelled = false;
    scenesApi.get(id, email)
      .then(r => { if (!cancelled) setScene(r.scene); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, email]);

  if (!isAuthenticated && !DEV_EMAIL) return <Navigate to="/login" replace />;
  if (!id) return <Navigate to="/scenes" replace />;
  if (failed) return <Navigate to="/scenes" replace />;
  if (!scene) return <Loading>Loading scene…</Loading>;

  return <SceneEditorInner sceneId={id} email={email} initial={scene} />;
};

export default SceneEditor;
