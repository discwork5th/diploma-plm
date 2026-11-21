import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  door: new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 0.5, metalness: 0.6 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x0c0b09, emissive: 0xffb866, emissiveIntensity: 0.08, roughness: 1 }),
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

// Много мелких деталей одного материала (пилястры, рейки ворот) склеиваются
// в один меш: для видеокарты это один вызов отрисовки вместо сотни
function merged(parts, material) {
  const geos = parts.map(([geo, x, y, z]) => geo.translate(x, y, z));
  const m = new THREE.Mesh(mergeGeometries(geos), material);
  geos.forEach(g => g.dispose());
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.noEdge = true;          // контур выделения рисуем только по крупным объёмам
  return m;
}

// Что видно в открытых воротах: тёплый свет цеха и уходящий вглубь пол.
// Стены у нас сплошные, вырезать в них проём дорого, поэтому глубину
// изображает текстура — градиент света и сходящиеся линии пола
let interiorTex = null;
function interiorTexture() {
  if (interiorTex) return interiorTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d');
  const wall = ctx.createLinearGradient(0, 0, 0, 40);
  wall.addColorStop(0, '#1a140c');
  wall.addColorStop(1, '#6b4a22');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, 64, 40);
  const floor = ctx.createLinearGradient(0, 40, 0, 64);
  floor.addColorStop(0, '#8a6430');
  floor.addColorStop(1, '#3a2c1a');
  ctx.fillStyle = floor;
  ctx.fillRect(0, 40, 64, 24);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for (const x of [-40, -10, 20, 44, 74, 104]) { ctx.beginPath(); ctx.moveTo(32 + (x - 32) * 0.25, 40); ctx.lineTo(x, 64); ctx.stroke(); }
  interiorTex = new THREE.CanvasTexture(c);
  interiorTex.colorSpace = THREE.SRGBColorSpace;
  return interiorTex;
}

// Погрузчик: корпус, ограждение кабины, мачта и вилы с поддоном
function makeForklift() {
  const f = new THREE.Group();
  f.add(mesh(new THREE.BoxGeometry(0.34, 0.2, 0.44), MAT.marking, 0, 0.16, 0));
  for (const [dx, dz] of [[-0.14, -0.15], [0.14, -0.15], [-0.14, 0.08], [0.14, 0.08]]) {
    f.add(mesh(new THREE.BoxGeometry(0.025, 0.28, 0.025), MAT.dark, dx, 0.4, dz));
  }
  f.add(mesh(new THREE.BoxGeometry(0.32, 0.03, 0.28), MAT.dark, 0, 0.55, -0.035));
  f.add(mesh(new THREE.BoxGeometry(0.26, 0.5, 0.04), MAT.dark, 0, 0.3, 0.25));
  for (const dx of [-0.08, 0.08]) f.add(mesh(new THREE.BoxGeometry(0.04, 0.02, 0.32), MAT.metal, dx, 0.08, 0.42));
  f.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), MAT.sleeper, 0, 0.19, 0.42));
  for (const [dx, dz] of [[-0.15, -0.14], [0.15, -0.14], [-0.15, 0.14], [0.15, 0.14]]) {
    const w = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), MAT.dark, dx, 0.07, dz);
    w.rotation.z = Math.PI / 2;
    f.add(w);
  }
  f.traverse(o => { o.userData.noEdge = true; });
  return f;
}

// Подъёмные секционные ворота: портал, «интерьер» и полотно, которое при
// открытии сматывается вверх (сжимается к верхней кромке — точка привязки
// полотна наверху). Открываются, когда к ним подъезжает погрузчик
function makeDoor(g, doors, w, h, x, z) {
  // Всё стоит перед цоколем (он выступает на 0,03), иначе нижний край проёма
  // перекрывала бы тёмная полоса цоколя
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: interiorTexture() }));
  inside.position.set(x, h / 2, z + 0.05);
  inside.userData.noEdge = true;
  g.add(inside);
  const frame = [
    [new THREE.BoxGeometry(0.07, h + 0.05, 0.08), x - w / 2 - 0.035, (h + 0.05) / 2, z + 0.06],
    [new THREE.BoxGeometry(0.07, h + 0.05, 0.08), x + w / 2 + 0.035, (h + 0.05) / 2, z + 0.06],
    [new THREE.BoxGeometry(w + 0.14, 0.07, 0.08), x, h + 0.035, z + 0.06]
  ];
  g.add(merged(frame, MAT.roof));
  const leaf = new THREE.Group();
  leaf.position.set(x, h, z + 0.08);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(w * 0.98, h, 0.04), MAT.door);
  panel.position.y = -h / 2;
  panel.castShadow = true;
  panel.userData.noEdge = true;
  leaf.add(panel);
  const ribs = [];
  for (let r = 0.18; r < h - 0.05; r += 0.22) ribs.push([new THREE.BoxGeometry(w * 0.92, 0.025, 0.02), 0, -r, 0.03]);
  leaf.add(merged(ribs, MAT.roof));
  g.add(leaf);
  doors.push({ leaf, x, z, open: 0 });
}

// Производственный корпус: стальной каркас с пилястрами по фасадам, цоколь,
// секционные ворота с козырьками, ленточное остекление, шедовая кровля над
// пролётами и плоский участок у торца с вентиляционными установками
function buildShop(g, b, cx, cz, doors) {
  const x0 = X(b.x), x1 = X(b.x + b.w), z0 = Z(b.y), z1 = Z(b.y + b.d);
  // Цоколь
  g.add(mesh(new THREE.BoxGeometry(b.w + 0.06, 0.32, b.d + 0.06), MAT.slab, cx, 0.16, cz));
  // Пилястры каркаса по всем фасадам, шаг ~1 клетка
  const ribs = [];
  const nx = Math.max(2, Math.round(b.w)), nz = Math.max(2, Math.round(b.d));
  for (let i = 0; i <= nx; i++) {
    const x = x0 + (b.w / nx) * i;
    ribs.push([new THREE.BoxGeometry(0.1, b.h, 0.06), x, b.h / 2, z1 + 0.03]);
    ribs.push([new THREE.BoxGeometry(0.1, b.h, 0.06), x, b.h / 2, z0 - 0.03]);
  }
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (b.d / nz) * i;
    ribs.push([new THREE.BoxGeometry(0.06, b.h, 0.1), x1 + 0.03, b.h / 2, z]);
    ribs.push([new THREE.BoxGeometry(0.06, b.h, 0.1), x0 - 0.03, b.h / 2, z]);
  }
  // Карнизная балка по периметру
  ribs.push([new THREE.BoxGeometry(b.w + 0.12, 0.12, 0.12), cx, b.h - 0.06, z1 + 0.03]);
  ribs.push([new THREE.BoxGeometry(0.12, 0.12, b.d + 0.12), x1 + 0.03, b.h - 0.06, cz]);
  g.add(merged(ribs, MAT.roof));

  // Ленточное остекление: длинная лента на южном фасаде, вертикальные — на торце
  g.add(mesh(new THREE.BoxGeometry(b.w * 0.92, 0.22, 0.04), MAT.glass, cx, b.h * 0.72, z1 + 0.02));
  for (let i = 1; i < nz; i++) {
    g.add(mesh(new THREE.BoxGeometry(0.04, b.h * 0.5, 0.28), MAT.glass, x1 + 0.02, b.h * 0.5, z0 + (b.d / nz) * i));
  }

  // Ворота: проём, секционное полотно с рейками, козырёк; и калитка рядом
  const gates = Math.max(1, Math.floor(b.w / 3.5));
  for (let k = 0; k < gates; k++) {
    const gx = x0 + (b.w / (gates + 1)) * (k + 1);
    makeDoor(g, doors, 1.3, 1.55, gx, z1);
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.06, 0.45), MAT.metal, gx, 1.68, z1 + 0.25));
    g.add(mesh(new THREE.BoxGeometry(0.32, 0.6, 0.05), MAT.dark, gx + 1.05, 0.3, z1 + 0.04));
  }

  // Кровля: шеды над пролётами (≈ 70% длины) и плоский участок у восточного торца
  const sawW = b.w * 0.7, th = 0.55;
  const teeth = Math.max(2, Math.round(sawW / 1.3)), tw = sawW / teeth;
  for (let i = 0; i < teeth; i++) {
    const tx = x0 + tw * i;
    const p = prism([[0, 0], [tw, th], [tw, 0]], b.d, MAT.roof);
    p.position.set(tx, b.h, z0);
    g.add(p);
    g.add(mesh(new THREE.BoxGeometry(0.04, th * 0.8, b.d * 0.94), MAT.glass, tx + tw - 0.03, b.h + th * 0.45, cz));
  }
  const flatX = x0 + sawW, flatW = b.w - sawW;
  // Парапет плоской части
  const parapet = [
    [new THREE.BoxGeometry(flatW, 0.18, 0.06), flatX + flatW / 2, b.h + 0.09, z0 + 0.03],
    [new THREE.BoxGeometry(flatW, 0.18, 0.06), flatX + flatW / 2, b.h + 0.09, z1 - 0.03],
    [new THREE.BoxGeometry(0.06, 0.18, b.d), x1 - 0.03, b.h + 0.09, cz]
  ];
  g.add(merged(parapet, MAT.roof));
  // Вентустановки: корпус и две крыльчатки сверху
  const units = Math.max(1, Math.floor(b.d / 2));
  for (let u = 0; u < units; u++) {
    const uz = z0 + (b.d / (units + 1)) * (u + 1);
    const ux = flatX + flatW / 2;
    g.add(mesh(new THREE.BoxGeometry(Math.min(1.4, flatW * 0.7), 0.45, 0.8), MAT.metal, ux, b.h + 0.23, uz));
    g.add(cylinder(0.22, 0.06, MAT.dark, ux - 0.3, b.h + 0.45, uz, 16));
    g.add(cylinder(0.22, 0.06, MAT.dark, ux + 0.3, b.h + 0.45, uz, 16));
  }
  // Воздуховод от вентустановки над шедами
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, sawW * 0.6, 14), MAT.metal);
  duct.rotation.z = Math.PI / 2;
  duct.position.set(flatX - sawW * 0.3, b.h + th + 0.25, z0 + b.d * 0.3);
  duct.castShadow = true;
  g.add(duct);
  return b.h + th + 0.4;
}

// Один корпус: группа мешей + контур для подсветки выбранного
function buildBuilding(b) {
  const g = new THREE.Group();
  const emitters = [];   // устья труб: отсюда идёт дым
  const spinners = [];   // крыльчатки вентиляторов
  const doors = [];      // подъёмные ворота
  const cx = X(b.x + b.w / 2), cz = Z(b.y + b.d / 2);
  let top = b.h;

  if (b.kind !== 'pad') g.add(mesh(new THREE.BoxGeometry(b.w, b.h, b.d), MAT.wall, cx, b.h / 2, cz));

  if (b.kind === 'shop') top = buildShop(g, b, cx, cz, doors);
  if (b.kind === 'warehouse') {
    const p = prism([[0, 0], [b.d / 2, 0.7], [b.d, 0]], b.w, MAT.roof);
    p.rotation.y = Math.PI / 2;
    p.position.set(X(b.x), b.h, Z(b.y + b.d));
    g.add(p);
    top = b.h + 0.7;
    // Ворота к проезду
    for (let i = 1.2; i < b.w - 0.5; i += 2.4) makeDoor(g, doors, 1, 1.15, X(b.x + i), Z(b.y + b.d));
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
    emitters.push(new THREE.Vector3(X(b.x + b.w - 1), b.h + 3.3, Z(b.y + 1)));
    top = Math.max(top, b.h + 3.2);
  }
  if (b.stack) {
    g.add(cylinder(0.42, 4.6, MAT.metal, cx, b.h, cz));
    for (const k of [3.4, 4.1]) g.add(cylinder(0.45, 0.14, MAT.roof, cx, b.h + k, cz));
    emitters.push(new THREE.Vector3(cx, b.h + 4.7, cz));
    top = Math.max(top, b.h + 4.6);
  }
  if (b.vents) [1, 2.5, 4].forEach(i => g.add(cylinder(0.22, 1.1, MAT.metal, X(b.x + i), b.h, cz, 16)));
  if (b.cyclones) {
    // Пылеуловители-циклоны у литейного: цилиндр на конусе, на опорах, с воздуховодом в цех
    for (let i = 0; i < 2; i++) {
      const px = X(b.x) - 0.9, pz = Z(b.y + 1.4 + i * 1.6);
      g.add(cylinder(0.42, 1.3, MAT.metal, px, 1.6, pz));
      const cone = mesh(new THREE.ConeGeometry(0.42, 0.9, 24), MAT.metal, px, 1.15, pz);
      cone.rotation.x = Math.PI;
      g.add(cone);
      for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
        g.add(mesh(new THREE.BoxGeometry(0.06, 1.6, 0.06), MAT.roof, px + dx, 0.8, pz + dz));
      }
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 12), MAT.metal);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(px + 0.6, 2.7, pz);
      g.add(pipe);
    }
  }
  if (b.fans) [0.9, 2.4].forEach(i => {
    g.add(cylinder(0.5, 0.25, MAT.metal, X(b.x + i), b.h, cz));
    g.add(cylinder(0.42, 0.27, MAT.dark, X(b.x + i), b.h, cz));
    // Крыльчатка: две перекрещённые лопасти, крутятся в цикле анимации
    const rotor = new THREE.Group();
    rotor.position.set(X(b.x + i), b.h + 0.3, cz);
    for (const r of [0, Math.PI / 2]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.03, 0.1), MAT.roof);
      blade.rotation.y = r;
      rotor.add(blade);
    }
    g.add(rotor);
    spinners.push(rotor);
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
    if (o.isMesh && !o.userData.noEdge) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), EDGE.clone());
      e.position.copy(o.position);
      e.rotation.copy(o.rotation);
      edges.add(e);
    }
  });
  g.add(edges);
  g.traverse(o => { o.userData.key = b.key; });
  return { group: g, edges, top, center: new THREE.Vector3(cx, 0, cz), emitters, spinners, doors, size: Math.max(b.w, b.d) };
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
  // Стрела шлагбаума крепится к стойке у края ворот и поднимается поворотом
  const barrier = new THREE.Group();
  barrier.position.set(X(GATE.x), 0.75, Z(SITE_D));
  const arm = mesh(new THREE.BoxGeometry(GATE.w, 0.06, 0.06), MAT.marking, GATE.w / 2, 0, 0);
  barrier.add(arm);
  g.add(barrier);
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), MAT.roof, X(GATE.x) - 0.05, 0.4, Z(SITE_D)));
  g.userData.barrier = barrier;
  const c = CHECKPOINT;
  g.add(mesh(new THREE.BoxGeometry(c.w, c.h, c.d), MAT.wall, X(c.x + c.w / 2), c.h / 2, Z(c.y + c.d / 2)));
  g.add(mesh(new THREE.BoxGeometry(c.w + 0.3, 0.1, c.d + 0.3), MAT.roof, X(c.x + c.w / 2), c.h + 0.05, Z(c.y + c.d / 2)));
  g.add(mesh(new THREE.BoxGeometry(c.w * 0.8, 0.25, 0.04), MAT.glass, X(c.x + c.w / 2), c.h * 0.65, Z(c.y + c.d) + 0.02));
  // Стоянка: асфальт и разметка мест
  g.add(flat(PARKING.w, PARKING.d, MAT.asphalt, X(PARKING.x + PARKING.w / 2), Z(PARKING.y + PARKING.d / 2)));
  for (let x = PARKING.x; x <= PARKING.x + PARKING.w + 0.01; x += 1) {
    g.add(flat(0.05, PARKING.d * 0.8, MAT.marking, X(x), Z(PARKING.y + PARKING.d * 0.6), 0.03));
  }
  // Крытые переходы между цехами: по ним идёт деталь от литья к сборке и окраске
  for (const [gx, gy, gd, gh] of [[9, 2.2, 2.4, 1.7], [18, 2.2, 2.4, 1.7], [27, 2.4, 2.2, 1.6]]) {
    g.add(mesh(new THREE.BoxGeometry(1, gh, gd), MAT.wall, X(gx + 0.5), gh / 2, Z(gy + gd / 2)));
    g.add(mesh(new THREE.BoxGeometry(1.06, 0.08, gd + 0.06), MAT.roof, X(gx + 0.5), gh + 0.04, Z(gy + gd / 2)));
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.18, 0.04), MAT.glass, X(gx + 0.5), gh * 0.65, Z(gy + gd) + 0.02));
  }
  // Козловой кран над ж/д веткой у склада готовой продукции
  {
    const cz0 = Z(13), cz1 = Z(15.5), xa = X(34.25), xb = X(35.75), hh = 3.2;   // ноги — между складом и забором
    for (const cz of [cz0, cz1]) {
      for (const lx of [xa, xb]) g.add(mesh(new THREE.BoxGeometry(0.1, hh, 0.1), MAT.metal, lx, hh / 2, cz));
      g.add(mesh(new THREE.BoxGeometry(xb - xa + 0.5, 0.22, 0.16), MAT.metal, (xa + xb) / 2, hh + 0.1, cz));
    }
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.3, cz1 - cz0 + 0.3), MAT.roof, (xa + xb) / 2 - 0.2, hh + 0.35, (cz0 + cz1) / 2));
    g.add(mesh(new THREE.BoxGeometry(0.02, 1.4, 0.02), MAT.dark, (xa + xb) / 2 - 0.2, hh - 0.6, (cz0 + cz1) / 2));
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.5), MAT.roof, (xa + xb) / 2 - 0.2, hh - 1.45, (cz0 + cz1) / 2));
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

// Мягкое пятно для частиц дыма: радиальный градиент, нарисованный на холсте
function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Грузовик: кабина и фургон. Ездит по кольцу проездов
function makeTruck() {
  const g = new THREE.Group();
  const trailer = mesh(new THREE.BoxGeometry(1.4, 0.55, 0.5), MAT.roof, -0.25, 0.4, 0);
  const cab = mesh(new THREE.BoxGeometry(0.45, 0.45, 0.48), MAT.wall, 0.72, 0.35, 0);
  const glass = mesh(new THREE.BoxGeometry(0.03, 0.15, 0.4), MAT.glass, 0.95, 0.45, 0);
  g.add(trailer, cab, glass);
  return g;
}

// Путь по точкам генплана: возвращает функцию «доля пути → позиция и курс»
function makePath(points, y) {
  const v = points.map(([a, b]) => new THREE.Vector3(X(a), y, Z(b)));
  const lens = v.slice(1).map((p, i) => p.distanceTo(v[i]));
  const total = lens.reduce((s, l) => s + l, 0);
  return (u) => {
    let d = (((u % 1) + 1) % 1) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i]) {
        const pos = v[i].clone().lerp(v[i + 1], d / lens[i]);
        const dir = v[i + 1].clone().sub(v[i]);
        return { pos, heading: Math.atan2(-dir.z, dir.x) };
      }
      d -= lens[i];
    }
    return { pos: v[v.length - 1].clone(), heading: 0 };
  };
}

// HTML-подпись над корпусом
function makeLabel(b, onSelect) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'plant-label';
  el.innerHTML = '<span class="plant-count"></span><span class="plant-name"></span><span class="plant-crit"></span>';
  el.querySelector('.plant-name').textContent = b.short;
  // Не отдаём нажатие на подпись в OrbitControls: иначе он захватывает указатель
  // и щелчок до кнопки не доходит
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(b.key); });
  return el;
}

const Plant3D = ({ byLocation, live, selected, onSelect }) => {
  const hostRef = useRef(null);
  const apiRef = useRef(null);          // доступ к сцене из других эффектов
  const onSelectRef = useRef(onSelect);
  const [focused, setFocused] = useState(false);   // камера ушла от общего вида
  const onViewRef = useRef(setFocused);
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
    // Сдвиг правой кнопкой (или Shift + левой): камера едет по земле, а не
    // поднимается в небо; точка, вокруг которой вращаемся, остаётся на площадке
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.panSpeed = 0.8;
    // Телефон: одним пальцем страница прокручивается как обычно (иначе карта
    // «захватывает» экран и до сводки не долистать), двумя — поворот и зум
    controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
    labels.domElement.style.touchAction = 'pan-y';
    controls.update();

    // Камера подстраивается под форму окна: на узком экране отъезжает дальше,
    // чтобы площадка целиком влезла по ширине
    const HOME = controls.target.clone();
    const BASE = new THREE.Vector3(24, 27, 37).sub(HOME);
    let fitK = 1;
    const fitCamera = (w, h) => {
      const aspect = w / h;
      fitK = aspect >= 1.5 ? 1 : Math.min(2.2, 1.5 / aspect * 0.92);
      // Пересчитываем позицию только на общем виде: если пользователь
      // приблизился к корпусу, поворот телефона его не выкидывает
      if (controls.target.distanceTo(HOME) < 0.5) camera.position.copy(HOME).add(BASE.clone().multiplyScalar(fitK));
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // На узком экране подписи короче: только числа, имя — у выбранного
      labels.domElement.classList.toggle('is-compact', w < 640);
    };
    fitCamera(width, height);

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
    const furniture = buildSiteFurniture();
    scene.add(furniture);
    const barrier = furniture.userData.barrier;
    let barrierOpen = 0;

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

    // ---- Дым из труб: спрайты поднимаются, расплываются и тают ----
    const smokeTex = smokeTexture();
    const puffs = [];
    for (const item of buildings.values()) {
      for (const origin of item.emitters) {
        for (let i = 0; i < 14; i++) {
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x9a9a96, transparent: true, depthWrite: false, opacity: 0 }));
          scene.add(sprite);
          puffs.push({ sprite, origin, phase: i / 14 });
        }
      }
    }

    // ---- Транспорт: грузовик по кольцу проездов, вагон по ж/д ветке ----
    const truck = makeTruck();
    scene.add(truck);
    // Маршрут только по проездам, с правосторонним движением: въезд через
    // ворота, главный проезд на запад, западный проезд на юг, проезд
    // энергетики на восток и выезд обратно через ворота
    const truckPath = makePath([[24.85, 27], [24.85, 9.25], [1.2, 9.25], [1.2, 17.65], [24.15, 17.65], [24.15, 27]], 0);
    // ---- Погрузчики: возят поддоны между соседними корпусами ----
    // Рейсы идут по очереди, по одному за раз, с паузой между ними: из ворот
    // одного корпуса вдоль фасада к воротам другого. В следующем круге —
    // обратно. Ворота открываются, только когда погрузчик рядом.
    const doorAt = (key, k = 0) => {
      const b = SITE.find(s => s.key === key);
      if (b.kind === 'shop') {
        const gates = Math.max(1, Math.floor(b.w / 3.5));
        return [b.x + (b.w / (gates + 1)) * (k + 1), b.y + b.d];
      }
      return [b.x + 1.2 + 2.4 * k, b.y + b.d];
    };
    const ROUTES = [
      ['Цех №2 (литейный)', 'Цех №1 (механообработка)', 0.8],
      ['Цех №1 (механообработка)', 'Цех №3 (сборочный)', 0.8],
      ['Склад резерва и запчастей', 'Склад готовой продукции', 0.7],
      ['Цех №3 (сборочный)', 'Цех №4 (окрасочный)', 0.8]
    ].map(([from, to, out]) => {
      const [sx, sy] = doorAt(from), [tx, ty] = doorAt(to);
      const row = Math.max(sy, ty) + out;       // проезд вдоль фасадов
      const pts = [[sx, sy - 0.4], [sx, row], [tx, row], [tx, ty - 0.4]];
      const lift = makeForklift();
      lift.visible = false;
      scene.add(lift);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      return { pts, back: [...pts].reverse(), lift, len };
    });
    const LIFT_SPEED = 1.1, WAIT = 1.2, GAP = 9;   // клеток в секунду, ожидание у ворот, пауза между рейсами
    const tripTime = (r) => WAIT + r.len / LIFT_SPEED + WAIT;
    const cycleTime = ROUTES.reduce((sum, r) => sum + tripTime(r) + GAP, 0);
    const pointAt = (pts, d) => {
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        const seg = Math.hypot(bx - ax, by - ay);
        if (d <= seg) return { x: ax + (bx - ax) * d / seg, y: ay + (by - ay) * d / seg, dx: bx - ax, dy: by - ay };
        d -= seg;
      }
      const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1];
      return { x: bx, y: by, dx: bx - ax, dy: by - ay };
    };

    const wagon = mesh(new THREE.BoxGeometry(2.2, 0.75, 0.6), MAT.metal, 0, 0, 0);
    scene.add(wagon);
    const railPath = makePath(RAIL, 0.5);

    // ---- Красная подсветка корпуса с живой тревогой (одна лампа на сцену) ----
    const alarmLight = new THREE.PointLight(0xe5484d, 0, 9, 1.6);
    scene.add(alarmLight);
    let alarmKeys = [];

    // ---- День и ночь: по местному времени, ночью светятся окна ----
    const setNight = (night) => {
      sun.intensity = night ? 0.35 : 2.6;
      rim.intensity = night ? 0.25 : 0.6;
      scene.environmentIntensity = night ? 0.18 : 0.7;
      MAT.glass.emissiveIntensity = night ? 1.1 : 0.22;
      host.classList.toggle('is-night', night);
    };
    const hour = new Date().getHours();
    setNight(hour < 7 || hour >= 20);

    // ---- Облёт камеры к выбранному корпусу ----
    let flight = null;
    // Пользователь сам взялся за камеру — облёт прекращаем, не спорим с ним
    controls.addEventListener('start', () => { flight = null; });
    const flyTo = (targetPoint, distance) => {
      const dir = camera.position.clone().sub(controls.target).normalize();
      flight = {
        t0: performance.now(), dur: 900,
        fromT: controls.target.clone(), toT: targetPoint.clone(),
        fromP: camera.position.clone(), toP: targetPoint.clone().add(dir.multiplyScalar(distance))
      };
    };
    const overview = { get target() { return HOME.clone(); }, get position() { return HOME.clone().add(BASE.clone().multiplyScalar(fitK)); } };

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
      fitCamera(w, h);
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
      if (flight) {
        const k = Math.min(1, (performance.now() - flight.t0) / flight.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // плавный старт и торможение
        controls.target.lerpVectors(flight.fromT, flight.toT, e);
        camera.position.lerpVectors(flight.fromP, flight.toP, e);
        if (k === 1) flight = null;
      }
      // Точку вращения не выпускаем за площадку и держим на уровне земли
      controls.target.x = THREE.MathUtils.clamp(controls.target.x, -SITE_W / 2, SITE_W / 2);
      controls.target.z = THREE.MathUtils.clamp(controls.target.z, -SITE_D / 2, SITE_D / 2);
      controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0, 2);
      controls.update();
      if (!reduceMotion) {
        for (const p of puffs) {
          const u = (t * 0.12 + p.phase) % 1;
          p.sprite.position.set(p.origin.x + u * 2.2 + Math.sin(u * 6 + p.phase * 9) * 0.2, p.origin.y + u * 4, p.origin.z - u * 0.8);
          p.sprite.scale.setScalar(0.5 + u * 2.4);
          p.sprite.material.opacity = 0.32 * Math.sin(Math.PI * u);
        }
        for (const item of buildings.values()) for (const r of item.spinners) r.rotation.y = t * 9;
        const tp = truckPath(t / 55);
        truck.position.copy(tp.pos);
        truck.rotation.y = tp.heading;
        // Погрузчики: какой рейс сейчас идёт и где на нём погрузчик
        const lifts = [];
        {
          const cycle = Math.floor(t / cycleTime);
          let c = t % cycleTime;
          for (const r of ROUTES) {
            const T = tripTime(r);
            r.lift.visible = false;
            if (c >= 0 && c < T) {
              const pts = cycle % 2 ? r.back : r.pts;
              const d = Math.min(r.len, Math.max(0, (c - WAIT) * LIFT_SPEED));
              const p = pointAt(pts, d);
              const moving = c > WAIT * 0.6 && c < T - WAIT * 0.5;   // до этого — ждёт ворота внутри, после — уже заехал
              r.lift.visible = moving;
              r.lift.position.set(X(p.x), 0, Z(p.y));
              r.lift.rotation.y = Math.atan2(p.dx, p.dy);
              lifts.push([X(p.x), Z(p.y)]);
            }
            c -= T + GAP;
          }
        }
        const dt = Math.min(0.1, t - (loop.last ?? t));
        loop.last = t;
        for (const item of buildings.values()) {
          for (const d of item.doors) {
            const near = lifts.some(([lx, lz]) => Math.hypot(lx - d.x, lz - d.z) < 1.4);
            d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 3);
            d.leaf.scale.y = 1 - 0.9 * d.open;
          }
        }
        const atGate = Math.hypot(truck.position.x - X(GATE.x + GATE.w / 2), truck.position.z - Z(SITE_D)) < 3;
        barrierOpen += ((atGate ? 1 : 0) - barrierOpen) * Math.min(1, dt * 3);
        barrier.rotation.z = barrierOpen * Math.PI * 0.45;
        const wp = railPath(0.5 + 0.48 * Math.sin(t / 22));   // вагон ходит туда-обратно
        wagon.position.copy(wp.pos);
        wagon.rotation.y = wp.heading;
      }
      if (alarmKeys.length) {
        const item = buildings.get(alarmKeys[Math.floor(t / 3) % alarmKeys.length]);
        alarmLight.position.set(item.center.x, item.top + 1.5, item.center.z);
        alarmLight.intensity = 6 + 5 * Math.sin(t * 6);
      } else alarmLight.intensity = 0;
      for (const [key, item] of buildings) {
        const active = key === apiRef.current.selected || key === hovered;
        item.edges.children.forEach(e => { e.material.opacity = key === apiRef.current.selected ? 0.9 : active ? 0.45 : 0; });
        if (item.beacon.visible && !reduceMotion) {
          // Живая тревога мигает быстрее и крупнее, чем «аварийное по паспорту»
          item.beacon.scale.setScalar(item.liveAlarm ? 1.6 + 0.6 * Math.sin(t * 10) : 1 + 0.25 * Math.sin(t * 4));
        }
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
        item.critical = Boolean(st && st.critical > 0);
        item.beacon.visible = item.critical || Boolean(item.liveAlarm);
        if (!st) continue;
        item.el.querySelector('.plant-count').textContent = st.total;
        item.el.querySelector('.plant-crit').textContent = st.critical > 0 ? st.critical : '';
        item.el.setAttribute('aria-label', `${key}: ${st.total} ед., аварийных ${st.critical}`);
      }
    };
    // Живые тревоги из телеметрии: маячок мигает чаще, корпус подсвечен красным
    const setLive = (snap) => {
      const alarmed = new Set((snap?.buildings || []).filter(b => b.alarms > 0).map(b => b.location));
      alarmKeys = [...alarmed].filter(k => buildings.has(k));
      for (const [key, item] of buildings) {
        item.liveAlarm = alarmed.has(key);
        item.beacon.visible = Boolean(item.critical) || item.liveAlarm;
      }
    };
    let firstSelect = true;
    const setSelected = (key) => {
      apiRef.current.selected = key;
      for (const [k, item] of buildings) item.el.classList.toggle('is-active', k === key);
      // Первый выбор — при открытии страницы: остаёмся на общем виде
      if (firstSelect) { firstSelect = false; return; }
      const item = buildings.get(key);
      if (item && apiRef.current.follow) {
        flyTo(new THREE.Vector3(item.center.x, 0.5, item.center.z), 24 + item.size * 2);
        onViewRef.current(true);
      }
    };
    const resetView = () => {
      flight = { t0: performance.now(), dur: 900, fromT: controls.target.clone(), toT: overview.target.clone(),
                 fromP: camera.position.clone(), toP: overview.position.clone() };
      onViewRef.current(false);
    };
    // Вернуться к общему виду: Esc или двойной щелчок по пустому месту
    const onKeyDown = (e) => { if (e.key === 'Escape') resetView(); };
    const onDblClick = (e) => { if (!pick(e)) resetView(); };
    host.tabIndex = -1;
    host.addEventListener('keydown', onKeyDown);
    target.addEventListener('dblclick', onDblClick);
    // Сдвиг или вращение руками тоже значит «я смотрю сам»
    controls.addEventListener('change', () => { if (!flight) onViewRef.current(controls.target.distanceTo(overview.target) > 1.5); });

    apiRef.current = { buildings, selected: null, follow: true, setStats, setSelected, setLive, setNight, resetView };
    loop();

    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      resize.disconnect();
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('dblclick', onDblClick);
      host.removeEventListener('keydown', onKeyDown);
      smokeTex.dispose();
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
  useEffect(() => { apiRef.current?.setLive(live); }, [live]);

  const [night, setNightState] = useState(() => { const h = new Date().getHours(); return h < 7 || h >= 20; });
  const toggleNight = () => { const n = !night; setNightState(n); apiRef.current?.setNight(n); };
  const [follow, setFollow] = useState(true);
  const toggleFollow = () => { const f = !follow; setFollow(f); if (apiRef.current) apiRef.current.follow = f; };

  return (
    <div className="relative">
      <div ref={hostRef} className="relative w-full h-[340px] sm:h-[460px] lg:h-[600px] plant-3d outline-none" />
      {focused && (
        <button onClick={() => apiRef.current?.resetView()} className="plant-ctl plant-ctl-main absolute left-2 top-2">
          ← Общий вид завода
        </button>
      )}
      <div className="absolute left-2 bottom-2 flex flex-wrap gap-1.5">
        <button onClick={toggleFollow} className="plant-ctl" aria-pressed={follow} title="Подлетать камерой к выбранному корпусу">
          Облёт: {follow ? 'вкл' : 'выкл'}
        </button>
        <button onClick={toggleNight} className="plant-ctl" aria-pressed={night}>{night ? 'Ночь' : 'День'}</button>
      </div>
      <p className="hidden md:block absolute right-2 bottom-2 text-[11px] text-white/40 pointer-events-none">
        Левая кнопка — вращать · правая — сдвигать · колесо — зум · Esc или двойной щелчок — общий вид
      </p>
    </div>
  );
};

export default Plant3D;
