import React, { useState, useEffect, useRef } from 'react';
import {
  Layers, User, X, Sparkles, ZoomIn, Plus, Trash2, Upload, Download,
  Pin, Pencil, Eraser, Palette, Save, RotateCcw, Grid, Minus,
  Copy, Clipboard, Trash, Crop, Check, Move, FlipHorizontal, Loader2, Scissors
} from 'lucide-react';
import { DEFAULT_CHAR_ROW_ACTIONS, getCharRowActions } from '../game/MapData';
import { saveHouseAssetToDB, deleteHouseAssetFromDB, getSavedHouseCode } from '../services/HouseService';
import { supabase } from '../lib/supabase';

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

export type MainCategory = 'map' | 'character';

export interface TilesetOption {
  id: string;
  name: string;
  url: string;
  cols: number;
  rows: number;
  size: number;
  prefix?: number;
  isCustom?: boolean;
}

const DEFAULT_MAP_TILESETS: TilesetOption[] = [
  { id: 'interior', name: '🏠 실내 인테리어 (Interior)', url: interiorTilesUrl, cols: 22, rows: 17, size: 16, prefix: 1000 },
  { id: 'outdoor', name: '🌲 야외 / 타운 (Outdoor)', url: outdoorTilesUrl, cols: 22, rows: 26, size: 16, prefix: 2000 },
  { id: 'village', name: '🏡 마을 / 이웃 (Village)', url: villageTilesUrl, cols: 20, rows: 12, size: 16, prefix: 3000 },
  { id: 'wall', name: '🧱 건물 벽 / 울타리 (Wall)', url: wallTilesUrl, cols: 10, rows: 11, size: 16, prefix: 4000 },
  { id: 'house', name: '🏠 지붕 / 외벽 (House)', url: houseTilesUrl, cols: 33, rows: 23, size: 16, prefix: 5000 },
  { id: 'nature', name: '🌳 숲 / 자연 (Nature)', url: natureTilesUrl, cols: 24, rows: 21, size: 16, prefix: 6000 },
  { id: 'water', name: '🌊 호수 / 강물 (Water)', url: waterTilesUrl, cols: 28, rows: 17, size: 16, prefix: 7000 },
  { id: 'field', name: '🌾 들판 / 잔디 (Field)', url: fieldTilesUrl, cols: 5, rows: 15, size: 16, prefix: 8000 },
];

const DEFAULT_CHARACTER_SPRITES: TilesetOption[] = [
  { id: 'samurai_blue', name: '⚔️ 블루 무사 (Samurai Blue)', url: samuraiBlueUrl, cols: 4, rows: 7, size: 16 },
  { id: 'ninja_blue', name: '🥷 닌자 (Ninja Blue)', url: ninjaBlueUrl, cols: 4, rows: 7, size: 16 },
  { id: 'samurai_green', name: '🌿 그린 무사 (Samurai Green)', url: samuraiGreenUrl, cols: 4, rows: 7, size: 16 },
  { id: 'pig', name: '🐷 아기 돼지 (Baby Pig)', url: pigUrl, cols: 2, rows: 1, size: 16 },
];

const PALETTE_COLORS = [
  '#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#ffff00',
  '#ff00ff', '#00ffff', '#ff9900', '#995500', '#ffcc99', '#666666',
  '#333333', '#89b4fa', '#f5c2e7', 'transparent'
];

interface AssetViewerProps {
  onClose: () => void;
  onSelectTile?: (index: number) => void;
}

export const AssetViewer: React.FC<AssetViewerProps> = ({ onClose, onSelectTile }) => {
  // Character tab active by default
  const [activeTab, setActiveTab] = useState<MainCategory>('character');
  
  // Custom uploaded options loaded from localStorage
  const [customMapTilesets, setCustomMapTilesets] = useState<TilesetOption[]>(() => {
    try {
      const saved = localStorage.getItem('on_house_custom_map_tilesets');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customCharSprites, setCustomCharSprites] = useState<TilesetOption[]>(() => {
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Custom asset uploading & DB sync loading state
  const [isSavingAsset, setIsSavingAsset] = useState<boolean>(false);
  const [saveProgressText, setSaveProgressText] = useState<string>('');

  // Sync custom assets from localStorage / Realtime updates
  useEffect(() => {
    const syncLocalAssets = () => {
      try {
        const savedMaps = localStorage.getItem('on_house_custom_map_tilesets');
        if (savedMaps) setCustomMapTilesets(JSON.parse(savedMaps));
        const savedChars = localStorage.getItem('on_house_custom_char_sprites');
        if (savedChars) setCustomCharSprites(JSON.parse(savedChars));
      } catch (e) {}
    };

    window.addEventListener('storage', syncLocalAssets);
    window.addEventListener('on_house_sprites_updated', syncLocalAssets);
    return () => {
      window.removeEventListener('storage', syncLocalAssets);
      window.removeEventListener('on_house_sprites_updated', syncLocalAssets);
    };
  }, []);

  // Character Spritesheet Image Overrides (for drawn pixels or added/deleted rows/cols/size)
  const [charImageOverrides, setCharImageOverrides] = useState<Record<string, { url: string; rows: number; cols: number; size?: number }>>(() => {
    try {
      const saved = localStorage.getItem('on_house_char_image_overrides');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Character Action Names Mapping State
  const [charRowActions, setCharRowActions] = useState<Record<string, string[]>>(() => {
    try {
      const saved = localStorage.getItem('on_house_char_row_actions');
      return saved ? JSON.parse(saved) : DEFAULT_CHAR_ROW_ACTIONS;
    } catch {
      return DEFAULT_CHAR_ROW_ACTIONS;
    }
  });

  const mapOptions = Array.from(
    new Map([...DEFAULT_MAP_TILESETS, ...customMapTilesets].map((m) => [m.id, m])).values()
  );
  const charOptions = Array.from(
    new Map([...DEFAULT_CHARACTER_SPRITES, ...customCharSprites].map((c) => [c.id, c])).values()
  ).map((opt) => {
    const override = charImageOverrides[opt.id];
    if (override) {
      return { ...opt, url: override.url, rows: override.rows, cols: override.cols, size: opt.size || 16 };
    }
    return opt;
  });

  const [selectedMapId, setSelectedMapId] = useState<string>('interior');
  const [selectedCharId, setSelectedCharId] = useState<string>('samurai_blue');
  const [gridZoom, setGridZoom] = useState<number>(2.0);

  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number; index: number; prefixedId?: number } | null>(null);
  const [selectedTileState, setSelectedTileState] = useState<{ col: number; row: number; index: number; prefixedId?: number } | null>(null);

  // Right Click Context Menu & Copy/Paste Buffer State
  const [contextMenuTile, setContextMenuTile] = useState<{ x: number; y: number; col: number; row: number } | null>(null);
  const [copiedFrameBuffer, setCopiedFrameBuffer] = useState<string | null>(null);
  const [copiedFrameRes, setCopiedFrameRes] = useState<number>(16);

  // Drag and Drop Swap Frame State
  const [draggedTile, setDraggedTile] = useState<{ col: number; row: number } | null>(null);

  // Upload Modal State (Default to character category)
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadCategory, setUploadCategory] = useState<MainCategory>('character');
  const [assetNameInput, setAssetNameInput] = useState<string>('');
  const [tileSizeInput, setTileSizeInput] = useState<number>(32);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(0);
  const [imgHeight, setImgHeight] = useState<number>(0);
  const [customColsInput, setCustomColsInput] = useState<number>(4);
  const [customRowsInput, setCustomRowsInput] = useState<number>(9);
  const [isNormalizing, setIsNormalizing] = useState<boolean>(false);

  // Pixel Art Editor Modal State
  const [editingTile, setEditingTile] = useState<{ charId: string; col: number; row: number } | null>(null);
  const [editorGridRes, setEditorGridRes] = useState<number>(16); // 16, 32, or 64
  const [editorZoom, setEditorZoom] = useState<number>(1.0); // Board zoom scale (1x, 1.5x, 2x, 3x, 4x)
  const [pixelGrid, setPixelGrid] = useState<string[][]>(Array.from({ length: 16 }, () => Array(16).fill('transparent')));
  const [selectedColor, setSelectedColor] = useState<string>('#ff0000');
  const [drawTool, setDrawTool] = useState<'pencil' | 'eraser'>('pencil');
  const [isMouseDown, setIsMouseDown] = useState<boolean>(false);
  const editorFileInputRef = useRef<HTMLInputElement | null>(null);

  // Image Crop Modal State for Pixel Editor Import (With Drag, Zoom & Keyboard Nudge)
  const [cropModalImage, setCropModalImage] = useState<string | null>(null);
  const [cropImgWidth, setCropImgWidth] = useState<number>(0);
  const [cropImgHeight, setCropImgHeight] = useState<number>(0);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 16, h: 16 });
  const [cropZoom, setCropZoom] = useState<number>(1.0); // Zoom scale (0.5x, 1x, 2x, 3x, 4x)
  const [isBoxDragging, setIsBoxDragging] = useState<boolean>(false);
  const [boxDragStart, setBoxDragStart] = useState<{ startX: number; startY: number; initRectX: number; initRectY: number } | null>(null);
  const cropViewportRef = useRef<HTMLDivElement | null>(null);

  // New Action Row Prompt State
  const [showAddRowModal, setShowAddRowModal] = useState<boolean>(false);
  const [newActionNameInput, setNewActionNameInput] = useState<string>('');

  // Persist custom assets to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(customMapTilesets));
    } catch (e) {
      console.warn('Failed to save custom map tilesets', e);
    }
  }, [customMapTilesets]);

  useEffect(() => {
    try {
      localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(customCharSprites));
    } catch (e) {
      console.warn('Failed to save custom char sprites', e);
    }
  }, [customCharSprites]);

  useEffect(() => {
    try {
      localStorage.setItem('on_house_char_image_overrides', JSON.stringify(charImageOverrides));

      // Also update customCharSprites list in localStorage so custom sprites have the latest edited URL!
      setCustomCharSprites((prev) => {
        let changed = false;
        const next = prev.map((opt) => {
          const override = charImageOverrides[opt.id];
          if (override && override.url && override.url !== opt.url) {
            changed = true;
            return {
              ...opt,
              url: override.url,
              cols: override.cols || opt.cols,
              rows: override.rows || opt.rows
            };
          }
          return opt;
        });
        if (changed) {
          localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
        }
        return changed ? next : prev;
      });

      // Save each override to Cloud DB & Broadcast to House Realtime channel!
      const currentHouseCode = getSavedHouseCode();
      Object.entries(charImageOverrides).forEach(([id, override]) => {
        if (override && override.url) {
          const foundOpt = customCharSprites.find((c) => c.id === id) || DEFAULT_CHARACTER_SPRITES.find((c) => c.id === id);
          const assetData = {
            id,
            name: foundOpt?.name || id,
            url: override.url,
            cols: override.cols || foundOpt?.cols || 4,
            rows: override.rows || foundOpt?.rows || 7,
            size: override.size || 16,
            isCustom: true
          };

          // Save to Supabase DB
          saveHouseAssetToDB(currentHouseCode, 'char_sprite', assetData);

          // Broadcast to Realtime channel
          try {
            supabase.channel(`house:${currentHouseCode}`).send({
              type: 'broadcast',
              event: 'asset_update',
              payload: {
                assetType: 'char_sprite',
                assetData
              }
            });
          } catch (e) {}
        }
      });

      // Notify game canvas to reload sprites locally
      window.dispatchEvent(new Event('on_house_sprites_updated'));
    } catch (e) {
      console.warn('Failed to save char image overrides', e);
    }
  }, [charImageOverrides]);

  // Keyboard Arrow Keys Nudging for Crop Modal
  useEffect(() => {
    if (!cropModalImage) return;
    const handleCropKeyDown = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, x: Math.max(0, prev.x - step) }));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, x: Math.min(cropImgWidth - prev.w, prev.x + step) }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, y: Math.max(0, prev.y - step) }));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setCropRect((prev) => ({ ...prev, y: Math.min(cropImgHeight - prev.h, prev.y + step) }));
      }
    };
    window.addEventListener('keydown', handleCropKeyDown);
    return () => window.removeEventListener('keydown', handleCropKeyDown);
  }, [cropModalImage, cropImgWidth, cropImgHeight]);

  // Auto-scroll crop viewport container so pink crop box is immediately visible without manual scrolling!
  useEffect(() => {
    if (!cropModalImage || !cropViewportRef.current) return;
    const timer = setTimeout(() => {
      if (!cropViewportRef.current) return;
      const targetY = cropRect.y * cropZoom;
      const targetX = cropRect.x * cropZoom;
      const containerH = cropViewportRef.current.clientHeight || 300;
      const containerW = cropViewportRef.current.clientWidth || 470;

      cropViewportRef.current.scrollTop = Math.max(0, targetY - containerH / 2 + (cropRect.w * cropZoom) / 2);
      cropViewportRef.current.scrollLeft = Math.max(0, targetX - containerW / 2 + (cropRect.w * cropZoom) / 2);
    }, 50);
    return () => clearTimeout(timer);
  }, [cropModalImage, cropRect.x, cropRect.y, cropZoom]);

  // Click outside listener for context menu
  useEffect(() => {
    const handleGlobalClick = () => setContextMenuTile(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const defaultFallbackOption: TilesetOption = {
    id: 'samurai_blue',
    name: '무사 (파랑)',
    url: samuraiBlueUrl,
    cols: 4,
    rows: 7,
    size: 32
  };

  const currentOptionList = activeTab === 'character' ? charOptions : mapOptions;
  const currentSelectedId = activeTab === 'character' ? selectedCharId : selectedMapId;
  const currentOption = (currentOptionList && currentOptionList.length > 0)
    ? (currentOptionList.find((opt) => opt.id === currentSelectedId) || currentOptionList[0])
    : defaultFallbackOption;

  const activeDisplayTile = selectedTileState || hoveredTile;

  // Visual UI display size per tile cell on screen (decoupled from native 16/32/64 tile resolution!)
  const visualCellSize = activeTab === 'character' ? 36 * gridZoom : ((currentOption?.size || 16) * gridZoom);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const col = Math.floor(x / visualCellSize);
    const row = Math.floor(y / visualCellSize);

    if (col >= 0 && col < currentOption.cols && row >= 0 && row < currentOption.rows) {
      const index = row * currentOption.cols + col;
      const prefixedId = currentOption.prefix ? currentOption.prefix + index : undefined;
      setHoveredTile({ col, row, index, prefixedId });
    } else {
      setHoveredTile(null);
    }
  };

  // Right-Click Context Menu Trigger
  const handleTileContextMenu = (e: React.MouseEvent, col: number, row: number) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTileState({ col, row, index: row * currentOption.cols + col });
    setContextMenuTile({
      x: e.clientX,
      y: e.clientY,
      col,
      row
    });
  };

  // 📋 Copy Frame to Clipboard Buffer
  const handleCopyFrame = (col: number, row: number) => {
    const srcResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    const savedRes = localStorage.getItem(srcResKey);
    const srcRes = savedRes ? parseInt(savedRes, 10) : (currentOption.size || 16);
    setCopiedFrameRes(srcRes);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const tileW = Math.max(16, Math.floor(img.width / currentOption.cols));
      const tileH = Math.max(16, Math.floor(img.height / currentOption.rows));
      const canvas = document.createElement('canvas');
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, tileW, tileH);
      setCopiedFrameBuffer(canvas.toDataURL());
      setContextMenuTile(null);
    };
    img.src = currentOption.url;
  };

  // ✂️ Cut Frame (Copy to Clipboard Buffer & Clear Frame Cell)
  const handleCutFrame = (col: number, row: number) => {
    handleCopyFrame(col, row);
    setTimeout(() => {
      handleDeleteFrameColumn(col, row);
    }, 50);
  };

  // 📥 Paste Copied Frame Buffer onto Target Frame
  const handlePasteFrame = (col: number, row: number) => {
    if (!copiedFrameBuffer) return;

    // Persist destination frame resolution to match copied source frame resolution!
    const dstResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    localStorage.setItem(dstResKey, copiedFrameRes.toString());

    const mainImg = new Image();
    mainImg.crossOrigin = 'anonymous';
    mainImg.onload = () => {
      const tileW = Math.max(16, Math.floor(mainImg.width / currentOption.cols));
      const tileH = Math.max(16, Math.floor(mainImg.height / currentOption.rows));
      const patchImg = new Image();
      patchImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = mainImg.width;
        canvas.height = mainImg.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(mainImg, 0, 0);
        ctx.clearRect(col * tileW, row * tileH, tileW, tileH);
        ctx.drawImage(patchImg, 0, 0, patchImg.width, patchImg.height, col * tileW, row * tileH, tileW, tileH);

        const updatedUrl = canvas.toDataURL();
        setCharImageOverrides((prev) => ({
          ...prev,
          [currentSelectedId]: {
            url: updatedUrl,
            rows: currentOption.rows,
            cols: currentOption.cols,
            size: tileW
          }
        }));
        setContextMenuTile(null);
      };
      patchImg.src = copiedFrameBuffer;
    };
    mainImg.src = currentOption.url;
  };

  // 🗑️ Delete/Clear Frame Cell (`col`, `row`)
  // Rule: Clear target cell (col, row). Only shrink `cols` count if target column `col` AND all columns after `col` (c >= col) are completely empty across ALL rows!
  const handleDeleteFrameColumn = (col: number, row: number) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const oldCols = currentOption.cols;
      const rows = currentOption.rows;
      const tileW = Math.max(16, Math.floor(img.width / oldCols));
      const tileH = Math.max(16, Math.floor(img.height / rows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // 1. Draw current full sprite sheet
      ctx.drawImage(img, 0, 0);

      // 2. Clear target cell (col, row) -> make it transparent
      ctx.clearRect(col * tileW, row * tileH, tileW, tileH);

      // Helper: Check if column `c` is completely empty across ALL rows
      const isColumnEmpty = (c: number): boolean => {
        if (c < 0 || c >= oldCols) return true;
        const colData = ctx.getImageData(c * tileW, 0, tileW, img.height).data;
        for (let i = 3; i < colData.length; i += 4) {
          if (colData[i] > 10) return false; // Non-transparent pixel found
        }
        return true;
      };

      // 3. Check if target column `col` AND ALL columns after `col` (c >= col) are empty across ALL rows
      let canTrimFromCol = true;
      for (let c = col; c < oldCols; c++) {
        if (!isColumnEmpty(c)) {
          canTrimFromCol = false;
          break;
        }
      }

      let newCols = oldCols;
      if (canTrimFromCol && oldCols > 1) {
        let lastNonEmptyCol = -1;
        for (let c = col - 1; c >= 0; c--) {
          if (!isColumnEmpty(c)) {
            lastNonEmptyCol = c;
            break;
          }
        }
        newCols = Math.max(1, lastNonEmptyCol + 1);
      }

      // Crop width if column count decreased
      let finalCanvas = canvas;
      if (newCols !== oldCols) {
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = newCols * tileW;
        cropCanvas.height = img.height;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.imageSmoothingEnabled = false;
          cropCtx.drawImage(canvas, 0, 0, cropCanvas.width, cropCanvas.height, 0, 0, cropCanvas.width, cropCanvas.height);
          finalCanvas = cropCanvas;
        }
      }

      const updatedUrl = finalCanvas.toDataURL();

      // Check if after clearing, that action row has no frames left anywhere
      const finalCtx = finalCanvas.getContext('2d');
      let rowIsEmpty = true;
      if (finalCtx) {
        const rowData = finalCtx.getImageData(0, row * tileH, finalCanvas.width, tileH).data;
        for (let i = 3; i < rowData.length; i += 4) {
          if (rowData[i] > 10) {
            rowIsEmpty = false;
            break;
          }
        }
      }

      setContextMenuTile(null);

      // If the row became completely empty and multiple rows exist, delete action row
      if (rowIsEmpty && rows > 1) {
        handleDeleteActionRow(row);
        return;
      }

      // Save updated sprite sheet
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows: currentOption.rows,
          cols: newCols,
          size: tileW
        }
      }));
    };
    img.src = currentOption.url;
  };

  // Toast feedback message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 2200);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // ⌨️ Keyboard Shortcuts & Grid Arrow Navigation Listener
  useEffect(() => {
    if (activeTab !== 'character' || !currentOption) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key events if typing in form inputs
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
        return;
      }

      const cols = currentOption.cols;
      const rows = currentOption.rows;

      const current = selectedTileState || { col: 0, row: 0, index: 0 };
      let newCol = current.col;
      let newRow = current.row;

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const keyLower = e.key ? e.key.toLowerCase() : '';
      const code = e.code || '';

      // 1. Ctrl+C : Copy Frame (Supports both English KeyC and Korean ㅊ layout!)
      if (isCtrlOrCmd && (code === 'KeyC' || keyLower === 'c' || e.key === 'ㅊ')) {
        e.preventDefault();
        handleCopyFrame(current.col, current.row);
        setToastMessage("📋 선택한 프레임이 복사되었습니다! (Ctrl+V로 붙여넣기)");
        return;
      }

      // 2. Ctrl+X : Cut Frame (Supports both English KeyX and Korean ㅌ layout!)
      if (isCtrlOrCmd && (code === 'KeyX' || keyLower === 'x' || e.key === 'ㅌ')) {
        e.preventDefault();
        handleCutFrame(current.col, current.row);
        setToastMessage("✂️ 선택한 프레임이 잘라내기 되었습니다!");
        return;
      }

      // 3. Ctrl+V : Paste Frame (Supports both English KeyV and Korean ㅍ layout!)
      if (isCtrlOrCmd && (code === 'KeyV' || keyLower === 'v' || e.key === 'ㅍ')) {
        e.preventDefault();
        if (copiedFrameBuffer) {
          handlePasteFrame(current.col, current.row);
          setToastMessage("📥 프레임이 붙여넣기 되었습니다!");
        } else {
          setToastMessage("⚠️ 복사된 프레임이 없습니다. 먼저 Ctrl+C로 복사해 주세요!");
        }
        return;
      }

      // 4. Delete / Backspace : Delete Frame Cell
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteFrameColumn(current.col, current.row);
        setToastMessage("🗑️ 선택한 프레임이 삭제되었습니다.");
        return;
      }

      // 5. Arrow Keys : Navigate Pink Highlight Selection Box
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        newCol = Math.max(0, current.col - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        newCol = Math.min(cols - 1, current.col + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        newRow = Math.max(0, current.row - 1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        newRow = Math.min(rows - 1, current.row + 1);
      } else {
        return;
      }

      setSelectedTileState({
        col: newCol,
        row: newRow,
        index: newRow * cols + newCol
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, currentOption, selectedTileState, copiedFrameBuffer, copiedFrameRes]);

  // Drag & Drop Frame Swap Handler
  const handleDropTile = (e: React.DragEvent, dstCol: number, dstRow: number) => {
    e.preventDefault();
    if (!draggedTile) return;
    const { col: srcCol, row: srcRow } = draggedTile;
    if (srcCol === dstCol && srcRow === dstRow) return;

    // Swap resolution preferences in localStorage
    const srcResKey = `on_house_char_frame_res_${currentSelectedId}_${srcRow}_${srcCol}`;
    const dstResKey = `on_house_char_frame_res_${currentSelectedId}_${dstRow}_${dstCol}`;
    const srcRes = localStorage.getItem(srcResKey);
    const dstRes = localStorage.getItem(dstResKey);

    if (dstRes) localStorage.setItem(srcResKey, dstRes);
    else localStorage.removeItem(srcResKey);

    if (srcRes) localStorage.setItem(dstResKey, srcRes);
    else localStorage.removeItem(dstResKey);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cols = currentOption.cols;
      const rows = currentOption.rows;
      const tileW = Math.max(16, Math.floor(img.width / cols));
      const tileH = Math.max(16, Math.floor(img.height / rows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Draw full original image
      ctx.drawImage(img, 0, 0);

      // Crop source tile
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = tileW;
      srcCanvas.height = tileH;
      const srcCtx = srcCanvas.getContext('2d');
      if (srcCtx) srcCtx.drawImage(img, srcCol * tileW, srcRow * tileH, tileW, tileH, 0, 0, tileW, tileH);

      // Crop destination tile
      const dstCanvas = document.createElement('canvas');
      dstCanvas.width = tileW;
      dstCanvas.height = tileH;
      const dstCtx = dstCanvas.getContext('2d');
      if (dstCtx) dstCtx.drawImage(img, dstCol * tileW, dstRow * tileH, tileW, tileH, 0, 0, tileW, tileH);

      // Clear both slots
      ctx.clearRect(srcCol * tileW, srcRow * tileH, tileW, tileH);
      ctx.clearRect(dstCol * tileW, dstRow * tileH, tileW, tileH);

      // Swap draw
      ctx.drawImage(srcCanvas, dstCol * tileW, dstRow * tileH);
      ctx.drawImage(dstCanvas, srcCol * tileW, srcRow * tileH);

      const updatedUrl = canvas.toDataURL();
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows,
          cols,
          size: tileW
        }
      }));

      setSelectedTileState({ col: dstCol, row: dstRow, index: dstRow * cols + dstCol });
      setDraggedTile(null);
    };
    img.src = currentOption.url;
  };

  // Helper to load/resample pixel grid at resolution (16, 32, 64)
  const loadPixelGridForRes = (res: number, col: number, row: number, imageUrl: string) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, res, res);
      // Sample source frame region dynamically using exact image dimensions
      const tileW = Math.max(16, Math.floor(img.width / currentOption.cols));
      const tileH = Math.max(16, Math.floor(img.height / currentOption.rows));

      ctx.drawImage(img, col * tileW, row * tileH, tileW, tileH, 0, 0, res, res);

      const imgData = ctx.getImageData(0, 0, res, res);
      const grid: string[][] = Array.from({ length: res }, () => Array(res).fill('transparent'));

      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const idx = (y * res + x) * 4;
          const r = imgData.data[idx];
          const g = imgData.data[idx + 1];
          const b = imgData.data[idx + 2];
          const a = imgData.data[idx + 3];

          if (a > 10) {
            const hexR = r.toString(16).padStart(2, '0');
            const hexG = g.toString(16).padStart(2, '0');
            const hexB = b.toString(16).padStart(2, '0');
            grid[y][x] = `#${hexR}${hexG}${hexB}`;
          } else {
            grid[y][x] = 'transparent';
          }
        }
      }

      setPixelGrid(grid);
    };
    img.src = imageUrl;
  };

  // Open Pixel Editor for a frame - restores saved grid resolution for this frame!
  const handleOpenPixelEditor = (col: number, row: number) => {
    const frameResKey = `on_house_char_frame_res_${currentSelectedId}_${row}_${col}`;
    const savedRes = localStorage.getItem(frameResKey);

    // Default to character option size (e.g. 64) if no explicit per-frame override exists!
    const defaultRes = currentOption.size || 16;
    const initialRes = savedRes ? parseInt(savedRes, 10) : defaultRes;

    setEditorGridRes(initialRes);
    loadPixelGridForRes(initialRes, col, row, currentOption.url);
    setEditingTile({ charId: currentSelectedId, col, row });
  };

  // Switch Resolution in Pixel Editor (16, 32, 64) & persist!
  const handleChangeGridRes = (newRes: number) => {
    if (!editingTile) return;
    setEditorGridRes(newRes);

    const frameResKey = `on_house_char_frame_res_${editingTile.charId}_${editingTile.row}_${editingTile.col}`;
    localStorage.setItem(frameResKey, newRes.toString());

    loadPixelGridForRes(newRes, editingTile.col, editingTile.row, currentOption.url);
  };

  // Step 1: Select image file -> Open Interactive Image Crop Modal (Default centered crop box matching active grid res!)
  const handleImportImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setCropImgWidth(img.width);
        setCropImgHeight(img.height);
        
        // Default crop box size matches active editorGridRes (16, 32, or 64)!
        const defaultSize = Math.min(img.width, img.height, editorGridRes);
        const centerX = Math.max(0, Math.floor((img.width - defaultSize) / 2));
        const centerY = Math.max(0, Math.floor((img.height - defaultSize) / 2));

        setCropRect({
          x: centerX,
          y: centerY,
          w: defaultSize,
          h: defaultSize
        });
        setCropZoom(1.0);
        setCropModalImage(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Drag selection box handler over the image
  const handleCropBoxMouseMove = (e: React.MouseEvent) => {
    if (!isBoxDragging || !boxDragStart) return;
    const deltaX = Math.round((e.clientX - boxDragStart.startX) / cropZoom);
    const deltaY = Math.round((e.clientY - boxDragStart.startY) / cropZoom);

    const newX = Math.max(0, Math.min(cropImgWidth - cropRect.w, boxDragStart.initRectX + deltaX));
    const newY = Math.max(0, Math.min(cropImgHeight - cropRect.h, boxDragStart.initRectY + deltaY));

    setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
  };

  // Click on image preview container to jump center of selection box
  const handleCropContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isBoxDragging) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / cropZoom);
    const clickY = Math.round((e.clientY - rect.top) / cropZoom);

    const newX = Math.max(0, Math.min(cropImgWidth - cropRect.w, clickX - Math.floor(cropRect.w / 2)));
    const newY = Math.max(0, Math.min(cropImgHeight - cropRect.h, clickY - Math.floor(cropRect.h / 2)));

    setCropRect((prev) => ({ ...prev, x: newX, y: newY }));
  };

  // Step 2: Confirm Crop Selection -> Sample into Pixel Board Grid
  const handleConfirmCropAndApply = () => {
    if (!cropModalImage) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const res = editorGridRes; // 16, 32, or 64
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, res, res);
      // Draw selected cropped sub-rectangle scaled onto res x res canvas
      ctx.drawImage(
        img,
        cropRect.x, cropRect.y, cropRect.w, cropRect.h,
        0, 0, res, res
      );

      const imgData = ctx.getImageData(0, 0, res, res);
      const grid: string[][] = Array.from({ length: res }, () => Array(res).fill('transparent'));

      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const idx = (y * res + x) * 4;
          const r = imgData.data[idx];
          const g = imgData.data[idx + 1];
          const b = imgData.data[idx + 2];
          const a = imgData.data[idx + 3];

          if (a > 10) {
            const hexR = r.toString(16).padStart(2, '0');
            const hexG = g.toString(16).padStart(2, '0');
            const hexB = b.toString(16).padStart(2, '0');
            grid[y][x] = `#${hexR}${hexG}${hexB}`;
          } else {
            grid[y][x] = 'transparent';
          }
        }
      }

      setPixelGrid(grid);
      setCropModalImage(null);
    };
    img.src = cropModalImage;
  };

  // Save painted frame back onto spritesheet canvas with exact chosen resolution (16, 32, 64)!
  const handleSavePixelEditor = () => {
    if (!editingTile) return;
    const { charId, col, row } = editingTile;
    const res = editorGridRes; // 16, 32, or 64

    // Use exact resolution chosen by user so 64x64 HD details are NEVER crushed or distorted!
    const currentFrameSize = currentOption.size || 16;
    const tileSize = Math.max(currentFrameSize, res);

    // Save frame resolution preference
    const frameResKey = `on_house_char_frame_res_${charId}_${row}_${col}`;
    localStorage.setItem(frameResKey, res.toString());

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cols = currentOption.cols;
      const rows = currentOption.rows;

      const canvas = document.createElement('canvas');
      canvas.width = cols * tileSize;
      canvas.height = rows * tileSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Resample existing tiles to new tileSize
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const srcTileW = img.width / cols;
          const srcTileH = img.height / rows;
          ctx.drawImage(
            img,
            c * srcTileW, r * srcTileH, srcTileW, srcTileH,
            c * tileSize, r * tileSize, tileSize, tileSize
          );
        }
      }

      // Clear specified (col, row) tile region
      ctx.clearRect(col * tileSize, row * tileSize, tileSize, tileSize);

      // Render pixelGrid (res x res) onto temp canvas then draw 1:1 crisp to main canvas frame slot
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = res;
      tempCanvas.height = res;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.imageSmoothingEnabled = false;
        for (let y = 0; y < res; y++) {
          for (let x = 0; x < res; x++) {
            const color = pixelGrid[y][x];
            if (color && color !== 'transparent') {
              tempCtx.fillStyle = color;
              tempCtx.fillRect(x, y, 1, 1);
            }
          }
        }
        // Draw 1:1 crisp to main canvas frame slot without downsampling loss!
        ctx.drawImage(tempCanvas, 0, 0, res, res, col * tileSize, row * tileSize, tileSize, tileSize);
      }

      const updatedUrl = canvas.toDataURL();
      setCharImageOverrides((prev) => ({
        ...prev,
        [charId]: {
          url: updatedUrl,
          rows: currentOption.rows,
          cols: currentOption.cols,
          size: tileSize
        }
      }));

      setEditingTile(null);
    };
    img.src = currentOption.url;
  };

  // Delete an Action Motion Row
  const handleDeleteActionRow = (rowIdx: number) => {
    if (currentOption.rows <= 1) {
      alert("최소 1개의 행은 유지되어야 합니다!");
      return;
    }

    const actionName = currentCharRowActions[rowIdx] || `행 ${rowIdx + 1}`;
    if (!window.confirm(`정말로 '${actionName}' (행 ${rowIdx})을 삭제하시겠습니까?`)) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const cols = currentOption.cols;
      const oldRows = currentOption.rows;
      const newRows = oldRows - 1;

      const tileW = Math.max(16, Math.floor(img.width / cols));
      const tileH = Math.max(16, Math.floor(img.height / oldRows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = Math.round(newRows * tileH);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Copy top part (rows above rowIdx)
      if (rowIdx > 0) {
        const topH = Math.round(rowIdx * tileH);
        ctx.drawImage(img, 0, 0, img.width, topH, 0, 0, img.width, topH);
      }

      // Copy bottom part (rows below rowIdx)
      if (rowIdx < oldRows - 1) {
        const bottomSrcY = Math.round((rowIdx + 1) * tileH);
        const bottomDstY = Math.round(rowIdx * tileH);
        const bottomH = Math.round((oldRows - rowIdx - 1) * tileH);
        ctx.drawImage(img, 0, bottomSrcY, img.width, bottomH, 0, bottomDstY, img.width, bottomH);
      }

      const updatedUrl = canvas.toDataURL();
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows: newRows,
          cols,
          size: tileW
        }
      }));

      // Update action row names list
      const updatedList = currentCharRowActions.filter((_, idx) => idx !== rowIdx);
      const updatedRowActions = {
        ...charRowActions,
        [currentSelectedId]: updatedList
      };
      setCharRowActions(updatedRowActions);
      localStorage.setItem('on_house_char_row_actions', JSON.stringify(updatedRowActions));

      setSelectedTileState(null);
    };
    img.src = currentOption.url;
  };

  // Add a Column (Frame) to the right of a row
  const handleAddColumn = (rowIdx?: number) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const rows = currentOption.rows;
      const oldCols = currentOption.cols;
      const newCols = oldCols + 1;

      const tileW = Math.max(16, Math.floor(img.width / oldCols));
      const tileH = Math.max(16, Math.floor(img.height / rows));

      const canvas = document.createElement('canvas');
      canvas.width = newCols * tileW;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Draw existing image
      ctx.drawImage(img, 0, 0);

      // Duplicate previous column in the specified row for smooth starter frame
      const targetRow = rowIdx !== undefined ? rowIdx : 0;
      ctx.drawImage(
        img,
        (oldCols - 1) * tileW, targetRow * tileH, tileW, tileH,
        oldCols * tileW, targetRow * tileH, tileW, tileH
      );

      const updatedUrl = canvas.toDataURL();
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows,
          cols: newCols,
          size: tileW
        }
      }));
    };
    img.src = currentOption.url;
  };

  // Add a new Action Motion Row to the character spritesheet
  const handleAddActionRowSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const actionName = newActionNameInput.trim() || `동작 ${currentOption.rows + 1}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const oldRows = currentOption.rows;
      const newRows = oldRows + 1;
      const cols = currentOption.cols;

      const tileW = Math.max(16, Math.floor(img.width / cols));
      const tileH = Math.max(16, Math.floor(img.height / oldRows));

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = newRows * tileH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;

      // Draw existing image
      ctx.drawImage(img, 0, 0);

      // Copy Row 0 (Idle frames) into the new bottom row as starting template
      ctx.drawImage(img, 0, 0, img.width, tileH, 0, (newRows - 1) * tileH, img.width, tileH);

      const updatedUrl = canvas.toDataURL();

      // Update image overrides
      setCharImageOverrides((prev) => ({
        ...prev,
        [currentSelectedId]: {
          url: updatedUrl,
          rows: newRows,
          cols,
          size: tileW
        }
      }));

      // Update action row names list
      const currentList = charRowActions[currentSelectedId] || getCharRowActions(currentSelectedId);
      const updatedList = [...currentList, actionName];
      const updatedRowActions = {
        ...charRowActions,
        [currentSelectedId]: updatedList
      };
      setCharRowActions(updatedRowActions);
      localStorage.setItem('on_house_char_row_actions', JSON.stringify(updatedRowActions));

      // Lock selection to first frame of the newly created row
      setSelectedTileState({ col: 0, row: newRows - 1, index: (newRows - 1) * cols });

      setShowAddRowModal(false);
      setNewActionNameInput('');
    };
    img.src = currentOption.url;
  };

  // Image file select handler with auto-detection for cols and rows
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setFileDataUrl(result);

      const img = new Image();
      img.onload = () => {
        setImgWidth(img.width);
        setImgHeight(img.height);

        // Auto detect cols & rows (Default: 4 cols, auto rows based on aspect ratio)
        const autoCols = 4;
        const estRowH = img.width / autoCols;
        const autoRows = estRowH > 0 ? Math.round(img.height / estRowH) : 9;
        setCustomColsInput(autoCols);
        setCustomRowsInput(autoRows > 0 ? autoRows : 9);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Smart Auto-Trim & Normalizer Algorithm for Custom Sprite Sheets
  const handleAutoNormalizeSpriteSheet = () => {
    if (!fileDataUrl) return;
    setIsNormalizing(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const targetCols = customColsInput || 4;
      const targetRows = customRowsInput || 9;
      const tSize = tileSizeInput || 32;

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        setIsNormalizing(false);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;

      // 1. Find overall non-background content bounding box
      let minX = img.width;
      let minY = img.height;
      let maxX = 0;
      let maxY = 0;

      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const idx = (y * img.width + x) * 4;
          const a = data[idx + 3];
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isContent = a > 15 && !(r < 18 && g < 18 && b < 18);
          if (isContent) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (minX >= maxX || minY >= maxY) {
        minX = 0;
        minY = 0;
        maxX = img.width - 1;
        maxY = img.height - 1;
      }

      const contentW = maxX - minX + 1;
      const contentH = maxY - minY + 1;

      // 2. Divide content bounding box into targetCols x targetRows
      const cellW = contentW / targetCols;
      const cellH = contentH / targetRows;

      // 3. Create normalized sprite sheet canvas: targetCols * tSize x targetRows * tSize
      const normCanvas = document.createElement('canvas');
      normCanvas.width = targetCols * tSize;
      normCanvas.height = targetRows * tSize;
      const normCtx = normCanvas.getContext('2d');
      if (!normCtx) {
        setIsNormalizing(false);
        return;
      }

      normCtx.imageSmoothingEnabled = false;

      // 4. For each cell (r, c), extract sub-image, find frame tight bounds, and center inside tSize x tSize
      for (let r = 0; r < targetRows; r++) {
        for (let c = 0; c < targetCols; c++) {
          const srcCellX = Math.floor(minX + c * cellW);
          const srcCellY = Math.floor(minY + r * cellH);
          const srcCellW = Math.max(1, Math.floor(cellW));
          const srcCellH = Math.max(1, Math.floor(cellH));

          let fMinX = srcCellW;
          let fMinY = srcCellH;
          let fMaxX = 0;
          let fMaxY = 0;
          let hasPixels = false;

          for (let cy = 0; cy < srcCellH; cy++) {
            for (let cx = 0; cx < srcCellW; cx++) {
              const px = srcCellX + cx;
              const py = srcCellY + cy;
              if (px < img.width && py < img.height) {
                const idx = (py * img.width + px) * 4;
                const a = data[idx + 3];
                const cr = data[idx];
                const cg = data[idx + 1];
                const cb = data[idx + 2];
                if (a > 15 && !(cr < 18 && cg < 18 && cb < 18)) {
                  hasPixels = true;
                  if (cx < fMinX) fMinX = cx;
                  if (cx > fMaxX) fMaxX = cx;
                  if (cy < fMinY) fMinY = cy;
                  if (cy > fMaxY) fMaxY = cy;
                }
              }
            }
          }

          const dstCellX = c * tSize;
          const dstCellY = r * tSize;

          if (hasPixels && fMinX <= fMaxX && fMinY <= fMaxY) {
            const frameSrcX = srcCellX + fMinX;
            const frameSrcY = srcCellY + fMinY;
            const frameSrcW = fMaxX - fMinX + 1;
            const frameSrcH = fMaxY - fMinY + 1;

            const scale = Math.min((tSize - 2) / frameSrcW, (tSize - 2) / frameSrcH, 1.5);
            const drawW = Math.round(frameSrcW * scale);
            const drawH = Math.round(frameSrcH * scale);

            const drawX = dstCellX + Math.floor((tSize - drawW) / 2);
            const drawY = dstCellY + Math.floor((tSize - drawH) / 2);

            normCtx.drawImage(
              img,
              frameSrcX, frameSrcY, frameSrcW, frameSrcH,
              drawX, drawY, drawW, drawH
            );
          } else {
            const drawX = dstCellX + Math.floor((tSize - srcCellW) / 2);
            const drawY = dstCellY + Math.floor((tSize - srcCellH) / 2);
            normCtx.drawImage(
              img,
              srcCellX, srcCellY, srcCellW, srcCellH,
              drawX, drawY, srcCellW, srcCellH
            );
          }
        }
      }

      const normalizedDataUrl = normCanvas.toDataURL();
      setFileDataUrl(normalizedDataUrl);
      setImgWidth(normCanvas.width);
      setImgHeight(normCanvas.height);
      setIsNormalizing(false);
      alert(`✨ 스마트 보정 완료!\n여백을 자동으로 제거하고 ${targetCols}열 x ${targetRows}행 (${tSize}x${tSize}px) 정격 규격 스프라이트 시트로 보정하였습니다.`);
    };
    img.src = fileDataUrl;
  };

  // Generate default character template spritesheet if no image uploaded
  const createDefaultCharTemplate = (tSize: number = 16) => {
    const cols = 4;
    const rows = 7;
    const canvas = document.createElement('canvas');
    canvas.width = cols * tSize;
    canvas.height = rows * tSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'transparent';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const dotSize = Math.max(2, Math.floor(tSize / 2));
      const subDot = Math.max(1, Math.floor(tSize / 4));
      const offset = Math.floor((tSize - dotSize) / 2);
      const subOffset = Math.floor((tSize - subDot) / 2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = '#89b4fa';
          ctx.fillRect(c * tSize + offset, r * tSize + offset, dotSize, dotSize);
          ctx.fillStyle = '#f5c2e7';
          ctx.fillRect(c * tSize + subOffset, r * tSize + subOffset, subDot, subDot);
        }
      }
    }
    return { dataUrl: canvas.toDataURL(), cols, rows };
  };

  // Save new custom asset (Supports character creation by Name Only & Shows Upload Progress!)
  const handleSaveCustomAsset = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = assetNameInput.trim();
    if (!name) {
      alert("에셋 이름을 입력해 주세요!");
      return;
    }

    try {
      setIsSavingAsset(true);
      setSaveProgressText('💾 이미지 데이터 규격화 처리 중...');

      let finalUrl = fileDataUrl;
      let cols = 4;
      let rows = 7;
      const tSize = tileSizeInput || 32;

      if (uploadCategory === 'character' && !fileDataUrl) {
        const template = createDefaultCharTemplate(tSize);
        finalUrl = template.dataUrl;
        cols = template.cols;
        rows = template.rows;
      } else if (fileDataUrl) {
        cols = customColsInput || Math.max(1, Math.floor(imgWidth / tSize));
        rows = customRowsInput || Math.max(1, Math.floor(imgHeight / tSize));
      } else {
        alert("맵 타일셋의 경우 이미지 파일을 선택해 주세요!");
        setIsSavingAsset(false);
        setSaveProgressText('');
        return;
      }

      const newId = (uploadCategory === 'map' ? 'custom_map_' : 'custom_char_') + Date.now();

      const newOption: TilesetOption = {
        id: newId,
        name,
        url: finalUrl!,
        cols,
        rows,
        size: tSize,
        prefix: uploadCategory === 'map' ? 9000 + customMapTilesets.length * 1000 : undefined,
        isCustom: true
      };

      const currentHouse = getSavedHouseCode();
      const assetType = uploadCategory === 'map' ? 'map_tileset' : 'char_sprite';

      setSaveProgressText('💾 로컬 저장소 등록 중...');

      if (uploadCategory === 'map') {
        setCustomMapTilesets((prev) => {
          const next = [...prev, newOption];
          localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(next));
          return next;
        });
        setActiveTab('map');
        setSelectedMapId(newId);
      } else {
        setCustomCharSprites((prev) => {
          const next = [...prev, newOption];
          localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
          return next;
        });
        setActiveTab('character');
        setSelectedCharId(newId);
      }

      // Notify window to update CanvasGame image caches immediately
      window.dispatchEvent(new Event('on_house_sprites_updated'));

      setSaveProgressText('☁️ 하우스 서버(Supabase) 업로드 저장 중...');
      // Save to Supabase DB for this House
      await saveHouseAssetToDB(currentHouse, assetType, newOption);

      // Broadcast asset_update to all players in the same House
      try {
        supabase.channel(`house:${currentHouse}`).send({
          type: 'broadcast',
          event: 'asset_update',
          payload: {
            assetType,
            assetData: newOption
          }
        });
      } catch (e) {}

      setSaveProgressText('✅ 에셋 저장 완료!');

      setTimeout(() => {
        setFileDataUrl(null);
        setAssetNameInput('');
        setImgWidth(0);
        setImgHeight(0);
        setShowUploadModal(false);
        setIsSavingAsset(false);
        setSaveProgressText('');
      }, 500);

    } catch (err) {
      console.error('Error saving asset:', err);
      alert('에셋 저장 중 오류가 발생했습니다. 다시 시도해 주세요.');
      setIsSavingAsset(false);
      setSaveProgressText('');
    }
  };

  // Delete custom asset
  const handleDeleteCustomAsset = async (id: string) => {
    if (!window.confirm("정말로 이 커스텀 에셋을 영구 삭제하시겠습니까?")) return;

    const currentHouse = getSavedHouseCode();

    if (activeTab === 'map') {
      setCustomMapTilesets((prev) => {
        const next = prev.filter((opt) => opt.id !== id);
        localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(next));
        return next;
      });
      setSelectedMapId('interior');
      await deleteHouseAssetFromDB(currentHouse, 'map_tileset', id);
    } else {
      setCustomCharSprites((prev) => {
        const next = prev.filter((opt) => opt.id !== id);
        localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));
        return next;
      });
      setCharImageOverrides((prev) => {
        const next = { ...prev };
        delete next[id];
        localStorage.setItem('on_house_char_image_overrides', JSON.stringify(next));
        return next;
      });
      setSelectedCharId('samurai_blue');
      await deleteHouseAssetFromDB(currentHouse, 'char_sprite', id);
    }

    // Broadcast sprite cache update event
    window.dispatchEvent(new Event('on_house_sprites_updated'));
  };

  // Export & Import All App Backup Data
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
        alert(`총 ${count}개의 백업 데이터(맵/에셋)가 성공적으로 복원되었습니다! 앱을 새로고침합니다.`);
        window.location.reload();
      } catch (err) {
        alert('백업 파일을 불러오는 중 오류가 발생했습니다. 올바른 .json 백업 파일인지 확인해 주세요.');
      }
    };
    reader.readAsText(file);
  };

  // Current row action names array for selected character
  const currentCharRowActions = charRowActions[currentSelectedId] || getCharRowActions(currentSelectedId);
  const baseBoardSize = 256;
  const boardSize = Math.round(baseBoardSize * editorZoom);
  const cellSizePx = boardSize / editorGridRes;

  return (
    <div className="glass-panel" style={{
      position: 'absolute', left: '4%', top: '4%', width: '92%', height: '92%',
      zIndex: 150, padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px',
      border: '1px solid rgba(255,255,255,0.2)', background: 'var(--bg-panel-solid)',
      boxShadow: '0 16px 48px rgba(0,0,0,0.7)', borderRadius: '12px'
    }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Renamed Title */}
          <h3 className="pixel-text" style={{ fontSize: '16px', color: 'var(--accent)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={18} /> 픽셀 에디터
          </h3>

          {/* 1. Main Category Tabs: Character First, Map Second */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <button
              onClick={() => {
                setActiveTab('character');
                setHoveredTile(null);
                setSelectedTileState(null);
              }}
              style={{
                padding: '6px 14px', fontSize: '11px', borderRadius: '6px', border: 'none',
                background: activeTab === 'character' ? 'var(--primary)' : 'transparent',
                color: '#fff', cursor: 'pointer', fontWeight: activeTab === 'character' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s ease'
              }}
            >
              <User size={13} /> 👤 캐릭터 스프라이트 ({charOptions.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('map');
                setHoveredTile(null);
                setSelectedTileState(null);
              }}
              style={{
                padding: '6px 14px', fontSize: '11px', borderRadius: '6px', border: 'none',
                background: activeTab === 'map' ? 'var(--primary)' : 'transparent',
                color: '#fff', cursor: 'pointer', fontWeight: activeTab === 'map' ? 'bold' : 'normal',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s ease'
              }}
            >
              <Layers size={13} /> 🗺️ 맵 타일 에셋 ({mapOptions.length})
            </button>
          </div>

          {/* 2. Sub-selection Select Box Dropdown & Delete Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              {activeTab === 'character' ? '캐릭터 선택:' : '타일셋 선택:'}
            </span>
            <select
              value={currentSelectedId}
              onChange={(e) => {
                if (activeTab === 'character') setSelectedCharId(e.target.value);
                else setSelectedMapId(e.target.value);
                setHoveredTile(null);
                setSelectedTileState(null);
              }}
              style={{
                background: '#12121c', color: '#fff', border: '1px solid var(--accent)',
                borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 'bold',
                outline: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
              }}
            >
              {currentOptionList.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name} ({opt.cols}x{opt.rows} 타일)
                </option>
              ))}
            </select>

            {/* If currently selected option is custom, show delete button */}
            {currentOption?.isCustom && (
              <button
                onClick={() => handleDeleteCustomAsset(currentOption.id)}
                title="커스텀 에셋 삭제"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger)',
                  color: '#ff6b6b', borderRadius: '6px', padding: '5px 8px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px'
                }}
              >
                <Trash2 size={12} /> 삭제
              </button>
            )}
          </div>

          {/* 3. Renamed Add Asset Button ("+ 추가") & Backup / Restore */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={() => {
                setUploadCategory(activeTab);
                setShowUploadModal(true);
              }}
              style={{
                padding: '6px 12px', fontSize: '11px', borderRadius: '6px',
                background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent)',
                border: '1px dashed var(--accent)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold'
              }}
            >
              <Plus size={13} /> 추가
            </button>
          </div>

          {/* 4. Grid Zoom Scale Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
            <ZoomIn size={12} style={{ color: 'var(--text-secondary)', marginRight: '2px' }} />
            {([1.0, 1.5, 2.0, 3.0] as const).map((z) => (
              <button
                key={z}
                onClick={() => setGridZoom(z)}
                style={{
                  padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: 'none',
                  background: gridZoom === z ? 'var(--accent)' : 'transparent',
                  color: gridZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                {z}x
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
            padding: '6px 12px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px'
          }}
        >
          <X size={14} /> 닫기
        </button>
      </div>

      {/* Main Grid Viewport & Side Panel */}
      <div style={{ flex: 1, display: 'flex', gap: '16px', overflow: 'hidden' }}>
        {/* Left Grid Viewer Canvas Container */}
        <div style={{
          flex: 1, overflow: 'auto', background: '#0a0a0f', borderRadius: '8px',
          border: '1px solid var(--border-glass)', display: 'block', padding: '24px 36px', position: 'relative'
        }}>
          {/* Outer Canvas Wrapper */}
          <div style={{
            position: 'relative',
            margin: 'auto',
            width: `${currentOption.cols * visualCellSize}px`,
            height: `${currentOption.rows * visualCellSize}px`,
            marginBottom: activeTab === 'character' ? '48px' : 0
          }}>
            {/* 1. Delete (-) Button on Left of Each Row */}
            {activeTab === 'character' && Array.from({ length: currentOption.rows }).map((_, rIdx) => (
              <button
                key={`del-row-${rIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteActionRow(rIdx);
                }}
                title={`행 ${rIdx} (${currentCharRowActions[rIdx] || '동작'}) 삭제`}
                style={{
                  position: 'absolute',
                  left: '-32px',
                  top: `${rIdx * visualCellSize + (visualCellSize - 24) / 2}px`,
                  width: '24px',
                  height: '24px',
                  background: 'rgba(239, 68, 68, 0.25)',
                  border: '1px solid var(--danger)',
                  color: '#ff6b6b',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  zIndex: 5
                }}
              >
                <Minus size={13} />
              </button>
            ))}

            {/* 2. Main Grid Canvas Container with Drag & Drop & Right-Click Context Menu Support */}
            <div 
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredTile(null)}
              onClick={() => {
                if (hoveredTile) {
                  // Lock tile selection on click
                  setSelectedTileState(hoveredTile);
                  if (onSelectTile) {
                    onSelectTile(hoveredTile.prefixedId ?? hoveredTile.index);
                  }
                }
              }}
              style={{
                position: 'relative',
                width: `${currentOption.cols * visualCellSize}px`,
                height: `${currentOption.rows * visualCellSize}px`,
                backgroundImage: `url(${currentOption.url})`,
                backgroundSize: '100% 100%',
                imageRendering: 'pixelated',
                cursor: 'pointer',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
              }}
            >
              {/* Individual Interactive Tile Drag & Context Overlay Cells */}
              {Array.from({ length: currentOption.rows }).map((_, rIdx) =>
                Array.from({ length: currentOption.cols }).map((_, cIdx) => (
                  <div
                    key={`tile-cell-${rIdx}-${cIdx}`}
                    draggable={activeTab === 'character'}
                    onDragStart={(e) => {
                      if (activeTab !== 'character') return;
                      e.dataTransfer.setData('text/plain', '');
                      setDraggedTile({ col: cIdx, row: rIdx });
                    }}
                    onDragOver={(e) => {
                      if (activeTab === 'character') e.preventDefault();
                    }}
                    onDrop={(e) => {
                      if (activeTab === 'character') handleDropTile(e, cIdx, rIdx);
                    }}
                    onContextMenu={(e) => {
                      if (activeTab === 'character') handleTileContextMenu(e, cIdx, rIdx);
                    }}
                    style={{
                      position: 'absolute',
                      left: `${cIdx * visualCellSize}px`,
                      top: `${rIdx * visualCellSize}px`,
                      width: `${visualCellSize}px`,
                      height: `${visualCellSize}px`,
                      boxSizing: 'border-box',
                      zIndex: 1
                    }}
                  />
                ))
              )}

              {/* Grid overlay */}
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.12) 1px, transparent 1px)',
                backgroundSize: `${visualCellSize}px ${visualCellSize}px`,
                pointerEvents: 'none'
              }} />

              {/* Locked selected tile highlight (pink/magenta) */}
              {selectedTileState && (
                <div style={{
                  position: 'absolute',
                  left: `${selectedTileState.col * visualCellSize}px`,
                  top: `${selectedTileState.row * visualCellSize}px`,
                  width: `${visualCellSize}px`,
                  height: `${visualCellSize}px`,
                  border: '2px solid #ff79c6',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  background: 'rgba(255, 121, 198, 0.35)',
                  boxShadow: '0 0 12px rgba(255, 121, 198, 0.8)',
                  zIndex: 2
                }} />
              )}

              {/* Hover highlight (cyan/blue) */}
              {hoveredTile && (!selectedTileState || selectedTileState.col !== hoveredTile.col || selectedTileState.row !== hoveredTile.row) && (
                <div style={{
                  position: 'absolute',
                  left: `${hoveredTile.col * visualCellSize}px`,
                  top: `${hoveredTile.row * visualCellSize}px`,
                  width: `${visualCellSize}px`,
                  height: `${visualCellSize}px`,
                  border: '2px dashed #8be9fd',
                  boxSizing: 'border-box',
                  pointerEvents: 'none',
                  background: 'rgba(139, 233, 253, 0.2)',
                  zIndex: 1
                }} />
              )}
            </div>

            {/* 3. Add Frame (+) Button on Right of Each Row */}
            {activeTab === 'character' && Array.from({ length: currentOption.rows }).map((_, rIdx) => (
              <button
                key={`add-col-${rIdx}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddColumn(rIdx);
                }}
                title={`행 ${rIdx} 오른쪽에 프레임(+) 추가`}
                style={{
                  position: 'absolute',
                  right: '-32px',
                  top: `${rIdx * visualCellSize + (visualCellSize - 24) / 2}px`,
                  width: '24px',
                  height: '24px',
                  background: 'rgba(139, 92, 246, 0.25)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                  zIndex: 5
                }}
              >
                <Plus size={13} />
              </button>
            ))}

            {/* 4. Add Row (+) Button at Bottom */}
            {activeTab === 'character' && (
              <button
                onClick={() => setShowAddRowModal(true)}
                title="맨 아래에 새로운 동작 행 추가"
                style={{
                  position: 'absolute',
                  left: '0px',
                  top: `${currentOption.rows * visualCellSize + 10}px`,
                  width: `${currentOption.cols * visualCellSize}px`,
                  height: '32px',
                  background: 'rgba(245, 194, 231, 0.2)',
                  border: '1px dashed #f5c2e7',
                  color: '#f5c2e7',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(245, 194, 231, 0.2)',
                  zIndex: 5
                }}
              >
                <Plus size={14} /> ➕ 새 동작 행 추가
              </button>
            )}
          </div>
        </div>

        {/* Right Details Panel */}
        <div style={{
          width: '300px', display: 'flex', flexDirection: 'column', gap: '14px',
          background: 'rgba(0,0,0,0.25)', padding: '16px', borderRadius: '8px',
          border: '1px solid var(--border-glass)', flexShrink: 0, overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
            <h4 className="pixel-text" style={{ fontSize: '13px', color: 'var(--accent)', margin: 0 }}>
              {activeTab === 'map' ? '🗺️ 선택된 타일 정보' : '👤 선택된 스프라이트 정보'}
            </h4>
            {selectedTileState && (
              <button
                onClick={() => setSelectedTileState(null)}
                title="선택 고정 해제"
                style={{
                  background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-glass)',
                  color: '#ff79c6', borderRadius: '4px', padding: '3px 6px', fontSize: '10px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                }}
              >
                <Pin size={10} /> 📌 고정 해제
              </button>
            )}
          </div>

          {activeDisplayTile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-secondary)' }}>타일셋 분류:</span>
                <span style={{ fontWeight: 'bold', color: '#fff', fontSize: '11px' }}>{currentOption.name}</span>
              </div>

              {activeDisplayTile.prefixedId !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(139, 92, 246, 0.15)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--accent)' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>맵 타일 ID (Prefixed):</span>
                  <span className="pixel-text" style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                    {activeDisplayTile.prefixedId}
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>로컬 인덱스 ID:</span>
                <span className="pixel-text" style={{ color: 'var(--accent)', fontWeight: 'bold', fontSize: '13px' }}>
                  {activeDisplayTile.index}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>열 (Column X):</span>
                <span>{activeDisplayTile.col} / {currentOption.cols - 1}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-secondary)' }}>행 (Row Y):</span>
                <span>{activeDisplayTile.row} / {currentOption.rows - 1}</span>
              </div>

              {/* Character sprite frame details & Action Name Editor & Pixel Art Editor Launcher */}
              {activeTab === 'character' && (
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#ccc' }}>
                    방향 (Direction):{' '}
                    <strong style={{ color: 'var(--accent)' }}>
                      {currentOption.id === 'pig'
                        ? (activeDisplayTile.col === 0 ? '왼쪽/기본 (Left)' : '걷기 프레임 2')
                        : (activeDisplayTile.col === 0 ? '아래 (Down 0)' : activeDisplayTile.col === 1 ? '위 (Up 1)' : activeDisplayTile.col === 2 ? '왼쪽 (Left 2)' : '오른쪽 (Right 3)')
                      }
                    </strong>
                  </div>

                  {/* Editable Action Motion Input for current Row */}
                  <div style={{ background: 'rgba(139, 92, 246, 0.15)', padding: '10px', borderRadius: '6px', border: '1px solid var(--accent)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 'bold' }}>
                        ✏️ 행 {activeDisplayTile.row} 동작 이름:
                      </span>
                      <span style={{ fontSize: '10px', color: '#aaa' }}>
                        (같은 행 {currentOption.cols}개 프레임 공통)
                      </span>
                    </div>
                    <input
                      type="text"
                      value={currentCharRowActions[activeDisplayTile.row] || `동작 ${activeDisplayTile.row + 1}`}
                      onChange={(e) => {
                        const newName = e.target.value;
                        const updatedList = [...currentCharRowActions];
                        updatedList[activeDisplayTile.row] = newName;
                        const updatedAll = {
                          ...charRowActions,
                          [currentSelectedId]: updatedList
                        };
                        setCharRowActions(updatedAll);
                        localStorage.setItem('on_house_char_row_actions', JSON.stringify(updatedAll));
                      }}
                      placeholder="예: 대기, 걷기1, 환호, 공격..."
                      style={{
                        width: '100%', background: '#0d0d12', border: '1px solid rgba(255,255,255,0.25)',
                        borderRadius: '6px', padding: '6px 10px', color: '#fff', fontSize: '12px',
                        fontWeight: 'bold', outline: 'none', boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '6px', lineHeight: '1.4' }}>
                      💬 채팅창에서 <strong style={{ color: '#89b4fa' }}>/{currentCharRowActions[activeDisplayTile.row] || '동작이름'}</strong> 입력 시 게임 내 캐릭터가 이 행의 모션을 실행합니다!
                    </div>
                  </div>

                  {/* 🎨 Launch Pixel Art Editor Button */}
                  <button
                    onClick={() => handleOpenPixelEditor(activeDisplayTile.col, activeDisplayTile.row)}
                    style={{
                      padding: '10px', background: 'linear-gradient(135deg, #89b4fa 0%, #cba6f7 100%)',
                      border: 'none', borderRadius: '6px', color: '#11111b', fontSize: '12px',
                      fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: '6px', boxShadow: '0 4px 14px rgba(203, 166, 247, 0.4)'
                    }}
                  >
                    <Pencil size={14} /> 🎨 픽셀 도트 직접 그리기 에디터
                  </button>
                </div>
              )}

              {/* Live Scaled Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>타일 미리보기</span>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundImage: `url(${currentOption.url})`,
                  backgroundPosition: `-${activeDisplayTile.col * 64}px -${activeDisplayTile.row * 64}px`,
                  backgroundSize: `${currentOption.cols * 64}px ${currentOption.rows * 64}px`,
                  imageRendering: 'pixelated',
                  border: '2px solid var(--accent)',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }} />
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
              마우스 클릭으로 타일을 고정하거나<br />마우스를 타일 위에 올리면<br />상세 정보가 표시됩니다.
            </div>
          )}
        </div>
      </div>

      {/* Floating Right-Click Context Menu for Frame Slot */}
      {contextMenuTile && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: `${contextMenuTile.x}px`,
            top: `${contextMenuTile.y}px`,
            background: '#1e1e2e',
            border: '1px solid var(--accent)',
            borderRadius: '8px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            zIndex: 2000,
            minWidth: '150px'
          }}
        >
          <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold', padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            🖼️ 프레임 (행 {contextMenuTile.row}, 열 {contextMenuTile.col}) 메뉴
          </div>

          <button
            onClick={() => {
              handleCopyFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("📋 선택한 프레임이 복사되었습니다! (Ctrl+V로 붙여넣기)");
            }}
            style={{
              background: 'transparent', border: 'none', color: '#fff', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            className="hover-highlight"
          >
            <Copy size={13} style={{ color: '#89b4fa' }} /> 📋 프레임 복사하기 (Ctrl+C)
          </button>

          <button
            onClick={() => {
              handleCutFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("✂️ 선택한 프레임이 잘라내기 되었습니다!");
            }}
            style={{
              background: 'transparent', border: 'none', color: '#fff', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
            className="hover-highlight"
          >
            <Scissors size={13} style={{ color: '#f9e2af' }} /> ✂️ 프레임 잘라내기 (Ctrl+X)
          </button>

          <button
            disabled={!copiedFrameBuffer}
            onClick={() => {
              handlePasteFrame(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("📥 프레임이 붙여넣기 되었습니다!");
            }}
            style={{
              background: 'transparent', border: 'none',
              color: copiedFrameBuffer ? '#fff' : '#666',
              padding: '6px 8px', fontSize: '11px', textAlign: 'left', borderRadius: '4px',
              cursor: copiedFrameBuffer ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}
          >
            <Clipboard size={13} style={{ color: copiedFrameBuffer ? '#a6e3a1' : '#555' }} /> 📥 프레임 붙여넣기 (Ctrl+V)
          </button>

          <button
            onClick={() => {
              handleDeleteFrameColumn(contextMenuTile.col, contextMenuTile.row);
              setToastMessage("🗑️ 프레임이 삭제되었습니다.");
            }}
            style={{
              background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ff6b6b', padding: '6px 8px',
              fontSize: '11px', textAlign: 'left', borderRadius: '4px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold'
            }}
          >
            <Trash size={13} /> 🗑️ 프레임 삭제하기 (Delete)
          </button>
        </div>
      )}

      {/* Toast Feedback Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          bottom: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(24, 24, 37, 0.95)',
          border: '1px solid var(--accent)',
          borderRadius: '8px',
          padding: '10px 18px',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 'bold',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.9)',
          zIndex: 2200,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(6px)',
          animation: 'fadeIn 0.2s ease-in-out'
        }}>
          {toastMessage}
        </div>
      )}

      {/* 1. Modal: Add New Action Row Prompt */}
      {showAddRowModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => setShowAddRowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px', padding: '24px', width: '360px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)', color: '#fff'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: '#f5c2e7' }}>
                <Plus size={18} /> 새 동작 행 추가
              </div>
              <button onClick={() => setShowAddRowModal(false)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddActionRowSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
                  추가할 동작 이름 (예: 점프, 스킬, 인사):
                </label>
                <input
                  type="text"
                  placeholder="예: 점프, 댄스, 마법공격..."
                  value={newActionNameInput}
                  onChange={(e) => setNewActionNameInput(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '6px', padding: '8px 12px', color: '#fff', fontSize: '12px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ fontSize: '11px', color: '#888', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '6px' }}>
                💡 확인을 누르면 스프라이트 시트 하단에 **새로운 행({currentOption.rows + 1}행)**이 추가되며, 기본 픽셀 도트가 템플릿으로 생성됩니다!
              </div>

              <button
                type="submit"
                style={{
                  padding: '10px', background: 'var(--primary)', border: 'none', borderRadius: '6px',
                  color: '#fff', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
                }}
              >
                ➕ 동작 행 생성하기
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Interactive Pixel Art Editor Studio */}
      {editingTile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onMouseUp={() => setIsMouseDown(false)}
        >
          {/* Hidden File Input for Importing Image into Pixel Grid */}
          <input
            type="file"
            ref={editorFileInputRef}
            accept="image/png, image/jpeg, image/webp"
            style={{ display: 'none' }}
            onChange={handleImportImageFileSelect}
          />

          <div style={{
            background: '#181825', border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '16px', padding: '16px', display: 'flex', gap: '16px',
            maxWidth: '520px', width: '92vw', maxHeight: '92vh', overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.95)', color: '#fff'
          }}>
            {/* Left: Pixel Grid Studio Drawing Board */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#89b4fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Pencil size={15} /> 픽셀 도트 (행 {editingTile.row}, 열 {editingTile.col})
                </div>

                {/* Grid Zoom & Resolution Selectors */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {/* Zoom Scale Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                    <ZoomIn size={11} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                    {([1.0, 1.5, 2.0, 3.0] as const).map((z) => (
                      <button
                        key={z}
                        onClick={() => setEditorZoom(z)}
                        style={{
                          padding: '2px 5px', fontSize: '9px', borderRadius: '3px', border: 'none',
                          background: editorZoom === z ? 'var(--accent)' : 'transparent',
                          color: editorZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                        }}
                      >
                        {z}x
                      </button>
                    ))}
                  </div>

                  {/* Grid Resolution Selector (16x16, 32x32, 64x64) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '4px', border: '1px solid var(--border-glass)' }}>
                    <Grid size={11} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                    {([16, 32, 64] as const).map((res) => (
                      <button
                        key={res}
                        onClick={() => handleChangeGridRes(res)}
                        style={{
                          padding: '2px 6px', fontSize: '9px', borderRadius: '3px', border: 'none',
                          background: editorGridRes === res ? 'var(--accent)' : 'transparent',
                          color: editorGridRes === res ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                        }}
                      >
                        {res}x{res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawing Tools Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setDrawTool('pencil')}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: drawTool === 'pencil' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <Pencil size={11} /> 연필
                  </button>
                  <button
                    onClick={() => setDrawTool('eraser')}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: drawTool === 'eraser' ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                      color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <Eraser size={11} /> 지우개
                  </button>
                  <button
                    onClick={() => {
                      const newGrid = pixelGrid.map((row) => [...row].reverse());
                      setPixelGrid(newGrid);
                    }}
                    title="그려진 도트 그림 좌우 반전"
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid var(--border-glass)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <FlipHorizontal size={11} /> ↔️ 반전
                  </button>
                  <button
                    onClick={() => setPixelGrid(Array.from({ length: editorGridRes }, () => Array(editorGridRes).fill('transparent')))}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(239, 68, 68, 0.2)', color: '#ff6b6b', border: '1px solid var(--danger)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                    }}
                  >
                    <RotateCcw size={11} /> 초기화
                  </button>
                  <button
                    onClick={() => editorFileInputRef.current?.click()}
                    style={{
                      padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                      background: 'rgba(139, 92, 246, 0.25)', color: 'var(--accent)',
                      border: '1px solid var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                      fontWeight: 'bold'
                    }}
                  >
                    <Upload size={11} /> 📁 불러오기
                  </button>
                </div>

                <div style={{ fontSize: '9px', color: '#aaa' }}>
                  <strong style={{ color: 'var(--accent)' }}>{editorGridRes}x{editorGridRes}</strong> ({cellSizePx.toFixed(1)}px/셀 | {editorZoom}x)
                </div>
              </div>

              {/* Zoomable & Scrollable Cell Grid Container */}
              <div style={{
                maxWidth: '320px', maxHeight: '320px', overflow: 'auto',
                background: '#0a0a0f', borderRadius: '8px', border: '1px solid var(--border-glass)',
                padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8)', margin: '0 auto'
              }}>
                <div
                  onMouseDown={() => setIsMouseDown(true)}
                  onMouseLeave={() => setIsMouseDown(false)}
                  style={{
                    width: `${boardSize}px`, height: `${boardSize}px`,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${editorGridRes}, ${cellSizePx}px)`,
                    gridTemplateRows: `repeat(${editorGridRes}, ${cellSizePx}px)`,
                    background: '#222', border: '2px solid var(--accent)',
                    borderRadius: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)', cursor: 'crosshair',
                    overflow: 'hidden', flexShrink: 0
                  }}
                >
                  {pixelGrid.map((row, y) =>
                    row.map((color, x) => (
                      <div
                        key={`${y}-${x}`}
                        onMouseDown={() => {
                          const newGrid = pixelGrid.map((r, ry) =>
                            r.map((c, cx) => (ry === y && cx === x ? (drawTool === 'pencil' ? selectedColor : 'transparent') : c))
                          );
                          setPixelGrid(newGrid);
                        }}
                        onMouseEnter={() => {
                          if (isMouseDown) {
                            const newGrid = pixelGrid.map((r, ry) =>
                              r.map((c, cx) => (ry === y && cx === x ? (drawTool === 'pencil' ? selectedColor : 'transparent') : c))
                            );
                            setPixelGrid(newGrid);
                          }
                        }}
                        style={{
                          width: `${cellSizePx}px`, height: `${cellSizePx}px`,
                          background: color === 'transparent' ? '#0d0d14' : color,
                          boxSizing: 'border-box',
                          borderRight: '1px solid rgba(255,255,255,0.12)',
                          borderBottom: '1px solid rgba(255,255,255,0.12)'
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right: Color Palette & Actions */}
            <div style={{ width: '160px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '6px' }}>
                <Palette size={14} /> 팔레트 색상
              </div>

              {/* Color swatches */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                {PALETTE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      if (c === 'transparent') setDrawTool('eraser');
                      else {
                        setSelectedColor(c);
                        setDrawTool('pencil');
                      }
                    }}
                    style={{
                      height: '24px', borderRadius: '3px',
                      background: c === 'transparent' ? '#222' : c,
                      border: selectedColor === c && drawTool === 'pencil' ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                      cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
                      color: c === 'transparent' ? '#aaa' : 'transparent', fontSize: '8px'
                    }}
                  >
                    {c === 'transparent' ? '지우개' : ''}
                  </button>
                ))}
              </div>

              {/* Custom Color Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '4px 6px', borderRadius: '4px' }}>
                <span style={{ fontSize: '10px', color: '#ccc' }}>커스텀:</span>
                <input
                  type="color"
                  value={selectedColor}
                  onChange={(e) => {
                    setSelectedColor(e.target.value);
                    setDrawTool('pencil');
                  }}
                  style={{ width: '28px', height: '20px', border: 'none', background: 'none', cursor: 'pointer' }}
                />
              </div>

              {/* Live Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', borderTop: '1px solid var(--border-glass)', paddingTop: '8px' }}>
                <span style={{ fontSize: '10px', color: '#aaa' }}>실시간 미리보기</span>
                <div
                  style={{
                    width: '48px', height: '48px', border: '2px solid var(--accent)', borderRadius: '4px',
                    display: 'grid',
                    gridTemplateColumns: `repeat(${editorGridRes}, ${48 / editorGridRes}px)`,
                    gridTemplateRows: `repeat(${editorGridRes}, ${48 / editorGridRes}px)`,
                    background: '#111', overflow: 'hidden'
                  }}
                >
                  {pixelGrid.map((row, y) =>
                    row.map((color, x) => (
                      <div key={`p-${y}-${x}`} style={{ background: color === 'transparent' ? 'transparent' : color }} />
                    ))
                  )}
                </div>
              </div>

              {/* Save / Cancel buttons */}
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <button
                  onClick={handleSavePixelEditor}
                  style={{
                    padding: '8px', background: 'var(--primary)', border: 'none', borderRadius: '6px',
                    color: '#fff', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                  }}
                >
                  <Save size={13} /> 💾 도트 반영
                </button>
                <button
                  onClick={() => setEditingTile(null)}
                  style={{
                    padding: '6px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                    borderRadius: '6px', color: '#ccc', fontSize: '10px', cursor: 'pointer'
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Modal: Interactive Image Crop Modal with Mouse Drag, Keyboard Arrows & Number Inputs */}
      {cropModalImage && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)',
          zIndex: 1200, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onMouseMove={handleCropBoxMouseMove}
        onMouseUp={() => setIsBoxDragging(false)}
        onClick={() => setCropModalImage(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#181825', border: '1px solid var(--accent)',
              borderRadius: '16px', padding: '24px', width: '520px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.95)', color: '#fff',
              display: 'flex', flexDirection: 'column', gap: '16px'
            }}
          >
            {/* Crop Header with Zoom Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-glass)', paddingBottom: '10px' }}>
              <div style={{ fontSize: '15px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Crop size={18} /> ✂️ 이미지 영역 잘라내기 (Crop)
              </div>

              {/* Image Zoom Control Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.4)', padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--border-glass)' }}>
                <ZoomIn size={13} style={{ color: 'var(--accent)', marginRight: '2px' }} />
                <span style={{ fontSize: '10px', color: '#aaa', marginRight: '4px' }}>보기 확대:</span>
                {([0.5, 1.0, 2.0, 3.0, 4.0] as const).map((z) => (
                  <button
                    key={z}
                    onClick={() => setCropZoom(z)}
                    style={{
                      padding: '3px 6px', fontSize: '10px', borderRadius: '4px', border: 'none',
                      background: cropZoom === z ? 'var(--accent)' : 'transparent',
                      color: cropZoom === z ? '#000' : '#ccc', cursor: 'pointer', fontWeight: 'bold'
                    }}
                  >
                    {z}x
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCropModalImage(null)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '11px', color: '#aaa', lineHeight: '1.4' }}>
              💡 마우스로 **선택 박스를 끌거나** 키보드 **화살표 키(Arrow Keys)**로 미세 조정하세요. (Shift+화살표: 10px 이동)
            </div>

            {/* Scrollable Image Viewport Canvas Container */}
            <div
              ref={cropViewportRef}
              style={{
                width: '100%', height: '300px', overflow: 'auto',
                background: '#0d0d12', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)',
                position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '24px'
              }}
            >
              {/* Scaled Exact Pixel Image Container */}
              <div
                onClick={handleCropContainerClick}
                style={{
                  position: 'relative',
                  width: `${cropImgWidth * cropZoom}px`,
                  height: `${cropImgHeight * cropZoom}px`,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                  cursor: 'crosshair',
                  margin: 'auto'
                }}
              >
                {/* Source Image */}
                <img
                  src={cropModalImage}
                  alt="Source Crop Preview"
                  style={{
                    width: '100%',
                    height: '100%',
                    imageRendering: 'pixelated',
                    display: 'block'
                  }}
                />

                {/* 100% PERFECT SQUARE Draggable Crop Box Overlay */}
                <div
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setIsBoxDragging(true);
                    setBoxDragStart({
                      startX: e.clientX,
                      startY: e.clientY,
                      initRectX: cropRect.x,
                      initRectY: cropRect.y
                    });
                  }}
                  style={{
                    position: 'absolute',
                    left: `${cropRect.x * cropZoom}px`,
                    top: `${cropRect.y * cropZoom}px`,
                    width: `${cropRect.w * cropZoom}px`,
                    height: `${cropRect.w * cropZoom}px`, // Always equal width & height -> PERFECT SQUARE!
                    border: '2px solid #ff79c6',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)',
                    boxSizing: 'border-box',
                    cursor: 'grab',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{
                    position: 'absolute', top: '-22px', left: '0px',
                    fontSize: '10px', background: '#ff79c6', color: '#111',
                    fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px',
                    whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
                  }}>
                    <Move size={10} /> {cropRect.w} × {cropRect.w} px
                  </div>
                </div>
              </div>
            </div>

            {/* Micro-Adjustment Controls with Direct Number Keyboard Inputs */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>↔️ X 위치:</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, cropImgWidth - cropRect.w)}
                  value={cropRect.x}
                  onChange={(e) => setCropRect((prev) => ({ ...prev, x: parseInt(e.target.value, 10) }))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropImgWidth - cropRect.w)}
                  value={cropRect.x}
                  onChange={(e) => {
                    const val = parseInt(e.target.value || '0', 10);
                    setCropRect((prev) => ({ ...prev, x: Math.max(0, Math.min(cropImgWidth - prev.w, isNaN(val) ? 0 : val)) }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>↕️ Y 위치:</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, cropImgHeight - cropRect.h)}
                  value={cropRect.y}
                  onChange={(e) => setCropRect((prev) => ({ ...prev, y: parseInt(e.target.value, 10) }))}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={0}
                  max={Math.max(0, cropImgHeight - cropRect.h)}
                  value={cropRect.y}
                  onChange={(e) => {
                    const val = parseInt(e.target.value || '0', 10);
                    setCropRect((prev) => ({ ...prev, y: Math.max(0, Math.min(cropImgHeight - prev.h, isNaN(val) ? 0 : val)) }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                <span style={{ width: '90px', color: '#ccc' }}>📐 잘라내기 크기:</span>
                <input
                  type="range"
                  min={8}
                  max={Math.min(cropImgWidth, cropImgHeight)}
                  value={cropRect.w}
                  onChange={(e) => {
                    const newW = parseInt(e.target.value, 10);
                    setCropRect((prev) => ({
                      x: Math.min(prev.x, cropImgWidth - newW),
                      y: Math.min(prev.y, cropImgHeight - newW),
                      w: newW,
                      h: newW
                    }));
                  }}
                  style={{ flex: 1 }}
                />
                <input
                  type="number"
                  min={8}
                  max={Math.min(cropImgWidth, cropImgHeight)}
                  value={cropRect.w}
                  onChange={(e) => {
                    const newW = Math.max(8, Math.min(Math.min(cropImgWidth, cropImgHeight), parseInt(e.target.value || '8', 10)));
                    setCropRect((prev) => ({
                      x: Math.min(prev.x, cropImgWidth - newW),
                      y: Math.min(prev.y, cropImgHeight - newW),
                      w: newW,
                      h: newW
                    }));
                  }}
                  style={{ width: '56px', background: '#0d0d12', border: '1px solid var(--accent)', color: '#fff', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', textAlign: 'center' }}
                />
                <span style={{ fontSize: '10px', color: '#aaa' }}>px</span>
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleConfirmCropAndApply}
                style={{
                  flex: 1, padding: '10px', background: 'var(--primary)', border: 'none',
                  borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 'bold',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Check size={15} /> ✂️ 선택 영역 픽셀 보드에 불러오기
              </button>
              <button
                onClick={() => setCropModalImage(null)}
                style={{
                  padding: '10px 16px', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)',
                  borderRadius: '6px', color: '#ccc', fontSize: '11px', cursor: 'pointer'
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Add Custom Asset Upload / Creation Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
          zIndex: 999, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}
        onClick={() => {
          if (!isSavingAsset) setShowUploadModal(false);
        }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: '#181825', border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px', padding: '24px', width: '380px',
              boxShadow: '0 16px 48px rgba(0, 0, 0, 0.9)', color: '#fff',
              overflow: 'hidden'
            }}
          >
            {/* Loading Overlay during Supabase DB / Image processing */}
            {isSavingAsset && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(24, 24, 37, 0.94)', backdropFilter: 'blur(6px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: '14px', zIndex: 50, padding: '20px',
                textAlign: 'center'
              }}>
                <Loader2 size={42} style={{ color: 'var(--accent)' }} className="animate-spin" />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', marginBottom: '4px' }}>
                    {saveProgressText || '💾 에셋 처리 및 서버 저장 중...'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>
                    이미지 업로드 및 DB 동기화가 진행 중입니다. 잠시만 기다려 주세요!
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              {/* Renamed Modal Title to "➕ 추가" */}
              <div style={{ fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent)' }}>
                <Plus size={18} /> 추가
              </div>
              <button
                disabled={isSavingAsset}
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'none', border: 'none', color: '#888', cursor: isSavingAsset ? 'not-allowed' : 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomAsset} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>에셋 분류:</label>
                {/* Category order: Character First, Map Second */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setUploadCategory('character')}
                    disabled={isSavingAsset}
                    style={{
                      flex: 1, padding: '8px', fontSize: '11px', borderRadius: '6px',
                      background: uploadCategory === 'character' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      color: '#fff', border: uploadCategory === 'character' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                      cursor: isSavingAsset ? 'not-allowed' : 'pointer', fontWeight: uploadCategory === 'character' ? 'bold' : 'normal'
                    }}
                  >
                    👤 캐릭터 스프라이트
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadCategory('map')}
                    disabled={isSavingAsset}
                    style={{
                      flex: 1, padding: '8px', fontSize: '11px', borderRadius: '6px',
                      background: uploadCategory === 'map' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      color: '#fff', border: uploadCategory === 'map' ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                      cursor: isSavingAsset ? 'not-allowed' : 'pointer', fontWeight: uploadCategory === 'map' ? 'bold' : 'normal'
                    }}
                  >
                    🗺️ 맵 타일셋
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>에셋 이름:</label>
                <input
                  type="text"
                  placeholder={uploadCategory === 'character' ? "예: 🐶 귀여운 강아지" : "예: 🎨 마법 던전 타일"}
                  value={assetNameInput}
                  disabled={isSavingAsset}
                  onChange={(e) => setAssetNameInput(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '12px', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
                  {uploadCategory === 'character' ? "프레임 1개 단위 크기 (px):" : "타일 1개 단위 크기 (px):"}
                </label>
                <select
                  value={tileSizeInput}
                  disabled={isSavingAsset}
                  onChange={(e) => setTileSizeInput(parseInt(e.target.value, 10))}
                  style={{
                    width: '100%', background: '#0d0d12', border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px', padding: '8px 10px', color: '#fff', fontSize: '12px', outline: 'none'
                  }}
                >
                  <option value={16}>16 x 16 px (기본 픽셀 규격)</option>
                  <option value={32}>32 x 32 px (고해상도 규격)</option>
                  <option value={64}>64 x 64 px (HD 규격)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
                  {uploadCategory === 'character' ? "이미지 파일 선택 (선택 사항):" : "이미지 파일 선택 (필수):"}
                </label>
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  disabled={isSavingAsset}
                  onChange={handleFileChange}
                  style={{
                    fontSize: '11px', color: '#ccc', background: 'rgba(255,255,255,0.05)',
                    padding: '8px', borderRadius: '6px', width: '100%', boxSizing: 'border-box',
                    border: '1px dashed rgba(255,255,255,0.2)'
                  }}
                />
              </div>

              {uploadCategory === 'character' && !fileDataUrl && (
                <div style={{ fontSize: '10px', color: '#888', background: 'rgba(255,255,255,0.03)', padding: '8px 10px', borderRadius: '6px' }}>
                  💡 이미지 파일 없이 에셋 이름만 입력하셔도 <strong>새로운 픽셀 캐릭터 에셋</strong>이 즉시 등록되어 에디터로 그리실 수 있습니다!
                </div>
              )}

              {fileDataUrl && (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-glass)', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <img src={fileDataUrl} alt="Preview" style={{ width: '48px', height: '48px', objectFit: 'contain', background: '#000', borderRadius: '4px', imageRendering: 'pixelated' }} />
                  <div style={{ fontSize: '11px', color: '#ccc', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div>현재 이미지 크기: <strong>{imgWidth} x {imgHeight} px</strong></div>
                    <div>설정된 타일: <strong style={{ color: 'var(--accent)' }}>{customColsInput}열 x {customRowsInput}행 ({tileSizeInput}px 규격)</strong></div>
                  </div>
                </div>
              )}

              {fileDataUrl && uploadCategory === 'character' && (
                <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid var(--accent)', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Sparkles size={14} /> ✨ 스마트 픽셀 자동 보정 (여백 제거 & 규격화)
                  </div>
                  
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>가로 열 수 (Cols)</label>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={customColsInput}
                        disabled={isSavingAsset}
                        onChange={(e) => setCustomColsInput(parseInt(e.target.value, 10) || 4)}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '4px 8px', color: '#fff', fontSize: '11px', textAlign: 'center' }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '10px', color: '#aaa', display: 'block', marginBottom: '2px' }}>세로 행 수 (Rows)</label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        value={customRowsInput}
                        disabled={isSavingAsset}
                        onChange={(e) => setCustomRowsInput(parseInt(e.target.value, 10) || 9)}
                        style={{ width: '100%', background: '#0d0d12', border: '1px solid var(--border-glass)', borderRadius: '4px', padding: '4px 8px', color: '#fff', fontSize: '11px', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleAutoNormalizeSpriteSheet}
                    disabled={isNormalizing || isSavingAsset}
                    style={{
                      padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: '6px',
                      color: '#000', fontSize: '11px', fontWeight: 'bold', cursor: (isNormalizing || isSavingAsset) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px'
                    }}
                  >
                    <Sparkles size={13} /> {isNormalizing ? '보정 처리 중...' : `✨ 여백 제거 & ${customColsInput}열 x ${customRowsInput}행 픽셀 규격화 자동 보정`}
                  </button>
                </div>
              )}

              {/* Submit Button with Loading Indicator */}
              <button
                type="submit"
                disabled={isSavingAsset || (uploadCategory === 'character' ? !assetNameInput.trim() : !fileDataUrl)}
                style={{
                  marginTop: '8px', padding: '10px',
                  background: isSavingAsset ? '#e5c07b' : ((uploadCategory === 'character' ? assetNameInput.trim() : fileDataUrl) ? 'var(--primary)' : '#444'),
                  border: 'none', borderRadius: '6px', color: isSavingAsset ? '#000' : '#fff', fontSize: '12px',
                  fontWeight: 'bold', cursor: (isSavingAsset || (uploadCategory === 'character' ? !assetNameInput.trim() : !fileDataUrl)) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.2s ease'
                }}
              >
                {isSavingAsset ? (
                  <>
                    <Loader2 size={15} className="animate-spin" /> {saveProgressText || '💾 에셋 저장 중...'}
                  </>
                ) : (
                  <>
                    <Save size={15} /> 💾 저장하기
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
