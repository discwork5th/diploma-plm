// ============================================================================
// demo-fleet.js — генератор реалистичного парка оборудования завода
// ----------------------------------------------------------------------------
// Вручную описанных изделий в demo-data.js десять — этого мало, чтобы каталог,
// дашборд и ИИ-помощник выглядели как на настоящем предприятии. Здесь парк
// из ~230 единиц собирается кодом по правилам:
//
//   * Типоразмеры взяты из типовых обозначений (насосы К и ЭЦВ, двигатели АИР,
//     вентиляторы ВР 80-75, редукторы 1Ц2У и Ч). Производители вымышленные.
//   * Характеристики согласованы физически: мощность насоса считается из подачи
//     и напора (P = Q·H / 367η) и округляется вверх до стандартного двигателя,
//     производительность компрессора пропорциональна мощности и т.д.
//   * Генератор случайных чисел детерминированный (с фиксированным зерном):
//     при каждой заливке получается один и тот же парк, демо не «прыгает».
//   * Состояние задаётся долями: ~60% в норме, ~25% требуют внимания,
//     ~13% критичны — как в реальном парке, а не «всё зелёное» или «всё красное».
//     Числа подобраны под правила экспертной системы (наработка с последнего ТО,
//     остаток ресурса, дата следующего ТО).
//   * ~10% насосов, двигателей, компрессоров и ПЧ лежат в резерве на складе —
//     из них ИИ-помощник подбирает замену.
// ============================================================================

// ---- Детерминированный генератор (mulberry32) ------------------------------
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = makeRng(20261121);
const between = (min, max) => min + rnd() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
const fmt = (x, digits = 1) => String(Number(x.toFixed(digits))).replace('.', ',');

// Стандартный ряд мощностей электродвигателей, кВт
const MOTOR_KW = [0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160];
const motorFor = (kw) => MOTOR_KW.find(m => m >= kw) || MOTOR_KW[MOTOR_KW.length - 1];

// ---- Места установки -------------------------------------------------------
const RESERVE = 'Склад резерва и запчастей';
const LOC = {
  water: 'Насосная станция оборотного водоснабжения',
  boiler: 'Котельная',
  well: 'Водозабор',
  treatment: 'Очистные сооружения',
  air: 'Компрессорная станция',
  machining: 'Цех №1 (механообработка)',
  foundry: 'Цех №2 (литейный)',
  assembly: 'Цех №3 (сборочный)',
  paint: 'Цех №4 (окрасочный)',
  warehouse: 'Склад готовой продукции',
  itp: 'ИТП административного корпуса'
};

const MAKERS = {
  pump: ['ООО «ВолгаНасосМаш»', 'АО «Гидромаш-Поволжье»', 'ООО «Насосные технологии»'],
  air: ['ООО «Компрессорные системы»', 'АО «Пневмомаш»'],
  motor: ['АО «Электромотор»', 'ООО «Приволжский электромашзавод»'],
  drive: ['ООО «Редуктор-Сервис»', 'АО «Привод»'],
  fan: ['ООО «ВентПромСистемы»', 'АО «Климатехника»'],
  vfd: ['ООО «Силовая электроника»', 'АО «ПромАвтоматика»'],
  heat: ['ООО «ТеплоОбмен»', 'АО «Термосистемы»'],
  conveyor: ['ООО «КонвейерМаш»', 'АО «Транспортные системы»']
};

// ---- Описание типов: как получить характеристики одного экземпляра ----------
// Каждая функция возвращает { name, type, specs, image, maker, prefix, resource,
// hoursPerDay, locations, toWork } для одного случайного типоразмера.

const K_SIZES = [[8, 18], [20, 18], [20, 30], [45, 30], [45, 55], [90, 20], [90, 35], [90, 55], [160, 20], [160, 30], [290, 30]];
function pumpK() {
  const [q, h] = pick(K_SIZES);
  const eta = q < 30 ? 0.58 : q < 100 ? 0.7 : 0.78;
  const kw = motorFor((q * h) / (367 * eta) * 1.15);
  const rpm = q >= 290 ? 1450 : 2900;
  return {
    name: `Насос центробежный консольный К ${q}/${h}`,
    type: 'Насосное оборудование', image: 'pump', maker: pick(MAKERS.pump), prefix: `К${q}`,
    specs: { 'Подача': `${q} м³/ч`, 'Напор': `${h} м`, 'Мощность двигателя': `${fmt(kw)} кВт`,
      'Частота вращения': `${rpm} об/мин`, 'Температура среды': 'до 85 °C' },
    resource: 25000, hoursPerDay: 20,
    locations: [LOC.water, LOC.water, LOC.boiler, LOC.treatment, LOC.foundry],
    toWork: ['Замена сальниковой набивки, проверка соосности', 'Вибродиагностика, контроль температуры подшипников',
      'Замена подшипников, проверка рабочего колеса', 'Замена торцевого уплотнения']
  };
}

const ECV_SIZES = [[4, 2.5, 80], [4, 4, 70], [5, 6.5, 80], [5, 6.5, 120], [6, 10, 80], [6, 10, 110], [6, 16, 110], [6, 16, 160], [8, 25, 100], [8, 40, 90], [10, 63, 110]];
const ECV_DIAMETER = { 4: 95, 5: 120, 6: 145, 8: 186, 10: 235 };
function pumpEcv() {
  const [d, q, h] = pick(ECV_SIZES);
  const kw = motorFor((q * h) / (367 * 0.6) * 1.1);
  return {
    name: `Насос скважинный ЭЦВ ${d}-${fmt(q)}-${h}`,
    type: 'Насосное оборудование', image: 'pump', maker: pick(MAKERS.pump), prefix: `ЭЦВ${d}`,
    specs: { 'Подача': `${fmt(q)} м³/ч`, 'Напор': `${h} м`, 'Мощность': `${fmt(kw)} кВт`,
      'Диаметр': `${ECV_DIAMETER[d]} мм`, 'Глубина установки': `${int(30, h - 15)} м` },
    resource: 18000, hoursPerDay: 16,
    locations: [LOC.well],
    toWork: ['Проверка сопротивления изоляции кабеля', 'Контроль дебита и динамического уровня',
      'Подъём насоса, ревизия рабочих колёс']
  };
}

function compressor() {
  const kw = pick([7.5, 11, 15, 22, 30, 37, 45, 55, 75]);
  const bar = pick([8, 8, 10]);
  const flow = 0.13 * kw * (bar === 10 ? 0.85 : 1) * between(0.95, 1.05);
  return {
    name: `Компрессор винтовой ВК-${String(kw).replace('.', ',')}`,
    type: 'Компрессорное оборудование', image: 'compressor', maker: pick(MAKERS.air), prefix: `ВК${Math.round(kw)}`,
    specs: { 'Производительность': `${fmt(flow)} м³/мин`, 'Рабочее давление': `${bar} бар`,
      'Мощность': `${fmt(kw)} кВт`, 'Уровень шума': `${int(64, 74)} дБ(А)`, 'Охлаждение': kw >= 55 ? 'водяное' : 'воздушное' },
    resource: 40000, hoursPerDay: 18,
    locations: [LOC.air, LOC.air, LOC.machining, LOC.paint],
    toWork: ['Замена воздушного и масляного фильтров', 'Замена масла и сепаратора', 'Проверка предохранительного клапана']
  };
}

const AIR_FRAMES = { 1.1: '80A4', 1.5: '80B4', 2.2: '90L4', 3: '100S4', 4: '100L4', 5.5: '112M4', 7.5: '132S4', 11: '132M4',
  15: '160S4', 18.5: '160M4', 22: '180S4', 30: '180M4', 37: '200M4', 45: '200L4', 55: '225M4', 75: '250S4', 90: '250M4', 110: '280S4' };
function motor() {
  const kw = Number(pick(Object.keys(AIR_FRAMES)));
  const eff = Math.min(95.5, 76 + 4.2 * Math.log(kw + 1));
  return {
    name: `Электродвигатель АИР${AIR_FRAMES[kw]}`,
    type: 'Электрооборудование', image: 'motor', maker: pick(MAKERS.motor), prefix: `АИР${AIR_FRAMES[kw].slice(0, 3)}`,
    specs: { 'Мощность': `${fmt(kw)} кВт`, 'Частота вращения': '1500 об/мин', 'Напряжение': '380/660 В',
      'КПД': `${fmt(eff)} %`, 'Монтажное исполнение': pick(['IM1081', 'IM2081', 'IM3081']) },
    resource: 40000, hoursPerDay: 16,
    locations: [LOC.machining, LOC.foundry, LOC.assembly, LOC.paint, LOC.warehouse, LOC.water],
    toWork: ['Замер сопротивления изоляции обмоток', 'Замена подшипников, продувка', 'Проверка вибрации и нагрева']
  };
}

function reducer() {
  if (chance(0.55)) {
    const size = pick([100, 125, 160, 200, 250]);
    const torque = { 100: 250, 125: 500, 160: 1000, 200: 2000, 250: 4000 }[size];
    const ratio = pick([8, 10, 12.5, 16, 20, 25, 31.5, 40]);
    return {
      name: `Редуктор цилиндрический 1Ц2У-${size}`,
      type: 'Приводная техника', image: 'gearbox', maker: pick(MAKERS.drive), prefix: `1Ц2У${size}`,
      specs: { 'Передаточное число': fmt(ratio), 'Крутящий момент на выходе': `${torque} Н·м`,
        'Межосевое расстояние': `${size} мм`, 'Смазка': 'жидкая, картерная' },
      resource: 30000, hoursPerDay: 16,
      locations: [LOC.machining, LOC.foundry, LOC.assembly, LOC.warehouse],
      toWork: ['Замена масла, проверка уровня', 'Контроль зазоров в зацеплении', 'Замена манжет']
    };
  }
  const size = pick([80, 100, 125, 160]);
  const torque = { 80: 200, 100: 350, 125: 650, 160: 1300 }[size];
  const ratio = pick([10, 16, 20, 31.5, 40, 50, 63, 80]);
  return {
    name: `Редуктор червячный Ч-${size}`,
    type: 'Приводная техника', image: 'gearbox', maker: pick(MAKERS.drive), prefix: `Ч${size}`,
    specs: { 'Передаточное число': fmt(ratio), 'Крутящий момент на выходе': `${torque} Н·м`,
      'Межосевое расстояние': `${size} мм`, 'Смазка': 'жидкая, картерная' },
    resource: 25000, hoursPerDay: 16,
    locations: [LOC.assembly, LOC.warehouse, LOC.foundry],
    toWork: ['Замена масла', 'Проверка люфта червячной пары', 'Замена манжет']
  };
}

const VR_SIZES = { '2,5': [1000, 600], '3,15': [2000, 800], '4': [4000, 1000], '5': [7000, 1200], '6,3': [12000, 1400], '8': [22000, 1600], '10': [35000, 1800] };
function fan() {
  const no = pick(Object.keys(VR_SIZES));
  const [q0, p0] = VR_SIZES[no];
  const q = Math.round(q0 * between(0.9, 1.1) / 100) * 100;
  const pa = Math.round(p0 * between(0.85, 1.1) / 10) * 10;
  const kw = motorFor((q * pa) / (3600 * 1000 * 0.7) * 1.15);
  return {
    name: `Вентилятор радиальный ВР 80-75 №${no}`,
    type: 'Вентиляционное оборудование', image: 'fan', maker: pick(MAKERS.fan), prefix: `ВР${no.replace(',', '')}`,
    specs: { 'Производительность': `${q} м³/ч`, 'Полное давление': `${pa} Па`, 'Мощность двигателя': `${fmt(kw)} кВт`,
      'Исполнение': pick(['общепромышленное', 'коррозионностойкое', 'взрывозащищённое']) },
    resource: 30000, hoursPerDay: 14,
    locations: [LOC.paint, LOC.paint, LOC.foundry, LOC.machining, LOC.assembly],
    toWork: ['Балансировка рабочего колеса', 'Натяжение ремней, замена подшипников', 'Очистка лопаток от отложений']
  };
}

function vfd() {
  const kw = pick([0.75, 1.5, 2.2, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110]);
  return {
    name: `Преобразователь частоты ПЧ-${String(kw).replace('.', ',')}`,
    type: 'Электрооборудование', image: 'drive', maker: pick(MAKERS.vfd), prefix: `ПЧ${Math.round(kw)}`,
    specs: { 'Мощность': `${fmt(kw)} кВт`, 'Входное напряжение': '3×380 В', 'Выходная частота': '0–400 Гц',
      'Степень защиты': kw > 30 ? 'IP54' : pick(['IP20', 'IP54']) },
    resource: 50000, hoursPerDay: 18,
    locations: [LOC.water, LOC.air, LOC.machining, LOC.paint, LOC.boiler],
    toWork: ['Очистка радиатора и вентиляторов', 'Проверка затяжки силовых клемм', 'Контроль ёмкости конденсаторов звена ПТ']
  };
}

function heatExchanger() {
  const kw = pick([50, 100, 150, 200, 300, 500, 750, 1000]);
  const area = kw / 48 * between(0.9, 1.1);
  return {
    name: `Теплообменник пластинчатый ТП-${kw}`,
    type: 'Теплообменное оборудование', image: 'heat-exchanger', maker: pick(MAKERS.heat), prefix: `ТП${kw}`,
    specs: { 'Тепловая мощность': `${kw} кВт`, 'Площадь теплообмена': `${fmt(area)} м²`,
      'Количество пластин': String(Math.round(area * 7) + 1), 'Рабочее давление': 'до 16 бар' },
    resource: 60000, hoursPerDay: 20,
    locations: [LOC.boiler, LOC.itp, LOC.boiler],
    toWork: ['Промывка пластин без разборки', 'Разборка, чистка пластин, замена уплотнений', 'Опрессовка']
  };
}

function conveyor() {
  const b = pick([400, 500, 650, 800, 1000]);
  const len = int(6, 60);
  const tph = Math.round(b * between(0.12, 0.25));
  const kw = motorFor(len * tph / 900 + 1);
  return {
    name: `Конвейер ленточный КЛ-${b}-${len}`,
    type: 'Транспортное оборудование', image: 'conveyor', maker: pick(MAKERS.conveyor), prefix: `КЛ${b}`,
    specs: { 'Ширина ленты': `${b} мм`, 'Длина': `${len} м`, 'Производительность': `${tph} т/ч`,
      'Мощность привода': `${fmt(kw)} кВт`, 'Скорость ленты': `${fmt(between(0.8, 2), 1)} м/с` },
    resource: 30000, hoursPerDay: 16,
    locations: [LOC.foundry, LOC.assembly, LOC.warehouse],
    toWork: ['Регулировка натяжения и центровки ленты', 'Замена роликов', 'Вулканизация стыка ленты']
  };
}

// Сколько экземпляров каждого типа и может ли тип лежать в резерве
const PLAN = [
  [pumpK, 40, true], [pumpEcv, 12, true], [compressor, 14, true], [motor, 60, true], [reducer, 25, true],
  [fan, 30, false], [vfd, 25, true], [heatExchanger, 12, false], [conveyor, 15, false]
];

// ---- Состояние и история одного экземпляра ----------------------------------

// Распределение по состоянию: норма / внимание / критично
function pickCondition() {
  const r = rnd();
  return r < 0.62 ? 'ok' : r < 0.87 ? 'warning' : 'critical';
}

function maintenanceFor(model, ageDays, condition) {
  const util = between(0.55, 0.9);
  const total = Math.round(ageDays * model.hoursPerDay * util);   // наработка с ввода
  let hours, nextTO, remaining;
  if (condition === 'ok') {
    hours = int(200, 2400);
    nextTO = int(31, 170);
    remaining = Math.max(model.resource - total, int(6000, 12000));
  } else if (condition === 'warning') {
    const kind = pick(['hours', 'to', 'resource']);
    hours = kind === 'hours' ? int(2600, 7800) : int(800, 2400);
    nextTO = kind === 'to' ? int(1, 30) : int(31, 150);
    remaining = kind === 'resource' ? int(1200, 4900) : Math.max(model.resource - total, int(5500, 9000));
  } else {
    const kind = pick(['overdue', 'overdue', 'hours', 'resource']);
    hours = kind === 'hours' ? int(8100, 9800) : int(1500, 6000);
    nextTO = kind === 'overdue' ? -int(3, 45) : int(5, 90);
    remaining = kind === 'resource' ? int(150, 950) : int(2000, 9000);
  }
  return { hours, nextTO, remaining, total };
}

// until — до какого дня шли плановые ТО (для списанного или снятого в резерв — до этого события)
function historyFor(model, made, commission, nextTO, extra = [], until = -10) {
  const events = [[made, 'Производство', 'Изготовление и заводские испытания']];
  if (commission !== null) {
    events.push([commission, 'Ввод в эксплуатацию', 'Монтаж и пусконаладка']);
    // Плановые ТО раз в 4–6 месяцев, в истории последние восемь
    const tos = [];
    for (let d = commission + int(120, 180); d < until; d += int(120, 180)) tos.push(d);
    if (commission < -1825 && chance(0.6)) {
      events.push([commission + int(1500, 1800), 'Капитальный ремонт', 'Полная разборка, замена изношенных узлов']);
    }
    for (const d of tos.slice(-8)) events.push([d, 'Плановое ТО', pick(model.toWork)]);
  }
  events.push(...extra);
  if (nextTO !== null) events.push([nextTO, 'Плановое ТО', pick(model.toWork), false]);
  return events.sort((a, b) => a[0] - b[0]);
}

// ---- Сборка парка ------------------------------------------------------------
function generateFleet() {
  const fleet = [];
  const serialCounters = {};
  const today = new Date();

  for (const [make, count, canReserve] of PLAN) {
    for (let i = 0; i < count; i++) {
      const model = make();
      const r = rnd();
      // Резерв: ~12% у типов, которые держат на складе; списание ~4%; ремонт ~7%
      const stage = canReserve && r < 0.12 ? 'storage' : r > 0.96 ? 'disposal' : r > 0.89 ? 'maintenance' : 'operation';

      let made, commission, maintenance = null, location, extra = [], nextTO = null, until = -10;
      if (stage === 'storage') {
        const used = chance(0.35);                  // часть резерва — снятые исправные агрегаты
        made = -int(60, used ? 2500 : 700);
        commission = used ? made + int(20, 60) : null;
        location = RESERVE;
        until = -int(30, 400);
        extra = used
          ? [[until, 'Демонтаж в резерв', 'Исправен, снят при модернизации линии; консервация']]
          : [[made + int(10, 40), 'Поступление на склад', 'Входной контроль пройден, консервация']];
        if (used) extra.push([-int(5, 29), 'Проверка резерва', 'Внешний осмотр, проверка консервации']);
      } else {
        const age = int(90, 4200);
        commission = -age;
        made = commission - int(20, 90);
        location = pick(model.locations);
        if (stage === 'disposal') {
          until = -int(10, 300);
          extra = [[until, 'Списание', 'Ресурс выработан, заменён новым агрегатом']];
        } else {
          const condition = stage === 'maintenance' ? 'warning' : pickCondition();
          const m = maintenanceFor(model, age, condition);
          nextTO = m.nextTO;
          maintenance = { nextTO: m.nextTO, hours: m.hours, remaining: m.remaining };
          if (stage === 'maintenance') {
            extra = [[-int(1, 14), 'Вывод в ремонт', 'Повышенная вибрация, дефектовка'],
                     [int(3, 20), 'Ремонт', 'Плановое завершение ремонта', false]];
          }
        }
      }

      const year = new Date(today.getTime() + made * 86400000).getFullYear();
      serialCounters[model.prefix] = (serialCounters[model.prefix] || 2000) + int(1, 37);
      const serial = `${model.prefix}-${year}-${String(serialCounters[model.prefix]).padStart(4, '0')}`;

      fleet.push({
        name: model.name, type: model.type, manufacturer: model.maker, serial, stage,
        image: `/equipment/${model.image}.svg`, location,
        made, commission, specs: model.specs, maintenance,
        events: historyFor(model, made, commission, stage === 'operation' || stage === 'maintenance' ? nextTO : null, extra, until)
      });
    }
  }
  return fleet;
}

module.exports = { generateFleet, LOC, RESERVE };
