import React, { useRef, useEffect, useState } from 'react';
import { type MapDefinition, type MapObjectInstance, getCharRowActions, getCharGridDimensions, getCharDisplaySize } from './MapData';
import type { PlayerState } from './syncManager';
import { getDyedSprite } from './spriteDyer';

// Image asset paths (relative to root)
import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';
import ninjaBlueUrl from '../assets/ninja_blue.png';
import samuraiBlueUrl from '../assets/samurai_blue.png';
import samuraiGreenUrl from '../assets/samurai_green.png';
import pigUrl from '../assets/pig.png';

import type { MapMemo } from '../types/memo';

interface CanvasGameProps {
  localPlayer: PlayerState;
  otherPlayers: Record<string, PlayerState>;
  offlinePlayers: Record<string, PlayerState>;
  currentMapId: string;
  chatBubbles: Record<string, { text: string; time: number }>;
  onMove: (x: number, y: number, dir: 'down' | 'up' | 'left' | 'right', isMoving: boolean) => void;
  onPlayerClick: (player: PlayerState) => void;
  
  // Memo Props
  memos?: MapMemo[];
  onInteractMemo?: (memo: MapMemo) => void;
  onCreateMemoRequest?: (x: number, y: number) => void;

  // Editor Props
  isEditMode: boolean;
  selectedTile: number;
  editLayer: 'base' | 'decor' | 'collision';
  onPaintTile: (tx: number, ty: number, tileIdx: number, layer: 'base' | 'decor' | 'collision') => void;
  mapData: MapDefinition;
  brushSize: number; // 1 = 1x1, 2 = 2x2, 3 = 3x3, etc.
  assetVersion?: number;
  reactionPrompt?: {
    fromId: string;
    fromName: string;
    emoji: string;
    expiresAt: number;
  } | null;
}

export const getTileDrawInfo = (idx: number, defaultTileset: string) => {
  if (idx === -1 || idx === undefined || idx === null) return null;
  let tilesetKey = defaultTileset;
  let localIdx = idx;

  try {
    const savedCustoms = localStorage.getItem('on_house_custom_map_tilesets');
    if (savedCustoms) {
      const customs: any[] = JSON.parse(savedCustoms);
      const sortedCustoms = [...customs].sort((a, b) => (b.prefix || 9000) - (a.prefix || 9000));
      for (const ct of sortedCustoms) {
        const p = ct.prefix || 9000;
        if (idx >= p) {
          return { tilesetKey: ct.id, localIdx: idx - p };
        }
      }
    }
  } catch (e) {}

  if (idx >= 8000) {
    tilesetKey = 'field';
    localIdx = idx - 8000;
  } else if (idx >= 7000) {
    tilesetKey = 'water';
    localIdx = idx - 7000;
  } else if (idx >= 6000) {
    tilesetKey = 'nature';
    localIdx = idx - 6000;
  } else if (idx >= 5000) {
    tilesetKey = 'house';
    localIdx = idx - 5000;
  } else if (idx >= 4000) {
    tilesetKey = 'wall';
    localIdx = idx - 4000;
  } else if (idx >= 3000) {
    tilesetKey = 'village';
    localIdx = idx - 3000;
  } else if (idx >= 2000) {
    tilesetKey = 'outdoor';
    localIdx = idx - 2000;
  } else if (idx >= 1000) {
    tilesetKey = 'interior';
    localIdx = idx - 1000;
  }

  return { tilesetKey, localIdx };
};

export const getTilesetInfo = (ts: string) => {
  try {
    const savedCustoms = localStorage.getItem('on_house_custom_map_tilesets');
    if (savedCustoms) {
      const customs: any[] = JSON.parse(savedCustoms);
      const found = customs.find(c => c.id === ts);
      if (found) {
        return {
          cols: found.cols || 16,
          rows: found.rows || 16,
          label: `🎨 ${found.name}`,
          prefix: found.prefix || 9000,
          url: found.url
        };
      }
    }
  } catch (e) {}

  switch (ts) {
    case 'interior':
      return { cols: 22, rows: 17, label: '🏠 실내 인테리어', prefix: 1000 };
    case 'outdoor':
      return { cols: 22, rows: 26, label: '🏙️ 실외 바닥/도시', prefix: 2000 };
    case 'village':
      return { cols: 20, rows: 12, label: '🌳 자연/마을 외곽', prefix: 3000 };
    case 'wall':
      return { cols: 10, rows: 11, label: '🧱 심플 벽', prefix: 4000 };
    case 'house':
      return { cols: 33, rows: 23, label: '🏡 가옥 외관', prefix: 5000 };
    case 'nature':
      return { cols: 24, rows: 21, label: '🌳 자연 환경', prefix: 6000 };
    case 'water':
      return { cols: 28, rows: 17, label: '🪵 강물/다리', prefix: 7000 };
    case 'field':
      return { cols: 5, rows: 15, label: '🌾 야외 소품/우물', prefix: 8000 };
    default:
      return { cols: 22, rows: 26, label: '🏙️ 실외 바닥/도시', prefix: 2000 };
  }
};

// Helper to compute camera bounds constraint (prevents displaying black void outside of map)
export const getCameraCoords = (
  px: number,
  py: number,
  map: MapDefinition,
  viewW: number,
  viewH: number,
  tileScale: number
) => {
  const vSize = 16 * tileScale;
  let cameraX = px * tileScale - viewW / 2 + vSize / 2;
  let cameraY = py * tileScale - viewH / 2 + vSize / 2;

  const maxCameraX = map.width * vSize - viewW;
  const maxCameraY = map.height * vSize - viewH;

  if (map.width * vSize > viewW) {
    cameraX = Math.max(0, Math.min(cameraX, maxCameraX));
  } else {
    cameraX = (map.width * vSize - viewW) / 2;
  }

  if (map.height * vSize > viewH) {
    cameraY = Math.max(0, Math.min(cameraY, maxCameraY));
  } else {
    cameraY = (map.height * vSize - viewH) / 2;
  }

  return {
    cameraX: Math.round(cameraX),
    cameraY: Math.round(cameraY),
    vSize
  };
};

// BFS Pathfinding Algorithm (calculates shortest path around obstacles to detour cleanly!)
export const findPathAroundObstacles = (
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  map: MapDefinition
): { x: number; y: number }[] => {
  let startTileX = Math.floor((startX + 8) / 16);
  let startTileY = Math.floor((startY + 8) / 16);
  let destTileX = Math.floor((targetX + 8) / 16);
  let destTileY = Math.floor((targetY + 8) / 16);

  // Clamp within map bounds
  startTileX = Math.max(0, Math.min(map.width - 1, startTileX));
  startTileY = Math.max(0, Math.min(map.height - 1, startTileY));
  destTileX = Math.max(0, Math.min(map.width - 1, destTileX));
  destTileY = Math.max(0, Math.min(map.height - 1, destTileY));

  if (startTileX === destTileX && startTileY === destTileY) {
    return [{ x: targetX, y: targetY }];
  }

  const isPassable = (tx: number, ty: number) => {
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return false;
    return map.collision[ty][tx] === 0;
  };

  // If destination tile is impassable, find nearest open neighbor
  if (!isPassable(destTileX, destTileY)) {
    const neighbors = [
      { x: destTileX + 1, y: destTileY },
      { x: destTileX - 1, y: destTileY },
      { x: destTileX, y: destTileY + 1 },
      { x: destTileX, y: destTileY - 1 }
    ];
    const openNeighbor = neighbors.find(n => isPassable(n.x, n.y));
    if (openNeighbor) {
      destTileX = openNeighbor.x;
      destTileY = openNeighbor.y;
    }
  }

  const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [
    { x: startTileX, y: startTileY, path: [] }
  ];
  const visited = new Set<string>();
  visited.add(`${startTileX},${startTileY}`);

  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 }
  ];

  let foundPath: { x: number; y: number }[] | null = null;
  let maxSteps = 1200;

  while (queue.length > 0 && maxSteps > 0) {
    maxSteps--;
    const curr = queue.shift()!;

    if (curr.x === destTileX && curr.y === destTileY) {
      foundPath = curr.path;
      break;
    }

    for (const d of dirs) {
      const nx = curr.x + d.x;
      const ny = curr.y + d.y;
      const key = `${nx},${ny}`;

      if (isPassable(nx, ny) && !visited.has(key)) {
        visited.add(key);
        queue.push({
          x: nx,
          y: ny,
          path: [...curr.path, { x: nx * 16, y: ny * 16 }]
        });
      }
    }
  }

  if (foundPath && foundPath.length > 0) {
    foundPath[foundPath.length - 1] = { x: targetX, y: targetY };
    return foundPath;
  }

  return [{ x: targetX, y: targetY }];
};

export const CanvasGame: React.FC<CanvasGameProps> = ({
  localPlayer,
  otherPlayers,
  offlinePlayers,
  currentMapId,
  chatBubbles,
  onMove,
  onPlayerClick,
  memos = [],
  onInteractMemo,
  onCreateMemoRequest,
  
  isEditMode,
  selectedTile,
  editLayer,
  onPaintTile,
  mapData,
  brushSize,
  assetVersion = 0,
  reactionPrompt
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Loaded assets state
  const [images, setImages] = useState<Record<string, HTMLImageElement> | null>(null);
  const [assetsLoaded, setAssetsLoaded] = useState(false);

  // Key states
  const keysPressed = useRef<Record<string, boolean>>({});

  // Editor Camera coordinates
  const editCameraX = useRef(0);
  const editCameraY = useRef(0);
  const isEditingInitialized = useRef(false);
  
  // Paint action states
  const isPainting = useRef(false);
  
  // Right-click drag camera panning state
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, camX: 0, camY: 0 });

  // Local player ref & Delta Time refs for smooth 60/120/144hz physics
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  const lastTimeRef = useRef<number>(performance.now());
  const lastSyncTimeRef = useRef<number>(0);
  const smoothRemotePosRef = useRef<Record<string, { x: number; y: number; isMoving: boolean }>>({});

  // Active animated visual particles (flying hearts, cheering claps, celebrate fireworks, flame effects)
  const particlesRef = useRef<Array<{
    id: string;
    type: 'heart' | 'cheer' | 'celebrate' | 'flame' | 'burst';
    startX: number;
    startY: number;
    targetX?: number;
    targetY?: number;
    icon: string;
    startTime: number;
    duration: number;
    offsetX?: number;
    arcOffset?: number;
    scale?: number;
  }>>([]);

  useEffect(() => {
    const handleSpawnParticle = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      const now = performance.now();
      const { type, fromPos, toPos } = detail;

      const tileScale = getTileScale();
      const vSize = 16 * tileScale;

      if (type === 'heart' && fromPos && toPos) {
        // Convert 16px map coordinates to scaled camera space (* tileScale)
        const sX = fromPos.x * tileScale + vSize / 2;
        const sY = fromPos.y * tileScale + vSize / 4;
        const tX = toPos.x * tileScale + vSize / 2;
        const tY = toPos.y * tileScale + vSize / 4;

        for (let i = 0; i < 4; i++) {
          particlesRef.current.push({
            id: 'heart_' + now + '_' + i,
            type: 'heart',
            startX: sX,
            startY: sY,
            targetX: tX,
            targetY: tY,
            icon: i % 2 === 0 ? '❤️' : '💖',
            startTime: now + i * 100,
            duration: 1150,
            arcOffset: (i - 1.5) * (24 * tileScale),
            scale: tileScale > 1.5 ? 1.2 : 1
          });
        }
      } else if (type === 'cheer' && fromPos) {
        const sX = fromPos.x * tileScale + vSize / 2;
        const sY = fromPos.y * tileScale + vSize / 4;

        const offsets = [
          { x: -16 * tileScale, y: -20 * tileScale, icon: '👏' },
          { x: 0, y: -32 * tileScale, icon: '👏' },
          { x: 16 * tileScale, y: -20 * tileScale, icon: '👏' }
        ];

        offsets.forEach((off, idx) => {
          particlesRef.current.push({
            id: 'cheer_' + now + '_' + idx,
            type: 'cheer',
            startX: sX,
            startY: sY,
            icon: off.icon,
            startTime: now + idx * 80,
            duration: 1600,
            offsetX: off.x,
            scale: tileScale > 1.5 ? 1.2 : 1
          });
        });
      } else if (type === 'celebrate') {
        // Celebrate / Fireworks burst around target friend character!
        const target = toPos || fromPos;
        if (target) {
          const sX = target.x * tileScale + vSize / 2;
          const sY = target.y * tileScale + vSize / 3;

          const icons = ['🎉', '🎆', '✨', '🎊', '⭐', '🎇', '✨', '🎉', '🎊', '⭐'];
          const count = icons.length;

          for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
            const radius = (20 + Math.random() * 25) * tileScale;
            particlesRef.current.push({
              id: 'celebrate_' + now + '_' + i,
              type: 'celebrate',
              startX: sX,
              startY: sY,
              targetX: sX + Math.cos(angle) * radius,
              targetY: sY + Math.sin(angle) * radius - (15 * tileScale),
              icon: icons[i],
              startTime: now + Math.random() * 120,
              duration: 1400,
              scale: tileScale > 1.5 ? 1.3 : 1
            });
          }
        }
      } else if (type === 'flame' && fromPos) {
        // Flame / Sizzling Fire effect around character
        const sX = fromPos.x * tileScale + vSize / 2;
        const sY = fromPos.y * tileScale + vSize / 2;

        const flameIcons = ['🔥', '💥', '🔥', '🔥'];
        const offsets = [
          { x: 0, y: 0, scale: 2.4 },
          { x: -12 * tileScale, y: 4 * tileScale, scale: 1.6 },
          { x: 12 * tileScale, y: 4 * tileScale, scale: 1.6 },
          { x: 0, y: -10 * tileScale, scale: 2.0 }
        ];

        flameIcons.forEach((icon, idx) => {
          particlesRef.current.push({
            id: 'flame_' + now + '_' + idx,
            type: 'flame',
            startX: sX,
            startY: sY,
            icon,
            startTime: now + idx * 60,
            duration: 1800,
            offsetX: offsets[idx].x,
            scale: offsets[idx].scale * (tileScale > 1.5 ? 1.1 : 1)
          });
        });
      }
    };

    const handleWalkTo = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.x !== undefined && detail.y !== undefined) {
        const p = localPlayerRef.current;
        const waypoints = findPathAroundObstacles(p.x, p.y, detail.x, detail.y, mapDataRef.current);
        autoWalkPathRef.current = {
          waypoints,
          onArrival: detail.onArrival
        };
      }
    };

    window.addEventListener('on_house_spawn_particle', handleSpawnParticle);
    window.addEventListener('on_house_walk_to', handleWalkTo);
    return () => {
      window.removeEventListener('on_house_spawn_particle', handleSpawnParticle);
      window.removeEventListener('on_house_walk_to', handleWalkTo);
    };
  }, []);

  const mapDataRef = useRef(mapData);
  useEffect(() => {
    mapDataRef.current = mapData;
  }, [mapData]);

  const autoWalkPathRef = useRef<{
    waypoints: { x: number; y: number }[];
    onArrival?: () => void;
  } | null>(null);

  useEffect(() => {
    // Only sync position from prop if map changed or if player is NOT moving locally
    const isMapChanged = localPlayerRef.current.mapId !== localPlayer.mapId;
    if (isMapChanged || !localPlayerRef.current.isMoving) {
      localPlayerRef.current = localPlayer;
    } else {
      // Preserve current smooth physics position (x, y) to prevent React state sync from pulling position backward
      localPlayerRef.current = {
        ...localPlayer,
        x: localPlayerRef.current.x,
        y: localPlayerRef.current.y,
        dir: localPlayerRef.current.dir,
        isMoving: localPlayerRef.current.isMoving
      };
    }
  }, [localPlayer]);

  // Mobile / Touch screen detector state
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => {
      const touchCapable = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      const smallScreen = window.innerWidth < 768;
      setIsMobile(touchCapable || smallScreen);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Dynamic Tile Scale factor based on viewport width (reduced for higher density and sharpness)
  const getTileScale = () => {
    if (dimensions.width < 768) return 1.5; // Mobile: 1.5x zoom
    return 2; // Desktop: 2x zoom (32px tiles - High Density HD map view!)
  };

  const handleVirtualDpadPress = (key: string, pressed: boolean) => {
    keysPressed.current[key] = pressed;
  };

  // Initialize edit camera to center on player when entering edit mode
  useEffect(() => {
    if (isEditMode) {
      const tileScale = getTileScale();
      const p = localPlayerRef.current;
      const vSize = 16 * tileScale;
      editCameraX.current = p.x * tileScale - dimensions.width / 2 + vSize / 2;
      editCameraY.current = p.y * tileScale - dimensions.height / 2 + vSize / 2;
      isEditingInitialized.current = true;
    } else {
      isEditingInitialized.current = false;
    }
  }, [isEditMode]);

  // Load assets once on mount & reload when sprite overrides change
  useEffect(() => {
    const loadAllAssets = () => {
      let overrides: Record<string, { url: string }> = {};
      try {
        const saved = localStorage.getItem('on_house_char_image_overrides');
        if (saved) overrides = JSON.parse(saved);
      } catch (e) {}

      const assets: Record<string, string> = {
        interior: interiorTilesUrl,
        outdoor: outdoorTilesUrl,
        village: villageTilesUrl,
        wall: wallTilesUrl,
        house: houseTilesUrl,
        nature: natureTilesUrl,
        water: waterTilesUrl,
        field: fieldTilesUrl,
        ninja_blue: overrides['ninja_blue']?.url || ninjaBlueUrl,
        samurai_blue: overrides['samurai_blue']?.url || samuraiBlueUrl,
        samurai_green: overrides['samurai_green']?.url || samuraiGreenUrl,
        pig: overrides['pig']?.url || pigUrl
      };

      // Add custom uploaded character sprites
      try {
        const customChars = localStorage.getItem('on_house_custom_char_sprites');
        if (customChars) {
          const list = JSON.parse(customChars);
          list.forEach((opt: { id: string; url: string }) => {
            assets[opt.id] = overrides[opt.id]?.url || opt.url;
          });
        }
      } catch (e) {}

      // Add custom uploaded map tilesets
      try {
        const customMaps = localStorage.getItem('on_house_custom_map_tilesets');
        if (customMaps) {
          const list = JSON.parse(customMaps);
          list.forEach((opt: { id: string; url: string }) => {
            assets[opt.id] = opt.url;
          });
        }
      } catch (e) {}

      const loadedImages: Record<string, HTMLImageElement> = {};
      let loadedCount = 0;
      const totalCount = Object.keys(assets).length;

      Object.entries(assets).forEach(([key, url]) => {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          loadedImages[key] = img;
          loadedCount++;
          if (loadedCount === totalCount) {
            setImages(loadedImages);
            setAssetsLoaded(true);
          }
        };
        img.onerror = () => {
          console.error(`Failed to load asset: ${key}`);
        };
      });
    };

    loadAllAssets();

    window.addEventListener('on_house_sprites_updated', loadAllAssets);
    return () => {
      window.removeEventListener('on_house_sprites_updated', loadAllAssets);
    };
  }, [assetVersion]);

  // State for Map Right-Click Context Menu
  const [mapContextMenu, setMapContextMenu] = useState<{ clientX: number; clientY: number; worldX: number; worldY: number } | null>(null);

  // Global dismiss listener for context menu on ANY click anywhere on screen
  useEffect(() => {
    if (!mapContextMenu) return;
    const handleGlobalClick = () => setMapContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [mapContextMenu]);

  // Keyboard input listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        // Prevent default scrolling for arrow keys/WASD & dismiss context menu
        e.preventDefault();
        keysPressed.current[key] = true;
        setMapContextMenu(null);
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setMapContextMenu(null);
        // Spacebar memo pickup check
        if (memos && memos.length > 0 && localPlayerRef.current) {
          const p = localPlayerRef.current;
          const nearbyMemo = memos.find(m => {
            if (m.mapId !== currentMapId) return false;
            const dist = Math.hypot(p.x - m.x, p.y - m.y);
            return dist <= 38;
          });
          if (nearbyMemo) {
            onInteractMemo?.(nearbyMemo);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        keysPressed.current = {};
        return;
      }

      const key = e.key.toLowerCase();
      if (keysPressed.current[key]) {
        keysPressed.current[key] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [memos, currentMapId, onInteractMemo]);

  // Window resize handler
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Bounding box collision checker
  const checkCollision = (px: number, py: number, map: MapDefinition): boolean => {
    const box = {
      left: px + 3,
      right: px + 13,
      top: py + 10,
      bottom: py + 16
    };

    const tileLeft = Math.floor(box.left / 16);
    const tileRight = Math.floor(box.right / 16);
    const tileTop = Math.floor(box.top / 16);
    const tileBottom = Math.floor(box.bottom / 16);

    // Map boundaries check
    if (tileLeft < 0 || tileRight >= map.width || tileTop < 0 || tileBottom >= map.height) {
      return true;
    }

    // Check cells inside the bounding box
    for (let ty = tileTop; ty <= tileBottom; ty++) {
      for (let tx = tileLeft; tx <= tileRight; tx++) {
        if (map.collision[ty][tx]) {
          return true;
        }
      }
    }
    return false;
  };

  // Main game logic loop (Physics & Rendering)
  useEffect(() => {
    if (!assetsLoaded || !images || !canvasRef.current) return;

    let animId: number;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const map = mapData;

    // Physics update function with Delta Time (dt) for 100% smooth, frame-rate independent movement
    const updatePhysics = (dt: number) => {
      const p = localPlayerRef.current;

      // EDIT MODE CAMERA PANNING CONTROL
      if (isEditMode) {
        if (isPanning.current) return;

        const scrollSpeed = 240 * dt; // 240px/sec
        let cdx = 0;
        let cdy = 0;
        if (keysPressed.current['w'] || keysPressed.current['arrowup']) cdy = -scrollSpeed;
        else if (keysPressed.current['s'] || keysPressed.current['arrowdown']) cdy = scrollSpeed;

        if (keysPressed.current['a'] || keysPressed.current['arrowleft']) cdx = -scrollSpeed;
        else if (keysPressed.current['d'] || keysPressed.current['arrowright']) cdx = scrollSpeed;

        editCameraX.current += cdx;
        editCameraY.current += cdy;

        constrainEditCamera();
        return;
      }

      // NORMAL PLAYER MOVEMENT PHYSICS
      const spawnX = (map.spawnPoints[0]?.x ?? Math.floor(map.width / 2)) * 16;
      const spawnY = (map.spawnPoints[0]?.y ?? Math.floor(map.height / 2)) * 16;
      if (p.x < 0 || p.x > (map.width - 1) * 16 || p.y < 0 || p.y > (map.height - 1) * 16) {
        onMove(spawnX, spawnY, 'down', false);
        return;
      }

      const moveUp = keysPressed.current['w'] || keysPressed.current['arrowup'];
      const moveDown = keysPressed.current['s'] || keysPressed.current['arrowdown'];
      const moveLeft = keysPressed.current['a'] || keysPressed.current['arrowleft'];
      const moveRight = keysPressed.current['d'] || keysPressed.current['arrowright'];

      if (moveUp || moveDown || moveLeft || moveRight) {
        autoWalkPathRef.current = null;
      }

      // AUTOMATIC WALK WAYPOINT PATH (A* / BFS Pathfinding Around Obstacles!)
      if (autoWalkPathRef.current && autoWalkPathRef.current.waypoints.length > 0) {
        const pathData = autoWalkPathRef.current;
        const currentTarget = pathData.waypoints[0];
        const diffX = currentTarget.x - p.x;
        const diffY = currentTarget.y - p.y;
        const dist = Math.sqrt(diffX * diffX + diffY * diffY);

        if (dist > 6) {
          const moveSpeed = 120 * dt; // Smooth walk speed (120px/s)
          const nx = diffX / dist;
          const ny = diffY / dist;

          let walkDir: 'up' | 'down' | 'left' | 'right' = 'right';
          if (Math.abs(diffX) > Math.abs(diffY)) {
            walkDir = diffX > 0 ? 'right' : 'left';
          } else {
            walkDir = diffY > 0 ? 'down' : 'up';
          }

          const nextX = p.x + nx * moveSpeed;
          const nextY = p.y + ny * moveSpeed;

          let finalX = p.x;
          let finalY = p.y;

          if (!checkCollision(nextX, p.y, map)) {
            finalX = nextX;
          }
          if (!checkCollision(p.x, nextY, map)) {
            finalY = nextY;
          }

          if (finalX === p.x && finalY === p.y) {
            autoWalkPathRef.current = null;
            localPlayerRef.current = {
              ...p,
              dir: walkDir,
              isMoving: false
            };
            onMove(p.x, p.y, walkDir, false);
            return;
          }

          localPlayerRef.current = {
            ...p,
            x: finalX,
            y: finalY,
            dir: walkDir,
            isMoving: true
          };
          onMove(finalX, finalY, walkDir, true);
          return;
        } else {
          // Reached current waypoint tile! Pop it off queue
          pathData.waypoints.shift();

          if (pathData.waypoints.length === 0) {
            // Reached final destination!
            const onArrivalFunc = pathData.onArrival;
            autoWalkPathRef.current = null;

            localPlayerRef.current = {
              ...p,
              x: currentTarget.x,
              y: currentTarget.y,
              isMoving: false
            };
            onMove(currentTarget.x, currentTarget.y, p.dir, false);

            if (onArrivalFunc) {
              onArrivalFunc();
            }
            return;
          }
        }
      }

      // Walk speed: 96 pixels per second (smooth 1.6px per frame at 60fps)
      const MOVE_SPEED = 96;
      const moveDist = MOVE_SPEED * dt;

      let dx = 0;
      let dy = 0;

      if (moveUp) dy -= moveDist;
      if (moveDown) dy += moveDist;
      if (moveLeft) dx -= moveDist;
      if (moveRight) dx += moveDist;

      let newDir = p.dir;

      if (dx !== 0 || dy !== 0) {
        if (dx === 0 && dy < 0) newDir = 'up';
        else if (dx === 0 && dy > 0) newDir = 'down';
        else if (dy === 0 && dx < 0) newDir = 'left';
        else if (dy === 0 && dx > 0) newDir = 'right';
        else {
          if (dy < 0 && p.dir === 'up') newDir = 'up';
          else if (dy > 0 && p.dir === 'down') newDir = 'down';
          else if (dx < 0 && p.dir === 'left') newDir = 'left';
          else if (dx > 0 && p.dir === 'right') newDir = 'right';
          else if (dy < 0) newDir = 'up';
          else if (dy > 0) newDir = 'down';
        }
      }

      // Normalize diagonal speed
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      const isMoving = dx !== 0 || dy !== 0;
      let newX = p.x + dx;
      let newY = p.y + dy;

      if (isMoving) {
        let finalX = p.x;
        let finalY = p.y;

        if (!checkCollision(newX, p.y, map)) {
          finalX = newX;
        }
        if (!checkCollision(p.x, newY, map)) {
          finalY = newY;
        }

        const moved = finalX !== p.x || finalY !== p.y;

        // Instantly update local ref for 60/120/144fps smooth canvas rendering
        localPlayerRef.current = {
          ...p,
          x: finalX,
          y: finalY,
          dir: newDir,
          isMoving: moved
        };

        // Throttle React state & BroadcastChannel network sync to ~33ms (30fps) or state change
        const nowTime = performance.now();
        const stateChanged = !p.isMoving || p.dir !== newDir;
        const timeElapsed = nowTime - lastSyncTimeRef.current > 33;

        if (stateChanged || timeElapsed) {
          lastSyncTimeRef.current = nowTime;
          onMove(finalX, finalY, newDir, moved);
        }
      } else if (p.isMoving) {
        localPlayerRef.current = {
          ...p,
          isMoving: false
        };
        onMove(p.x, p.y, p.dir, false);
      }
    };

    // Constrain camera position helper
    const constrainEditCamera = () => {
      const tileScale = getTileScale();
      const vSize = 16 * tileScale;
      const maxCameraX = map.width * vSize - dimensions.width;
      const maxCameraY = map.height * vSize - dimensions.height;

      if (map.width * vSize > dimensions.width) {
        editCameraX.current = Math.max(0, Math.min(editCameraX.current, maxCameraX));
      } else {
        editCameraX.current = (map.width * vSize - dimensions.width) / 2;
      }

      if (map.height * vSize > dimensions.height) {
        editCameraY.current = Math.max(0, Math.min(editCameraY.current, maxCameraY));
      } else {
        editCameraY.current = (map.height * vSize - dimensions.height) / 2;
      }
    };

    // Render loop
    const render = () => {
      const now = performance.now();
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05); // max 50ms per frame
      lastTimeRef.current = now;

      updatePhysics(dt);

      const dpr = window.devicePixelRatio || 1;

      // Setup Camera
      const p = localPlayerRef.current;
      const tileScale = getTileScale();
      
      let cameraX = 0;
      let cameraY = 0;
      let vSize = 16 * tileScale;

      if (isEditMode) {
        if (isPanning.current) {
          constrainEditCamera();
        }
        cameraX = editCameraX.current;
        cameraY = editCameraY.current;
      } else {
        const coords = getCameraCoords(p.x, p.y, map, dimensions.width, dimensions.height, tileScale);
        cameraX = coords.cameraX;
        cameraY = coords.cameraY;
      }

      // Save context for DPR scaling
      ctx.save();
      ctx.scale(dpr, dpr);

      // Draw background
      ctx.fillStyle = '#0f0f15';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Save context for camera translation
      ctx.save();
      ctx.translate(-cameraX, -cameraY);

      // Disable image smoothing for crisp pixel rendering (cross-browser)
      ctx.imageSmoothingEnabled = false;

      // 1. Draw Base Floor Layer
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tileIdx = map.baseLayer[ty][tx];
          const drawInfo = getTileDrawInfo(tileIdx, map.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
              const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
              const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));
              const srcX = (drawInfo.localIdx % tsInfo.cols) * tileW;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * tileH;
              ctx.drawImage(
                img,
                srcX, srcY, tileW, tileH,
                tx * vSize, ty * vSize, vSize, vSize
              );
            }
          }
        }
      }

      // 2. Prepare Y-Sorted Characters List
      const renderList: PlayerState[] = [p];

      Object.values(otherPlayers).forEach((op) => {
        if (op.mapId === currentMapId && op.id !== p.id && op.nickname !== p.nickname) {
          let smooth = smoothRemotePosRef.current[op.id];
          if (!smooth) {
            smooth = { x: op.x, y: op.y, isMoving: op.isMoving };
            smoothRemotePosRef.current[op.id] = smooth;
          }

          const dx = op.x - smooth.x;
          const dy = op.y - smooth.y;
          const dist = Math.hypot(dx, dy);

          if (dist > 160) {
            smooth.x = op.x;
            smooth.y = op.y;
            smooth.isMoving = op.isMoving;
          } else {
            const lerpFactor = 0.28;
            smooth.x += dx * lerpFactor;
            smooth.y += dy * lerpFactor;
            smooth.isMoving = dist > 0.5 || op.isMoving;
          }

          renderList.push({
            ...op,
            x: smooth.x,
            y: smooth.y,
            isMoving: smooth.isMoving
          });
        }
      });

      Object.values(offlinePlayers).forEach((offp) => {
        if (offp.mapId === currentMapId && offp.id !== p.id && offp.nickname !== p.nickname && !otherPlayers[offp.id]) {
          renderList.push(offp);
        }
      });

      renderList.sort((a, b) => a.y - b.y);

      // Helper to render a single player on canvas
      const renderPlayer = (player: PlayerState) => {
        const spriteSheet = images[player.spriteType] || images['ninja_blue'];
        if (!spriteSheet) return;

        const dyedSpriteSheet = getDyedSprite(spriteSheet, player.hue, player.isOnline);

        // Calculate sprite sheet grid bounds dynamically from character dimension rules & image size
        const { cols: gridCols, rows: gridRows } = getCharGridDimensions(player.spriteType);
        const maxCols = Math.max(1, gridCols);
        const maxRows = Math.max(1, gridRows);

        const tileW = spriteSheet.width / maxCols;
        const tileH = spriteSheet.height / maxRows;

        const isEmoting = !!(player.emoteUntil && Date.now() < player.emoteUntil && player.currentEmote);
        const charRowActions = getCharRowActions(player.spriteType);

        // Check if player's current statusMessage matches any registered character action row
        const statusText = player.statusMessage ? player.statusMessage.trim() : '';
        const statusRowIdx = statusText
          ? charRowActions.findIndex(
              (act) =>
                act.trim() &&
                (act.trim().toLowerCase() === statusText.toLowerCase() ||
                  statusText.toLowerCase().includes(act.trim().toLowerCase()) ||
                  act.trim().toLowerCase().includes(statusText.toLowerCase()))
            )
          : -1;

        let col = 0; // Down
        if (player.dir === 'up') col = 1;
        else if (player.dir === 'left') col = 2;
        else if (player.dir === 'right') col = 3;

        let row = 0; // Idle frame (Row 0 = 대기)

        if (isEmoting && player.currentEmote) {
          const emoteRowIdx = charRowActions.findIndex(act => act === player.currentEmote);
          if (emoteRowIdx >= 0 && emoteRowIdx < maxRows) {
            row = emoteRowIdx;
          } else {
            row = Math.min(6, maxRows - 1);
          }
          col = maxCols > 1 ? Math.floor(Date.now() / 140) % maxCols : 0;
        } else if (player.isMoving) {
          if (maxRows > 1) {
            const walkCycle = [1, 2, 3, 2];
            const walkIdx = Math.floor(Date.now() / 120) % walkCycle.length;
            row = Math.min(walkCycle[walkIdx], maxRows - 1);
            col = col % maxCols;
          } else {
            row = 0;
            col = Math.floor(Date.now() / 150) % maxCols;
          }
        } else if (statusRowIdx >= 0 && statusRowIdx < maxRows) {
          row = statusRowIdx;
          col = maxCols > 1 ? Math.floor(Date.now() / 180) % maxCols : 0;
        } else {
          row = 0;
          col = col % maxCols;
        }

        col = Math.min(col, maxCols - 1);
        row = Math.min(row, maxRows - 1);

        const charDrawX = Math.round(player.x * tileScale);
        const charDrawY = Math.round(player.y * tileScale);

        const isOffline = !player.isOnline || player.statusMessage === '오프라인';

        ctx.save();

        if (isOffline) {
          ctx.filter = 'grayscale(100%) opacity(0.45)';
        } else {
          ctx.filter = 'none';
        }

        const baseCharSize = player.charSize || getCharDisplaySize(player.spriteType) || 16;
        const charDrawW = Math.round((baseCharSize / 16) * vSize);
        const charDrawH = Math.round((baseCharSize / 16) * vSize);

        const drawX = Math.round(charDrawX - (charDrawW - vSize) / 2);
        const drawY = Math.round(charDrawY - (charDrawH - vSize));

        if (maxRows === 1) {
          const centerX = drawX + charDrawW / 2;
          const centerY = drawY + charDrawH / 2;
          ctx.translate(centerX, centerY);

          if (player.dir === 'right') {
            ctx.scale(-1, 1);
          }

          if (player.dir === 'up') {
            const waddle = player.isMoving ? Math.sin(Date.now() / 80) * 0.1 : 0;
            ctx.rotate(-0.2 + waddle);
            ctx.scale(0.95, 1.05);
          } else if (player.dir === 'down') {
            const waddle = player.isMoving ? Math.sin(Date.now() / 80) * 0.1 : 0;
            ctx.rotate(0.2 + waddle);
            ctx.scale(1.05, 0.95);
          } else if (player.isMoving) {
            const waddle = Math.sin(Date.now() / 70) * 0.12;
            ctx.rotate(waddle);
          }

          ctx.drawImage(
            dyedSpriteSheet,
            col * tileW, row * tileH, tileW, tileH,
            -charDrawW / 2, -charDrawH / 2, charDrawW, charDrawH
          );
        } else {
          ctx.drawImage(
            dyedSpriteSheet,
            col * tileW, row * tileH, tileW, tileH,
            drawX, drawY, charDrawW, charDrawH
          );
        }

        ctx.filter = 'none';
        ctx.restore();

        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const headCenterX = drawX + charDrawW / 2;
        let currentY = drawY - 8;

        ctx.font = '10px "DungGeunMo", monospace';
        const isMobileUser = player.isMobile;
        const nameText = `${isMobileUser ? '📱 ' : ''}${player.nickname}`;
        const nameWidth = ctx.measureText(nameText).width + 8;
        
        ctx.fillStyle = isOffline ? 'rgba(30, 30, 40, 0.85)' : 'rgba(15, 15, 25, 0.75)';
        ctx.fillRect(headCenterX - nameWidth / 2, currentY - 7, nameWidth, 14);

        ctx.fillStyle = player.id === localPlayerRef.current.id 
          ? (isOffline ? '#d0a0c0' : '#f5c2e7')
          : (!isOffline ? '#ffffff' : '#a6adc8');
        ctx.fillText(nameText, headCenterX, currentY);

        currentY -= 16;

        if (player.id === localPlayerRef.current.id && reactionPrompt && Date.now() < reactionPrompt.expiresAt) {
          ctx.font = 'bold 11px "DungGeunMo", monospace';
          const promptText = `(F) 상호작용 ${reactionPrompt.emoji}`;
          const pWidth = ctx.measureText(promptText).width + 12;

          const pulse = Math.sin(Date.now() / 120) * 0.15 + 0.85;
          ctx.fillStyle = `rgba(139, 92, 246, ${pulse})`;
          ctx.strokeStyle = '#fab387';
          ctx.lineWidth = 1.5;

          ctx.beginPath();
          ctx.roundRect(headCenterX - pWidth / 2, currentY - 8, pWidth, 16, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(promptText, headCenterX, currentY);

          currentY -= 18;
        }

        if (isEmoting && player.currentEmote) {
          ctx.font = '10px "DungGeunMo", monospace';
          const emoteDisplay = `✨ [${player.currentEmote}]`;
          const emoteWidth = ctx.measureText(emoteDisplay).width + 10;

          ctx.fillStyle = 'rgba(245, 194, 231, 0.95)';
          ctx.beginPath();
          ctx.roundRect(headCenterX - emoteWidth / 2, currentY - 7, emoteWidth, 14, 4);
          ctx.fill();

          ctx.fillStyle = '#11111b';
          ctx.fillText(emoteDisplay, headCenterX, currentY);

          currentY -= 16;
        }

        const statusMsg = player.statusMessage;
        if (statusMsg) {
          ctx.font = '10px "DungGeunMo", monospace';
          const statusDisplay = `${!player.isOnline ? '💤' : '⚡'} ${statusMsg}`;
          const badgeWidth = ctx.measureText(statusDisplay).width + 8;

          ctx.fillStyle = !player.isOnline ? 'rgba(40, 40, 50, 0.85)' : 'rgba(139, 92, 246, 0.85)';
          ctx.beginPath();
          ctx.roundRect(headCenterX - badgeWidth / 2, currentY - 7, badgeWidth, 14, 4);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.fillText(statusDisplay, headCenterX, currentY);

          currentY -= 16;
        }

        const chat = chatBubbles[player.id];
        if (chat && Date.now() - chat.time < 4000 && !chat.text.startsWith('/')) {
          ctx.font = '11px Arial';
          const padding = 8;
          const bubbleWidth = ctx.measureText(chat.text).width + padding * 2;
          const bubbleHeight = 22;
          const bubbleY = currentY - 10;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1;
          
          ctx.beginPath();
          ctx.roundRect(headCenterX - bubbleWidth / 2, bubbleY - bubbleHeight / 2, bubbleWidth, bubbleHeight, 6);
          ctx.fill();
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(headCenterX - 4, bubbleY + bubbleHeight / 2);
          ctx.lineTo(headCenterX, bubbleY + bubbleHeight / 2 + 4);
          ctx.lineTo(headCenterX + 4, bubbleY + bubbleHeight / 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#11111b';
          ctx.fillText(chat.text, headCenterX, bubbleY);
        }

        ctx.restore();
      };

      // 3. Render Layer 2 Decor Tiles, Objects & Players Interleaved Row by Row (Y-Depth Sorting!)
      const objectTilesSet = new Set<string>();
      const objectRootRowMap: Record<number, MapObjectInstance[]> = {};

      if (map.objects && map.objects.length > 0) {
        map.objects.forEach((obj) => {
          const rootRow = obj.y + obj.height - 1;
          if (!objectRootRowMap[rootRow]) {
            objectRootRowMap[rootRow] = [];
          }
          objectRootRowMap[rootRow].push(obj);

          // Track tile cells owned by this object
          for (let ody = 0; ody < obj.height; ody++) {
            for (let odx = 0; odx < obj.width; odx++) {
              objectTilesSet.add(`${obj.x + odx}_${obj.y + ody}`);
            }
          }
        });
      }

      let renderPlayerIdx = 0;
      for (let ty = 0; ty < map.height; ty++) {
        // A. Render Standalone Layer 2 Decor Tiles for current row ty
        for (let tx = 0; tx < map.width; tx++) {
          const tileIdx = map.decorLayer[ty][tx];
          const drawInfo = getTileDrawInfo(tileIdx, map.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfo(drawInfo.tilesetKey);
              const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
              const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));
              const srcX = (drawInfo.localIdx % tsInfo.cols) * tileW;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * tileH;
              ctx.drawImage(
                img,
                srcX, srcY, tileW, tileH,
                tx * vSize, ty * vSize, vSize, vSize
              );
            }
          }
        }

        // B. Render Objects rooted at this row (ty), sorted by zIndex ascending
        const objectsAtRow = objectRootRowMap[ty];
        if (objectsAtRow && objectsAtRow.length > 0) {
          const sortedObjs = [...objectsAtRow].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
          sortedObjs.forEach((obj) => {
            const tsInfo = getTilesetInfo(obj.tilesetKey);
            const img = images[obj.tilesetKey];
            if (img && tsInfo) {
              const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
              const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));
              for (let ody = 0; ody < obj.height; ody++) {
                for (let odx = 0; odx < obj.width; odx++) {
                  const targetTx = obj.x + odx;
                  const targetTy = obj.y + ody;
                  if (targetTx >= 0 && targetTx < map.width && targetTy >= 0 && targetTy < map.height) {
                    const localIdx = (obj.startRow + ody) * tsInfo.cols + (obj.startCol + odx);
                    const srcX = (localIdx % tsInfo.cols) * tileW;
                    const srcY = Math.floor(localIdx / tsInfo.cols) * tileH;
                    ctx.drawImage(
                      img,
                      srcX, srcY, tileW, tileH,
                      targetTx * vSize, targetTy * vSize, vSize, vSize
                    );
                  }
                }
              }
            }
          });
        }

        // C. Render all players whose feet Y falls within or before current row ty
        const rowBottomY = (ty + 1) * 16;
        while (renderPlayerIdx < renderList.length && renderList[renderPlayerIdx].y < rowBottomY) {
          renderPlayer(renderList[renderPlayerIdx]);
          renderPlayerIdx++;
        }
      }

      // Render any remaining players beyond bottom map boundary
      while (renderPlayerIdx < renderList.length) {
        renderPlayer(renderList[renderPlayerIdx]);
        renderPlayerIdx++;
      }

      // 4. Render Animated Visual Particles (Flying Hearts & Cheering Claps)
      const nowTime = performance.now();
      particlesRef.current = particlesRef.current.filter((pt) => {
        if (nowTime < pt.startTime) return true;
        const elapsed = (nowTime - pt.startTime) / pt.duration;
        if (elapsed >= 1) return false;

        const progress = Math.min(1, Math.max(0, elapsed));

        let px = pt.startX;
        let py = pt.startY;
        let scale = pt.scale || 1;
        let opacity = 1;

        if (pt.type === 'heart' && pt.targetX !== undefined && pt.targetY !== undefined) {
          const tScale = getTileScale();
          // Curved quadratic Bezier trajectory from startX/Y to targetX/Y
          const midX = (pt.startX + pt.targetX) / 2 + (pt.arcOffset || 0);
          const midY = Math.min(pt.startY, pt.targetY) - (35 * tScale);

          const t1 = 1 - progress;
          px = t1 * t1 * pt.startX + 2 * t1 * progress * midX + progress * progress * pt.targetX;
          py = t1 * t1 * pt.startY + 2 * t1 * progress * midY + progress * progress * pt.targetY;

          scale = (pt.scale || 1) + Math.sin(progress * Math.PI) * 0.4;
          opacity = progress > 0.85 ? (1 - progress) / 0.15 : 1;
        } else if (pt.type === 'cheer') {
          const tScale = getTileScale();
          // Floating upward with bounce
          px = pt.startX + (pt.offsetX || 0);
          py = pt.startY - (10 * tScale) - progress * (28 * tScale) + Math.sin(progress * Math.PI * 3) * 3;
          scale = (pt.scale || 1.1) + Math.sin(progress * Math.PI) * 0.3;
          opacity = progress > 0.7 ? (1 - progress) / 0.3 : 1;
        } else if (pt.type === 'celebrate' && pt.targetX !== undefined && pt.targetY !== undefined) {
          const tScale = getTileScale();
          // Fireworks explosion burst trajectory with gravity drop
          px = pt.startX + (pt.targetX - pt.startX) * progress;
          py = pt.startY + (pt.targetY - pt.startY) * progress + (progress * progress * 22 * tScale);
          scale = (pt.scale || 1.3) * Math.sin(progress * Math.PI) * 1.4;
          opacity = progress > 0.75 ? (1 - progress) / 0.25 : 1;
        } else if (pt.type === 'flame') {
          const tScale = getTileScale();
          // Character-sized roaring flame flickering & blazing upward
          px = pt.startX + (pt.offsetX || 0) + Math.sin(progress * Math.PI * 12) * (4 * tScale);
          py = pt.startY + (4 * tScale) - (progress * 24 * tScale);
          scale = (pt.scale || 2.2) * (0.85 + Math.sin(progress * Math.PI) * 0.4);
          opacity = progress > 0.8 ? (1 - progress) / 0.2 : (0.85 + Math.sin(progress * Math.PI * 14) * 0.15);
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
        ctx.font = `${Math.round(18 * scale)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pt.icon, px, py);
        ctx.restore();

        return true;
      });

      ctx.restore(); // Restore camera translation
      ctx.restore(); // Restore DPR scaling

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [assetsLoaded, images, currentMapId, dimensions, otherPlayers, offlinePlayers, chatBubbles, isEditMode, mapData]);

  // Click on Canvas handler to interact with characters, memos, or walk to floor destination
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isEditMode) return; // Disable DMs while building!
    if (!canvasRef.current || !localPlayer) return;

    // Always dismiss context menu if open
    setMapContextMenu(null);

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileScale = getTileScale();
    const { cameraX, cameraY, vSize } = getCameraCoords(localPlayer.x, localPlayer.y, mapData, dimensions.width, dimensions.height, tileScale);

    const gameX = clickX + cameraX;
    const gameY = clickY + cameraY;

    // 1. Check if another player was clicked
    const candidates: { player: PlayerState; dist: number }[] = [];

    const checkCandidate = (p: PlayerState) => {
      const px = p.x * tileScale + vSize / 2;
      const py = p.y * tileScale + vSize / 2;
      const dist = Math.sqrt((gameX - px) ** 2 + (gameY - py) ** 2);
      if (dist < 28) {
        candidates.push({ player: p, dist });
      }
    };

    Object.values(otherPlayers).forEach((op) => {
      if (op.mapId === currentMapId && op.id !== localPlayer.id && op.nickname !== localPlayer.nickname) {
        checkCandidate(op);
      }
    });

    Object.values(offlinePlayers).forEach((offp) => {
      if (offp.mapId === currentMapId && offp.id !== localPlayer.id && offp.nickname !== localPlayer.nickname && !otherPlayers[offp.id]) {
        checkCandidate(offp);
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.dist - b.dist);
      onPlayerClick(candidates[0].player);
      return;
    }

    // 2. Check if a Map Memo was clicked
    if (memos && memos.length > 0) {
      const clickedMemo = memos.find((m) => {
        if (m.mapId !== currentMapId) return false;
        const mx = m.x * tileScale + vSize / 2;
        const my = m.y * tileScale + vSize / 2;
        const dist = Math.hypot(gameX - mx, gameY - my);
        return dist < 24;
      });

      if (clickedMemo) {
        window.dispatchEvent(new CustomEvent('on_house_walk_to', {
          detail: {
            x: clickedMemo.x,
            y: clickedMemo.y,
            onArrival: () => {
              onInteractMemo?.(clickedMemo);
            }
          }
        }));
        return;
      }
    }

    // 3. Otherwise: Mouse Click Walk to floor destination (with BFS pathfinding!)
    const targetX = Math.round(gameX / tileScale - 8);
    const targetY = Math.round(gameY / tileScale - 8);

    const clampedX = Math.max(0, Math.min(mapData.width * 16 - 16, targetX));
    const clampedY = Math.max(0, Math.min(mapData.height * 16 - 16, targetY));

    window.dispatchEvent(new CustomEvent('on_house_walk_to', {
      detail: { x: clampedX, y: clampedY }
    }));
  };

  // Editor: Paint tile trigger with Brush Size support!
  const handlePaintAtCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isEditMode || !canvasRef.current || isPanning.current) return;
    
    // Check if it is a right click (we should ignore painting if panning)
    if ('button' in e && (e.button === 2 || e.button === 1)) {
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const tileScale = getTileScale();
    const vSize = 16 * tileScale;

    // Use current edit camera values
    const cameraX = editCameraX.current;
    const cameraY = editCameraY.current;

    const gameX = clickX + cameraX;
    const gameY = clickY + cameraY;

    const tx = Math.floor(gameX / vSize);
    const ty = Math.floor(gameY / vSize);

    // Brush painting grid block based on brushSize
    const half = Math.floor(brushSize / 2);
    
    // Draw brush box centered around click
    for (let dy = -half; dy <= (brushSize % 2 === 0 ? half - 1 : half); dy++) {
      for (let dx = -half; dx <= (brushSize % 2 === 0 ? half - 1 : half); dx++) {
        const ptx = tx + dx;
        const pty = ty + dy;
        
        if (ptx >= 0 && ptx < mapData.width && pty >= 0 && pty < mapData.height) {
          onPaintTile(ptx, pty, selectedTile, editLayer);
        }
      }
    }
  };

  // Context menu handler for Right-Click on Map Floor to show "📝 이 위치에 메모 남기기"
  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (isEditMode) return;

    if (!canvasRef.current || !localPlayer) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileScale = getTileScale();
    const { cameraX, cameraY } = getCameraCoords(localPlayer.x, localPlayer.y, mapData, dimensions.width, dimensions.height, tileScale);

    const gameX = clickX + cameraX;
    const gameY = clickY + cameraY;

    const targetX = Math.round(gameX / tileScale - 8);
    const targetY = Math.round(gameY / tileScale - 8);

    const clampedX = Math.max(0, Math.min(mapData.width * 16 - 16, targetX));
    const clampedY = Math.max(0, Math.min(mapData.height * 16 - 16, targetY));

    setMapContextMenu({
      clientX: e.clientX,
      clientY: e.clientY,
      worldX: clampedX,
      worldY: clampedY
    });
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {!assetsLoaded && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          background: '#12121e', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', zIndex: 10
        }}>
          <div className="pixel-text" style={{ fontSize: '20px', marginBottom: '10px' }}>
            픽셀 에셋 불러오는 중...
          </div>
          <div style={{
            width: '200px', height: '10px', background: '#1e1e2e',
            borderRadius: '5px', overflow: 'hidden'
          }}>
            <div style={{
              width: '100%', height: '100%', background: '#8b5cf6',
              animation: 'pulse-glow 1.5s infinite'
            }} />
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={dimensions.width * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)}
        height={dimensions.height * (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)}
        onClick={handleCanvasClick}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => {
          if (isEditMode && (e.button === 2 || e.button === 1)) {
            // Right or middle click: start camera panning!
            e.preventDefault();
            isPanning.current = true;
            panStart.current = {
              x: e.clientX,
              y: e.clientY,
              camX: editCameraX.current,
              camY: editCameraY.current
            };
          } else {
            // Left click: Paint tile
            isPainting.current = true;
            handlePaintAtCoords(e);
          }
        }}
        onMouseMove={(e) => {
          if (isEditMode && isPanning.current) {
            // Panning: scroll camera view
            const dx = e.clientX - panStart.current.x;
            const dy = e.clientY - panStart.current.y;
            editCameraX.current = panStart.current.camX - dx;
            editCameraY.current = panStart.current.camY - dy;
          } else if (isPainting.current) {
            // Drag-painting
            handlePaintAtCoords(e);
          }
        }}
        onMouseUp={(e) => {
          if (e.button === 2 || e.button === 1) {
            isPanning.current = false;
          } else {
            isPainting.current = false;
          }
        }}
        onMouseLeave={() => {
          isPainting.current = false;
          isPanning.current = false;
        }}
        onTouchStart={(e) => {
          // On mobile, simple single touch is painting
          isPainting.current = true;
          handlePaintAtCoords(e);
        }}
        onTouchMove={(e) => {
          if (isPainting.current) handlePaintAtCoords(e);
        }}
        onTouchEnd={() => { isPainting.current = false; }}
        className="pixelated"
        style={{ display: 'block', cursor: isEditMode ? (isPanning.current ? 'grabbing' : 'crosshair') : 'pointer', width: '100%', height: '100%' }}
      />

      {/* Mobile virtual directional key overlay */}
      {isMobile && (
        <div style={{
          position: 'absolute', left: '12px', bottom: '125px', width: '115px', height: '115px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: 'repeat(3, 1fr)',
          gap: '3px', zIndex: 120, background: 'rgba(0,0,0,0.3)', padding: '5px', borderRadius: '50%',
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)', touchAction: 'none'
        }}>
          <div />
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualDpadPress('w', true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleVirtualDpadPress('w', false); }}
            onMouseDown={() => handleVirtualDpadPress('w', true)}
            onMouseUp={() => handleVirtualDpadPress('w', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 'bold',
              touchAction: 'none'
            }}
          >
            ▲
          </button>
          <div />
          
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualDpadPress('a', true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleVirtualDpadPress('a', false); }}
            onMouseDown={() => handleVirtualDpadPress('a', true)}
            onMouseUp={() => handleVirtualDpadPress('a', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 'bold',
              touchAction: 'none'
            }}
          >
            ◀
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '8px', fontFamily: 'var(--font-pixel)', whiteSpace: 'nowrap' }}>
            {isEditMode ? '시점' : '이동'}
          </div>
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualDpadPress('d', true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleVirtualDpadPress('d', false); }}
            onMouseDown={() => handleVirtualDpadPress('d', true)}
            onMouseUp={() => handleVirtualDpadPress('d', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 'bold',
              touchAction: 'none'
            }}
          >
            ▶
          </button>

          <div />
          <button
            onTouchStart={(e) => { e.preventDefault(); handleVirtualDpadPress('s', true); }}
            onTouchEnd={(e) => { e.preventDefault(); handleVirtualDpadPress('s', false); }}
            onMouseDown={() => handleVirtualDpadPress('s', true)}
            onMouseUp={() => handleVirtualDpadPress('s', false)}
            className="glass-panel"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
              borderRadius: '6px', border: '1px solid rgba(255,255,255,0.2)', fontSize: '12px', fontWeight: 'bold',
              touchAction: 'none'
            }}
          >
            ▼
          </button>
          <div />
        </div>
      )}

      {/* Map Right-Click Context Menu Popup */}
      {mapContextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${mapContextMenu.clientX}px`,
            top: `${mapContextMenu.clientY}px`,
            zIndex: 1200,
            background: '#181825',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            padding: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              onCreateMemoRequest?.(mapContextMenu.worldX, mapContextMenu.worldY);
              setMapContextMenu(null);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 'bold',
              padding: '6px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            className="hover-highlight"
          >
            📝 이 위치에 메모 남기기
          </button>
        </div>
      )}
    </div>
  );
};
