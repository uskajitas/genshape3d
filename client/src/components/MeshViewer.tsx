import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface MeshViewerProps {
  url: string;
  wireframe?: boolean;
  showGrid?: boolean;
}

const MeshViewer: React.FC<MeshViewerProps> = ({ url, wireframe = false, showGrid = true }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const meshesRef = useRef<THREE.Mesh[]>([]);

  // ── Main scene effect — only re-runs on URL change ──────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Reset mesh refs for new load
    meshesRef.current = [];
    gridRef.current = null;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07060f);

    // Camera
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 1000);
    camera.position.set(0, 1, 3);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 8, 5);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8b5cf6, 0.4);
    fill.position.set(-5, 2, -3);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x10b981, 0.3);
    rim.position.set(0, -3, -5);
    scene.add(rim);

    // Grid / floor plane
    const grid = new THREE.GridHelper(4, 20, 0x1e1b2e, 0x1e1b2e);
    grid.visible = showGrid;
    scene.add(grid);
    gridRef.current = grid;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.5;
    controls.maxDistance = 20;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    // Load GLB
    const loader = new GLTFLoader();
    loader.load(
      url,
      gltf => {
        const model = gltf.scene;

        // Center and scale model to fit view
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        model.position.y += 0.05; // slightly above grid

        const collectedMeshes: THREE.Mesh[] = [];
        model.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            // Apply current wireframe state to newly loaded materials
            const mat = mesh.material;
            if (Array.isArray(mat)) {
              mat.forEach(m => { (m as THREE.MeshStandardMaterial).wireframe = wireframe; });
            } else if (mat) {
              (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
            }
            collectedMeshes.push(mesh);
          }
        });
        meshesRef.current = collectedMeshes;

        scene.add(model);

        // Adjust camera distance based on model size
        camera.position.set(0, maxDim * scale * 0.6, maxDim * scale * 2);
        controls.update();
      },
      undefined,
      err => console.error('GLB load error:', err)
    );

    // Resize handler
    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);

    // Animation loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // ── Wireframe toggle — no mesh reload ───────────────────────────────────
  useEffect(() => {
    meshesRef.current.forEach(mesh => {
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach(m => { (m as THREE.MeshStandardMaterial).wireframe = wireframe; });
      } else if (mat) {
        (mat as THREE.MeshStandardMaterial).wireframe = wireframe;
      }
    });
  }, [wireframe]);

  // ── Grid / floor plane toggle — no mesh reload ──────────────────────────
  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
};

export default MeshViewer;
