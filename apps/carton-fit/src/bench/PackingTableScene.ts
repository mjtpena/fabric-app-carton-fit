import * as THREE from 'three';

import type { CartonCandidate, Placement } from '../domain/packing';
import type { BenchLens } from '../domain/today';
import type { Carton } from '../model';
import type { BenchPalette } from './theme';

export interface PackingTableCallbacks {
  onPickUnit(unitIndex: number | null): void;
  onPickCarton(cartonId: string): void;
  onReady(): void;
  onError(message: string): void;
}

export interface PackingTableSceneData {
  carton: Carton | null;
  placements: Placement[];
  candidates: CartonCandidate[];
  chosenCartonId: string | null;
  lens: BenchLens;
  visibleCount: number;
  focusUnitIndex: number | null;
}

const SCALE = 0.01; // 100 mm = 1 world unit

export class PackingTableScene {
  private host: HTMLElement;
  private overlay: HTMLElement;
  private callbacks: PackingTableCallbacks;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  private root = new THREE.Group();
  private cartonGroup = new THREE.Group();
  private itemsGroup = new THREE.Group();
  private voidGroup = new THREE.Group();
  private rackGroup = new THREE.Group();
  private benchMesh: THREE.Mesh | null = null;
  private lampLight: THREE.SpotLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;

  private palette: BenchPalette | null = null;
  private data: PackingTableSceneData | null = null;
  private shiftPx = 0;
  private reduced = false;
  private disposed = false;
  private rafId = 0;
  private resizeObserver: ResizeObserver | null = null;

  private yaw = 0.58;
  private pitch = 0.48;
  private distance = 12.2;
  private dragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointer = { x: 0, y: 0 };
  private dropAnimStart = 0;
  private prevVisibleCount = 0;

  private raycaster = new THREE.Raycaster();
  private pickableUnits: Array<{ mesh: THREE.Object3D; unitIndex: number }> = [];
  private rackLabels: Array<{ el: HTMLDivElement; worldPos: THREE.Vector3; cartonId: string }> = [];

  constructor(host: HTMLElement, overlay: HTMLElement, callbacks: PackingTableCallbacks) {
    this.host = host;
    this.overlay = overlay;
    this.callbacks = callbacks;

    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';
      this.host.insertBefore(renderer.domElement, this.overlay);
      this.renderer = renderer;
    } catch (err) {
      this.callbacks.onError(err instanceof Error ? err.message : 'WebGL initialization failed');
      return;
    }

    this.scene.add(this.root);
    this.root.add(this.cartonGroup, this.itemsGroup, this.voidGroup, this.rackGroup);

    this.setupLightsAndBench();
    this.bindEvents();
    this.resize();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);

    this.callbacks.onReady();
    this.loop();
  }

  private setupLightsAndBench() {
    this.hemiLight = new THREE.HemisphereLight('#fff5e6', '#5e4938', 0.85);
    this.scene.add(this.hemiLight);

    // One warm overhead packing-table lamp
    const spot = new THREE.SpotLight('#ffdca8', 2.4, 38, Math.PI / 4, 0.45, 1.1);
    spot.position.set(1.2, 11.5, 2.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    this.scene.add(spot);
    this.scene.add(spot.target);
    this.lampLight = spot;

    const fill = new THREE.DirectionalLight('#d8e6f5', 0.45);
    fill.position.set(-7, 6, -5);
    this.scene.add(fill);

    // Packing bench tabletop
    const benchGeo = new THREE.BoxGeometry(18, 0.45, 10);
    const benchMat = new THREE.MeshStandardMaterial({ color: '#c9ae8c', roughness: 0.78, metalness: 0.04 });
    const bench = new THREE.Mesh(benchGeo, benchMat);
    bench.position.set(-0.6, -0.225, -0.4);
    bench.receiveShadow = true;
    this.root.add(bench);
    this.benchMesh = bench;

    // Subtle bench measuring grid lines
    const grid = new THREE.GridHelper(16, 16, '#8b6d4e', '#8b6d4e');
    grid.position.set(-0.6, 0.004, -0.4);
    const gridMat = grid.material as THREE.Material;
    gridMat.transparent = true;
    gridMat.opacity = 0.14;
    this.root.add(grid);
  }

  private bindEvents() {
    const dom = this.renderer?.domElement;
    if (!dom) return;

    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.yaw -= dx * 0.0065;
    this.pitch = Math.max(0.16, Math.min(1.22, this.pitch + dy * 0.0055));
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (moved < 6) {
      this.pickAt(e.clientX, e.clientY);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    this.zoom(factor);
  };

  public zoom(factor: number) {
    this.distance = Math.max(6.2, Math.min(20, this.distance * factor));
  }

  public resetCamera() {
    this.yaw = 0.58;
    this.pitch = 0.48;
    this.distance = 12.2;
  }

  public setShift(px: number) {
    this.shiftPx = px;
    this.updateCameraOffset();
  }

  public setReduced(reduced: boolean) {
    this.reduced = reduced;
  }

  public setTheme(palette: BenchPalette) {
    this.palette = palette;
    if (this.benchMesh) {
      (this.benchMesh.material as THREE.MeshStandardMaterial).color.set(palette.benchWood);
    }
    if (this.hemiLight) {
      this.hemiLight.intensity = palette.isDark ? 0.65 : 0.95;
    }
    if (this.lampLight) {
      this.lampLight.intensity = palette.isDark ? 3.2 : 2.1;
    }
    this.rebuildGeometry();
  }

  public setData(data: PackingTableSceneData) {
    if (data.visibleCount !== this.prevVisibleCount) {
      this.dropAnimStart = performance.now();
      this.prevVisibleCount = data.visibleCount;
    }
    this.data = data;
    this.rebuildGeometry();
  }

  private clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children.pop()!;
      child.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else if (mat) mat.dispose();
      });
    }
  }

  private rebuildGeometry() {
    if (!this.palette || !this.data) return;
    const pal = this.palette;
    const { carton, placements, candidates, chosenCartonId, lens, visibleCount, focusUnitIndex } = this.data;

    this.clearGroup(this.cartonGroup);
    this.clearGroup(this.itemsGroup);
    this.clearGroup(this.voidGroup);
    this.clearGroup(this.rackGroup);
    this.pickableUnits = [];

    // Clear rack HTML labels
    this.overlay.innerHTML = '';
    this.rackLabels = [];

    // 1. Open cardboard carton centered on bench at (0, 0, 0)
    if (carton) {
      const L = carton.innerLength * SCALE;
      const W = carton.innerWidth * SCALE;
      const H = carton.innerHeight * SCALE;
      const wall = 0.06;

      const outerMat = new THREE.MeshStandardMaterial({
        color: pal.cardboardOuter,
        roughness: 0.86,
        metalness: 0.02,
      });
      const frontGlassMat = new THREE.MeshStandardMaterial({
        color: pal.cardboardOuter,
        roughness: 0.8,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      });
      const edgeMat = new THREE.LineBasicMaterial({ color: pal.cardboardEdge, transparent: true, opacity: 0.72 });

      // Floor
      const floor = new THREE.Mesh(new THREE.BoxGeometry(L + wall * 2, wall, W + wall * 2), outerMat);
      floor.position.set(0, wall / 2, 0);
      floor.receiveShadow = true;
      floor.castShadow = true;
      this.cartonGroup.add(floor);

      // Back wall (-Z)
      const backWall = new THREE.Mesh(new THREE.BoxGeometry(L + wall * 2, H, wall), outerMat);
      backWall.position.set(0, wall + H / 2, -W / 2 - wall / 2);
      backWall.castShadow = true;
      backWall.receiveShadow = true;
      this.cartonGroup.add(backWall);

      // Left wall (-X)
      const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wall, H, W), outerMat);
      leftWall.position.set(-L / 2 - wall / 2, wall + H / 2, 0);
      leftWall.castShadow = true;
      leftWall.receiveShadow = true;
      this.cartonGroup.add(leftWall);

      // Right wall (+X) slightly translucent so packed contents stay readable
      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wall, H, W), frontGlassMat);
      rightWall.position.set(L / 2 + wall / 2, wall + H / 2, 0);
      this.cartonGroup.add(rightWall);

      // Front wall (+Z) translucent cutaway so you see inside the open carton
      const frontWall = new THREE.Mesh(new THREE.BoxGeometry(L + wall * 2, H, wall), frontGlassMat);
      frontWall.position.set(0, wall + H / 2, W / 2 + wall / 2);
      this.cartonGroup.add(frontWall);

      // Crisp inner wireframe outline
      const innerEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), edgeMat);
      innerEdges.position.set(0, wall + H / 2, 0);
      this.cartonGroup.add(innerEdges);

      // Open top flaps (back, left, right) tilted outward at ~122°
      const flapLen = Math.min(W * 0.48, 1.35);
      const backFlap = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, flapLen), outerMat);
      backFlap.position.set(0, wall + H + flapLen * 0.28, -W / 2 - flapLen * 0.42);
      backFlap.rotation.x = -0.62;
      backFlap.castShadow = true;
      this.cartonGroup.add(backFlap);

      const sideFlapLen = Math.min(L * 0.42, 1.15);
      const leftFlap = new THREE.Mesh(new THREE.BoxGeometry(sideFlapLen, 0.04, W * 0.94), outerMat);
      leftFlap.position.set(-L / 2 - sideFlapLen * 0.44, wall + H + sideFlapLen * 0.25, 0);
      leftFlap.rotation.z = 0.56;
      leftFlap.castShadow = true;
      this.cartonGroup.add(leftFlap);

      const rightFlap = new THREE.Mesh(new THREE.BoxGeometry(sideFlapLen, 0.04, W * 0.94), outerMat);
      rightFlap.position.set(L / 2 + sideFlapLen * 0.44, wall + H + sideFlapLen * 0.25, 0);
      rightFlap.rotation.z = -0.56;
      rightFlap.castShadow = true;
      this.cartonGroup.add(rightFlap);

      // 2. Placed items (up to visibleCount)
      const shown = placements.slice(0, Math.min(visibleCount, placements.length));
      const baseOriginX = -L / 2;
      const baseOriginY = wall;
      const baseOriginZ = -W / 2;

      for (let idx = 0; idx < shown.length; idx++) {
        const p = shown[idx];
        const cx = baseOriginX + (p.x + p.dx / 2) * SCALE;
        const cy = baseOriginY + (p.y + p.dy / 2) * SCALE;
        const cz = baseOriginZ + (p.z + p.dz / 2) * SCALE;

        const rdx = p.rawDx * SCALE;
        const rdy = p.rawDy * SCALE;
        const rdz = p.rawDz * SCALE;

        const itemColor = this.pickItemColor(p, lens, pal);
        const isFocused = focusUnitIndex === p.unitIndex;

        const itemGroup = new THREE.Group();
        itemGroup.position.set(cx, cy, cz);
        itemGroup.userData = { targetY: cy, orderIdx: idx };

        let mesh: THREE.Mesh;
        if (p.isCylinder) {
          const radius = Math.min(rdx, rdz) * 0.48;
          const geo = new THREE.CylinderGeometry(radius, radius, rdy * 0.96, 20);
          const mat = new THREE.MeshStandardMaterial({
            color: itemColor,
            roughness: 0.42,
            metalness: 0.14,
            emissive: isFocused ? pal.accent : '#000000',
            emissiveIntensity: isFocused ? 0.35 : 0,
          });
          mesh = new THREE.Mesh(geo, mat);
        } else {
          const geo = new THREE.BoxGeometry(rdx * 0.96, rdy * 0.96, rdz * 0.96);
          const mat = new THREE.MeshStandardMaterial({
            color: itemColor,
            roughness: 0.56,
            metalness: 0.08,
            emissive: isFocused ? pal.accent : '#000000',
            emissiveIntensity: isFocused ? 0.35 : 0,
          });
          mesh = new THREE.Mesh(geo, mat);
        }
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        itemGroup.add(mesh);
        this.pickableUnits.push({ mesh, unitIndex: p.unitIndex });

        // Fragile items get translucent amber cushion envelope + amber edge tape
        if (p.fragile) {
          const cushGeo = new THREE.BoxGeometry(p.dx * SCALE, p.dy * SCALE, p.dz * SCALE);
          const cushMat = new THREE.MeshStandardMaterial({
            color: pal.fragileAmber,
            transparent: true,
            opacity: lens === 'fragile' ? 0.26 : 0.12,
            depthWrite: false,
            roughness: 0.3,
          });
          const cushMesh = new THREE.Mesh(cushGeo, cushMat);
          itemGroup.add(cushMesh);

          const tapeEdges = new THREE.LineSegments(
            new THREE.EdgesGeometry(cushGeo),
            new THREE.LineBasicMaterial({ color: pal.fragileAmber }),
          );
          itemGroup.add(tapeEdges);
        }

        // Keep-upright indicator bar on top
        if (p.keepUpright) {
          const barGeo = new THREE.BoxGeometry(rdx * 0.45, 0.025, 0.04);
          const barMat = new THREE.MeshBasicMaterial({ color: pal.uprightInk });
          const bar = new THREE.Mesh(barGeo, barMat);
          bar.position.set(0, rdy * 0.49, 0);
          itemGroup.add(bar);
        }

        this.itemsGroup.add(itemGroup);
      }

      // 3. Translucent frosted void volume + crinkled kraft paper inside unused headroom
      const maxTopMm = shown.reduce((m, p) => Math.max(m, p.y + p.dy), 0);
      const voidHeightMm = Math.max(18, carton.innerHeight - maxTopMm);
      const vh = voidHeightMm * SCALE;
      const voidOpacity = lens === 'void' ? 0.32 : 0.14;

      const frostGeo = new THREE.BoxGeometry(L * 0.98, vh * 0.94, W * 0.98);
      const frostMat = new THREE.MeshPhysicalMaterial({
        color: pal.frostAir,
        transparent: true,
        opacity: voidOpacity,
        roughness: 0.28,
        transmission: 0.15,
        depthWrite: false,
      });
      const frostMesh = new THREE.Mesh(frostGeo, frostMat);
      frostMesh.position.set(0, wall + maxTopMm * SCALE + vh / 2, 0);
      this.voidGroup.add(frostMesh);

      // Crinkled paper puffs tucked into the void layer
      const paperMat = new THREE.MeshStandardMaterial({
        color: pal.kraftPaper,
        roughness: 0.92,
        flatShading: true,
        transparent: true,
        opacity: lens === 'void' ? 0.85 : 0.48,
      });
      const puffCount = Math.min(8, Math.max(3, Math.round((L * W) / 1.4)));
      for (let i = 0; i < puffCount; i++) {
        const t = (i + 0.5) / puffCount;
        const px = -L * 0.36 + t * L * 0.72;
        const pz = ((i % 2 === 0 ? -1 : 1) * W * 0.22);
        const radius = Math.min(0.32, Math.max(0.14, vh * 0.36));
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), paperMat);
        puff.position.set(px, wall + maxTopMm * SCALE + vh * 0.42, pz);
        puff.scale.set(1.3, 0.72, 1.1);
        puff.rotation.set(i * 0.7, i * 1.1, i * 0.4);
        this.voidGroup.add(puff);
      }
    }

    // 4. Candidate carton rack standing on a raised shelf behind the bench (always includes chosen carton)
    const activeCandidates = candidates.filter((c) => c.carton.active);
    const chosenIdx = activeCandidates.findIndex((c) => c.carton.id === chosenCartonId);
    let startIdx = 0;
    if (chosenIdx >= 0 && activeCandidates.length > 6) {
      startIdx = Math.max(0, Math.min(activeCandidates.length - 6, chosenIdx - 2));
    }
    const rackCandidates = activeCandidates.slice(startIdx, startIdx + 6);
    const rackStartX = -5.2;
    const rackZ = -4.5;
    const shelfY = 1.65;

    // Wooden rack shelf behind the bench
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(13.2, 0.14, 1.8),
      new THREE.MeshStandardMaterial({ color: pal.benchEdge, roughness: 0.8 }),
    );
    shelf.position.set(-0.2, shelfY - 0.08, rackZ);
    shelf.receiveShadow = true;
    this.rackGroup.add(shelf);

    rackCandidates.forEach((cand, i) => {
      const isChosen = cand.carton.id === chosenCartonId;
      const rL = Math.min(1.5, cand.carton.innerLength * SCALE * 0.34);
      const rH = Math.min(1.25, cand.carton.innerHeight * SCALE * 0.34);
      const rW = Math.min(1.15, cand.carton.innerWidth * SCALE * 0.34);
      const x = rackStartX + i * 2.05;
      const z = isChosen ? rackZ + 0.85 : rackZ;
      const y = shelfY + (isChosen ? rH / 2 + 0.28 : rH / 2 + 0.02);

      let wireColor = pal.rackWire;
      if (isChosen) wireColor = pal.rackChosen;
      else if (lens === 'stock' && cand.carton.stock <= cand.carton.reorderPoint) wireColor = pal.bad;
      else if (lens === 'billable' && cand.fits) {
        wireColor = cand.dimGrams > cand.actualGrams ? pal.warn : pal.ok;
      } else if (!cand.fits) {
        wireColor = pal.rackFail;
      }

      const boxGeo = new THREE.BoxGeometry(rL, rH, rW);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        new THREE.LineBasicMaterial({ color: wireColor }),
      );
      edges.position.set(x, y, z);
      this.rackGroup.add(edges);

      if (isChosen) {
        const glowMesh = new THREE.Mesh(
          boxGeo,
          new THREE.MeshStandardMaterial({
            color: pal.rackChosen,
            transparent: true,
            opacity: 0.24,
            emissive: pal.rackChosen,
            emissiveIntensity: 0.45,
            depthWrite: false,
          }),
        );
        glowMesh.position.set(x, y, z);
        this.rackGroup.add(glowMesh);
      }

      // Projected label pill on the overlay
      const label = document.createElement('div');
      label.className =
        'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-md border px-1.5 py-0.5 text-[10px] font-mono leading-tight backdrop-blur-sm transition';
      label.style.borderColor = isChosen ? pal.rackChosen : pal.line;
      label.style.backgroundColor = isChosen
        ? pal.isDark
          ? 'rgba(161, 124, 86, 0.32)'
          : 'rgba(161, 124, 86, 0.2)'
        : pal.isDark
          ? 'rgba(24, 19, 15, 0.78)'
          : 'rgba(255, 250, 244, 0.85)';
      label.style.color = isChosen ? (pal.isDark ? '#fff5e6' : '#3a2512') : pal.fg;
      label.innerHTML = `<span style="font-weight:600">${cand.carton.code}</span> · ${(cand.billableGrams / 1000).toFixed(1)}kg`;
      label.title = cand.fits ? `${cand.carton.name} — $${cand.totalCost.toFixed(2)}` : `${cand.carton.name}: ${cand.reason}`;
      label.addEventListener('click', () => this.callbacks.onPickCarton(cand.carton.id));
      this.overlay.appendChild(label);

      this.rackLabels.push({
        el: label,
        worldPos: new THREE.Vector3(x, y + rH / 2 + 0.36, z),
        cartonId: cand.carton.id,
      });
    });
  }

  private pickItemColor(p: Placement, lens: BenchLens, pal: BenchPalette): string {
    switch (lens) {
      case 'fragile':
        return p.fragile ? pal.fragileAmber : pal.isDark ? '#4d535a' : '#8a9199';
      case 'stack': {
        if (p.fragile) return pal.fragileAmber;
        const ratio = p.stackLimitGrams > 0 ? p.loadAboveGrams / p.stackLimitGrams : 0;
        if (ratio > 0.75) return pal.bad;
        if (ratio > 0.35) return pal.warn;
        return pal.ok;
      }
      case 'void':
        return p.fragile ? pal.fragileAmber : pal.isDark ? '#69727c' : '#7b8794';
      case 'billable':
        return p.weightGrams > 1000 ? pal.accent : pal.info;
      case 'stock':
        return p.isCylinder ? pal.itemCylinder : pal.itemBox;
    }
  }

  private pickAt(clientX: number, clientY: number) {
    if (!this.renderer) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const meshes = this.pickableUnits.map((u) => u.mesh);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hit = this.pickableUnits.find((u) => u.mesh === hits[0].object);
      this.callbacks.onPickUnit(hit ? hit.unitIndex : null);
    } else {
      this.callbacks.onPickUnit(null);
    }
  }

  private updateCameraOffset() {
    const w = this.host.clientWidth || 1;
    const h = this.host.clientHeight || 1;
    if (this.shiftPx > 0) {
      this.camera.setViewOffset(w, h, this.shiftPx * 0.42, 0, w, h);
    } else {
      this.camera.clearViewOffset();
    }
  }

  private resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.updateCameraOffset();
    this.renderer.setSize(w, h, false);
  }

  private loop = () => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.renderer) return;

    // Smooth camera orbit
    const targetY = 1.25;
    const cx = Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance;
    const cy = Math.sin(this.pitch) * this.distance + targetY;
    const cz = Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(0, targetY, -0.5);

    // Gentle drop-in motion for the most recently placed item
    if (!this.reduced && this.itemsGroup.children.length > 0) {
      const elapsed = Math.min(1, (performance.now() - this.dropAnimStart) / 380);
      const easeOut = 1 - Math.pow(1 - elapsed, 3);
      const last = this.itemsGroup.children[this.itemsGroup.children.length - 1];
      const ty = (last.userData.targetY as number) ?? last.position.y;
      last.position.y = ty + (1 - easeOut) * 1.4;
    }

    this.renderer.render(this.scene, this.camera);
    this.updateOverlayLabels();
  };

  private updateOverlayLabels() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    for (const item of this.rackLabels) {
      const v = item.worldPos.clone().project(this.camera);
      if (v.z > 1) {
        item.el.style.display = 'none';
        continue;
      }
      item.el.style.display = 'block';
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      item.el.style.left = `${x}px`;
      item.el.style.top = `${y}px`;
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver?.disconnect();
    const dom = this.renderer?.domElement;
    if (dom) {
      dom.removeEventListener('pointerdown', this.onPointerDown);
      dom.removeEventListener('wheel', this.onWheel);
      dom.remove();
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.clearGroup(this.cartonGroup);
    this.clearGroup(this.itemsGroup);
    this.clearGroup(this.voidGroup);
    this.clearGroup(this.rackGroup);
    this.renderer?.dispose();
    this.renderer = null;
  }
}
