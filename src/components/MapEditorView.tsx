import React, { useRef, useEffect, useState } from 'react';
import { type MapDefinition, type MapObjectInstance, cleanDuplicateObjects, maps, PRESET_MAP_TEMPLATES } from '../game/MapData';
import { Trash2, Save, X, Undo, Redo, Pipette, Paintbrush, PaintBucket, Eraser, Info, Sparkles, Plus, Download, Upload, Pencil, MousePointer, Copy, Layers, MoveUp, MoveDown } from 'lucide-react';
import { getTileDrawInfo, getTilesetInfo } from '../game/CanvasGame';

import interiorTilesUrl from '../assets/interior_tiles.png';
import outdoorTilesUrl from '../assets/outdoor_tiles.png';
import villageTilesUrl from '../assets/village_tiles.png';
import wallTilesUrl from '../assets/wall_tiles.png';
import houseTilesUrl from '../assets/house_tiles.png';
import natureTilesUrl from '../assets/nature_tiles.png';
import waterTilesUrl from '../assets/water_tiles.png';
import fieldTilesUrl from '../assets/field_tiles.png';

interface TilesetOption {
  id: string;
  name: string;
  url: string;
  cols: number;
  rows: number;
  size?: number;
  prefix?: number;
  isCustom?: boolean;
}

const getCustomMapTilesets = (): TilesetOption[] => {
  try {
    const saved = localStorage.getItem('on_house_custom_map_tilesets');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return [];
};

interface MapEditorViewProps {
  activeMaps: Record<string, MapDefinition>;
  availableMapIds: string[];
  onSaveMap: (mapId: string, updatedMap: MapDefinition) => void;
  onAddMap: (presetId?: string, customName?: string) => void;
  onDeleteMap: (mapId: string) => void;
  onRenameMap?: (mapId: string, newName: string) => void;
  onClose: () => void;
}

export const MapEditorView: React.FC<MapEditorViewProps> = ({
  activeMaps,
  availableMapIds,
  onSaveMap,
  onAddMap,
  onDeleteMap,
  onRenameMap,
  onClose
}) => {
  const [selectedMapId, setSelectedMapId] = useState<string>(availableMapIds[0] || 'room');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [customNameInput, setCustomNameInput] = useState<string>('');
  const [editLayer, setEditLayer] = useState<'base' | 'decor' | 'collision'>('base');
  const [leftSidebarTab, setLeftSidebarTab] = useState<'basic' | 'size' | 'option'>('basic');
  
  // Brush & Tools
  const [selectedTile, setSelectedTile] = useState<number>(1199);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [customBrushInput, setCustomBrushInput] = useState<string>('5');
  const [tool, setTool] = useState<'brush' | 'bucket' | 'eyedropper' | 'select'>('brush');
  const [autoCollision, setAutoCollision] = useState<boolean>(true);

  // Palette Drag Selection Box State (Step 1)
  const [paletteDragStart, setPaletteDragStart] = useState<{ col: number; row: number } | null>(null);
  const [paletteSelection, setPaletteSelection] = useState<{ startCol: number; startRow: number; cols: number; rows: number; tilesetKey: string } | null>(null);

  // Object Selection & Smart Editing State (Step 3 & 4)
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [copiedObject, setCopiedObject] = useState<MapObjectInstance | null>(null);
  const [isDraggingObject, setIsDraggingObject] = useState<boolean>(false);
  const [objectDragStart, setObjectDragStart] = useState<{ originX: number; originY: number; startTx: number; startTy: number } | null>(null);

  // Map Canvas Box Drag Selection State (For merging 1x1 map tiles directly into a single object!)
  const [mapBoxSelectStart, setMapBoxSelectStart] = useState<{ tx: number; ty: number } | null>(null);
  const [mapBoxSelection, setMapBoxSelection] = useState<{ startCol: number; startRow: number; cols: number; rows: number } | null>(null);

  // Eyedropper Toast Notification
  const [pickedToast, setPickedToast] = useState<string | null>(null);
  const [isAltPressed, setIsAltPressed] = useState<boolean>(false);
  
  // View Settings & Zoom (0.5x to 4.0x)
  const [zoom, setZoom] = useState<number>(2); 
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showBase, setShowBase] = useState<boolean>(true);
  const [showDecor, setShowDecor] = useState<boolean>(true);
  const [showCollision, setShowCollision] = useState<boolean>(true);
  
  // Hover cursor highlight
  const [hoverTile, setHoverTile] = useState<{ x: number; y: number } | null>(null);
  const [hoverPaletteTile, setHoverPaletteTile] = useState<{ col: number; row: number } | null>(null);

  // Resizable Palette Width (280px to 850px) & Palette Scale (1.0x to 3.0x)
  const [paletteWidth, setPaletteWidth] = useState<number>(380);
  const [paletteZoom, setPaletteZoom] = useState<number>(2.0);
  const isResizingPalette = useRef<boolean>(false);

  // Map dimensions local input
  const [widthInput, setWidthInput] = useState<string>('40');
  const [heightInput, setHeightInput] = useState<string>('30');

  // Transactional Map States
  const [localMap, setLocalMap] = useState<MapDefinition>(activeMaps.room);
  const [originalMap, setOriginalMap] = useState<MapDefinition>(activeMaps.room);

  // Undo / Redo stacks
  const [history, setHistory] = useState<MapDefinition[]>([]);
  const [redoHistory, setRedoHistory] = useState<MapDefinition[]>([]);

  // Canvas painting state
  const isPainting = useRef(false);
  const lastPaintedCellRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [customMapTilesets] = useState<TilesetOption[]>(getCustomMapTilesets);
  const [activeTileset, setActiveTileset] = useState<string>(localMap.tileset);

  const getTilesetInfoLocal = (ts: string) => {
    const foundCustom = customMapTilesets.find(t => t.id === ts);
    if (foundCustom) {
      return {
        url: foundCustom.url,
        cols: foundCustom.cols,
        rows: foundCustom.rows,
        label: `🎨 ${foundCustom.name}`,
        prefix: foundCustom.prefix || 9000
      };
    }

    const globalInfo = getTilesetInfo(ts);
    let url = outdoorTilesUrl;
    switch (ts) {
      case 'interior': url = interiorTilesUrl; break;
      case 'outdoor': url = outdoorTilesUrl; break;
      case 'village': url = villageTilesUrl; break;
      case 'wall': url = wallTilesUrl; break;
      case 'house': url = houseTilesUrl; break;
      case 'nature': url = natureTilesUrl; break;
      case 'water': url = waterTilesUrl; break;
      case 'field': url = fieldTilesUrl; break;
    }
    return {
      url,
      cols: globalInfo.cols,
      rows: globalInfo.rows,
      label: globalInfo.label,
      prefix: globalInfo.prefix
    };
  };

  const tilesetInfo = getTilesetInfoLocal(activeTileset);
  const tilesetUrl = tilesetInfo.url;
  const tilesetCols = tilesetInfo.cols;
  const tilesetRows = tilesetInfo.rows;

  // Viewport & Space Panning Refs
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const isSpacePressed = useRef<boolean>(false);
  const isPanningViewport = useRef<boolean>(false);
  const panStartRef = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Refs for handleUndo / handleRedo to avoid stale closures in event listeners
  const handleUndoRef = useRef<() => void>(() => {});
  const handleRedoRef = useRef<() => void>(() => {});

  // Helper handlers for Smart Object Management (Steps 3 & 4) - Non-destructive Layer Overlay
  const handleDeleteSelectedObject = (targetId?: string) => {
    const objId = targetId || selectedObjectId;
    if (!objId) return;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const obj = prev.objects?.find(o => o.id === objId);
      if (!obj) return prev;

      const newCollision = prev.collision.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);

      const tsInfo = getTilesetInfoLocal(obj.tilesetKey);

      for (let ody = 0; ody < obj.height; ody++) {
        for (let odx = 0; odx < obj.width; odx++) {
          const ptx = obj.x + odx;
          const pty = obj.y + ody;
          if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
            if (autoCollision) newCollision[pty][ptx] = false;

            // Clean up any duplicate baked-in decor tiles left from previous versions
            if (tsInfo) {
              const localIdx = (obj.startRow + ody) * tsInfo.cols + (obj.startCol + odx);
              const expectedTile = getPrefixedIndex(localIdx, obj.tilesetKey);
              if (newDecor[pty][ptx] === expectedTile) {
                newDecor[pty][ptx] = -1;
              }
            }
          }
        }
      }

      return {
        ...prev,
        decorLayer: newDecor,
        collision: newCollision,
        objects: (prev.objects || []).filter(o => o.id !== objId)
      };
    });

    setSelectedObjectId(null);
  };

  const handleCopySelectedObject = () => {
    if (!selectedObjectId) return;
    const obj = localMap.objects?.find(o => o.id === selectedObjectId);
    if (obj) {
      setCopiedObject(obj);
      setPickedToast(`'${obj.tilesetKey}' 에셋이 클립보드에 복사되었습니다! (Ctrl+V로 붙여넣기)`);
      setTimeout(() => setPickedToast(null), 2200);
    }
  };

  const handlePasteObject = (targetTx?: number, targetTy?: number) => {
    if (!copiedObject) return;
    const destX = targetTx !== undefined ? targetTx : (hoverTile ? hoverTile.x : copiedObject.x + 1);
    const destY = targetTy !== undefined ? targetTy : (hoverTile ? hoverTile.y : copiedObject.y + 1);

    const newId = `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pastedObj: MapObjectInstance = {
      ...copiedObject,
      id: newId,
      x: destX,
      y: destY,
      zIndex: Date.now()
    };

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const newCollision = prev.collision.map(r => [...r]);

      if (autoCollision) {
        for (let ody = 0; ody < pastedObj.height; ody++) {
          for (let odx = 0; odx < pastedObj.width; odx++) {
            const ptx = destX + odx;
            const pty = destY + ody;
            if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
              newCollision[pty][ptx] = true;
            }
          }
        }
      }

      return {
        ...prev,
        collision: newCollision,
        objects: [...(prev.objects || []), pastedObj]
      };
    });

    setSelectedObjectId(newId);
    setTool('select');
  };

  const handleBringToFront = (objId?: string) => {
    const id = objId || selectedObjectId;
    if (!id) return;
    setLocalMap(prev => {
      const objs = prev.objects || [];
      const maxZ = Math.max(...objs.map(o => o.zIndex || 0), 0);
      return {
        ...prev,
        objects: objs.map(o => o.id === id ? { ...o, zIndex: maxZ + 1 } : o)
      };
    });
    setPickedToast('오브젝트를 맨 앞으로 가져왔습니다!');
    setTimeout(() => setPickedToast(null), 1500);
  };

  const handleSendToBack = (objId?: string) => {
    const id = objId || selectedObjectId;
    if (!id) return;
    setLocalMap(prev => {
      const objs = prev.objects || [];
      const minZ = Math.min(...objs.map(o => o.zIndex || 0), 0);
      return {
        ...prev,
        objects: objs.map(o => o.id === id ? { ...o, zIndex: minZ - 1 } : o)
      };
    });
    setPickedToast('오브젝트를 맨 뒤로 보냈습니다!');
    setTimeout(() => setPickedToast(null), 1500);
  };

  // Keyboard Shortcuts: Space (Pan map), Ctrl+Z (Undo), Ctrl+Y (Redo), Alt, B, F, E, X, V, Delete, Ctrl+C, Ctrl+V
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

      // Space key for map panning
      if ((e.code === 'Space' || e.key === ' ') && !isInput) {
        e.preventDefault();
        if (!isSpacePressed.current) {
          isSpacePressed.current = true;
          setIsSpaceHeld(true);
        }
      }

      if (isInput) return;

      // Ctrl + Z (Undo) / Ctrl + Shift + Z or Ctrl + Y (Redo)
      const isCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (isCtrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedoRef.current();
        } else {
          handleUndoRef.current();
        }
        return;
      }

      if (isCtrl && key === 'y') {
        e.preventDefault();
        handleRedoRef.current();
        return;
      }

      if (isCtrl && key === 'c') {
        if (selectedObjectId) {
          e.preventDefault();
          handleCopySelectedObject();
        }
        return;
      }

      if (isCtrl && key === 'v') {
        if (copiedObject) {
          e.preventDefault();
          handlePasteObject();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedObjectId) {
          e.preventDefault();
          handleDeleteSelectedObject();
        }
        return;
      }

      if (e.key === 'Alt') {
        setIsAltPressed(true);
      }

      if (key === 'b') {
        setTool('brush');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'f' && editLayer !== 'collision') {
        setTool('bucket');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'e' && editLayer !== 'collision') {
        setTool('eyedropper');
        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
      } else if (key === 'v') {
        setTool('select');
      } else if (key === 'x' && editLayer !== 'collision') {
        setSelectedTile(-1);
        setTool('brush');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        isSpacePressed.current = false;
        setIsSpaceHeld(false);
        isPanningViewport.current = false;
      }
      if (e.key === 'Alt') {
        setIsAltPressed(false);
      }
    };

    const handleBlur = () => {
      setIsAltPressed(false);
      setIsSpaceHeld(false);
      isSpacePressed.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [editLayer, selectedTile, activeTileset]);

  // Drag-to-resize Right Palette Panel
  const handlePaletteResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingPalette.current = true;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingPalette.current) return;
      const newW = window.innerWidth - ev.clientX;
      if (newW >= 280 && newW <= 850) {
        setPaletteWidth(newW);
      }
    };

    const handleMouseUp = () => {
      isResizingPalette.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Sync state when map tab switches
  const prevMapIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevMapIdRef.current !== selectedMapId) {
      prevMapIdRef.current = selectedMapId;
      const map = activeMaps[selectedMapId] || maps[selectedMapId];
      if (map) {
        setLocalMap(map);
        setOriginalMap(map);
        setWidthInput(map.width.toString());
        setHeightInput(map.height.toString());
        setHistory([]);
        setRedoHistory([]);
        setActiveTileset(map.tileset);
        
        if (map.tileset === 'interior') setSelectedTile(1199);
        else setSelectedTile(2000);
      }
    }
  }, [selectedMapId, activeMaps]);

  // Image preloader for tilesets
  const [images, setImages] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const assetUrls: Record<string, string> = {
      interior: interiorTilesUrl,
      outdoor: outdoorTilesUrl,
      village: villageTilesUrl,
      wall: wallTilesUrl,
      house: houseTilesUrl,
      nature: natureTilesUrl,
      water: waterTilesUrl,
      field: fieldTilesUrl
    };

    customMapTilesets.forEach((ct) => {
      assetUrls[ct.id] = ct.url;
    });

    const loaded: Record<string, HTMLImageElement> = {};
    let count = 0;
    const total = Object.keys(assetUrls).length;

    Object.entries(assetUrls).forEach(([k, url]) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        loaded[k] = img;
        count++;
        if (count === total) {
          setImages(loaded);
        }
      };
    });
  }, [customMapTilesets]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !images.outdoor) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const tileSize = 16 * zoom;
    canvas.width = localMap.width * tileSize;
    canvas.height = localMap.height * tileSize;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Base Floor Layer (Controlled by showBase toggle!)
    if (showBase) {
      // 1. Base Floor Layer
      for (let y = 0; y < localMap.height; y++) {
        for (let x = 0; x < localMap.width; x++) {
          const idx = localMap.baseLayer[y][x];
          const drawInfo = getTileDrawInfo(idx, localMap.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
              const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
              ctx.drawImage(
                img,
                srcX, srcY, 16, 16,
                x * tileSize, y * tileSize, tileSize, tileSize
              );
            }
          }
        }
      }
  
      // 1.5 Base Layer Objects (obj.layer === 'base' - Ground Overlay Objects like Stepping Stones, Rugs)
      if (localMap.objects && localMap.objects.length > 0) {
        const baseObjects = cleanDuplicateObjects(localMap.objects.filter(o => o.layer === 'base'));
        baseObjects.forEach(obj => {
          const img = images[obj.tilesetKey];
          const tsInfo = getTilesetInfoLocal(obj.tilesetKey);
          if (img && tsInfo) {
            const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
            const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));
  
              for (let ody = 0; ody < obj.height; ody++) {
                for (let odx = 0; odx < obj.width; odx++) {
                  const targetTx = obj.x + odx;
                  const targetTy = obj.y + ody;
                  if (targetTx >= 0 && targetTx < localMap.width && targetTy >= 0 && targetTy < localMap.height) {
                    if (obj.tiles && obj.tiles[ody] && obj.tiles[ody][odx] !== undefined) {
                      const tileIdx = obj.tiles[ody][odx];
                      if (tileIdx !== -1) {
                        const drawInfo = getTileDrawInfo(tileIdx, obj.tilesetKey || localMap.tileset);
                        if (drawInfo) {
                          const tImg = images[drawInfo.tilesetKey];
                          if (tImg) {
                            const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
                            const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
                            const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
                            ctx.drawImage(
                              tImg,
                              srcX, srcY, 16, 16,
                              targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                            );
                          }
                        }
                      }
                    } else {
                      const srcX = (obj.startCol + odx) * tileW;
                      const srcY = (obj.startRow + ody) * tileH;
                      ctx.drawImage(
                        img,
                        srcX, srcY, tileW, tileH,
                        targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                      );
                    }
                  }
                }
              }
          }
        });
      }
  
    }

    // 2. Decor Layer
    if (showDecor) {
      for (let y = 0; y < localMap.height; y++) {
        for (let x = 0; x < localMap.width; x++) {
          const idx = localMap.decorLayer[y][x];
          const drawInfo = getTileDrawInfo(idx, localMap.tileset);
          if (drawInfo) {
            const img = images[drawInfo.tilesetKey];
            if (img) {
              const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
              const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
              const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
              ctx.drawImage(
                img,
                srcX, srcY, 16, 16,
                x * tileSize, y * tileSize, tileSize, tileSize
              );
            }
          }
        }
      }

      // 2.5 Decor Objects Layer (MapObjectInstance[]) - Standing Decor Entity Rendering
      if (localMap.objects && localMap.objects.length > 0) {
        const cleaned = cleanDuplicateObjects(localMap.objects.filter(o => o.layer !== 'base'));
        const sortedObjects = [...cleaned].sort((a, b) => {
          const rootA = a.y + a.height - 1;
          const rootB = b.y + b.height - 1;
          if (rootA !== rootB) return rootA - rootB;
          return (a.zIndex || 0) - (b.zIndex || 0);
        });

        sortedObjects.forEach(obj => {
          const img = images[obj.tilesetKey];
          const tsInfo = getTilesetInfoLocal(obj.tilesetKey);
          if (img && tsInfo) {
            const tileW = Math.max(1, Math.floor(img.width / tsInfo.cols));
            const tileH = Math.max(1, Math.floor(img.height / tsInfo.rows));

            for (let ody = 0; ody < obj.height; ody++) {
              for (let odx = 0; odx < obj.width; odx++) {
                const targetTx = obj.x + odx;
                const targetTy = obj.y + ody;
                if (targetTx >= 0 && targetTx < localMap.width && targetTy >= 0 && targetTy < localMap.height) {
                  if (obj.tiles && obj.tiles[ody] && obj.tiles[ody][odx] !== undefined) {
                    const tileIdx = obj.tiles[ody][odx];
                    if (tileIdx !== -1) {
                      const drawInfo = getTileDrawInfo(tileIdx, obj.tilesetKey || localMap.tileset);
                      if (drawInfo) {
                        const tImg = images[drawInfo.tilesetKey];
                        if (tImg) {
                          const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
                          const srcX = (drawInfo.localIdx % tsInfo.cols) * 16;
                          const srcY = Math.floor(drawInfo.localIdx / tsInfo.cols) * 16;
                          ctx.drawImage(
                            tImg,
                            srcX, srcY, 16, 16,
                            targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                          );
                        }
                      }
                    }
                  } else {
                    const srcX = (obj.startCol + odx) * tileW;
                    const srcY = (obj.startRow + ody) * tileH;
                    ctx.drawImage(
                      img,
                      srcX, srcY, tileW, tileH,
                      targetTx * tileSize, targetTy * tileSize, tileSize, tileSize
                    );
                  }
                }
              }
            }
          }
        });
      }
    }

    // 3. Collision red borders (100% Vivid Red for clear distinction!)
    if (showCollision) {
      ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      ctx.lineWidth = 1.5;
      for (let y = 0; y < localMap.height; y++) {
        for (let x = 0; x < localMap.width; x++) {
          if (localMap.collision[y][x]) {
            ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
            ctx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
          }
        }
      }
    }

    // 4. Grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x <= localMap.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * tileSize, 0);
        ctx.lineTo(x * tileSize, localMap.height * tileSize);
        ctx.stroke();
      }
      for (let y = 0; y <= localMap.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * tileSize);
        ctx.lineTo(localMap.width * tileSize, y * tileSize);
        ctx.stroke();
      }
    }

    // 5. Objects Bounding Boxes Overlay (Selected: Gold/Yellow, Unselected: Neon Cyan!)
    if (localMap.objects && localMap.objects.length > 0) {
      localMap.objects.forEach(obj => {
        const isSelected = obj.id === selectedObjectId;
        const ox = obj.x * tileSize;
        const oy = obj.y * tileSize;
        const ow = obj.width * tileSize;
        const oh = obj.height * tileSize;

        ctx.save();
        if (isSelected) {
          // 1) Active Selected Object: Electric Gold / Yellow (#ffd700)
          ctx.strokeStyle = "#ffd700";
          ctx.lineWidth = 3.0;
          ctx.setLineDash([6, 6]);
          ctx.fillStyle = "rgba(255, 215, 0, 0.22)";
          ctx.fillRect(ox, oy, ow, oh);
          ctx.strokeRect(ox, oy, ow, oh);
        }
        ctx.restore();
      });
    }

    // 5.5 Map Canvas Box Selection Drag Highlight (Electric Gold #ffd700)
    if (mapBoxSelection && tool === 'select') {
      const bx = mapBoxSelection.startCol * tileSize;
      const by = mapBoxSelection.startRow * tileSize;
      const bw = mapBoxSelection.cols * tileSize;
      const bh = mapBoxSelection.rows * tileSize;

      ctx.save();
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.25)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }

    // 6. Hover Cursor Tile Preview / Eyedropper Highlight
    if (hoverTile && hoverTile.x >= 0 && hoverTile.x < localMap.width && hoverTile.y >= 0 && hoverTile.y < localMap.height) {
      ctx.save();
      const hx = hoverTile.x * tileSize;
      const hy = hoverTile.y * tileSize;

      if (isAltPressed || tool === 'eyedropper') {
        // Cyan Eyedropper Highlight Box
        ctx.strokeStyle = '#89dceb';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(137, 220, 235, 0.25)';
        ctx.fillRect(hx, hy, tileSize, tileSize);
        ctx.strokeRect(hx, hy, tileSize, tileSize);
      } else {
        let pCols = brushSize;
        let pRows = brushSize;
        let pStartCol = 0;
        let pStartRow = 0;

        const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
        const tsInfo = drawInfo ? getTilesetInfoLocal(drawInfo.tilesetKey) : null;

        if (paletteSelection && paletteSelection.tilesetKey === activeTileset) {
          pCols = paletteSelection.cols;
          pRows = paletteSelection.rows;
          pStartCol = paletteSelection.startCol;
          pStartRow = paletteSelection.startRow;
        } else if (drawInfo && tsInfo) {
          pStartCol = drawInfo.localIdx % tsInfo.cols;
          pStartRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
        }

        const bw = Math.min(localMap.width - hoverTile.x, pCols) * tileSize;
        const bh = Math.min(localMap.height - hoverTile.y, pRows) * tileSize;

        // Draw real-time multi-tile object texture preview under mouse cursor!
        if (selectedTile !== -1 && editLayer !== 'collision' && tool === 'brush' && (paletteSelection || brushSize > 1)) {
          ctx.globalAlpha = 0.75;
          if (tsInfo) {
            const img = images[drawInfo?.tilesetKey || activeTileset];
            if (img) {
              for (let dy = 0; dy < pRows; dy++) {
                for (let dx = 0; dx < pCols; dx++) {
                  const px = hoverTile.x + dx;
                  const py = hoverTile.y + dy;
                  const targetCol = pStartCol + dx;
                  const targetRow = pStartRow + dy;
                  if (px < localMap.width && py < localMap.height && targetCol < tsInfo.cols && targetRow < tsInfo.rows) {
                    ctx.drawImage(
                      img,
                      targetCol * 16, targetRow * 16, 16, 16,
                      px * tileSize, py * tileSize, tileSize, tileSize
                    );
                  }
                }
              }
            }
          }
          ctx.globalAlpha = 1.0;
        }

        if (tool !== 'select') {
          ctx.strokeStyle = '#f9e2af';
          ctx.lineWidth = 2;
          ctx.fillStyle = 'rgba(249, 226, 175, 0.15)';
          ctx.fillRect(hx, hy, bw, bh);
          ctx.strokeRect(hx, hy, bw, bh);
        }
      }
      ctx.restore();
    }
  }, [images, localMap, zoom, showGrid, showBase, showDecor, showCollision, hoverTile, isAltPressed, tool, brushSize, selectedTile, editLayer, activeTileset]);

  // Undo / Redo
  const handleUndo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setRedoHistory(r => [localMap, ...r]);
    setLocalMap(prev);
    setHistory(h => h.slice(0, -1));
  };

  const handleRedo = () => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[0];
    setHistory(h => [...h, localMap]);
    setLocalMap(next);
    setRedoHistory(r => r.slice(1));
  };

  handleUndoRef.current = handleUndo;
  // Auto-sync map edits to Supabase DB & localStorage continuously
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      onSaveMap(selectedMapId, localMap);
    }, 500);
    return () => clearTimeout(timer);
  }, [localMap, selectedMapId, onSaveMap]);

  const handleSave = () => {
    onSaveMap(selectedMapId, localMap);
    setOriginalMap(localMap);
    alert('디자인 변경 사항이 성공적으로 클라우드에 저장되었습니다!');
  };

  const handleExportBackup = () => {
    try {
      const backupData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('on_house_')) {
          const val = localStorage.getItem(key);
          if (val) backupData[key] = val;
        }
      }
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `on_house_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('백업 파일 생성 실패: ' + e);
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const backupData = JSON.parse(content);
        let count = 0;
        Object.entries(backupData).forEach(([k, v]) => {
          if (k.startsWith('on_house_') && typeof v === 'string') {
            localStorage.setItem(k, v);
            count++;
          }
        });
        alert(`총 ${count}개의 백업 데이터가 성공적으로 복원되었습니다! 앱을 새로고침합니다.`);
        window.location.reload();
      } catch (err) {
        alert('백업 파일을 불러오는 중 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
  };

  const handleCancel = () => {
    const hasChanges = JSON.stringify(localMap) !== JSON.stringify(originalMap);
    if (hasChanges) {
      if (!window.confirm("저장하지 않은 변경사항이 있습니다. 정말로 저장을 취소하고 나가시겠습니까?")) {
        return;
      }
    }
    onClose();
  };

  const handleResetToDefault = () => {
    if (window.confirm("정말로 이 지도의 수정을 취소하고 기본 레이아웃으로 전체 초기화하시겠습니까? (저장을 해야 최종 반영됩니다)")) {
      setHistory(prev => [...prev, localMap]);
      setRedoHistory([]);
      const defaultLayout = maps[selectedMapId];
      if (defaultLayout) {
        setLocalMap({ ...defaultLayout });
      }
    }
  };

  // 🧪 Eyedropper: Pick tile/object based on currently selected editLayer ('base' vs 'decor')
  const pickTileFromMap = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    let pickedIdx = -1;
    let pickedObj: MapObjectInstance | null = null;

    if (editLayer === 'collision') {
      pickedIdx = localMap.collision[ty][tx] ? 1 : 0;
    } else if (editLayer === 'base') {
      // 1층 바닥 레이어 선택 상태 -> 1층 바닥 타일 또는 1층 바닥 오브젝트 우선 추출!
      const baseObj = localMap.objects?.find(o => o.layer === 'base' && tx >= o.x && tx < o.x + o.width && ty >= o.y && ty < o.y + o.height);
      if (baseObj) {
        pickedObj = baseObj;
        const tsInfo = getTilesetInfoLocal(baseObj.tilesetKey);
        if (tsInfo) {
          const lIdx = baseObj.startRow * tsInfo.cols + baseObj.startCol;
          pickedIdx = getPrefixedIndex(lIdx, baseObj.tilesetKey);
        }
      } else if (localMap.baseLayer && localMap.baseLayer[ty]) {
        pickedIdx = localMap.baseLayer[ty][tx];
      }
    } else if (editLayer === 'decor') {
      // 2층 가구/장식 레이어 선택 상태 -> 2층 가구 오브젝트 또는 2층 장식 타일 우선 추출!
      const decorObj = localMap.objects?.find(o => o.layer !== 'base' && tx >= o.x && tx < o.x + o.width && ty >= o.y && ty < o.y + o.height);
      if (decorObj) {
        pickedObj = decorObj;
        const tsInfo = getTilesetInfoLocal(decorObj.tilesetKey);
        if (tsInfo) {
          const lIdx = decorObj.startRow * tsInfo.cols + decorObj.startCol;
          pickedIdx = getPrefixedIndex(lIdx, decorObj.tilesetKey);
        }
      } else if (localMap.decorLayer && localMap.decorLayer[ty] && localMap.decorLayer[ty][tx] !== undefined && localMap.decorLayer[ty][tx] !== -1) {
        pickedIdx = localMap.decorLayer[ty][tx];
      } else if (localMap.baseLayer && localMap.baseLayer[ty]) {
        // Fallback to base tile if decor layer is empty
        pickedIdx = localMap.baseLayer[ty][tx];
      }
    }

    if (pickedIdx !== -1) {
      setSelectedTile(pickedIdx);

      if (pickedObj) {
        // If an object was picked, set palette selection box matching the object dimensions!
        setActiveTileset(pickedObj.tilesetKey);
        setPaletteSelection({
          startCol: pickedObj.startCol,
          startRow: pickedObj.startRow,
          cols: pickedObj.width,
          rows: pickedObj.height,
          tilesetKey: pickedObj.tilesetKey
        });
        setBrushSize(Math.max(pickedObj.width, pickedObj.height));
      } else {
        // If a tile was picked, auto-switch active tileset category
        const info = getTileDrawInfo(pickedIdx, localMap.tileset);
        if (info && info.tilesetKey) {
          setActiveTileset(info.tilesetKey);
          setPaletteSelection(null);
          setBrushSize(1);
        }
      }

      const info = getTileDrawInfo(pickedIdx, localMap.tileset);
      const tsInfo = info ? getTilesetInfoLocal(info.tilesetKey) : null;
      const layerName = editLayer === 'base' ? '1층 바닥' : editLayer === 'decor' ? '2층 가구' : '통행';
      const label = pickedObj
        ? `${tsInfo?.label || '오브젝트'} [${pickedObj.width}x${pickedObj.height} 가구]`
        : tsInfo ? `${tsInfo.label} (ID: ${info?.localIdx})` : `타일 (ID: ${pickedIdx})`;

      setPickedToast(`🧪 [${layerName}] 스포이드 추출: ${label}`);
      setTimeout(() => setPickedToast(null), 2500);

      // Auto-return to brush tool for smooth painting workflow!
      setTool('brush');
    }
  };

  const performFloodFill = (startX: number, startY: number, fillVal: number) => {
    const currentLayer = editLayer;
    if (currentLayer === 'collision') return;
    
    const newBase = localMap.baseLayer.map(r => [...r]);
    const newDecor = localMap.decorLayer.map(r => [...r]);
    const newCollision = localMap.collision.map(r => [...r]);

    const targetGrid = currentLayer === 'base' ? newBase : newDecor;
    const originalVal = targetGrid[startY][startX];
    
    if (originalVal === fillVal) return;

    const w = localMap.width;
    const h = localMap.height;
    const queue: [number, number][] = [[startX, startY]];
    targetGrid[startY][startX] = fillVal;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          if (targetGrid[ny][nx] === originalVal) {
            targetGrid[ny][nx] = fillVal;
            if (currentLayer === 'decor' && autoCollision) {
              newCollision[ny][nx] = fillVal !== -1;
            }
            queue.push([nx, ny]);
          }
        }
      }
    }

    setLocalMap(prev => ({
      ...prev,
      baseLayer: newBase,
      decorLayer: newDecor,
      collision: newCollision
    }));
  };

  const handleMoveObjectTiles = (objId: string, newTx: number, newTy: number) => {
    setLocalMap(prev => {
      const obj = prev.objects?.find(o => o.id === objId);
      if (!obj) return prev;
      if (obj.x === newTx && obj.y === newTy) return prev;

      const newBase = prev.baseLayer.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);
      const newCollision = prev.collision.map(r => [...r]);

      // 1) Record object's current collision pattern before moving
      const objCollisionMap: boolean[][] = [];
      for (let dy = 0; dy < obj.height; dy++) {
        objCollisionMap[dy] = [];
        for (let dx = 0; dx < obj.width; dx++) {
          const ox = obj.x + dx;
          const oy = obj.y + dy;
          objCollisionMap[dy][dx] = (ox >= 0 && ox < prev.width && oy >= 0 && oy < prev.height) ? prev.collision[oy][ox] : false;
        }
      }

      // 2) Erase base/decor tiles to 100% pure black ground (-1) & remove collision from old position
      for (let dy = 0; dy < obj.height; dy++) {
        for (let dx = 0; dx < obj.width; dx++) {
          const oldX = obj.x + dx;
          const oldY = obj.y + dy;
          if (oldX >= 0 && oldX < prev.width && oldY >= 0 && oldY < prev.height) {
            newDecor[oldY][oldX] = -1;
            if (obj.layer === "base" || editLayer === "base") { newBase[oldY][oldX] = -1; }
            if (objCollisionMap[dy][dx]) {
              newCollision[oldY][oldX] = false;
            }
          }
        }
      }

      // 3) Transfer collision pattern to new target position
      for (let dy = 0; dy < obj.height; dy++) {
        for (let dx = 0; dx < obj.width; dx++) {
          const nX = newTx + dx;
          const nY = newTy + dy;
          if (nX >= 0 && nX < prev.width && nY >= 0 && nY < prev.height) {
            if (objCollisionMap[dy][dx]) {
              newCollision[nY][nX] = true;
            }
          }
        }
      }

      return {
        ...prev,
        baseLayer: newBase,
        decorLayer: newDecor,
        collision: newCollision,
        objects: (prev.objects || []).map(o => o.id === objId ? { ...o, x: newTx, y: newTy } : o)
      };
    });
  };

  const handlePaint = (tx: number, ty: number) => {
    if (tx < 0 || tx >= localMap.width || ty < 0 || ty >= localMap.height) return;

    setLocalMap(prev => {
      const newBase = prev.baseLayer.map(r => [...r]);
      const newDecor = prev.decorLayer.map(r => [...r]);
      const newCollision = prev.collision.map(r => [...r]);
      let nextObjects = prev.objects ? [...prev.objects] : [];

      let cols = brushSize;
      let rows = brushSize;
      let startCol = 0;
      let startRow = 0;

      const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
      const tsInfo = drawInfo ? getTilesetInfoLocal(drawInfo.tilesetKey) : null;

      if (paletteSelection && paletteSelection.tilesetKey === activeTileset) {
        cols = paletteSelection.cols;
        rows = paletteSelection.rows;
        startCol = paletteSelection.startCol;
        startRow = paletteSelection.startRow;
      } else if (drawInfo && tsInfo) {
        startCol = drawInfo.localIdx % tsInfo.cols;
        startRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
      }

      const isMultiTileObject = (tool === 'object' || ((cols > 1 || rows > 1) && editLayer === 'decor')) && selectedTile !== -1 && editLayer !== 'collision';

      for (let dy = 0; dy < rows; dy++) {
        for (let dx = 0; dx < cols; dx++) {
          const ptx = tx + dx;
          const pty = ty + dy;

          if (ptx >= 0 && ptx < prev.width && pty >= 0 && pty < prev.height) {
            if (editLayer === 'collision') {
              newCollision[pty][ptx] = selectedTile === 1;
            } else if (selectedTile === -1) {
              if (editLayer === 'base') {
                newBase[pty][ptx] = -1;
              } else if (editLayer === 'decor') {
                newDecor[pty][ptx] = -1;
                if (autoCollision) newCollision[pty][ptx] = false;
              }
              // Erase any object overlapping eraser position
              nextObjects = nextObjects.filter(o => !(ptx >= o.x && ptx < o.x + o.width && pty >= o.y && pty < o.y + o.height));
            } else {
              let tileToPaint = selectedTile;
              if (paletteSelection && paletteSelection.tilesetKey === activeTileset && tsInfo) {
                const lIdx = (startRow + dy) * tsInfo.cols + (startCol + dx);
                tileToPaint = getPrefixedIndex(lIdx, activeTileset);
              } else {
                tileToPaint = getOffsetTile(selectedTile, activeTileset, dx, dy);
              }

              // Multi-tile objects go into objects layer without overwriting base/decor background!
              if (!isMultiTileObject) {
                if (editLayer === 'base') {
                  newBase[pty][ptx] = tileToPaint;
                  // Remove any accidental object at this tile when painting ground floor tiles
                  nextObjects = nextObjects.filter(o => !(ptx >= o.x && ptx < o.x + o.width && pty >= o.y && pty < o.y + o.height));
                } else if (editLayer === 'decor') {
                  newDecor[pty][ptx] = tileToPaint;
                  if (autoCollision) {
                    newCollision[pty][ptx] = tileToPaint !== -1;
                  }
                }
              } else if (autoCollision) {
                newCollision[pty][ptx] = true;
              }
            }
          }
        }
      }

      if (isMultiTileObject) {
        const newObj: MapObjectInstance = {
          id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tilesetKey: activeTileset,
          startCol,
          startRow,
          width: cols,
          height: rows,
          x: tx,
          y: ty,
          layer: editLayer === 'collision' ? 'decor' : editLayer,
          zIndex: Date.now()
        };

        // Remove any exact overlapping same-origin object if replacing
        nextObjects = nextObjects.filter(o => !(o.x === tx && o.y === ty));
        nextObjects.push(newObj);
        setSelectedObjectId(newObj.id);
      }

      return {
        ...prev,
        baseLayer: newBase,
        decorLayer: newDecor,
        collision: newCollision,
        objects: nextObjects
      };
    });
  };

  // Viewport Drag-to-Pan Handlers (Space + Mouse Drag or Right/Middle Click)
  const handleViewportMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSpacePressed.current || isSpaceHeld || e.button === 1 || e.button === 2) {
      e.preventDefault();
      isPanningViewport.current = true;
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: viewportRef.current?.scrollLeft || 0,
        scrollTop: viewportRef.current?.scrollTop || 0
      };
    }
  };

  const handleViewportMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isPanningViewport.current && viewportRef.current) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      viewportRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
      viewportRef.current.scrollTop = panStartRef.current.scrollTop - dy;
    }
  };

  const handleViewportMouseUp = () => {
    isPanningViewport.current = false;
  };

  // ✨ Merge dragged map tiles into a single unified MapObjectInstance!
  const handleConvertBoxToSingleObject = () => {
    if (!mapBoxSelection) return;
    const { startCol, startRow, cols, rows } = mapBoxSelection;

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    setLocalMap(prev => {
      const newDecor = prev.decorLayer.map(r => [...r]);
      let nextObjects = prev.objects ? [...prev.objects] : [];

      // Determine primary tile in the selection box to identify tileset
      let sampleTileIdx = -1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const curTx = startCol + c;
          const curTy = startRow + r;
          if (curTx >= 0 && curTx < prev.width && curTy >= 0 && curTy < prev.height) {
            const dIdx = prev.decorLayer[curTy][curTx];
            const bIdx = prev.baseLayer[curTy][curTx];
            if (dIdx !== -1) {
              sampleTileIdx = dIdx;
              break;
            } else if (bIdx !== -1 && sampleTileIdx === -1) {
              sampleTileIdx = bIdx;
            }
          }
        }
        if (sampleTileIdx !== -1 && sampleTileIdx !== 1199 && sampleTileIdx !== 2000) break;
      }

      if (sampleTileIdx === -1) sampleTileIdx = selectedTile !== -1 ? selectedTile : getPrefixedIndex(0, activeTileset);

      const drawInfo = getTileDrawInfo(sampleTileIdx, activeTileset);
      const targetTsKey = drawInfo?.tilesetKey || activeTileset;
      const tsInfo = getTilesetInfoLocal(targetTsKey);

      let objStartCol = 0;
      let objStartRow = 0;
      if (drawInfo && tsInfo) {
        objStartCol = drawInfo.localIdx % tsInfo.cols;
        objStartRow = Math.floor(drawInfo.localIdx / tsInfo.cols);
      }

      // Capture exact tile grid for custom combined object & erase original map cells to 100% black empty
      const emptyBase = -1; // 100% Pure Black Canvas Ground (-1)!
      const newBase = prev.baseLayer.map(r => [...r]);
      const tilesGrid: number[][] = [];
      for (let r = 0; r < rows; r++) {
        const rowTiles: number[] = [];
        for (let c = 0; c < cols; c++) {
          const curTx = startCol + c;
          const curTy = startRow + r;
          if (curTx >= 0 && curTx < prev.width && curTy >= 0 && curTy < prev.height) {
            const dIdx = prev.decorLayer[curTy][curTx];
            const bIdx = prev.baseLayer[curTy][curTx];
            rowTiles.push(editLayer === "decor" ? dIdx : (dIdx !== -1 ? dIdx : bIdx));
            
            // 🎯 ERASE BOTH LAYERS AT VACATED CELLS TO BLACK EMPTY GROUND (1199 / -1)!
            newDecor[curTy][curTx] = -1;
            if (editLayer === "base") { newBase[curTy][curTx] = emptyBase; }
          } else {
            rowTiles.push(-1);
          }
        }
        tilesGrid.push(rowTiles);
      }

      const newObj: MapObjectInstance = {
        id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        tilesetKey: targetTsKey,
        startCol: objStartCol,
        startRow: objStartRow,
        width: cols,
        height: rows,
        x: startCol,
        y: startRow,
        layer: editLayer === "base" ? "base" : "decor",
        zIndex: Date.now(),
        tiles: tilesGrid
      };

      // Filter out any small sub-objects previously contained in this box
      nextObjects = nextObjects.filter(o => !(o.x >= startCol && o.x + o.width <= startCol + cols && o.y >= startRow && o.y + o.height <= startRow + rows));
      nextObjects.push(newObj);
      setSelectedObjectId(newObj.id);

      return {
        ...prev,
        decorLayer: newDecor,
        objects: nextObjects
      };
    });

    setMapBoxSelection(null);
    setPickedToast(`✨ 맵 영역 (${cols}x${rows}) 타일이 1개의 오브젝트로 묶였습니다!`);
    setTimeout(() => setPickedToast(null), 3000);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Right click cancels stamp preview and switches to select mode
    if (e.button === 2) {
      e.preventDefault();
      setPaletteSelection(null);
      setMapBoxSelection(null);
      setTool('select');
      return;
    }

    if (isSpacePressed.current || isSpaceHeld || e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 16 * zoom;
    const tx = Math.floor(clickX / tileSize);
    const ty = Math.floor(clickY / tileSize);

    // 🧪 Eyedropper on Alt + Click OR Tool = eyedropper
    // 🧪 Eyedropper on Alt + Click (Disabled for object & select tools) OR Tool = eyedropper
    const isAltPick = (e.altKey || isAltPressed) && tool !== "object" && tool !== "select";
    if (isAltPick || tool === "eyedropper") {
      pickTileFromMap(tx, ty);
      return;
    }

    if (tool === "select") {
      const isAltHeld = e.altKey || isAltPressed;

      if (isAltHeld) {
        // Alt + Drag in select mode -> ONLY WAY to start Map Box Multi-Tile Drag Selection!
        setSelectedObjectId(null);
        setIsDraggingObject(false);
        setObjectDragStart(null);
        setMapBoxSelectStart({ tx, ty });
        setMapBoxSelection({ startCol: tx, startRow: ty, cols: 1, rows: 1 });
        return;
      }

      // NO Alt held -> Pure 1x1 Tile / Object Select & Drag-to-Move Mode!
      setMapBoxSelectStart(null);
      setMapBoxSelection(null);

      // A. Check existing MapObjectInstance at (tx, ty)
      const clickedObj = (localMap.objects || []).slice().reverse().find(o =>
        tx >= o.x && tx < o.x + o.width && ty >= o.y && ty < o.y + o.height
      );

      if (clickedObj) {
        setSelectedObjectId(clickedObj.id);
        setIsDraggingObject(true);
        setObjectDragStart({ originX: e.clientX, originY: e.clientY, startTx: clickedObj.x, startTy: clickedObj.y });

        // 🎯 Update "현재 선택된 브러시" preview box in palette panel!
        if (clickedObj.tiles && clickedObj.tiles[0] && clickedObj.tiles[0][0] !== undefined) {
          const tIdx = clickedObj.tiles[0][0];
          if (tIdx !== -1) {
            setSelectedTile(tIdx);
            const drawInfo = getTileDrawInfo(tIdx, clickedObj.tilesetKey || activeTileset);
            if (drawInfo?.tilesetKey) setActiveTileset(drawInfo.tilesetKey);
          }
        } else {
          const tsInfo = getTilesetInfoLocal(clickedObj.tilesetKey);
          if (tsInfo) {
            const lIdx = clickedObj.startRow * tsInfo.cols + clickedObj.startCol;
            setSelectedTile(getPrefixedIndex(lIdx, clickedObj.tilesetKey));
            setActiveTileset(clickedObj.tilesetKey);
          }
        }
        return;
      }

      // B. Check 1x1 tile on decorLayer or baseLayer at (tx, ty) to move it
      const dTile = localMap.decorLayer[ty] ? localMap.decorLayer[ty][tx] : -1;
      const bTile = localMap.baseLayer[ty] ? localMap.baseLayer[ty][tx] : -1;
      const defaultBase = localMap.tileset === 'interior' ? 1199 : 2000;
      const isBasePick = editLayer === 'base' || (dTile === -1 && bTile !== -1 && bTile !== defaultBase);
      const targetTile = isBasePick ? bTile : dTile;

      if (targetTile !== -1 && targetTile !== 1199 && targetTile !== 2000) {
        setHistory(prev => [...prev, localMap]);
        setRedoHistory([]);

        const drawInfo = getTileDrawInfo(targetTile, activeTileset);
        const tsKey = drawInfo?.tilesetKey || activeTileset;
        const tsInfo = getTilesetInfoLocal(tsKey);
        const startCol = drawInfo && tsInfo ? (drawInfo.localIdx % tsInfo.cols) : 0;
        const startRow = drawInfo && tsInfo ? Math.floor(drawInfo.localIdx / tsInfo.cols) : 0;

        const newObj: MapObjectInstance = {
          id: `obj_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          tilesetKey: tsKey,
          startCol,
          startRow,
          width: 1,
          height: 1,
          x: tx,
          y: ty,
          layer: isBasePick ? 'base' : 'decor',
          zIndex: Date.now(),
          tiles: [[targetTile]]
        };

        setLocalMap(prev => {
          const newDecor = prev.decorLayer.map(r => [...r]);
          const newBase = prev.baseLayer.map(r => [...r]);
          if (isBasePick) {
            newBase[ty][tx] = defaultBase; // 🎯 ERASE OLD BASE TILE FROM MAP!
          } else {
            newDecor[ty][tx] = -1; // 🎯 ERASE OLD DECOR TILE FROM MAP!
          }
          return {
            ...prev,
            decorLayer: newDecor,
            baseLayer: newBase,
            objects: [...(prev.objects || []), newObj]
          };
        });

        setSelectedObjectId(newObj.id);
        setIsDraggingObject(true);
        setObjectDragStart({ originX: e.clientX, originY: e.clientY, startTx: tx, startTy: ty });

        // 🎯 Update "현재 선택된 브러시" preview box in palette panel!
        setSelectedTile(targetTile);
        if (tsKey) setActiveTileset(tsKey);
        return;
      }

      // C. Click on empty ground cell without Alt -> Clear object selection
      setSelectedObjectId(null);
      setIsDraggingObject(false);
      setObjectDragStart(null);
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    if (tool === 'bucket') {
      performFloodFill(tx, ty, selectedTile);
    } else {
      isPainting.current = true;
      lastPaintedCellRef.current = { x: tx, y: ty };
      handlePaint(tx, ty);

      // Clean anchor: clear stamp & deselect only when placing a palette object!
      if (paletteSelection) {
        setPaletteSelection(null);
        setSelectedObjectId(null);
      }
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = 16 * zoom;
    const tx = Math.floor(clickX / tileSize);
    const ty = Math.floor(clickY / tileSize);

    setHoverTile(prev => {
      if (prev?.x === tx && prev?.y === ty) return prev;
      return { x: tx, y: ty };
    });

    if (isDraggingObject && selectedObjectId && objectDragStart && e.buttons === 1) {
      const deltaTx = Math.round((e.clientX - objectDragStart.originX) / tileSize);
      const deltaTy = Math.round((e.clientY - objectDragStart.originY) / tileSize);
      const targetTx = Math.max(0, Math.min(localMap.width - 1, objectDragStart.startTx + deltaTx));
      const targetTy = Math.max(0, Math.min(localMap.height - 1, objectDragStart.startTy + deltaTy));

      const curObj = localMap.objects?.find(o => o.id === selectedObjectId);
      if (curObj && (curObj.x !== targetTx || curObj.y !== targetTy)) {
        handleMoveObjectTiles(selectedObjectId, targetTx, targetTy);
      }
      return;
    }

    // Drag to select box area on map ONLY when Alt is held in select mode
    if (tool === 'select' && mapBoxSelectStart && (e.altKey || isAltPressed) && e.buttons === 1) {
      const sCol = Math.min(mapBoxSelectStart.tx, tx);
      const sRow = Math.min(mapBoxSelectStart.ty, ty);
      const eCol = Math.max(mapBoxSelectStart.tx, tx);
      const eRow = Math.max(mapBoxSelectStart.ty, ty);
      const cols = eCol - sCol + 1;
      const rows = eRow - sRow + 1;
      setMapBoxSelection({ startCol: sCol, startRow: sRow, cols, rows });
      return;
    }

    if (!isPainting.current || (tool as string) !== 'brush' || e.altKey || isAltPressed) return;

    // Do NOT drag-spawn multi-tile objects on MouseMove!
    const isMultiTile = !!paletteSelection || brushSize > 1;
    if (isMultiTile) return;

    if (lastPaintedCellRef.current?.x === tx && lastPaintedCellRef.current?.y === ty) return;
    lastPaintedCellRef.current = { x: tx, y: ty };
    handlePaint(tx, ty);
  };

  const handleCanvasMouseUp = () => {
    isPainting.current = false;
    lastPaintedCellRef.current = null;
    setIsDraggingObject(false);
    setObjectDragStart(null);
    setMapBoxSelectStart(null);
  };

  const handleCanvasMouseLeave = () => {
    isPainting.current = false;
    lastPaintedCellRef.current = null;
    setHoverTile(null);
  };

  // Mouse wheel zoom over map viewport
  const handleCanvasWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))));
    } else {
      setZoom(prev => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))));
    }
  };

  // Map Resize Handler
  // Clear All Map Contents Handler (Reset map to 100% empty black canvas)
  const handleClearAllMapContents = () => {
    if (!window.confirm("정말 지도의 모든 타일과 오브젝트를 삭제하고 빈 화면(검은색)으로 초기화하시겠습니까?")) {
      return;
    }
    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const emptyBase = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => -1));
    const emptyDecor = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => -1));
    const emptyCollision = Array.from({ length: localMap.height }, () => Array.from({ length: localMap.width }, () => false));

    setLocalMap(prev => ({
      ...prev,
      baseLayer: emptyBase,
      decorLayer: emptyDecor,
      collision: emptyCollision,
      objects: []
    }));

    setSelectedObjectId(null);
    setMapBoxSelection(null);
    setMapBoxSelectStart(null);
    alert("지도의 모든 내역이 초기화되어 빈 화면(검은색)이 되었습니다.");
  };

  const handleResizeMap = () => {
    const newW = parseInt(widthInput, 10);
    const newH = parseInt(heightInput, 10);

    if (isNaN(newW) || isNaN(newH) || newW < 5 || newW > 100 || newH < 5 || newH > 100) {
      alert('지도 가로 및 세로 크기는 5에서 100 사이의 숫자로 입력해 주세요.');
      return;
    }

    setHistory(prev => [...prev, localMap]);
    setRedoHistory([]);

    const newBase = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) =>
        y < localMap.height && x < localMap.width ? localMap.baseLayer[y][x] : (localMap.tileset === 'interior' ? 1199 : 2000)
      )
    );

    const newDecor = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) =>
        y < localMap.height && x < localMap.width ? localMap.decorLayer[y][x] : -1
      )
    );

    const newCollision = Array.from({ length: newH }, (_, y) =>
      Array.from({ length: newW }, (_, x) => {
        if (x === 0 || x === newW - 1 || y === 0 || y === newH - 1) return true;
        if (y < localMap.height && x < localMap.width) return localMap.collision[y][x];
        return false;
      })
    );

    const boundedSpawns = localMap.spawnPoints.map(p => ({
      x: Math.min(p.x, newW - 2),
      y: Math.min(p.y, newH - 2)
    }));

    const updated: MapDefinition = {
      ...localMap,
      width: newW,
      height: newH,
      baseLayer: newBase,
      decorLayer: newDecor,
      collision: newCollision,
      spawnPoints: boundedSpawns
    };

    setLocalMap(updated);
    alert(`지도 크기가 ${newW}x${newH}로 변경되었습니다! (저장을 눌러야 최종 반영됩니다)`);
  };

  const getSelectedTileDetails = () => {
    if (selectedTile === -1) {
      return { col: 0, row: 0, label: '지우개 🧽', url: '', cols: tilesetCols, tileW: 16, tileH: 16 };
    }
    const drawInfo = getTileDrawInfo(selectedTile, activeTileset);
    if (!drawInfo) return { col: 0, row: 0, label: '지우개 🧽', url: '', cols: tilesetCols, tileW: 16, tileH: 16 };
    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
    const img = images[drawInfo.tilesetKey];
    const tileW = img ? Math.max(1, Math.floor(img.width / tsInfo.cols)) : 16;
    const tileH = img ? Math.max(1, Math.floor(img.height / tsInfo.rows)) : 16;
    return {
      col: drawInfo.localIdx % tsInfo.cols,
      row: Math.floor(drawInfo.localIdx / tsInfo.cols),
      label: `${tsInfo.label} (ID: ${drawInfo.localIdx})`,
      url: tsInfo.url,
      cols: tsInfo.cols,
      tileW,
      tileH
    };
  };

  const getPrefixedIndex = (localIdx: number, tilesetKey: string) => {
    if (localIdx === -1) return -1;
    const custom = customMapTilesets.find(ct => ct.id === tilesetKey);
    if (custom && custom.prefix) {
      return custom.prefix + localIdx;
    }
    switch (tilesetKey) {
      case 'interior': return 1000 + localIdx;
      case 'outdoor': return 2000 + localIdx;
      case 'village': return 3000 + localIdx;
      case 'wall': return 4000 + localIdx;
      case 'house': return 5000 + localIdx;
      case 'nature': return 6000 + localIdx;
      case 'water': return 7000 + localIdx;
      case 'field': return 8000 + localIdx;
      default: return localIdx;
    }
  };

  const getOffsetTile = (baseTileIdx: number, currentTsKey: string, dx: number, dy: number): number => {
    if (baseTileIdx === -1) return -1;
    const drawInfo = getTileDrawInfo(baseTileIdx, currentTsKey);
    if (!drawInfo) return baseTileIdx;

    const tsInfo = getTilesetInfoLocal(drawInfo.tilesetKey);
    const baseCol = drawInfo.localIdx % tsInfo.cols;
    const baseRow = Math.floor(drawInfo.localIdx / tsInfo.cols);

    const targetCol = baseCol + dx;
    const targetRow = baseRow + dy;

    if (targetCol >= tsInfo.cols || targetRow >= tsInfo.rows) {
      return baseTileIdx;
    }

    const targetLocalIdx = targetRow * tsInfo.cols + targetCol;
    return getPrefixedIndex(targetLocalIdx, drawInfo.tilesetKey);
  };

  const tileDetails = getSelectedTileDetails();

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: '#111116', zIndex: 140, display: 'flex', flexDirection: 'column',
      color: '#fff', fontFamily: 'var(--font-pixel)', userSelect: 'none'
    }}>
      {/* 1. Photoshop-Style Compact Header Toolbar */}
      <div style={{
        padding: "4px 16px 0px 16px", borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(20, 20, 32, 0.98)", display: "flex", justifyContent: "space-between",
        alignItems: "flex-end", minHeight: "38px", zIndex: 10
      }}>
        {/* Left Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "4px" }}>
          <button
            onClick={handleCancel}
            style={{
              padding: "4px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)",
              borderRadius: "4px", color: "#fff", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px",
              cursor: "pointer"
            }}
          >
            <X size={13} /> 닫기
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "4px 12px", background: "var(--primary)", border: "1px solid var(--primary-hover)",
              borderRadius: "4px", color: "#fff", fontSize: "11px", display: "flex", alignItems: "center", gap: "4px",
              fontWeight: "normal", cursor: "pointer"
            }}
          >
            <Save size={13} /> 저장하기
          </button>

          {/* Undo & Redo Icons attached right next to 저장하기 */}
          <div style={{ display: "flex", alignItems: "center", gap: "2px", marginLeft: "6px" }}>
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              style={{
                padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)",
                borderRadius: "4px 0 0 4px", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: history.length === 0 ? "not-allowed" : "pointer", opacity: history.length === 0 ? 0.3 : 1
              }}
              title="실행 취소 (Ctrl + Z)"
            >
              <Undo size={13} />
            </button>
            <button
              onClick={handleRedo}
              disabled={redoHistory.length === 0}
              style={{
                padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-glass)",
                borderLeft: "none", borderRadius: "0 4px 4px 0", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: redoHistory.length === 0 ? "not-allowed" : "pointer", opacity: redoHistory.length === 0 ? 0.3 : 1
              }}
              title="다시 실행 (Ctrl + Y)"
            >
              <Redo size={13} />
            </button>
          </div>
        </div>

        {/* Center: Photoshop Document Tabs with Compact Add Button */}
        <div style={{ display: "flex", gap: "2px", alignItems: "flex-end" }}>
          {availableMapIds.map((mId) => {
            const mapObj = activeMaps[mId];
            const name = mapObj ? mapObj.name : mId;
            const isSelected = selectedMapId === mId;
            const canDelete = availableMapIds.length > 1;

            return (
              <div
                key={mId}
                style={{
                  display: "flex", alignItems: "center", gap: "4px",
                  padding: "5px 10px", borderRadius: "6px 6px 0 0",
                  background: isSelected ? "#1e1e2e" : "rgba(255, 255, 255, 0.03)",
                  color: isSelected ? "#fff" : "rgba(255, 255, 255, 0.65)",
                  borderTop: isSelected ? "2px solid #89b4fa" : "2px solid transparent",
                  borderLeft: isSelected ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.03)",
                  borderRight: isSelected ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.03)",
                  borderBottom: "none",
                  transition: "all 0.15s ease",
                  cursor: "pointer"
                }}
                onClick={() => {
                  if (!isSelected) {
                    const hasChanges = JSON.stringify(localMap) !== JSON.stringify(originalMap);
                    if (hasChanges) {
                      if (!window.confirm("저장하지 않은 변경사항이 있습니다. 다른 지도로 이동하시겠습니까?")) {
                        return;
                      }
                    }
                    setSelectedMapId(mId);
                  }
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: isSelected ? "bold" : "normal" }}>
                  {name}
                </span>

                {/* Rename button (✏️) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = window.prompt(`'${name}' 맵의 새로운 이름을 입력하세요:`, name);
                    if (newName && newName.trim() && newName.trim() !== name) {
                      if (onRenameMap) {
                        onRenameMap(mId, newName.trim());
                      }
                      if (mId === selectedMapId) {
                        setLocalMap((prev) => ({ ...prev, name: newName.trim() }));
                      }
                    }
                  }}
                  title="맵 이름 변경"
                  style={{
                    background: "none", border: "none",
                    color: "rgba(255, 255, 255, 0.4)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "1px", borderRadius: "3px", marginLeft: "2px"
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "#89b4fa";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.color = "rgba(255, 255, 255, 0.4)";
                  }}
                >
                  <Pencil size={10} />
                </button>

                {/* Delete button (×) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canDelete) {
                      alert("최소 1개의 맵은 항상 유지되어야 합니다.");
                      return;
                    }
                    if (window.confirm(`'${name}' 맵을 에디터 및 서버 DB에서 영구 삭제하시겠습니까?`)) {
                      onDeleteMap(mId);
                      if (selectedMapId === mId) {
                        const remaining = availableMapIds.filter((id) => id !== mId);
                        if (remaining.length > 0) {
                          setSelectedMapId(remaining[0]);
                        }
                      }
                    }
                  }}
                  title={canDelete ? `${name} 맵 삭제` : "최소 1개 맵 필수"}
                  style={{
                    background: "none", border: "none",
                    color: canDelete ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.15)",
                    cursor: canDelete ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "1px", borderRadius: "3px", marginLeft: "1px"
                  }}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
          {availableMapIds.length < 4 && (
            <button
              onClick={() => setShowAddModal(true)}
              title="새 맵 추가 (최대 4개)"
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                padding: "5px 10px", borderRadius: "6px 6px 0 0",
                background: "rgba(255, 255, 255, 0.03)",
                color: "var(--accent)",
                borderTop: "2px solid transparent",
                borderLeft: "1px solid rgba(255,255,255,0.03)",
                borderRight: "1px solid rgba(255,255,255,0.03)",
                borderBottom: "none",
                cursor: "pointer", transition: "all 0.15s ease",
                fontSize: "11px", fontWeight: "normal"
              }}
            >
              <Plus size={12} />
              <span>추가</span>
            </button>
          )}
        </div>

        {/* Right Actions: Reset */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "4px" }}>
          <button
            onClick={handleResetToDefault}
            style={{
              padding: "4px 10px", background: "rgba(243, 139, 168, 0.1)", color: "var(--danger)",
              border: "1px solid rgba(243, 139, 168, 0.25)", borderRadius: "4px", fontSize: "11px",
              display: "flex", alignItems: "center", gap: "4px", cursor: "pointer"
            }}
          >
            <Trash2 size={13} /> 리셋
          </button>
        </div>
      </div>
      {/* 2. Main Editor Workspace (3-column layout) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Map Properties Panel with 3 Compact Tabs (기본, 크기, 옵션) */}
        <div style={{
          width: '260px', borderRight: '1px solid var(--border-glass)',
          background: 'rgba(20, 20, 30, 0.5)', display: 'flex',
          flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Tab Header Row */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(15, 15, 24, 0.8)', padding: '4px 4px 0 4px', gap: '2px'
          }}>
            {(['basic', 'size', 'option'] as const).map((tabKey) => {
              const isActive = leftSidebarTab === tabKey;
              const label = tabKey === 'basic' ? '⚙️ 기본' : tabKey === 'size' ? '📐 크기' : '👁️ 옵션';
              return (
                <button
                  key={tabKey}
                  onClick={() => setLeftSidebarTab(tabKey)}
                  style={{
                    flex: 1, padding: '7px 2px', fontSize: '11px', fontWeight: isActive ? 'bold' : 'normal',
                    color: isActive ? '#fff' : 'rgba(255, 255, 255, 0.6)',
                    background: isActive ? '#1e1e2e' : 'rgba(255, 255, 255, 0.02)',
                    borderTop: isActive ? '2px solid #89b4fa' : '2px solid transparent',
                    borderLeft: isActive ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    borderRight: isActive ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    borderBottom: 'none', borderRadius: '4px 4px 0 0',
                    cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab Body Scrollable Container */}
          <div style={{ flex: 1, padding: '14px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Tab 1: ⚙️ 기본 (레이어, 도구, 브러시 크기 설정) */}
            {leftSidebarTab === 'basic' && (
              <>
                {/* Section 1: 레이어 (Layer Selector) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <h4 style={{ fontSize: '11px', color: 'var(--accent)', margin: '0 0 2px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>▪</span> 레이어
                  </h4>

                  {/* 1. 1단계 레이어(바닥) + 노출 체크박스 */}
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button
                      onClick={() => {
                        setEditLayer("base");
                        if (selectedTile === 1 || selectedTile === 0 || selectedTile === -1) {
                          setSelectedTile(getPrefixedIndex(0, activeTileset));
                        }
                        if (tool === "select") setTool("brush");
                      }}
                      style={{
                        flex: 1, padding: "7px 10px", fontSize: "11px", borderRadius: "4px",
                        background: editLayer === "base" ? "rgba(139, 92, 246, 0.2)" : "rgba(255,255,255,0.03)",
                        color: editLayer === "base" ? "var(--accent)" : "#fff",
                        border: editLayer === "base" ? "1px solid var(--accent)" : "1px solid var(--border-glass)",
                        textAlign: "left", cursor: "pointer", fontWeight: "normal"
                      }}
                    >
                      1단계 레이어(바닥)
                    </button>
                    <label
                      style={{
                        display: "flex", alignItems: "center", gap: "3px", padding: "6px 8px",
                        fontSize: "11px", color: showBase ? "var(--accent)" : "#888",
                        background: showBase ? "rgba(139, 92, 246, 0.1)" : "rgba(255,255,255,0.02)",
                        border: showBase ? "1px solid var(--accent)" : "1px solid var(--border-glass)",
                        borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap"
                      }}
                      title="1단계 레이어 노출/숨김"
                    >
                      <input
                        type="checkbox"
                        checked={showBase}
                        onChange={(e) => setShowBase(e.target.checked)}
                        style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                      />
                      👁️
                    </label>
                  </div>

                  {/* 2. 2단계 레이어(장식) + 노출 체크박스 */}
                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                    <button
                      onClick={() => {
                        setEditLayer("decor");
                        if (selectedTile === 1 || selectedTile === 0 || selectedTile === -1) {
                          setSelectedTile(getPrefixedIndex(0, activeTileset));
                        }
                        if (tool === "select") setTool("brush");
                      }}
                      style={{
                        flex: 1, padding: "7px 10px", fontSize: "11px", borderRadius: "4px",
                        background: editLayer === "decor" ? "rgba(139, 92, 246, 0.2)" : "rgba(255,255,255,0.03)",
                        color: editLayer === "decor" ? "var(--accent)" : "#fff",
                        border: editLayer === "decor" ? "1px solid var(--accent)" : "1px solid var(--border-glass)",
                        textAlign: "left", cursor: "pointer", fontWeight: "normal"
                      }}
                    >
                      2단계 레이어(장식)
                    </button>
                    <label
                      style={{
                        display: "flex", alignItems: "center", gap: "3px", padding: "6px 8px",
                        fontSize: "11px", color: showDecor ? "var(--accent)" : "#888",
                        background: showDecor ? "rgba(139, 92, 246, 0.1)" : "rgba(255,255,255,0.02)",
                        border: showDecor ? "1px solid var(--accent)" : "1px solid var(--border-glass)",
                        borderRadius: "4px", cursor: "pointer", whiteSpace: "nowrap"
                      }}
                      title="2단계 레이어 노출/숨김"
                    >
                      <input
                        type="checkbox"
                        checked={showDecor}
                        onChange={(e) => setShowDecor(e.target.checked)}
                        style={{ accentColor: "var(--accent)", cursor: "pointer" }}
                      />
                      👁️
                    </label>
                  </div>

                  {/* 3. 이동 불가지역 Row with [추가] and [제거] buttons right next to it! */}
                  <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        setEditLayer('collision');
                        setSelectedTile(1);
                        setTool('brush');
                        setSelectedObjectId(null);
                        setPaletteSelection(null);
                        setShowCollision(true);
                      }}
                      style={{
                        flex: 1, padding: '7px 8px', fontSize: '11px', borderRadius: '4px',
                        background: editLayer === 'collision' ? 'rgba(243, 139, 168, 0.2)' : 'rgba(255,255,255,0.03)',
                        color: editLayer === 'collision' ? '#f38ba8' : '#fff',
                        border: editLayer === 'collision' ? '1px solid #f38ba8' : '1px solid var(--border-glass)',
                        textAlign: 'left', cursor: 'pointer', fontWeight: 'normal', whiteSpace: 'nowrap'
                      }}
                    >
                      이동 불가지역
                    </button>

                    <button
                      onClick={() => {
                        setEditLayer('collision');
                        setSelectedTile(1);
                        setTool('brush');
                        setSelectedObjectId(null);
                        setPaletteSelection(null);
                        setShowCollision(true);
                      }}
                      style={{
                        padding: '7px 8px', fontSize: '10px', borderRadius: '4px',
                        background: editLayer === 'collision' && selectedTile === 1 ? 'var(--danger)' : 'rgba(255,255,255,0.04)',
                        color: editLayer === 'collision' && selectedTile === 1 ? '#fff' : 'rgba(255,255,255,0.7)',
                        border: editLayer === 'collision' && selectedTile === 1 ? '1px solid var(--danger)' : '1px solid var(--border-glass)',
                        fontWeight: 'normal', cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                      title="이동 불가지역 (충돌 벽) 추가"
                    >
                      추가
                    </button>

                    <button
                      onClick={() => {
                        setEditLayer('collision');
                        setSelectedTile(0);
                        setTool('brush');
                        setSelectedObjectId(null);
                        setPaletteSelection(null);
                        setShowCollision(true);
                      }}
                      style={{
                        padding: '7px 8px', fontSize: '10px', borderRadius: '4px',
                        background: editLayer === 'collision' && selectedTile === 0 ? '#a6e3a1' : 'rgba(255,255,255,0.04)',
                        color: editLayer === 'collision' && selectedTile === 0 ? '#000' : 'rgba(255,255,255,0.7)',
                        border: editLayer === 'collision' && selectedTile === 0 ? '1px solid #a6e3a1' : '1px solid var(--border-glass)',
                        fontWeight: 'normal', cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                      title="이동 불가지역 (충돌 벽) 제거"
                    >
                      제거
                    </button>
                  </div>
                </div>

                {/* Section 2: 그리기 도구 설정 (Vertical Tools Stack - Disabled when in collision layer mode!) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  <h4 style={{ fontSize: '11px', color: 'var(--accent)', margin: '0 0 2px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>▪</span> 그리기 도구 설정
                  </h4>
                  
                  {/* Vertical Tool Switcher Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {/* 1. 선택(V) */}
                    <button
                      onClick={() => setTool('select')}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: tool === 'select' && editLayer !== 'collision' ? 'rgba(245, 194, 231, 0.3)' : 'rgba(255,255,255,0.03)',
                        color: tool === 'select' && editLayer !== 'collision' ? '#f5c2e7' : '#fff',
                        border: tool === 'select' && editLayer !== 'collision' ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        fontWeight: tool === 'select' && editLayer !== 'collision' ? 'bold' : 'normal',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="오브젝트 스마트 선택 & 이동/편집 (단축키: V)"
                    >
                      <MousePointer size={12} /> 선택(V)
                    </button>

                    {/* 2. 스포이드(E) */}
                    <button
                      onClick={() => {
                        setTool('eyedropper');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? 'rgba(137, 220, 235, 0.3)' : 'rgba(255,255,255,0.03)',
                        color: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? '#89dceb' : '#fff',
                        border: (tool === 'eyedropper' || isAltPressed) && editLayer !== 'collision' ? '1px solid #89dceb' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="스포이드 (단축키: Alt + 클릭 / E)"
                    >
                      <Pipette size={12} /> 스포이드(E)
                    </button>

                    {/* 3. 브러시(B) */}
                    <button
                      onClick={() => {
                        setTool('brush');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                        color: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? 'var(--accent)' : '#fff',
                        border: tool === 'brush' && selectedTile !== -1 && editLayer !== 'collision' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="일반 브러시 타일 그리기 (단축키: B)"
                    >
                      <Paintbrush size={12} /> 브러시(B)
                    </button>

                    {/* 4. 채우기(F) */}
                    <button
                      onClick={() => {
                        setTool('bucket');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)',
                        color: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? 'var(--accent)' : '#fff',
                        border: tool === 'bucket' && selectedTile !== -1 && editLayer !== 'collision' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="영역 채우기 (단축키: F)"
                    >
                      <PaintBucket size={12} /> 채우기(F)
                    </button>

                    {/* 5. 오브젝트(O) */}
                    <button
                      onClick={() => {
                        setTool('object');
                        if (selectedTile === -1) setSelectedTile(getPrefixedIndex(0, activeTileset));
                      }}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: tool === 'object' && editLayer !== 'collision' ? 'rgba(250, 179, 135, 0.3)' : 'rgba(255,255,255,0.03)',
                        color: tool === 'object' && editLayer !== 'collision' ? '#fab387' : '#fff',
                        border: tool === 'object' && editLayer !== 'collision' ? '1px solid #fab387' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        fontWeight: tool === 'object' && editLayer !== 'collision' ? 'bold' : 'normal',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="독립 오브젝트 스탬프 배치 (단축키: O)"
                    >
                      <Layers size={12} /> 오브젝트(O)
                    </button>

                    {/* 6. 지우개 모드(X) */}
                    <button
                      onClick={() => {
                        setSelectedTile(-1);
                        setTool('brush');
                      }}
                      disabled={editLayer === 'collision'}
                      style={{
                        width: '100%', padding: '6px 10px', fontSize: '11px', borderRadius: '4px',
                        background: selectedTile === -1 && editLayer !== 'collision' ? 'var(--danger)' : 'rgba(255,255,255,0.03)',
                        color: '#fff', border: selectedTile === -1 && editLayer !== 'collision' ? '1px solid var(--danger)' : '1px solid var(--border-glass)',
                        display: 'flex', alignItems: 'center', gap: '6px', cursor: editLayer === 'collision' ? 'not-allowed' : 'pointer',
                        fontWeight: selectedTile === -1 && editLayer !== 'collision' ? 'bold' : 'normal',
                        opacity: editLayer === 'collision' ? 0.4 : 1
                      }}
                      title="지우개 (단축키: X)"
                    >
                      <Eraser size={12} /> 지우개 모드(X)
                    </button>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#ccc', cursor: 'pointer', marginTop: '4px' }}>
                      <input
                        type="checkbox"
                        checked={autoCollision}
                        onChange={(e) => setAutoCollision(e.target.checked)}
                      />
                      가구 배치 시 자동 충돌막 설정
                    </label>
                  </div>
                </div>

                {/* Section 3: 브러시 크기 (Title size matching Section 1 & 2!) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                  <h4 style={{ fontSize: '11px', color: 'var(--accent)', margin: '0 0 2px 0', borderBottom: '1px solid var(--border-glass)', paddingBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '9px', opacity: 0.7 }}>▪</span> 브러시 크기
                  </h4>

                  {/* Preset 1x1, 2x2, 3x3, 4x4 Row */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {([1, 2, 3, 4] as const).map((sz) => {
                      const isSelected = brushSize === sz;
                      return (
                        <button
                          key={sz}
                          onClick={() => {
                            setBrushSize(sz);
                            setCustomBrushInput(String(sz));
                          }}
                          style={{
                            flex: 1, padding: '5px 2px', fontSize: '10px', borderRadius: '4px',
                            background: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.03)',
                            color: isSelected ? '#000' : '#fff',
                            border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                            fontWeight: 'normal', cursor: 'pointer', transition: 'all 0.15s ease'
                          }}
                        >
                          {sz}x{sz}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Size Input Row: [숫자] x [숫자] [적용] (Selected Pink Background when custom size is active!) */}
                  {(() => {
                    const isCustomSelected = !([1, 2, 3, 4].includes(brushSize));
                    return (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                        background: isCustomSelected ? 'rgba(245, 194, 231, 0.2)' : 'rgba(255,255,255,0.02)',
                        padding: '6px 8px', borderRadius: '4px',
                        border: isCustomSelected ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                        transition: 'all 0.15s ease',
                        boxShadow: isCustomSelected ? '0 0 10px rgba(245, 194, 231, 0.2)' : 'none'
                      }}>
                        <span style={{ fontSize: '10px', color: isCustomSelected ? '#f5c2e7' : 'var(--text-secondary)', fontWeight: isCustomSelected ? 'bold' : 'normal' }}>
                          사용자 정의:
                        </span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={customBrushInput}
                          onChange={(e) => setCustomBrushInput(e.target.value)}
                          style={{
                            width: '36px', background: '#0a0a0f',
                            border: isCustomSelected ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                            borderRadius: '3px', padding: '3px 4px', fontSize: '11px', color: '#fff', textAlign: 'center'
                          }}
                        />
                        <span style={{ fontSize: '10px', color: isCustomSelected ? '#f5c2e7' : 'var(--text-muted)' }}>x</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={customBrushInput}
                          onChange={(e) => setCustomBrushInput(e.target.value)}
                          style={{
                            width: '36px', background: '#0a0a0f',
                            border: isCustomSelected ? '1px solid #f5c2e7' : '1px solid var(--border-glass)',
                            borderRadius: '3px', padding: '3px 4px', fontSize: '11px', color: '#fff', textAlign: 'center'
                          }}
                        />
                        <button
                          onClick={() => {
                            const val = parseInt(customBrushInput, 10);
                            if (!isNaN(val) && val >= 1 && val <= 20) {
                              setBrushSize(val);
                              if (tool !== 'brush') setTool('brush');
                            } else {
                              alert('브러시 크기는 1에서 20 사이의 숫자로 지정해 주세요.');
                            }
                          }}
                          style={{
                            marginLeft: 'auto', padding: '3px 8px', fontSize: '10px', borderRadius: '3px',
                            background: isCustomSelected ? '#f5c2e7' : 'var(--primary)',
                            color: isCustomSelected ? '#000' : '#fff',
                            border: 'none', fontWeight: 'normal', cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                        >
                          적용
                        </button>
                      </div>
                    );
                  })()}
                </div>
                {/* Section 4: 현재 선택된 브러시 (Placed under Section 3 브러시 크기!) */}
                {(() => {
                  const selInfo = getTileDrawInfo(selectedTile, activeTileset);
                  const tsInfo = selInfo ? getTilesetInfoLocal(selInfo.tilesetKey) : null;
                  const tsCols = tsInfo ? tsInfo.cols : tilesetCols;
                  const startCol = selInfo ? (selInfo.localIdx % tsCols) : 0;
                  const startRow = selInfo ? Math.floor(selInfo.localIdx / tsCols) : 0;
                  const curCols = (paletteSelection && paletteSelection.tilesetKey === activeTileset && paletteSelection.cols > 1) ? paletteSelection.cols : (brushSize || 1);
                  const curRows = (paletteSelection && paletteSelection.tilesetKey === activeTileset && paletteSelection.rows > 1) ? paletteSelection.rows : (brushSize || 1);

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                      <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 2px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 현재 선택된 브러시
                      </h4>
                      <div style={{
                        padding: "8px 10px", borderRadius: "6px",
                        background: "rgba(15, 15, 25, 0.6)", border: "1px solid var(--border-glass)",
                        display: "flex", alignItems: "center", gap: "10px"
                      }}>
                        <div style={{
                          width: `${Math.max(36, Math.min(54, curCols * 18))}px`,
                          height: `${Math.max(36, Math.min(54, curRows * 18))}px`,
                          border: "2px solid var(--accent)",
                          borderRadius: "6px", background: "#000", display: "grid",
                          gridTemplateColumns: `repeat(${curCols}, 1fr)`,
                          overflow: "hidden", imageRendering: "pixelated", padding: "1px", boxSizing: "border-box", flexShrink: 0
                        }}>
                          {selectedTile !== -1 ? (
                            Array.from({ length: curCols * curRows }).map((_, i) => {
                              const dx = i % curCols;
                              const dy = Math.floor(i / curCols);
                              const cellCol = startCol + dx;
                              const cellRow = startRow + dy;
                              const cellLocalIdx = cellRow * tsCols + cellCol;
                              const subTile = getPrefixedIndex(cellLocalIdx, activeTileset);
                              const subInfo = getTileDrawInfo(subTile, activeTileset);
                              if (!subInfo) return <div key={i} />;
                              const subTsInfo = getTilesetInfoLocal(subInfo.tilesetKey);
                              const subCol = subInfo.localIdx % subTsInfo.cols;
                              const subRow = Math.floor(subInfo.localIdx / subTsInfo.cols);
                              return (
                                <div key={i} style={{
                                  width: "100%", height: "100%",
                                  backgroundImage: `url(${subTsInfo.url})`,
                                  backgroundPosition: `-${subCol * 100}% -${subRow * 100}%`,
                                  backgroundSize: `${subTsInfo.cols * 100}% ${subTsInfo.rows * 100}%`,
                                  imageRendering: "pixelated"
                                }} />
                              );
                            })
                          ) : (
                            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%" }}>
                              <span style={{ fontSize: "16px" }}>🧽</span>
                            </div>
                          )}
                        </div>
                        <div style={{ minWidth: 0, overflow: "hidden" }}>
                          <div style={{ fontSize: "9px", color: "var(--text-secondary)" }}>
                            {curCols}x{curRows} 크기 브러시
                          </div>
                          <div style={{ fontSize: "10px", color: "var(--accent)", fontWeight: "bold", marginTop: "2px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {selectedTile === -1 ? "지우개 🧽" : `${tileDetails.label}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </>
            )}

            {/* Tab 2: 📐 크기 (지도 크기) */}
            {leftSidebarTab === "size" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 4px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 지도 크기
                </h4>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginBottom: "4px" }}>가로 (너비)</div>
                    <input
                      type="number"
                      value={widthInput}
                      onChange={(e) => setWidthInput(e.target.value)}
                      style={{
                        width: "100%", background: "#0a0a0f", border: "1px solid var(--border-glass)",
                        borderRadius: "4px", padding: "6px 10px", fontSize: "12px", color: "#fff", textAlign: "center"
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "12px", marginTop: "16px", color: "var(--text-muted)" }}>x</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "9px", color: "var(--text-secondary)", marginBottom: "4px" }}>세로 (높이)</div>
                    <input
                      type="number"
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      style={{
                        width: "100%", background: "#0a0a0f", border: "1px solid var(--border-glass)",
                        borderRadius: "4px", padding: "6px 10px", fontSize: "12px", color: "#fff", textAlign: "center"
                      }}
                    />
                  </div>
                </div>
                <button
                  onClick={handleResizeMap}
                  style={{
                    width: "100%", padding: "8px", background: "var(--primary)", color: "#fff",
                    border: "1px solid var(--primary-hover)", borderRadius: "4px", fontSize: "11px",
                    fontWeight: "normal", cursor: "pointer", marginTop: "4px"
                  }}
                >
                  크기 변경 적용
                </button>

                {/* Map Reset Section under Map Size */}
                <div style={{ marginTop: "16px", borderTop: "1px solid var(--border-glass)", paddingTop: "12px" }}>
                  <h4 style={{ fontSize: "11px", color: "var(--danger)", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 지도 전체 초기화
                  </h4>
                  <button
                    onClick={handleClearAllMapContents}
                    style={{
                      width: "100%", padding: "9px", background: "rgba(243, 139, 168, 0.15)", color: "#f38ba8",
                      border: "1px solid #f38ba8", borderRadius: "4px", fontSize: "11px",
                      fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px"
                    }}
                  >
                    <Trash2 size={13} /> 지도에 모든 내역 초기화 (빈 화면)
                  </button>
                </div>
              </div>
            )}

            {/* Tab 3: 👁️ 옵션 (화면 뷰 옵션) */}
            {leftSidebarTab === "option" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <h4 style={{ fontSize: "11px", color: "var(--accent)", margin: "0 0 4px 0", borderBottom: "1px solid var(--border-glass)", paddingBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", opacity: 0.7 }}>▪</span> 화면 뷰 옵션
                </h4>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showGrid} onChange={e => setShowGrid(e.target.checked)} /> 그리드 격자선 보이기
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showDecor} onChange={e => setShowDecor(e.target.checked)} /> 가구/장식 레이어 노출
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", cursor: "pointer", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={showCollision} onChange={e => setShowCollision(e.target.checked)} /> 벽/통행 경계선 노출 (선명한 빨간색 🔴)
                </label>
              </div>
            )}

            {/* Handy Shortcuts Guide Panel at bottom */}
            <div style={{
              marginTop: 'auto', padding: '10px 12px', background: 'rgba(255, 255, 255, 0.03)',
              borderRadius: '6px', border: '1px solid var(--border-glass)', fontSize: '10px',
              color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px'
            }}>
              <div style={{ color: 'var(--accent)', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                <Info size={12} /> 단축키 팁 (Quick Keys)
              </div>
              <div>• <strong style={{ color: '#89dceb' }}>Space+드래그 / 우클릭</strong>: 지도 이동</div>
              <div>• <strong style={{ color: '#a6e3a1' }}>Ctrl + Z / Y</strong>: 되돌리기/다시실행</div>
              <div>• <strong style={{ color: '#f9e2af' }}>Alt + 클릭 / Alt + 드래그</strong>: 스포이드 / 다중 선택</div>
              <div>• <strong>V</strong>:선택 <strong>B</strong>:브러시 <strong>F</strong>:채우기 <strong>X</strong>:지우개</div>
            </div>

          </div>
        </div>

        {/* Center: Canvas Viewport Area Container */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', height: '100%' }}>
          {/* Floating Zoom & Tool Bar over Viewport (Fixed on top left) */}
          <div style={{
            position: 'absolute', top: '16px', left: '16px', zIndex: 12,
            background: 'rgba(20, 20, 30, 0.85)', padding: '6px 12px', borderRadius: '8px',
            border: '1px solid var(--border-glass)', display: 'flex', gap: '8px', alignItems: 'center',
            backdropFilter: 'blur(8px)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            pointerEvents: 'auto'
          }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>🔍 맵 Zoom:</span>
            {([0.5, 1.0, 1.5, 2.0, 3.0] as const).map((zVal) => (
              <button
                key={zVal}
                onClick={() => setZoom(zVal)}
                style={{
                  padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                  background: zoom === zVal ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                  color: zoom === zVal ? '#fff' : 'var(--text-secondary)',
                  border: zoom === zVal ? '1px solid var(--primary-hover)' : '1px solid var(--border-glass)',
                  fontWeight: 'normal', cursor: 'pointer'
                }}
              >
                {Math.round(zVal * 100)}%
              </button>
            ))}

            <div style={{ width: '1px', height: '14px', background: 'var(--border-glass)' }} />

            <button
              onClick={() => setZoom(prev => Math.max(0.5, parseFloat((prev - 0.25).toFixed(2))))}
              style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >-</button>
            <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--accent)', minWidth: '40px', textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.min(4.0, parseFloat((prev + 0.25).toFixed(2))))}
              style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
            >+</button>
          </div>

          {/* Floating Object Smart Edit Action Bar (Fixed on bottom center) */}
          {selectedObjectId && (
            <div style={{
              position: "absolute", bottom: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 100,
              background: "rgba(20, 20, 32, 0.95)", border: "1px solid #ffd700",
              borderRadius: "8px", padding: "6px 14px", display: "flex", alignItems: "center", gap: "8px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6)", backdropFilter: "blur(10px)",
              pointerEvents: "auto", animation: "fadeIn 0.15s ease-out", whiteSpace: "nowrap"
            }}>
              <span style={{ fontSize: "11px", color: "#ffd700", fontWeight: "normal", whiteSpace: "nowrap" }}>
                📦 오브젝트
              </span>
              <div style={{ width: "1px", height: "14px", background: "rgba(255,255,255,0.2)" }} />
              <button
                onClick={() => handleBringToFront()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="앞으로 가져오기"
              >
                <MoveUp size={12} /> 앞으로
              </button>
              <button
                onClick={() => handleSendToBack()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="뒤로 보내기"
              >
                <MoveDown size={12} /> 뒤로
              </button>
              <button
                onClick={() => handleCopySelectedObject()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "rgba(255,255,255,0.08)",
                  color: "#fff", border: "1px solid var(--border-glass)", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap"
                }}
                title="복사 (Ctrl+C)"
              >
                <Copy size={12} /> 복사
              </button>
              <button
                onClick={() => handleDeleteSelectedObject()}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: "4px", background: "var(--danger)",
                  color: "#fff", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "4px", fontWeight: "normal", whiteSpace: "nowrap"
                }}
                title="삭제 (Delete)"
              >
                <Trash2 size={12} /> 삭제
              </button>
              <button
                onClick={() => setSelectedObjectId(null)}
                style={{ padding: "4px 6px", fontSize: "10px", borderRadius: "4px", background: "transparent", color: "#aaa", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Floating Map Drag-Box Selection Action Bar (Group tiles into Single Object) */}
          {mapBoxSelection && !selectedObjectId && (
            <div style={{
              position: 'absolute', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 100,
              background: 'rgba(20, 20, 32, 0.95)', border: '1px solid #ffd700',
              borderRadius: '8px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '10px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)',
              pointerEvents: 'auto', animation: 'fadeIn 0.15s ease-out'
            }}>
              <span style={{ fontSize: '11px', color: '#ffd700', fontWeight: 'normal' }}>
                📦 맵 범위 선택됨 ({mapBoxSelection.cols}x{mapBoxSelection.rows})
              </span>
              <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.2)' }} />
              <button
                onClick={handleConvertBoxToSingleObject}
                style={{
                  padding: '5px 12px', fontSize: '11px', borderRadius: '4px',
                  background: 'var(--primary)', color: '#fff', border: '1px solid var(--primary-hover)',
                  fontWeight: 'normal', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}
                title="선택한 맵 타일들을 1개의 독립 오브젝트로 통합 묶기"
              >
                <Layers size={13} /> ✨ 1개의 오브젝트로 묶기
              </button>
              <button
                onClick={() => setMapBoxSelection(null)}
                style={{ padding: '4px 6px', fontSize: '10px', borderRadius: '4px', background: 'transparent', color: '#aaa', border: 'none', cursor: 'pointer' }}
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* 🧪 Eyedropper Toast Notification (Fixed on top right) */}
          {pickedToast && (
            <div style={{
              position: 'absolute', top: '16px', right: '16px', zIndex: 12,
              background: 'rgba(137, 220, 235, 0.95)', color: '#11111b', padding: '8px 16px', borderRadius: '8px',
              fontWeight: 'normal', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', gap: '6px', animation: 'fadeIn 0.2s ease-out'
            }}>
              <Sparkles size={14} /> {pickedToast}
            </div>
          )}

          {/* Scrollable Viewport Container */}
          <div
            ref={viewportRef}
            onMouseDown={handleViewportMouseDown}
            onMouseMove={handleViewportMouseMove}
            onMouseUp={handleViewportMouseUp}
            onMouseLeave={handleViewportMouseUp}
            style={{
              width: '100%', height: '100%', background: '#0a0a0f', overflow: 'auto', display: 'block',
              position: 'relative', padding: '60px 40px 40px 40px',
              cursor: isPanningViewport.current ? 'grabbing' : isSpaceHeld ? 'grab' : 'default',
              userSelect: 'none', boxSizing: 'border-box'
            }}
          >
            {/* Canvas Wrapper */}
            <div style={{
              position: 'relative', border: '1px solid #333', boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              margin: 'auto', width: 'fit-content'
            }}>
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={() => isPainting.current = false}
                onMouseLeave={handleCanvasMouseLeave}
                onWheel={handleCanvasWheel}
                style={{
                  display: 'block',
                  cursor: isPanningViewport.current
                    ? 'grabbing'
                    : isSpaceHeld
                      ? 'grab'
                      : (isAltPressed || (tool as string) === 'eyedropper')
                        ? 'crosshair'
                        : tool === 'bucket'
                          ? 'cell'
                          : selectedTile === -1
                            ? 'alias'
                            : 'pointer'
                }}
              />
            </div>
          </div>
        </div>

        {/* Resizable Divider Drag Handle */}
        <div
          onMouseDown={handlePaletteResizeStart}
          style={{
            width: '6px', background: 'rgba(255, 255, 255, 0.05)', cursor: 'col-resize',
            borderLeft: '1px solid var(--border-glass)', borderRight: '1px solid var(--border-glass)',
            display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'background 0.2s'
          }}
          title="좌우 드래그로 크기 조절">
          <div style={{ width: '2px', height: '24px', background: 'rgba(255, 255, 255, 0.3)', borderRadius: '1px' }} />
        </div>

        {/* Right Side: Tileset Palette & Selector Panel */}
        <div style={{
          width: `${paletteWidth}px`, borderLeft: '1px solid var(--border-glass)',
          background: 'rgba(20, 20, 30, 0.65)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          {/* Palette Control Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--border-glass)',
            background: 'rgba(30, 30, 46, 0.9)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 'normal', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🎨 타일셋 브러시 ({paletteWidth}px)
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Palette Tile Zoom Scale */}
              <span style={{ fontSize: "9px", color: "var(--text-secondary)" }}>타일 크기:</span>
              {([1.5, 2.0, 3.0] as const).map((pZoom) => (
                <button
                  key={pZoom}
                  onClick={() => setPaletteZoom(pZoom)}
                  style={{
                    padding: "2px 5px", fontSize: "9px", borderRadius: "3px",
                    background: paletteZoom === pZoom ? "var(--accent)" : "rgba(255,255,255,0.05)",
                    color: paletteZoom === pZoom ? "#000" : "#fff", border: "1px solid var(--border-glass)",
                    fontWeight: "normal", cursor: "pointer"
                  }}
                >
                  {pZoom}x
                </button>
              ))}
          </div>
          </div>

          {/* Tileset Category Dropdown Selector */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-glass)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>타일셋 리스트들</div>
            <select
              value={activeTileset}
              onChange={(e) => {
                const newTs = e.target.value;
                setActiveTileset(newTs);
                setSelectedTile(getPrefixedIndex(0, newTs));
              }}
              style={{
                width: '100%', background: '#0a0a0f', border: '1px solid var(--border-glass)',
                borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '12px',
                outline: 'none', cursor: 'pointer'
              }}
            >
              <option value="interior">🏠 실내 인테리어 (Interior)</option>
              <option value="outdoor">🏡 실외 바닥/도시 (Outdoor)</option>
              <option value="village">🏘️ 마을 건물/벽면 (Village)</option>
              <option value="wall">🧱 돌담/담장 벽 (Wall)</option>
              <option value="house">🪵 목조 통나무집/지붕 (House)</option>
              <option value="nature">🌳 울창한 나무/숲 (Nature)</option>
              <option value="water">🌊 강물/연못/나무다리 (Water)</option>
              <option value="field">🌾 마당/우물/울타리 (Field)</option>

              {customMapTilesets.length > 0 && (
                <optgroup label="🎨 내가 추가한 타일셋">
                  {customMapTilesets.map(ct => (
                    <option key={ct.id} value={ct.id}>
                      🎨 {ct.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Scrollable Visual Tileset Grid Sheet (Direct Cell Rendering & 100% Precise Hit Testing) */}
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", background: "#0d0d12" }}>
            <div
              onMouseLeave={() => {
                setHoverPaletteTile(null);
                setPaletteDragStart(null);
              }}
              onMouseUp={() => setPaletteDragStart(null)}
              style={{
                display: "inline-block", border: "1px solid #333",
                background: "#000", imageRendering: "pixelated", userSelect: "none"
              }}
            >
              {Array.from({ length: tilesetRows }).map((_, r) => (
                <div key={r} style={{ display: "flex" }}>
                  {Array.from({ length: tilesetCols }).map((_, c) => {
                    const localIdx = r * tilesetCols + c;
                    const prefixedIdx = getPrefixedIndex(localIdx, activeTileset);
                    const selDrawInfo = getTileDrawInfo(selectedTile, activeTileset);
                    const selCol = (selDrawInfo && selDrawInfo.tilesetKey === activeTileset) ? (selDrawInfo.localIdx % tilesetCols) : -1;
                    const selRow = (selDrawInfo && selDrawInfo.tilesetKey === activeTileset) ? Math.floor(selDrawInfo.localIdx / tilesetCols) : -1;
                    const curCols = (paletteSelection && paletteSelection.tilesetKey === activeTileset && paletteSelection.cols > 1) ? paletteSelection.cols : 1;
                    const curRows = (paletteSelection && paletteSelection.tilesetKey === activeTileset && paletteSelection.rows > 1) ? paletteSelection.rows : 1;

                    const isSelected = (selectedTile !== -1 && selCol !== -1) &&
                      (c >= selCol && c < selCol + curCols && r >= selRow && r < selRow + curRows);

                    let isHovered = false;
                    if (hoverPaletteTile && !paletteDragStart && !isSelected) {
                      isHovered = c === hoverPaletteTile.col && r === hoverPaletteTile.row;
                    }

                    return (
                      <div
                        key={c}
                        title={`Tile ID: ${localIdx} (Row: ${r}, Col: ${c})`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setPaletteDragStart({ col: c, row: r });
                          setPaletteSelection({ startCol: c, startRow: r, cols: 1, rows: 1, tilesetKey: activeTileset });
                          setSelectedTile(prefixedIdx);
                          setSelectedObjectId(null);
                        }}
                        onMouseEnter={() => {
                          setHoverPaletteTile({ col: c, row: r });
                          if (paletteDragStart) {
                            const sCol = Math.min(paletteDragStart.col, c);
                            const sRow = Math.min(paletteDragStart.row, r);
                            const eCol = Math.max(paletteDragStart.col, c);
                            const eRow = Math.max(paletteDragStart.row, r);
                            const cols = eCol - sCol + 1;
                            const rows = eRow - sRow + 1;
                            setPaletteSelection({ startCol: sCol, startRow: sRow, cols, rows, tilesetKey: activeTileset });
                            const sLocalIdx = sRow * tilesetCols + sCol;
                            setSelectedTile(getPrefixedIndex(sLocalIdx, activeTileset));
                            setBrushSize(Math.max(cols, rows));
                          }
                        }}
                        style={{
                          width: `${16 * paletteZoom}px`,
                          height: `${16 * paletteZoom}px`,
                          backgroundImage: `url(${tilesetUrl})`,
                          backgroundPosition: `-${c * 16 * paletteZoom}px -${r * 16 * paletteZoom}px`,
                          backgroundSize: `${tilesetCols * 16 * paletteZoom}px auto`,
                          imageRendering: "pixelated",
                          border: isSelected 
                            ? "2px solid var(--accent)" 
                            : isHovered 
                              ? "1.5px solid #89dceb" 
                              : "1px solid rgba(255,255,255,0.05)",
                          boxSizing: "border-box", cursor: "pointer"
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Map Modal / Popover inside Map Editor */}
      {showAddModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => setShowAddModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px', padding: '20px 24px', width: '340px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)', color: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ fontSize: '14px', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent)' }} />
                <span>에디터 맵 추가 (현재 {availableMapIds.length} / 최대 4개)</span>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px' }}>
              추가할 프리셋 맵 템플릿을 선택하거나 새 커스텀 맵을 생성하세요:
            </div>

            {/* Presets List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', marginBottom: '14px' }}>
              {Object.entries(PRESET_MAP_TEMPLATES).map(([key, template]) => {
                const isAlreadyAdded = availableMapIds.includes(key);
                return (
                  <button
                    key={key}
                    disabled={isAlreadyAdded}
                    onClick={() => {
                      onAddMap(key);
                      setSelectedMapId(key);
                      setShowAddModal(false);
                    }}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', borderRadius: '6px',
                      background: isAlreadyAdded ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.07)',
                      color: isAlreadyAdded ? '#666' : '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                      textAlign: 'left', fontSize: '12px'
                    }}
                  >
                    <span>{template.name}</span>
                    <span style={{ fontSize: '10px', color: isAlreadyAdded ? '#555' : 'var(--accent)', fontWeight: 'normal' }}>
                      {isAlreadyAdded ? '추가됨' : '+ 선택 추가'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Map Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const name = customNameInput.trim() || `🎨 커스텀 맵 ${availableMapIds.length + 1}`;
                onAddMap(undefined, name);
                setShowAddModal(false);
              }}
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '14px' }}
            >
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px' }}>새 빈 커스텀 맵 직접 만들기:</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="예: 🎨 카페 테라스"
                  value={customNameInput}
                  onChange={(e) => setCustomNameInput(e.target.value)}
                  style={{
                    flex: 1, background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: '8px 14px', background: 'var(--primary)', border: 'none',
                    borderRadius: '6px', color: '#fff', fontSize: '12px', cursor: 'pointer',
                    fontWeight: 'normal', whiteSpace: 'nowrap'
                  }}
                >
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
