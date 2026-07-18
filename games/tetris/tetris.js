import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const COLS = 10;
const ROWS = 20;
const CELL = 1;
const DROP_BASE_MS = 800;
const LINE_FLASH_MS = 420;
const LINE_VANISH_MS = 480;
const BOARD_CENTER_X = COLS / 2 - 0.5;
const BOARD_CENTER_Y = ROWS / 2 - 0.5;
const BOARD_PADDING = 1.5;

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

const COLORS = {
  I: 0x00e5ff,
  O: 0xffd700,
  T: 0xa855f7,
  S: 0x22c55e,
  Z: 0xef4444,
  J: 0x3b82f6,
  L: 0xf97316,
};

const PIECE_TYPES = Object.keys(SHAPES);

class Tetris3D {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.nextCanvas = document.getElementById('next-canvas');
    this.scoreEl = document.getElementById('score');
    this.levelEl = document.getElementById('level');
    this.linesEl = document.getElementById('lines');
    this.startOverlay = document.getElementById('start-overlay');
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.finalScoreEl = document.getElementById('final-score');

    this.board = [];
    this.placedMeshes = [];
    this.activeGroup = null;
    this.ghostGroup = null;
    this.current = null;
    this.next = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.running = false;
    this.paused = false;
    this.lastDrop = 0;
    this.dropInterval = DROP_BASE_MS;
    this.materialCache = {};
    this.geometry = new THREE.BoxGeometry(CELL * 0.92, CELL * 0.92, CELL * 0.92);
    this.lineClearAnim = null;
    this.clearAnimating = false;

    this.initScene();
    this.bindEvents();
    this.resize();
    this.animate();
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a12);
    this.scene.fog = new THREE.Fog(0x0a0a12, 50, 90);

    this.camera = new THREE.PerspectiveCamera(45, 10 / 22, 0.1, 200);
    this.fitCamera(10 / 22);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const ambient = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(5, 15, 10);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x6688ff, 0.4);
    fillLight.position.set(-8, 5, -5);
    this.scene.add(fillLight);

    const rimLight = new THREE.PointLight(0x00e5ff, 0.8, 40);
    rimLight.position.set(COLS + 2, ROWS, 8);
    this.scene.add(rimLight);

    const rimLight2 = new THREE.PointLight(0xa855f7, 0.5, 40);
    rimLight2.position.set(-2, 0, 8);
    this.scene.add(rimLight2);

    this.buildBoardFrame();
    this.initNextPreview();
  }

  buildBoardFrame() {
    const frameGeo = new THREE.BoxGeometry(COLS + 0.6, ROWS + 0.6, 0.3);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.8,
      roughness: 0.3,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.set(COLS / 2 - 0.5, ROWS / 2 - 0.5, -0.5);
    this.scene.add(frame);

    const gridHelper = new THREE.GridHelper(COLS, COLS, 0x222233, 0x111122);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(COLS / 2 - 0.5, 0, -0.15);
    this.scene.add(gridHelper);

    const backPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshStandardMaterial({
        color: 0x0d0d18,
        metalness: 0.5,
        roughness: 0.6,
        transparent: true,
        opacity: 0.6,
      })
    );
    backPlane.position.set(COLS / 2 - 0.5, ROWS / 2 - 0.5, -0.2);
    this.scene.add(backPlane);
  }

  initNextPreview() {
    this.nextScene = new THREE.Scene();
    this.nextScene.background = new THREE.Color(0x111118);
    this.nextCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
    this.nextCamera.position.set(2, 2, 6);
    this.nextCamera.lookAt(1, 1, 0);
    this.nextRenderer = new THREE.WebGLRenderer({
      canvas: this.nextCanvas,
      antialias: true,
    });
    this.nextRenderer.setSize(120, 120);
    this.nextRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.nextRenderer.toneMapping = THREE.ACESFilmicToneMapping;

    const nextAmbient = new THREE.AmbientLight(0xffffff, 0.5);
    this.nextScene.add(nextAmbient);
    const nextLight = new THREE.DirectionalLight(0xffffff, 1);
    nextLight.position.set(3, 5, 5);
    this.nextScene.add(nextLight);

    this.nextGroup = new THREE.Group();
    this.nextScene.add(this.nextGroup);
  }

  getMaterial(color) {
    if (!this.materialCache[color]) {
      this.materialCache[color] = new THREE.MeshStandardMaterial({
        color,
        metalness: 0.7,
        roughness: 0.15,
        envMapIntensity: 1.5,
      });
    }
    return this.materialCache[color];
  }

  createBlockMesh(color) {
    const mesh = new THREE.Mesh(this.geometry, this.getMaterial(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  resetBoard() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.placedMeshes.forEach((m) => this.scene.remove(m));
    this.placedMeshes = [];
    this.lineClearAnim = null;
    this.clearAnimating = false;
    if (this.activeGroup) {
      this.scene.remove(this.activeGroup);
      this.activeGroup = null;
    }
    if (this.ghostGroup) {
      this.scene.remove(this.ghostGroup);
      this.ghostGroup = null;
    }
  }

  randomPiece() {
    const type = PIECE_TYPES[Math.floor(Math.random() * PIECE_TYPES.length)];
    return {
      type,
      shape: SHAPES[type].map((row) => [...row]),
      color: COLORS[type],
      x: 3,
      y: ROWS - 1,
    };
  }

  start() {
    this.resetBoard();
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.dropInterval = DROP_BASE_MS;
    this.updateHUD();
    this.next = this.randomPiece();
    this.spawnPiece();
    this.running = true;
    this.paused = false;
    this.lastDrop = performance.now();
    this.startOverlay.classList.add('overlay--hidden');
    this.gameoverOverlay.classList.add('overlay--hidden');
  }

  spawnPiece() {
    this.current = this.next;
    this.next = this.randomPiece();
    this.current.x = Math.floor((COLS - this.current.shape[0].length) / 2);
    this.current.y = ROWS - 1;
    this.updateActiveMesh();
    this.updateGhostMesh();
    this.updateNextPreview();

    if (this.collides(this.current.shape, this.current.x, this.current.y)) {
      this.gameOver();
    }
  }

  collides(shape, offsetX, offsetY) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const bx = offsetX + x;
        const by = offsetY - y;
        if (bx < 0 || bx >= COLS || by < 0) return true;
        if (this.board[by][bx]) return true;
      }
    }
    return false;
  }

  updateActiveMesh() {
    if (this.activeGroup) {
      this.scene.remove(this.activeGroup);
    }
    this.activeGroup = new THREE.Group();
    const { shape, color, x, y } = this.current;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const mesh = this.createBlockMesh(color);
        mesh.position.set(x + col, y - row, 0);
        this.activeGroup.add(mesh);
      }
    }
    this.scene.add(this.activeGroup);
  }

  getGhostY() {
    let ghostY = this.current.y;
    while (!this.collides(this.current.shape, this.current.x, ghostY - 1)) {
      ghostY--;
    }
    return ghostY;
  }

  updateGhostMesh() {
    if (this.ghostGroup) {
      this.scene.remove(this.ghostGroup);
    }
    this.ghostGroup = new THREE.Group();
    const { shape, color, x } = this.current;
    const ghostY = this.getGhostY();
    const ghostMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.5,
      roughness: 0.3,
      transparent: true,
      opacity: 0.2,
    });

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const mesh = new THREE.Mesh(this.geometry, ghostMat);
        mesh.position.set(x + col, ghostY - row, 0);
        this.ghostGroup.add(mesh);
      }
    }
    this.scene.add(this.ghostGroup);
  }

  updateNextPreview() {
    while (this.nextGroup.children.length) {
      this.nextGroup.remove(this.nextGroup.children[0]);
    }
    const { shape, color } = this.next;
    const offsetX = (4 - shape[0].length) / 2;
    const offsetY = (4 - shape.length) / 2;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const mesh = this.createBlockMesh(color);
        mesh.position.set(col + offsetX, -(row + offsetY) + 3, 0);
        mesh.scale.setScalar(0.85);
        this.nextGroup.add(mesh);
      }
    }
    this.nextRenderer.render(this.nextScene, this.nextCamera);
  }

  move(dx) {
    if (!this.running || this.paused || this.clearAnimating) return;
    const newX = this.current.x + dx;
    if (!this.collides(this.current.shape, newX, this.current.y)) {
      this.current.x = newX;
      this.updateActiveMesh();
      this.updateGhostMesh();
    }
  }

  rotate() {
    if (!this.running || this.paused || this.clearAnimating) return;
    const rotated = this.current.shape[0].map((_, i) =>
      this.current.shape.map((row) => row[i]).reverse()
    );
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!this.collides(rotated, this.current.x + kick, this.current.y)) {
        this.current.shape = rotated;
        this.current.x += kick;
        this.updateActiveMesh();
        this.updateGhostMesh();
        return;
      }
    }
  }

  softDrop() {
    if (!this.running || this.paused || this.clearAnimating) return;
    if (!this.collides(this.current.shape, this.current.x, this.current.y - 1)) {
      this.current.y--;
      this.score += 1;
      this.updateActiveMesh();
      this.updateGhostMesh();
      this.updateHUD();
    } else {
      this.lockPiece();
    }
  }

  hardDrop() {
    if (!this.running || this.paused || this.clearAnimating) return;
    const ghostY = this.getGhostY();
    const dist = this.current.y - ghostY;
    this.current.y = ghostY;
    this.score += dist * 2;
    this.updateHUD();
    this.lockPiece();
  }

  lockPiece() {
    const { shape, color, x, y } = this.current;

    for (let row = 0; row < shape.length; row++) {
      for (let col = 0; col < shape[row].length; col++) {
        if (!shape[row][col]) continue;
        const bx = x + col;
        const by = y - row;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          this.board[by][bx] = color;
          const mesh = this.createBlockMesh(color);
          mesh.position.set(bx, by, 0);
          this.scene.add(mesh);
          this.placedMeshes.push(mesh);
        }
      }
    }

    if (this.activeGroup) {
      this.scene.remove(this.activeGroup);
      this.activeGroup = null;
    }
    if (this.ghostGroup) {
      this.scene.remove(this.ghostGroup);
      this.ghostGroup = null;
    }

    this.clearLines();
  }

  findFullRows() {
    const rows = [];
    for (let row = 0; row < ROWS; row++) {
      if (this.board[row].every((cell) => cell !== 0)) rows.push(row);
    }
    return rows;
  }

  clearLines() {
    const fullRows = this.findFullRows();
    if (fullRows.length === 0) {
      this.spawnPiece();
      return;
    }

    this.startLineClearAnimation(fullRows, () => {
      this.applyLineClear(fullRows.length);
      this.rebuildPlacedMeshes();
      this.spawnPiece();
    });
  }

  startLineClearAnimation(rows, onComplete) {
    this.clearAnimating = true;
    const animMeshes = [];
    const flashPlanes = [];

    for (const row of rows) {
      const sweep = new THREE.Mesh(
        new THREE.PlaneGeometry(COLS + 0.4, CELL * 0.95),
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      sweep.position.set(BOARD_CENTER_X, row, 0.6);
      this.scene.add(sweep);
      flashPlanes.push(sweep);

      this.placedMeshes
        .filter((m) => Math.round(m.position.y) === row)
        .forEach((mesh) => {
          const animMat = mesh.material.clone();
          animMat.transparent = true;
          mesh.material = animMat;
          mesh.userData.animBase = {
            x: mesh.position.x,
            y: mesh.position.y,
            z: mesh.position.z,
            rotZ: mesh.rotation.z,
          };
          animMeshes.push(mesh);
        });
    }

    this.lineClearAnim = {
      startTime: performance.now(),
      meshes: animMeshes,
      flashPlanes,
      cleared: rows.length,
      onComplete,
    };
  }

  updateLineClearAnimation(now) {
    const anim = this.lineClearAnim;
    if (!anim) return;

    const elapsed = now - anim.startTime;
    const total = LINE_FLASH_MS + LINE_VANISH_MS;

    if (elapsed >= total) {
      anim.meshes.forEach((mesh) => {
        this.scene.remove(mesh);
        const idx = this.placedMeshes.indexOf(mesh);
        if (idx !== -1) this.placedMeshes.splice(idx, 1);
        mesh.material.dispose();
      });
      anim.flashPlanes.forEach((plane) => {
        this.scene.remove(plane);
        plane.geometry.dispose();
        plane.material.dispose();
      });

      this.lineClearAnim = null;
      this.clearAnimating = false;
      anim.onComplete();
      return;
    }

    if (elapsed < LINE_FLASH_MS) {
      const pulse = Math.sin(elapsed * 0.045) ** 2;

      anim.meshes.forEach((mesh) => {
        const mat = mesh.material;
        mat.emissive.setHex(0xffffff);
        mat.emissiveIntensity = 0.6 + pulse * 2.8;
        const scale = 1 + pulse * 0.14;
        mesh.scale.setScalar(scale);
      });

      anim.flashPlanes.forEach((plane) => {
        plane.material.opacity = 0.15 + pulse * 0.55;
        plane.scale.x = 1 + pulse * 0.06;
      });
    } else {
      const t = (elapsed - LINE_FLASH_MS) / LINE_VANISH_MS;
      const ease = t * t;

      anim.meshes.forEach((mesh) => {
        const { x, y, z, rotZ } = mesh.userData.animBase;
        const mat = mesh.material;
        const outward = (x - BOARD_CENTER_X) * 0.35 * ease;

        mat.emissiveIntensity = (1 - t) * 1.5;
        mat.opacity = 1 - ease;
        mesh.scale.setScalar(Math.max(0, 1 - ease * 0.95));
        mesh.position.set(x + outward, y + ease * 0.6, z + ease * 2.2);
        mesh.rotation.z = rotZ + ease * Math.PI * 0.7 * Math.sign(outward || 1);
      });

      anim.flashPlanes.forEach((plane) => {
        plane.material.opacity = (1 - t) * 0.4;
        plane.position.z = 0.6 + ease * 1.5;
        plane.scale.y = 1 + ease * 2;
      });
    }
  }

  applyLineClear(cleared) {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (this.board[row].every((cell) => cell !== 0)) {
        this.board.splice(row, 1);
        this.board.push(Array(COLS).fill(0));
        row++;
      }
    }

    const points = [0, 100, 300, 500, 800];
    this.score += points[cleared] * this.level;
    this.lines += cleared;
    this.level = Math.floor(this.lines / 10) + 1;
    this.dropInterval = Math.max(100, DROP_BASE_MS - (this.level - 1) * 60);
    this.updateHUD();
  }

  rebuildPlacedMeshes() {
    this.placedMeshes.forEach((m) => this.scene.remove(m));
    this.placedMeshes = [];

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!this.board[row][col]) continue;
        const mesh = this.createBlockMesh(this.board[row][col]);
        mesh.position.set(col, row, 0);
        this.scene.add(mesh);
        this.placedMeshes.push(mesh);
      }
    }
  }

  updateHUD() {
    this.scoreEl.textContent = this.score;
    this.levelEl.textContent = this.level;
    this.linesEl.textContent = this.lines;
  }

  gameOver() {
    this.running = false;
    this.finalScoreEl.textContent = this.score;
    this.gameoverOverlay.classList.remove('overlay--hidden');
  }

  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
  }

  tick(now) {
    if (!this.running || this.paused || this.clearAnimating) return;
    if (now - this.lastDrop >= this.dropInterval) {
      this.lastDrop = now;
      this.softDrop();
    }
  }

  fitCamera(aspect) {
    const fovRad = (this.camera.fov * Math.PI) / 180;
    const halfH = (ROWS + BOARD_PADDING) / 2;
    const halfW = (COLS + BOARD_PADDING) / 2;

    const distForHeight = halfH / Math.tan(fovRad / 2);
    const distForWidth = halfW / (Math.tan(fovRad / 2) * aspect);
    const distance = Math.max(distForHeight, distForWidth);

    this.camera.position.set(BOARD_CENTER_X, BOARD_CENTER_Y, distance);
    this.camera.lookAt(BOARD_CENTER_X, BOARD_CENTER_Y, 0);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const maxHeight = window.innerHeight - 120;
    const maxWidth = window.innerWidth - 400;
    let height = Math.min(maxHeight, 660);
    let width = height * (10 / 22);
    if (width > maxWidth) {
      width = maxWidth;
      height = width * (22 / 10);
    }
    this.renderer.setSize(width, height);
    this.fitCamera(width / height);
  }
  bindEvents() {
    document.getElementById('btn-start').addEventListener('click', () => this.start());
    document.getElementById('btn-restart').addEventListener('click', () => this.start());

    document.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
        e.preventDefault();
      }
      switch (e.key) {
        case 'ArrowLeft': this.move(-1); break;
        case 'ArrowRight': this.move(1); break;
        case 'ArrowUp': this.rotate(); break;
        case 'ArrowDown': this.softDrop(); break;
        case ' ': this.hardDrop(); break;
        case 'p':
        case 'P': this.togglePause(); break;
      }
    });

    window.addEventListener('resize', () => this.resize());
  }

  animate() {
    requestAnimationFrame((t) => this.animate(t));
    const now = performance.now();
    this.updateLineClearAnimation(now);
    this.tick(now);

    if (this.activeGroup && !this.clearAnimating) {
      this.activeGroup.children.forEach((child, i) => {
        child.position.z = Math.sin(performance.now() * 0.003 + i) * 0.03;
      });
    }

    this.renderer.render(this.scene, this.camera);
  }
}

new Tetris3D();
