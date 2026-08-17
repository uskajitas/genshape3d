// ─────────────────────────────────────────────────────────────────────────────
// SceneEditor — place multiple existing GLBs together, light them, frame a
// camera, and export a presentation image.
//
// Deliberately separate from MeshViewer: MeshViewer auto-recenters/rescales
// every model it loads (correct for a single-asset preview), which would
// destroy scene placement. Here each object gets a wrapper group whose
// transform is the one thing that gets saved — the inner GLB is normalized
// once on load (so newly-added assets land at a sane size) but the outer
// group transform is what the user edits and what round-trips through save.
// The source GLB itself is never modified.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useReducer, useRef, useState } from 'react';
import styled from 'styled-components';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useAuth } from '../../context/AuthContext';
import { Dropdown, type DropdownOption } from '../../components/Dropdown';
import { scenesApi, Scene, SceneData, SceneLighting } from './api';

const DEFAULT_LIGHTING: SceneLighting = {
  ambientIntensity: 0.9,
  keyIntensity: 2.2,
  keyAzimuth: 45,
  keyElevation: 55,
  background: '#101013',
};

const DEFAULT_CAMERA = {
  position: [0, 1.6, 4] as [number, number, number],
  target: [0, 0.5, 0] as [number, number, number],
  fov: 45,
};

const BACKGROUND_PRESETS: DropdownOption<string>[] = [
  { value: '#101013', label: 'Studio dark' },
  { value: '#1c1c22', label: 'Charcoal' },
  { value: '#e8e8ec', label: 'Studio light' },
  { value: '#ffffff', label: 'White' },
  { value: '#0b1220', label: 'Midnight blue' },
  { value: '#151018', label: 'Aubergine' },
];

interface PickerJob {
  id: string;
  name?: string;
  status: string;
  resultUrl?: string;
  imageUrl?: string;
  createdAt?: string;
}

interface NodeMeta {
  id: string;
  jobId: string;
  name: string;
  resultUrl: string;
}

const meshUrlFor = (resultUrl: string) => `/api/mesh?key=${encodeURIComponent(resultUrl)}`;
const thumbUrlFor = (job: PickerJob) => {
  if (!job.imageUrl) return undefined;
  const key = job.imageUrl.includes('/uploads/')
    ? `uploads/${job.imageUrl.split('/uploads/')[1]}`
    : job.imageUrl;
  return `/api/image?key=${encodeURIComponent(key)}`;
};

// ── Styled ───────────────────────────────────────────────────────────────────

const Shell = styled.div`
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: ${p => p.theme.colors.background};
`;

const TopBar = styled.div`
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  flex-shrink: 0;
`;

const BackLink = styled(Link)`
  font-size: 0.78rem; font-weight: 700;
  color: ${p => p.theme.colors.textMuted};
  text-decoration: none;
  &:hover { color: ${p => p.theme.colors.text}; }
`;

const NameInput = styled.input`
  font: inherit; font-size: 0.92rem; font-weight: 700;
  padding: 0.4rem 0.6rem; border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  color: ${p => p.theme.colors.text};
  min-width: 160px;
  &:hover, &:focus { border-color: ${p => p.theme.colors.border}; background: ${p => p.theme.colors.surfaceHigh}; }
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const Spacer = styled.div`flex: 1;`;

const Btn = styled.button<{ $primary?: boolean }>`
  font: inherit; font-size: 0.8rem; font-weight: 600;
  padding: 0.48rem 0.95rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.$primary ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$primary
    ? `linear-gradient(135deg, ${p.theme.colors.primary}, ${p.theme.colors.violet})`
    : 'transparent'};
  color: ${p => p.$primary ? 'white' : p.theme.colors.text};
  &:hover { opacity: 0.85; }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
`;

const SaveStatus = styled.span`
  font-size: 0.72rem; color: ${p => p.theme.colors.textMuted};
`;

const Body = styled.div`
  flex: 1; display: flex; min-height: 0;
`;

const SidePanel = styled.aside`
  width: 260px; flex-shrink: 0;
  display: flex; flex-direction: column; gap: 1rem;
  padding: 1rem;
  border-right: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surface};
  overflow-y: auto;
`;

const RightPanel = styled(SidePanel)`
  border-right: 0;
  border-left: 1px solid ${p => p.theme.colors.border};
`;

const PanelSection = styled.div`
  display: flex; flex-direction: column; gap: 0.5rem;
`;

const PanelTitle = styled.div`
  font-size: 0.68rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.07em;
  color: ${p => p.theme.colors.textMuted};
`;

const NodeRow = styled.button<{ $active?: boolean }>`
  display: flex; align-items: center; gap: 0.5rem;
  width: 100%; text-align: left; font: inherit;
  padding: 0.45rem 0.55rem; border-radius: 8px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : 'transparent'};
  background: ${p => p.$active ? `${p.theme.colors.violet}18` : 'transparent'};
  color: ${p => p.theme.colors.text};
  &:hover { background: ${p => p.theme.colors.surfaceHigh}; }
`;

const NodeLabel = styled.span`
  flex: 1; min-width: 0; font-size: 0.8rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
`;

const NodeRemove = styled.span`
  font-size: 0.85rem; color: ${p => p.theme.colors.textMuted};
  &:hover { color: ${p => p.theme.colors.violet}; }
`;

const EmptyHint = styled.div`
  font-size: 0.76rem; color: ${p => p.theme.colors.textMuted}; line-height: 1.5;
`;

const ModeRow = styled.div`
  display: flex; gap: 0.35rem;
`;

const ModeChip = styled.button<{ $active?: boolean }>`
  flex: 1; font: inherit; font-size: 0.72rem; font-weight: 700;
  padding: 0.35rem 0; border-radius: 7px; cursor: pointer;
  border: 1px solid ${p => p.$active ? p.theme.colors.violet : p.theme.colors.border};
  background: ${p => p.$active ? `${p.theme.colors.violet}22` : 'transparent'};
  color: ${p => p.$active ? p.theme.colors.violet : p.theme.colors.textMuted};
`;

const XForm = styled.div`
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.35rem;
`;

const XField = styled.label`
  display: flex; flex-direction: column; gap: 0.2rem;
  font-size: 0.62rem; font-weight: 700; color: ${p => p.theme.colors.textMuted};
  text-transform: uppercase;
`;

const XInput = styled.input`
  font: inherit; font-size: 0.78rem;
  padding: 0.32rem 0.4rem; border-radius: 6px;
  border: 1px solid ${p => p.theme.colors.border};
  background: ${p => p.theme.colors.surfaceHigh};
  color: ${p => p.theme.colors.text};
  width: 100%;
  &:focus { outline: none; border-color: ${p => p.theme.colors.violet}; }
`;

const SliderLabel = styled.div`
  display: flex; justify-content: space-between;
  font-size: 0.72rem; color: ${p => p.theme.colors.textMuted};
  span:last-child { color: ${p => p.theme.colors.text}; font-weight: 600; }
`;

const Slider = styled.input`
  width: 100%; accent-color: ${p => p.theme.colors.violet};
`;

const Viewport = styled.div`
  flex: 1; position: relative; min-width: 0;
`;

const ViewportMount = styled.div`
  position: absolute; inset: 0;
`;

const ViewportHint = styled.div`
  position: absolute; left: 12px; bottom: 12px;
  font-size: 0.7rem; color: ${p => p.theme.colors.textMuted};
  background: ${p => p.theme.colors.surface}cc;
  padding: 0.3rem 0.6rem; border-radius: 6px;
  pointer-events: none;
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

// ── Component ────────────────────────────────────────────────────────────────

export const SceneEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const email = user?.email || '';

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadedScene, setLoadedScene] = useState<Scene | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const [name, setName] = useState('Untitled scene');
  const [nodeList, setNodeList] = useState<NodeMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [lighting, setLighting] = useState<SceneLighting>(DEFAULT_LIGHTING);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
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
  const keyLightRef = useRef<THREE.DirectionalLight | null>(null);
  const nodeObjectsRef = useRef<Map<string, THREE.Group>>(new Map());
  const appliedRef = useRef(false);

  // ── Load scene from the server ──────────────────────────────────────────
  useEffect(() => {
    if (!email || !id) return;
    scenesApi.get(id, email)
      .then(r => setLoadedScene(r.scene))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id, email]);

  // ── Build the three.js scaffold once ────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULT_LIGHTING.background);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      DEFAULT_CAMERA.fov, mount.clientWidth / mount.clientHeight, 0.01, 1000,
    );
    camera.position.set(...DEFAULT_CAMERA.position);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, DEFAULT_LIGHTING.ambientIntensity);
    scene.add(ambient);
    ambientRef.current = ambient;

    const key = new THREE.DirectionalLight(0xffffff, DEFAULT_LIGHTING.keyIntensity);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    keyLightRef.current = key;

    const fill = new THREE.DirectionalLight(0xffffff, 0.6);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(20, 40, 0x2a2a33, 0x2a2a33);
    scene.add(grid);

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(...DEFAULT_CAMERA.target);
    orbit.update();
    orbitRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.setSize(0.9);
    scene.add(transform.getHelper());
    transform.addEventListener('dragging-changed', (e: any) => { orbit.enabled = !e.value; });
    transform.addEventListener('objectChange', () => forceTick());
    transformRef.current = transform;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onClick = (e: MouseEvent) => {
      if (transform.dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const groups = Array.from(nodeObjectsRef.current.values());
      const hits = raycaster.intersectObjects(groups, true);
      if (hits.length === 0) return;
      let obj: THREE.Object3D | null = hits[0].object;
      while (obj && !obj.userData.nodeId) obj = obj.parent;
      if (obj) setSelectedId(obj.userData.nodeId);
    };
    renderer.domElement.addEventListener('click', onClick);

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
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    setSceneReady(true);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      orbit.dispose();
      transform.dispose();
      nodeObjectsRef.current.forEach(disposeObject);
      nodeObjectsRef.current.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      orbitRef.current = null;
      transformRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Apply loaded scene data once the scaffold + fetch are both ready ───
  useEffect(() => {
    if (!sceneReady || !loadedScene || appliedRef.current) return;
    appliedRef.current = true;

    setName(loadedScene.name);
    setLighting(loadedScene.sceneData.lighting || DEFAULT_LIGHTING);

    const cam = cameraRef.current!;
    const orbit = orbitRef.current!;
    const camData = loadedScene.sceneData.camera || DEFAULT_CAMERA;
    cam.position.set(...camData.position);
    cam.fov = camData.fov;
    cam.updateProjectionMatrix();
    orbit.target.set(...camData.target);
    orbit.update();

    (loadedScene.sceneData.nodes || []).forEach(n => {
      loadNode(n.id, n.jobId, n.name, n.resultUrl, n.position, n.rotation, n.scale);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneReady, loadedScene]);

  // ── Push lighting state into the live scene ─────────────────────────────
  useEffect(() => {
    if (!sceneReady) return;
    if (ambientRef.current) ambientRef.current.intensity = lighting.ambientIntensity;
    if (keyLightRef.current) {
      keyLightRef.current.intensity = lighting.keyIntensity;
      const az = THREE.MathUtils.degToRad(lighting.keyAzimuth);
      const el = THREE.MathUtils.degToRad(lighting.keyElevation);
      const r = 7;
      keyLightRef.current.position.set(
        r * Math.cos(el) * Math.cos(az),
        Math.max(0.5, r * Math.sin(el)),
        r * Math.cos(el) * Math.sin(az),
      );
    }
    if (sceneRef.current) sceneRef.current.background = new THREE.Color(lighting.background);
  }, [lighting, sceneReady]);

  // ── Keep the gizmo attached to the selected node ────────────────────────
  useEffect(() => {
    const tc = transformRef.current;
    if (!tc) return;
    if (!selectedId) { tc.detach(); return; }
    const obj = nodeObjectsRef.current.get(selectedId);
    if (obj) tc.attach(obj); else tc.detach();
  }, [selectedId]);

  useEffect(() => {
    transformRef.current?.setMode(transformMode);
  }, [transformMode]);

  // ── Node loading ─────────────────────────────────────────────────────────
  function loadNode(
    nodeId: string, jobId: string, jobName: string, resultUrl: string,
    position: [number, number, number], rotation: [number, number, number], scale: [number, number, number],
  ) {
    const scene = sceneRef.current;
    if (!scene) return;
    const group = new THREE.Group();
    group.userData.nodeId = nodeId;
    group.position.set(...position);
    group.rotation.set(...rotation);
    group.scale.set(...scale);
    scene.add(group);
    nodeObjectsRef.current.set(nodeId, group);
    setNodeList(prev => [...prev, { id: nodeId, jobId, name: jobName, resultUrl }]);

    new GLTFLoader().load(meshUrlFor(resultUrl), gltf => {
      const inner = gltf.scene;
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const fitScale = 1.4 / maxDim;
      inner.scale.setScalar(fitScale);
      inner.position.set(
        -center.x * fitScale,
        -center.y * fitScale + (size.y * fitScale) / 2,
        -center.z * fitScale,
      );
      inner.traverse(c => {
        const mesh = c as THREE.Mesh;
        if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; }
      });
      group.add(inner);
      forceTick();
    }, undefined, err => console.error('Scene GLB load error:', err));
  }

  function addAsset(job: PickerJob) {
    if (!job.resultUrl) return;
    const nodeId = crypto.randomUUID();
    const offset = nodeList.length;
    const angle = offset * 0.9;
    const position: [number, number, number] = [Math.cos(angle) * 1.6 * (offset > 0 ? 1 : 0), 0, Math.sin(angle) * 1.6 * (offset > 0 ? 1 : 0)];
    loadNode(nodeId, job.id, job.name || 'Untitled asset', job.resultUrl, position, [0, 0, 0], [1, 1, 1]);
    setSelectedId(nodeId);
    setPickerOpen(false);
  }

  function removeNode(nodeId: string) {
    const scene = sceneRef.current;
    const obj = nodeObjectsRef.current.get(nodeId);
    if (scene && obj) {
      if (selectedId === nodeId) transformRef.current?.detach();
      scene.remove(obj);
      disposeObject(obj);
      nodeObjectsRef.current.delete(nodeId);
    }
    setNodeList(prev => prev.filter(n => n.id !== nodeId));
    if (selectedId === nodeId) setSelectedId(null);
  }

  // ── Asset picker ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pickerOpen || pickerJobs !== null || !email) return;
    fetch(`/api/jobs?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setPickerJobs((d.jobs || []).filter((j: PickerJob) => j.status === 'done' && j.resultUrl)))
      .catch(() => setPickerJobs([]));
  }, [pickerOpen, pickerJobs, email]);

  // ── Save ─────────────────────────────────────────────────────────────────
  function captureThumbnail(): string {
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!renderer || !scene || !camera) return '';
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = Math.max(1, Math.round((480 * src.height) / src.width));
    const ctx = c.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  }

  function buildSceneData(): SceneData {
    const nodes: SceneData['nodes'] = nodeList.map(meta => {
      const obj = nodeObjectsRef.current.get(meta.id);
      const position: [number, number, number] = obj ? [obj.position.x, obj.position.y, obj.position.z] : [0, 0, 0];
      const rotation: [number, number, number] = obj ? [obj.rotation.x, obj.rotation.y, obj.rotation.z] : [0, 0, 0];
      const scale: [number, number, number] = obj ? [obj.scale.x, obj.scale.y, obj.scale.z] : [1, 1, 1];
      return {
        id: meta.id,
        jobId: meta.jobId,
        name: meta.name,
        resultUrl: meta.resultUrl,
        position,
        rotation,
        scale,
      };
    });
    const cam = cameraRef.current!, orbit = orbitRef.current!;
    return {
      nodes,
      lighting,
      camera: {
        position: cam.position.toArray() as [number, number, number],
        target: orbit.target.toArray() as [number, number, number],
        fov: cam.fov,
      },
    };
  }

  async function save() {
    if (!email || !id || saving) return;
    setSaving(true);
    try {
      const thumbnailUrl = captureThumbnail();
      await scenesApi.update(id, email, { name, sceneData: buildSceneData(), thumbnailUrl });
      setSavedAt(new Date());
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  function exportImage() {
    const renderer = rendererRef.current, scene = sceneRef.current, camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);
    const prevAspect = camera.aspect;
    const W = 1920, H = 1080;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    renderer.setSize(prevSize.x, prevSize.y, false);
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${(name || 'scene').replace(/[^a-z0-9-_]+/gi, '_')}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── Selected node transform panel ───────────────────────────────────────
  const selectedObj = selectedId ? nodeObjectsRef.current.get(selectedId) : null;

  const setPos = (axis: 'x' | 'y' | 'z', v: number) => {
    if (!selectedObj) return;
    selectedObj.position[axis] = v;
    forceTick();
  };
  const setRotDeg = (axis: 'x' | 'y' | 'z', deg: number) => {
    if (!selectedObj) return;
    selectedObj.rotation[axis] = THREE.MathUtils.degToRad(deg);
    forceTick();
  };
  const setScaleAll = (axis: 'x' | 'y' | 'z', v: number) => {
    if (!selectedObj || v <= 0) return;
    selectedObj.scale[axis] = v;
    forceTick();
  };

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (loading) return <Loading>Loading scene…</Loading>;
  if (notFound || !loadedScene) return <Navigate to="/scenes" replace />;

  return (
    <Shell>
      <TopBar>
        <BackLink to="/scenes">← Scenes</BackLink>
        <NameInput value={name} onChange={e => setName(e.target.value)} placeholder="Scene name" />
        <Spacer />
        {savedAt && <SaveStatus>Saved {savedAt.toLocaleTimeString()}</SaveStatus>}
        <Btn onClick={exportImage} disabled={nodeList.length === 0}>Export image</Btn>
        <Btn $primary onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
      </TopBar>

      <Body>
        <SidePanel>
          <PanelSection>
            <PanelTitle>Objects ({nodeList.length})</PanelTitle>
            {nodeList.length === 0 && (
              <EmptyHint>No objects yet. Add one of your finished 3D generations to start composing.</EmptyHint>
            )}
            {nodeList.map(n => (
              <NodeRow key={n.id} $active={n.id === selectedId} onClick={() => setSelectedId(n.id)}>
                <NodeLabel>{n.name}</NodeLabel>
                <NodeRemove onClick={(e) => { e.stopPropagation(); removeNode(n.id); }} title="Remove from scene">✕</NodeRemove>
              </NodeRow>
            ))}
            <Btn onClick={() => setPickerOpen(true)}>+ Add object</Btn>
          </PanelSection>
        </SidePanel>

        <Viewport>
          <ViewportMount ref={mountRef} />
          <ViewportHint>Drag to orbit · click an object to select it</ViewportHint>
        </Viewport>

        <RightPanel>
          {selectedObj && (
            <PanelSection>
              <PanelTitle>Transform</PanelTitle>
              <ModeRow>
                <ModeChip $active={transformMode === 'translate'} onClick={() => setTransformMode('translate')}>Move</ModeChip>
                <ModeChip $active={transformMode === 'rotate'} onClick={() => setTransformMode('rotate')}>Rotate</ModeChip>
                <ModeChip $active={transformMode === 'scale'} onClick={() => setTransformMode('scale')}>Scale</ModeChip>
              </ModeRow>

              <XField>Position</XField>
              <XForm>
                {(['x', 'y', 'z'] as const).map(axis => (
                  <XInput
                    key={axis}
                    type="number"
                    step="0.1"
                    value={Number(selectedObj.position[axis].toFixed(2))}
                    onChange={e => setPos(axis, parseFloat(e.target.value) || 0)}
                  />
                ))}
              </XForm>

              <XField>Rotation (°)</XField>
              <XForm>
                {(['x', 'y', 'z'] as const).map(axis => (
                  <XInput
                    key={axis}
                    type="number"
                    step="5"
                    value={Math.round(THREE.MathUtils.radToDeg(selectedObj.rotation[axis]))}
                    onChange={e => setRotDeg(axis, parseFloat(e.target.value) || 0)}
                  />
                ))}
              </XForm>

              <XField>Scale</XField>
              <XForm>
                {(['x', 'y', 'z'] as const).map(axis => (
                  <XInput
                    key={axis}
                    type="number"
                    step="0.05"
                    min="0.01"
                    value={Number(selectedObj.scale[axis].toFixed(2))}
                    onChange={e => setScaleAll(axis, parseFloat(e.target.value) || 0.01)}
                  />
                ))}
              </XForm>
            </PanelSection>
          )}

          <PanelSection>
            <PanelTitle>Lighting</PanelTitle>
            <SliderLabel><span>Ambient</span><span>{lighting.ambientIntensity.toFixed(2)}</span></SliderLabel>
            <Slider type="range" min={0} max={2} step={0.05} value={lighting.ambientIntensity}
              onChange={e => setLighting(l => ({ ...l, ambientIntensity: parseFloat(e.target.value) }))} />

            <SliderLabel><span>Key light</span><span>{lighting.keyIntensity.toFixed(2)}</span></SliderLabel>
            <Slider type="range" min={0} max={4} step={0.05} value={lighting.keyIntensity}
              onChange={e => setLighting(l => ({ ...l, keyIntensity: parseFloat(e.target.value) }))} />

            <SliderLabel><span>Key azimuth</span><span>{lighting.keyAzimuth}°</span></SliderLabel>
            <Slider type="range" min={0} max={360} step={1} value={lighting.keyAzimuth}
              onChange={e => setLighting(l => ({ ...l, keyAzimuth: parseFloat(e.target.value) }))} />

            <SliderLabel><span>Key elevation</span><span>{lighting.keyElevation}°</span></SliderLabel>
            <Slider type="range" min={5} max={90} step={1} value={lighting.keyElevation}
              onChange={e => setLighting(l => ({ ...l, keyElevation: parseFloat(e.target.value) }))} />

            <PanelTitle style={{ marginTop: '0.25rem' }}>Background</PanelTitle>
            <Dropdown
              value={lighting.background}
              options={BACKGROUND_PRESETS}
              onChange={v => setLighting(l => ({ ...l, background: v }))}
              fullWidth
            />
          </PanelSection>
        </RightPanel>
      </Body>

      {pickerOpen && (
        <ModalBackdrop onMouseDown={e => { if (e.target === e.currentTarget) setPickerOpen(false); }}>
          <ModalPanel>
            <ModalHead>
              <ModalTitle>Add an object</ModalTitle>
              <Btn onClick={() => setPickerOpen(false)}>Close</Btn>
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

function disposeObject(obj: THREE.Object3D) {
  obj.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : [mat];
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

export default SceneEditor;
