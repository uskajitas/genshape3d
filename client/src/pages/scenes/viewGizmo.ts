// ─────────────────────────────────────────────────────────────────────────────
// ViewGizmo — the classic corner navigation widget (Blender/Maya/Unity style).
//
// A small overlay canvas in the top-right of the viewport showing colored
// X/Y/Z axis balls that mirror the main camera's orientation:
//   · click a ball  → snap the view to look down that axis
//   · drag the ball → orbit the main camera
//   · hover         → highlight
//
// Self-contained: owns its canvas + renderer; call render() every frame and
// dispose() on teardown.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SIZE = 92;               // canvas px
const CAM_DIST = 3.1;

interface AxisSpec {
  key: string;
  dir: THREE.Vector3;
  color: number;
  label?: string;
}

const AXES: AxisSpec[] = [
  { key: '+x', dir: new THREE.Vector3(1, 0, 0),  color: 0xff4b6e, label: 'X' },
  { key: '-x', dir: new THREE.Vector3(-1, 0, 0), color: 0xff4b6e },
  { key: '+y', dir: new THREE.Vector3(0, 1, 0),  color: 0x9ccb3b, label: 'Y' },
  { key: '-y', dir: new THREE.Vector3(0, -1, 0), color: 0x9ccb3b },
  { key: '+z', dir: new THREE.Vector3(0, 0, 1),  color: 0x3b8ecb, label: 'Z' },
  { key: '-z', dir: new THREE.Vector3(0, 0, -1), color: 0x3b8ecb },
];

function labelTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 38px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0c0c10';
  ctx.fillText(text, 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ViewGizmo {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private gscene = new THREE.Scene();
  private gcam: THREE.OrthographicCamera;
  private balls = new Map<string, THREE.Mesh>();
  private raycaster = new THREE.Raycaster();
  private hovered: string | null = null;
  private dragging = false;
  private moved = 0;
  private lastXY: [number, number] = [0, 0];
  private disposed = false;

  constructor(
    private camera: THREE.PerspectiveCamera,
    private orbit: OrbitControls,
    host: HTMLElement,
  ) {
    this.canvas = document.createElement('canvas');
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      width: `${SIZE}px`,
      height: `${SIZE}px`,
      borderRadius: '50%',
      cursor: 'pointer',
      zIndex: '5',
      background: 'rgba(20, 20, 26, 0.35)',
      transition: 'background 0.15s',
    } as CSSStyleDeclaration);
    host.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(SIZE, SIZE, false);
    this.renderer.setClearColor(0x000000, 0);

    this.gcam = new THREE.OrthographicCamera(-1.9, 1.9, 1.9, -1.9, 0.1, 10);

    // Axis lines from center to each positive ball.
    for (const spec of AXES) {
      if (spec.label) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          spec.dir.clone().multiplyScalar(1.05),
        ]);
        const line = new THREE.Line(
          lineGeo,
          new THREE.LineBasicMaterial({ color: spec.color, transparent: true, opacity: 0.9 }),
        );
        this.gscene.add(line);
      }

      const isPositive = !!spec.label;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(isPositive ? 0.34 : 0.22, 20, 20),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: isPositive ? 1 : 0.45,
        }),
      );
      ball.position.copy(spec.dir).multiplyScalar(isPositive ? 1.3 : 1.3);
      ball.userData.axisKey = spec.key;
      this.gscene.add(ball);
      this.balls.set(spec.key, ball);

      if (spec.label) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: labelTexture(spec.label),
          transparent: true,
          depthTest: false,
        }));
        sprite.scale.setScalar(0.55);
        sprite.position.copy(ball.position);
        sprite.renderOrder = 2;
        this.gscene.add(sprite);
      }
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerenter', this.onEnter);
    this.canvas.addEventListener('pointerleave', this.onLeave);
  }

  private onEnter = () => { this.canvas.style.background = 'rgba(30, 30, 40, 0.6)'; };
  private onLeave = () => {
    this.canvas.style.background = 'rgba(20, 20, 26, 0.35)';
    this.setHover(null);
  };

  private pick(e: PointerEvent): string | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const p = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(p, this.gcam);
    const hits = this.raycaster.intersectObjects([...this.balls.values()], false);
    return hits.length ? (hits[0].object.userData.axisKey as string) : null;
  }

  private setHover(key: string | null) {
    if (this.hovered === key) return;
    for (const [k, ball] of this.balls) {
      const isPositive = k.startsWith('+');
      const mat = ball.material as THREE.MeshBasicMaterial;
      const base = isPositive ? 1 : 0.45;
      mat.opacity = k === key ? 1 : base;
      ball.scale.setScalar(k === key ? 1.25 : 1);
    }
    this.hovered = key;
    this.canvas.style.cursor = key ? 'pointer' : 'grab';
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    this.dragging = true;
    this.moved = 0;
    this.lastXY = [e.clientX, e.clientY];
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) {
      this.setHover(this.pick(e));
      return;
    }
    const dx = e.clientX - this.lastXY[0];
    const dy = e.clientY - this.lastXY[1];
    this.lastXY = [e.clientX, e.clientY];
    this.moved += Math.abs(dx) + Math.abs(dy);
    this.orbitBy(dx * 0.011, dy * 0.011);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.moved < 4) {
      const key = this.pick(e);
      if (key) this.snapToAxis(key);
    }
  };

  /** Rotate the main camera around the orbit target (drag-orbit). */
  private orbitBy(dTheta: number, dPhi: number) {
    const offset = this.camera.position.clone().sub(this.orbit.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta -= dTheta;
    sph.phi = THREE.MathUtils.clamp(sph.phi - dPhi, 0.05, Math.PI - 0.05);
    this.camera.position.copy(this.orbit.target).add(new THREE.Vector3().setFromSpherical(sph));
    this.orbit.update();
  }

  /** Snap the view to look down an axis ('+x', '-y', …), keeping distance. */
  snapToAxis(key: string) {
    const spec = AXES.find(a => a.key === key);
    if (!spec) return;
    const dist = this.camera.position.distanceTo(this.orbit.target) || 5;
    const dir = spec.dir.clone();
    // Looking straight down ±Y needs a nudge so lookAt doesn't degenerate.
    if (Math.abs(dir.y) > 0.99) dir.z = 0.001;
    this.camera.position
      .copy(this.orbit.target)
      .add(dir.normalize().multiplyScalar(dist));
    this.orbit.update();
  }

  /** Mirror the main camera's orientation, then draw. Call every frame. */
  render() {
    if (this.disposed) return;
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    this.gcam.position.copy(dir).multiplyScalar(CAM_DIST);
    this.gcam.up.copy(this.camera.up);
    this.gcam.lookAt(0, 0, 0);
    this.renderer.render(this.gscene, this.gcam);
  }

  dispose() {
    this.disposed = true;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerenter', this.onEnter);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.gscene.traverse(obj => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = (mesh as any).material as THREE.Material | undefined;
      if (mat) {
        const map = (mat as any).map as THREE.Texture | undefined;
        map?.dispose();
        mat.dispose();
      }
    });
    this.renderer.dispose();
    this.canvas.remove();
  }
}
