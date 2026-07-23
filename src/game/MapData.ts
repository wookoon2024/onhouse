export interface MapObjectInstance {
  id: string;
  tilesetKey: string;
  startCol: number;
  startRow: number;
  width: number;
  height: number;
  x: number; // 맵 타일 X 좌표
  y: number; // 맵 타일 Y 좌표
  layer: 'base' | 'decor';
  zIndex?: number; // 앞뒤 순서 제어용 z-index
}

export function cleanDuplicateObjects(objects?: MapObjectInstance[]): MapObjectInstance[] {
  if (!objects || objects.length === 0) return [];
  const result: MapObjectInstance[] = [];

  for (let i = objects.length - 1; i >= 0; i--) {
    const candidate = objects[i];
    const isDuplicate = result.some(existing => {
      if (
        existing.tilesetKey === candidate.tilesetKey &&
        existing.startCol === candidate.startCol &&
        existing.startRow === candidate.startRow &&
        existing.width === candidate.width &&
        existing.height === candidate.height
      ) {
        const dx = Math.abs(existing.x - candidate.x);
        const dy = Math.abs(existing.y - candidate.y);
        return dx < candidate.width && dy < candidate.height;
      }
      return false;
    });

    if (!isDuplicate) {
      result.unshift(candidate);
    }
  }

  return result;
}

export interface MapDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  tileset: string;
  baseLayer: number[][]; // 2D array of tile index
  decorLayer: number[][]; // 2D array for decorations
  collision: boolean[][]; // 2D array of colliders (true = solid)
  spawnPoints: { x: number; y: number }[];
  objects?: MapObjectInstance[];
}

export const DEFAULT_CHAR_ROW_ACTIONS: Record<string, string[]> = {
  ninja_blue: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  samurai_blue: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  samurai_green: ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'],
  pig: ['대기', '걷기1'],
};

export function getCharRowActions(spriteType: string): string[] {
  try {
    const saved = localStorage.getItem('on_house_char_row_actions');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed[spriteType] && Array.isArray(parsed[spriteType])) {
        return parsed[spriteType];
      }
    }
  } catch (e) {
    // fallback
  }
  return DEFAULT_CHAR_ROW_ACTIONS[spriteType] || ['대기', '걷기1', '걷기2', '걷기3', '공격', '피격', '환호'];
}

export function getCharGridDimensions(spriteType: string): { cols: number; rows: number } {
  try {
    const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
    if (savedOverrides) {
      const overrides = JSON.parse(savedOverrides);
      if (overrides[spriteType] && overrides[spriteType].cols && overrides[spriteType].rows) {
        return { cols: overrides[spriteType].cols, rows: overrides[spriteType].rows };
      }
    }
    const savedCustom = localStorage.getItem('on_house_custom_char_sprites');
    if (savedCustom) {
      const customList = JSON.parse(savedCustom);
      const matched = customList.find((item: any) => item.id === spriteType);
      if (matched && matched.cols && matched.rows) {
        return { cols: matched.cols, rows: matched.rows };
      }
    }
  } catch (e) {
    // fallback
  }

  if (spriteType === 'pig') return { cols: 2, rows: 1 };
  return { cols: 4, rows: 7 };
}

export function getCharDisplaySize(spriteType: string): number {
  try {
    const savedOverrides = localStorage.getItem('on_house_char_image_overrides');
    if (savedOverrides) {
      const overrides = JSON.parse(savedOverrides);
      if (overrides[spriteType] && overrides[spriteType].size) {
        return overrides[spriteType].size;
      }
    }
    const savedCustom = localStorage.getItem('on_house_custom_char_sprites');
    if (savedCustom) {
      const customList = JSON.parse(savedCustom);
      const matched = customList.find((item: any) => item.id === spriteType);
      if (matched && matched.size) {
        return matched.size;
      }
    }
  } catch (e) {
    // fallback
  }

  return 16; // Default base size is 16px tile scale
}

// Helper to create an empty 2D grid
const createGrid = (w: number, h: number, fillVal: number): number[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

const createBoolGrid = (w: number, h: number, fillVal: boolean): boolean[][] => {
  return Array.from({ length: h }, () => Array(w).fill(fillVal));
};

// PRE-FIXED TILE INDEX HELPERS
const getInteriorTile = (col: number, row: number) => 1000 + (row * 22 + col);
// --- MAP 1: MY ROOM (마이 룸) ---
const buildMyRoom = (): MapDefinition => {
  const w = 45;
  const h = 35;
  const base = createGrid(w, h, getInteriorTile(1, 9)); // Wood floor
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) {
    base[0][x] = getInteriorTile(1, 0);
    base[1][x] = getInteriorTile(1, 1);
    base[2][x] = getInteriorTile(1, 2);
    
    coll[0][x] = true;
    coll[1][x] = true;
    coll[2][x] = true;
    coll[h - 1][x] = true;
  }
  for (let y = 0; y < h; y++) {
    coll[y][0] = true;
    coll[y][w - 1] = true;
  }

  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  // Bed
  decor[cy - 5][cx - 8] = getInteriorTile(0, 11);
  decor[cy - 5][cx - 7] = getInteriorTile(1, 11);
  decor[cy - 4][cx - 8] = getInteriorTile(0, 12);
  decor[cy - 4][cx - 7] = getInteriorTile(1, 12);
  coll[cy - 5][cx - 8] = true; coll[cy - 5][cx - 7] = true;
  coll[cy - 4][cx - 8] = true; coll[cy - 4][cx - 7] = true;

  // Carpet
  decor[cy - 2][cx - 6] = getInteriorTile(10, 12);
  decor[cy - 2][cx - 5] = getInteriorTile(11, 12);
  decor[cy - 1][cx - 6] = getInteriorTile(10, 13);
  decor[cy - 1][cx - 5] = getInteriorTile(11, 13);

  // Wardrobe / Bookshelf
  decor[3][cx + 8] = getInteriorTile(16, 5);
  decor[4][cx + 8] = getInteriorTile(16, 6);
  coll[3][cx + 8] = true; coll[4][cx + 8] = true;

  decor[3][cx - 2] = getInteriorTile(12, 5);
  decor[4][cx - 2] = getInteriorTile(12, 6);
  coll[3][cx - 2] = true; coll[4][cx - 2] = true;

  // Table & Chairs
  decor[cy][cx] = getInteriorTile(15, 8);
  decor[cy][cx - 1] = getInteriorTile(16, 8);
  decor[cy][cx + 1] = getInteriorTile(16, 8);
  coll[cy][cx] = true; coll[cy][cx - 1] = true; coll[cy][cx + 1] = true;

  return {
    id: 'room',
    name: '🏠 마이 룸',
    width: w,
    height: h,
    tileset: 'interior',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: cx, y: cy + 4 }]
  };
};

// --- MAP 2: SUBWAY (지하철역) ---
const buildSubway = (): MapDefinition => {
  const w = 55;
  const h = 28;
  const base = createGrid(w, h, getInteriorTile(3, 9)); 
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) {
    base[0][x] = getInteriorTile(2, 16);
    base[1][x] = getInteriorTile(3, 16);
    base[2][x] = getInteriorTile(4, 16);
    
    coll[0][x] = true;
    coll[1][x] = true;
    coll[2][x] = true;
    coll[h - 1][x] = true;
  }
  for (let y = 0; y < h; y++) {
    coll[y][0] = true;
    coll[y][w - 1] = true;
  }

  for (let x = 5; x < w - 2; x += 8) {
    decor[8][x] = getInteriorTile(12, 0);
    decor[9][x] = getInteriorTile(12, 1);
    coll[8][x] = true; coll[9][x] = true;
  }

  const bx = Math.floor(w / 2);
  return {
    id: 'subway',
    name: '🚇 지하철역',
    width: w,
    height: h,
    tileset: 'interior',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: bx, y: 12 }]
  };
};

// --- MAP 3: CLEAN CANVAS PARK (호수공원) ---
// Clean, empty grass canvas for custom map building
const buildLakePark = (): MapDefinition => {
  const w = 50;
  const h = 35;
  // Simple grass base tile (ID 2000)
  const base = createGrid(w, h, 2000); 
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  // Outer Map Colliders
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'park',
    name: '🌳 호수공원',
    width: w,
    height: h,
    tileset: 'outdoor',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: 25, y: 17 }]
  };
};

// --- MAP 4: CLEAN CANVAS APT (아파트 단지) ---
const buildApartmentComplex = (): MapDefinition => {
  const w = 50;
  const h = 35;
  const base = createGrid(w, h, 2000);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);

  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'apt',
    name: '🏢 아파트 단지',
    width: w,
    height: h,
    tileset: 'outdoor',
    baseLayer: base,
    decorLayer: decor,
    collision: coll,
    spawnPoints: [{ x: 25, y: 17 }]
  };
};

// --- MAP 5: VILLAGE (시골 마을) ---
const buildVillage = (): MapDefinition => {
  const w = 45;
  const h = 35;
  const base = createGrid(w, h, 3000);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'village',
    name: '🏘️ 시골 마을',
    width: w, height: h,
    tileset: 'village',
    baseLayer: base, decorLayer: decor, collision: coll,
    spawnPoints: [{ x: 22, y: 17 }]
  };
};

// --- MAP 6: WATER (해변 연못) ---
const buildWater = (): MapDefinition => {
  const w = 45;
  const h = 35;
  const base = createGrid(w, h, 7000);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'water',
    name: '🌊 해변 연못',
    width: w, height: h,
    tileset: 'water',
    baseLayer: base, decorLayer: decor, collision: coll,
    spawnPoints: [{ x: 22, y: 17 }]
  };
};

// --- MAP 7: FOREST (숲속 쉼터) ---
const buildForest = (): MapDefinition => {
  const w = 45;
  const h = 35;
  const base = createGrid(w, h, 6000);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id: 'forest',
    name: '🌲 숲속 쉼터',
    width: w, height: h,
    tileset: 'nature',
    baseLayer: base, decorLayer: decor, collision: coll,
    spawnPoints: [{ x: 22, y: 17 }]
  };
};

export const createCustomMap = (id: string, name: string, tileset: string = 'outdoor'): MapDefinition => {
  const w = 40;
  const h = 30;
  let baseTile = 2000;
  if (tileset === 'interior') baseTile = 1000;
  else if (tileset === 'village') baseTile = 3000;
  else if (tileset === 'wall') baseTile = 4000;
  else if (tileset === 'house') baseTile = 5000;
  else if (tileset === 'nature') baseTile = 6000;
  else if (tileset === 'water') baseTile = 7000;
  else if (tileset === 'field') baseTile = 8000;

  const base = createGrid(w, h, baseTile);
  const decor = createGrid(w, h, -1);
  const coll = createBoolGrid(w, h, false);
  for (let x = 0; x < w; x++) { coll[0][x] = true; coll[h - 1][x] = true; }
  for (let y = 0; y < h; y++) { coll[y][0] = true; coll[y][w - 1] = true; }

  return {
    id,
    name,
    width: w, height: h,
    tileset,
    baseLayer: base, decorLayer: decor, collision: coll,
    spawnPoints: [{ x: 20, y: 15 }]
  };
};

export const PRESET_MAP_TEMPLATES: Record<string, { name: string; builder: () => MapDefinition }> = {
  room: { name: '🏠 마이 룸', builder: buildMyRoom },
  subway: { name: '🚇 지하철역', builder: buildSubway },
  park: { name: '🌳 호수공원', builder: buildLakePark },
  apt: { name: '🏢 아파트 단지', builder: buildApartmentComplex },
  village: { name: '🏘️ 시골 마을', builder: buildVillage },
  water: { name: '🌊 해변 연못', builder: buildWater },
  forest: { name: '🌲 숲속 쉼터', builder: buildForest }
};

export const maps: Record<string, MapDefinition> = {
  room: buildMyRoom(),
  subway: buildSubway(),
  park: buildLakePark(),
  apt: buildApartmentComplex(),
  village: buildVillage(),
  water: buildWater(),
  forest: buildForest()
};
