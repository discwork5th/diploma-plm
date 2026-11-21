import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SITE, PIPES, SITE_W, SITE_D, ROADS, RAIL, GATE, CHECKPOINT, PARKING, TREES } from './plantSite';

// ============================================================================
// 3D-модель предприятия (three.js)
// ----------------------------------------------------------------------------
// Вся геометрия строится кодом из того же генплана (plantSite.js), что и
// плоская схема: прямоугольник корпуса превращается в коробку, шеды — в
// треугольные призмы, трубы — в цилиндры. Моделей из файлов нет.
//
// Как устроено:
//   * сцена, камера и рендерер WebGL; OrbitControls — вращение и зум мышью;
//   * освещение: окружение RoomEnvironment даёт металлу отражения, плюс
//     направленный «солнечный» свет с тенями;
//   * подписи корпусов — обычные HTML-элементы (CSS2DRenderer), которые
//     каждый кадр ставятся в экранную точку над крышей;
//   * клик: луч из камеры через точку курсора (Raycaster) ищет корпус;
//   * цвет только у состояний: над корпусом с аварийным оборудованием
//     пульсирует красный маячок.
// Сцена перерисовывается только пока карта видна на экране.
// ============================================================================

const MAT = {
  ground: new THREE.MeshStandardMaterial({ color: 0x0a0a09, roughness: 1 }),
  slab: new THREE.MeshStandardMaterial({ color: 0x232321, roughness: 0.85 }),
  wall: new THREE.MeshStandardMaterial({ color: 0x3c3c39, roughness: 0.7, metalness: 0.3 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x55554f, roughness: 0.4, metalness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x77776f, roughness: 0.28, metalness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0e0e0d, roughness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1a1712, emissive: 0xffc98a, emissiveIntensity: 0.22, roughness: 0.2 }),
  water: new THREE.MeshStandardMaterial({ color: 0x0d1012, roughness: 0.05, metalness: 0.8 }),
  beacon: new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xe5484d, emissiveIntensity: 1.1 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x121211, roughness: 0.95 }),
  marking: new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.8 }),
  rail: new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.3, metalness: 1 }),
  sleeper: new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 }),
  foliage: new THREE.MeshStandardMaterial({ color: 0x2f342f, roughness: 0.9, flatShading: true })
};
const EDGE = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });

// Генплан в координатах сцены: x → X, y → Z, центр площадки в нуле
const X = (x) => x - SITE_W / 2;
const Z = (y) => y - SITE_D / 2;

function mesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Призма из треугольника в плоскости XY, вытянутая на length по Z
function prism(points, length, material) {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cylinder(r, h, material, x, y0, z, segments = 24) {
  return mesh(new THREE.CylinderGeometry(r, r, h, segments), material, x, y0 + h / 2, z);
}

// Один корпус: группа мешей + контур для подсветки выбранного
function buildBuilding(b) {
  const g = new THREE.Group();
  const cx = X(b.x + b.w / 2), cz = Z(b.y + b.d / 2);
  let top = b.h;

  if (b.kind !== 'pad') g.add(mesh(new THREE.BoxGeometry(b.w, b.h, b.d), MAT.wall, cx, b.h / 2, cz));

  if (b.kind === 'shop') {
    // Шеды: наклонная кровля и остеклённая вертикальная грань у каждого зуба
    const teeth = Math.round(b.w / 1.4), tw = b.w / teeth, th = 0.55;
    for (let i = 0; i < teeth; i++) {
      const x0 = X(b.x) + tw * i;
      const p = prism([[0, 0], [tw, th], [tw, 0]], b.d, MAT.roof);
      p.position.set(x0, b.h, Z(b.y));
      g.add(p);
      g.add(mesh(new THREE.BoxGeometry(0.04, th * 0.8, b.d * 0.94), MAT.glass, x0 + tw - 0.03, b.h + th * 0.45, cz));
    }
    top = b.h + th;
    // Ленточное остекление по фасаду
    g.add(mesh(new THREE.BoxGeometry(b.w * 0.9, 0.12, 0.04), MAT.glass, cx, b.h * 0.62, Z(b.y + b.d) + 0.02));
  }
  if (b.kind === 'warehouse') {
    const p = prism([[0, 0], [b.d / 2, 0.7], [b.d, 0]], b.w, MAT.roof);
    p.rotation.y = Math.PI / 2;
    p.position.set(X(b.x), b.h, Z(b.y + b.d));
    g.add(p);
    top = b.h + 0.7;
    // Ворота
    for (let i = 1; i < b.w; i += 2.2) g.add(mesh(new THREE.BoxGeometry(1, 1.1, 0.05), MAT.dark, X(b.x + i), 0.55, Z(b.y + b.d) + 0.03));
  }
  if (b.kind === 'office') {
    for (let f = 0; f < b.h - 0.5; f += 1) {
      g.add(mesh(new THREE.BoxGeometry(b.w * 0.88, 0.2, 0.04), MAT.glass, cx, f + 0.6, Z(b.y + b.d) + 0.02));
      g.add(mesh(new THREE.BoxGeometry(0.04, 0.2, b.d * 0.85), MAT.glass, X(b.x + b.w) + 0.02, f + 0.6, cz));
    }
    g.add(mesh(new THREE.BoxGeometry(b.w * 0.4, 0.5, b.d * 0.4), MAT.metal, cx, b.h + 0.25, cz));
    top = b.h + 0.5;
  }
  if (b.chimney) {
    g.add(cylinder(0.35, 3.2, MAT.metal, X(b.x + b.w - 1), b.h, Z(b.y + 1)));
    top = Math.max(top, b.h + 3.2);
  }
  if (b.stack) {
    g.add(cylinder(0.42, 4.6, MAT.metal, cx, b.h, cz));
    for (const k of [3.4, 4.1]) g.add(cylinder(0.45, 0.14, MAT.roof, cx, b.h + k, cz));
    top = Math.max(top, b.h + 4.6);
  }
  if (b.vents) [1, 2.5, 4].forEach(i => g.add(cylinder(0.22, 1.1, MAT.metal, X(b.x + i), b.h, cz, 16)));
  if (b.fans) [0.9, 2.4].forEach(i => {
    g.add(cylinder(0.5, 0.25, MAT.metal, X(b.x + i), b.h, cz));
    g.add(cylinder(0.42, 0.27, MAT.dark, X(b.x + i), b.h, cz));
  });
  if (b.tank) {
    g.add(cylinder(0.8, 2.4, MAT.metal, X(b.x + b.w + 1.3), 0, Z(b.y + 1)));
    g.add(mesh(new THREE.SphereGeometry(0.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), MAT.metal, X(b.x + b.w + 1.3), 2.4, Z(b.y + 1)));
  }
  if (b.kind === 'pad') {
    g.add(mesh(new THREE.BoxGeometry(b.w, b.h, b.d), MAT.slab, cx, b.h / 2, cz));
    for (let i = 0; i < (b.clarifiers || 0); i++) {
      const px = X(b.x + 1.5 + i * 3);
      g.add(cylinder(1.25, 0.6, MAT.roof, px, b.h, cz, 40));
      g.add(cylinder(1.1, 0.62, MAT.water, px, b.h, cz, 40));
      const bridge = mesh(new THREE.BoxGeometry(2.6, 0.08, 0.15), MAT.metal, px, b.h + 0.75, cz);
      bridge.rotation.y = 0.6 + i;
      g.add(bridge);
    }
    top = b.h + 0.8;
  }

  // Контур выбранного/наведённого корпуса: рёбра всех мешей
  const edges = new THREE.Group();
  g.traverse(o => {
    if (o.isMesh) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), EDGE.clone());
      e.position.copy(o.position);
      e.rotation.copy(o.rotation);
      edges.add(e);
    }
  });
  g.add(edges);
  g.traverse(o => { o.userData.key = b.key; });
  return { group: g, edges, top, center: new THREE.Vector3(cx, 0, cz) };
}

// Трубопроводы на эстакаде: трубы на высоте 0.9 и опоры через ~2 клетки
function buildPipes() {
  const g = new THREE.Group();
  const y = 1.3;   // выше проезда: машины проходят под эстакадой
  for (const line of PIPES) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = new THREE.Vector3(X(line[i][0]), y, Z(line[i][1]));
      const b = new THREE.Vector3(X(line[i + 1][0]), y, Z(line[i + 1][1]));
      const len = a.distanceTo(b);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, len, 12), MAT.metal);
      pipe.position.copy(a).add(b).multiplyScalar(0.5);
      pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      pipe.castShadow = true;
      g.add(pipe);
      for (let t = 0; t <= len; t += 2) {
        const p = a.clone().lerp(b, len ? t / len : 0);
        g.add(mesh(new THREE.BoxGeometry(0.08, y, 0.08), MAT.roof, p.x, y / 2, p.z));
      }
    }
  }
  return g;
}

// Всё, что делает площадку заводом, а не набором коробок: проезды с разметкой,
// ж/д ветка, забор с воротами, проходная, стоянка, деревья
function buildSiteFurniture() {
  const g = new THREE.Group();
  const flat = (w, d, material, x, z, y = 0.012) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return m;
  };
  for (const r of ROADS) {
    g.add(flat(r.w, r.d, MAT.asphalt, X(r.x + r.w / 2), Z(r.y + r.d / 2)));
    // Прерывистая осевая линия
    const along = r.w > r.d;
    const len = along ? r.w : r.d;
    for (let t = 0.6; t < len - 0.6; t += 1.4) {
      g.add(flat(along ? 0.6 : 0.06, along ? 0.06 : 0.6, MAT.marking,
        along ? X(r.x + t + 0.3) : X(r.x + r.w / 2), along ? Z(r.y + r.d / 2) : Z(r.y + t + 0.3), 0.03));
    }
  }
  // Ж/д ветка: два рельса и шпалы
  for (let i = 0; i < RAIL.length - 1; i++) {
    const [ax, ay] = RAIL[i], [bx, by] = RAIL[i + 1];
    const alongX = ay === by;
    const len = alongX ? Math.abs(bx - ax) : Math.abs(by - ay);
    const cx = X((ax + bx) / 2), cz = Z((ay + by) / 2);
    for (const off of [-0.22, 0.22]) {
      g.add(mesh(new THREE.BoxGeometry(alongX ? len : 0.05, 0.06, alongX ? 0.05 : len), MAT.rail,
        alongX ? cx : cx + off, 0.08, alongX ? cz + off : cz));
    }
    for (let t = 0; t <= len; t += 0.45) {
      g.add(mesh(new THREE.BoxGeometry(alongX ? 0.12 : 0.7, 0.05, alongX ? 0.7 : 0.12), MAT.sleeper,
        alongX ? X(Math.min(ax, bx) + t) : cx, 0.03, alongX ? cz : Z(Math.min(ay, by) + t)));
    }
  }
  // Забор по периметру: столбы и две жерди, разрыв под ворота
  const fence = (x1, y1, x2, y2) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const alongX = y1 === y2;
    for (let t = 0; t <= len + 0.01; t += 1.5) {
      const px = alongX ? x1 + t : x1, py = alongX ? y1 : y1 + t;
      g.add(mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), MAT.roof, X(px), 0.45, Z(py)));
    }
    for (const h of [0.35, 0.8]) {
      g.add(mesh(new THREE.BoxGeometry(alongX ? len : 0.03, 0.03, alongX ? 0.03 : len), MAT.metal,
        X((x1 + x2) / 2), h, Z((y1 + y2) / 2)));
    }
  };
  fence(0, 0, SITE_W, 0);
  fence(0, 0, 0, SITE_D);
  fence(SITE_W, 0, SITE_W, SITE_D);
  fence(0, SITE_D, GATE.x, SITE_D);
  fence(GATE.x + GATE.w, SITE_D, SITE_W, SITE_D);
  // Шлагбаум и проходная
  const barrier = mesh(new THREE.BoxGeometry(GATE.w, 0.06, 0.06), MAT.marking, X(GATE.x + GATE.w / 2), 0.75, Z(SITE_D));
  g.add(barrier);
  const c = CHECKPOINT;
  g.add(mesh(new THREE.BoxGeometry(c.w, c.h, c.d), MAT.wall, X(c.x + c.w / 2), c.h / 2, Z(c.y + c.d / 2)));
  g.add(mesh(new THREE.BoxGeometry(c.w + 0.3, 0.1, c.d + 0.3), MAT.roof, X(c.x + c.w / 2), c.h + 0.05, Z(c.y + c.d / 2)));
  g.add(mesh(new THREE.BoxGeometry(c.w * 0.8, 0.25, 0.04), MAT.glass, X(c.x + c.w / 2), c.h * 0.65, Z(c.y + c.d) + 0.02));
  // Стоянка: асфальт и разметка мест
  g.add(flat(PARKING.w, PARKING.d, MAT.asphalt, X(PARKING.x + PARKING.w / 2), Z(PARKING.y + PARKING.d / 2)));
  for (let x = PARKING.x; x <= PARKING.x + PARKING.w + 0.01; x += 1) {
    g.add(flat(0.05, PARKING.d * 0.8, MAT.marking, X(x), Z(PARKING.y + PARKING.d * 0.6), 0.03));
  }
  // Деревья: ствол и низкополигональная крона
  for (const [tx, ty] of TREES) {
    g.add(cylinder(0.07, 0.6, MAT.sleeper, X(tx), 0, Z(ty), 8));
    const crown = mesh(new THREE.IcosahedronGeometry(0.5, 0), MAT.foliage, X(tx), 1.05, Z(ty));
    crown.rotation.y = tx * 1.7;
    g.add(crown);
  }
  return g;
}

// HTML-подпись над корпусом
function makeLabel(b, onSelect) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'plant-label';
  el.innerHTML = '<span class="plant-count"></span><span class="plant-name"></span><span class="plant-crit"></span>';
  el.querySelector('.plant-name').textContent = b.short;
  el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(b.key); });
  return el;
}

const Plant3D = ({ byLocation, selected, onSelect }) => {
  const hostRef = useRef(null);
  const apiRef = useRef(null);          // доступ к сцене из других эффектов
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Сцена создаётся один раз
  useEffect(() => {
    const host = hostRef.current;
    const width = host.clientWidth, height = host.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    host.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(width, height);
    labels.domElement.className = 'plant-labels';
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 55, 105);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.7;

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 200);
    camera.position.set(24, 27, 37);

    const controls = new OrbitControls(camera, labels.domElement);
    controls.target.set(0, 0.5, 3);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 16;
    controls.maxDistance = 90;
    controls.maxPolarAngle = 1.32;     // не опускаться под землю
    controls.enablePan = false;
    controls.update();

    // Свет: мягкий общий + «солнце» с тенями + холодная заливка сбоку
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.6);
    sun.position.set(-18, 32, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 });
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 0.6);
    rim.position.set(20, 10, -18);
    scene.add(rim);

    // Земля и площадка с бортиком
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), MAT.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    ground.receiveShadow = true;
    scene.add(ground);
    const slab = mesh(new THREE.BoxGeometry(SITE_W + 1, 0.3, SITE_D + 1), MAT.slab, 0, -0.15, 0);
    scene.add(slab);
    const grid = new THREE.GridHelper(SITE_W + 1, SITE_W + 1, 0xffffff, 0xffffff);
    grid.material.transparent = true;
    grid.material.opacity = 0.05;
    grid.scale.z = (SITE_D + 1) / (SITE_W + 1);
    grid.position.y = 0.005;
    scene.add(grid);
    scene.add(buildPipes());
    scene.add(buildSiteFurniture());

    // Корпуса, подписи и маячки
    const buildings = new Map();
    const pickable = [];
    for (const b of SITE) {
      const built = buildBuilding(b);
      scene.add(built.group);
      built.group.traverse(o => { if (o.isMesh) pickable.push(o); });

      const el = makeLabel(b, (key) => onSelectRef.current(key));
      const label = new CSS2DObject(el);
      label.position.set(built.center.x, built.top + 1.2, built.center.z);
      scene.add(label);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), MAT.beacon);
      beacon.position.set(built.center.x, built.top + 0.25, built.center.z);
      beacon.visible = false;
      scene.add(beacon);

      buildings.set(b.key, { ...built, el, beacon });
    }

    // Клик и наведение: отличаем клик от поворота камеры по сдвигу курсора
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down = null, hovered = null;
    const pick = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickable, false)[0]?.object.userData.key || null;
    };
    const target = labels.domElement;
    const onDown = (e) => { down = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) {
        const key = pick(e);
        if (key) onSelectRef.current(key);
      }
      down = null;
    };
    const onMove = (e) => {
      if (down) return;
      hovered = pick(e);
      target.style.cursor = hovered ? 'pointer' : 'grab';
    };
    target.addEventListener('pointerdown', onDown);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointermove', onMove);

    const resize = new ResizeObserver(() => {
      const w = host.clientWidth, h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resize.observe(host);

    // Рисуем только когда карта на экране: на скрытой вкладке и при прокрутке
    // ниже видеокарта не работает впустую
    let visible = true, frame = 0;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) loop(); });
    io.observe(host);
    const started = performance.now();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function loop() {
      cancelAnimationFrame(frame);
      if (!visible) return;
      frame = requestAnimationFrame(loop);
      const t = (performance.now() - started) / 1000;
      controls.update();
      for (const [key, item] of buildings) {
        const active = key === apiRef.current.selected || key === hovered;
        item.edges.children.forEach(e => { e.material.opacity = key === apiRef.current.selected ? 0.9 : active ? 0.45 : 0; });
        if (item.beacon.visible && !reduceMotion) item.beacon.scale.setScalar(1 + 0.25 * Math.sin(t * 4));
      }
      renderer.render(scene, camera);
      labels.render(scene, camera);
    }

    // Обновление подписей и маячков по данным с сервера
    const setStats = (byLocation) => {
      const stats = new Map((byLocation || []).map(l => [l.location, l]));
      for (const [key, item] of buildings) {
        const st = stats.get(key);
        item.el.style.display = st ? '' : 'none';
        item.beacon.visible = Boolean(st && st.critical > 0);
        if (!st) continue;
        item.el.querySelector('.plant-count').textContent = st.total;
        item.el.querySelector('.plant-crit').textContent = st.critical > 0 ? st.critical : '';
        item.el.setAttribute('aria-label', `${key}: ${st.total} ед., аварийных ${st.critical}`);
      }
    };
    const setSelected = (key) => {
      apiRef.current.selected = key;
      for (const [k, item] of buildings) item.el.classList.toggle('is-active', k === key);
    };

    apiRef.current = { buildings, selected: null, setStats, setSelected };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      resize.disconnect();
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointermove', onMove);
      controls.dispose();
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !Object.values(MAT).includes(o.material)) o.material.dispose();
      });
      scene.environment?.dispose();
      pmrem.dispose();
      renderer.dispose();
      host.innerHTML = '';
    };
  }, []);

  // Данные и выбор приходят через пропсы, сцена обновляется через свои функции
  useEffect(() => { apiRef.current?.setStats(byLocation); }, [byLocation]);
  useEffect(() => { apiRef.current?.setSelected(selected); }, [selected]);

  return <div ref={hostRef} className="relative w-full h-[460px] lg:h-[600px] plant-3d" />;
};

export default Plant3D;
