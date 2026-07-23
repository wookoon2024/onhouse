import { useState, useEffect, useRef } from 'react';
import { CanvasGame } from './game/CanvasGame';
import { type MapDefinition, maps, PRESET_MAP_TEMPLATES, createCustomMap, getCharRowActions } from './game/MapData';
import {
  type PlayerState,
  getOrCreateDeviceId,
  generateNickname,
  getOfflineUsers,
  saveOfflineUser,
  removeOfflineUser,
  getDMs,
  saveDM,
  type DirectMessage
} from './game/syncManager';
import { Customizer } from './components/Customizer';
import { Messenger } from './components/Messenger';
import { StatusPicker } from './components/StatusPicker';
import { MapSelector } from './components/MapSelector';
import { MapEditorView } from './components/MapEditorView';
import { Mail, Settings, User, Eye, Hammer, Home } from 'lucide-react';
import { AssetViewer } from './components/AssetViewer';
import { HouseJoinModal } from './components/HouseJoinModal';
import { PlayerInteractionModal } from './components/PlayerInteractionModal';
import { DMRequestModal } from './components/DMRequestModal';
import { getSavedHouseCode, setSavedHouseCode, fetchHouseMaps, saveHouseMapToDB, fetchHouseAssets } from './services/HouseService';
import { supabase } from './lib/supabase';
import { APP_VERSION } from './config/version';

interface ChatLogMessage {
  id: string;
  senderName: string;
  text: string;
  time: number;
}

export default function App() {
  const deviceId = useRef(getOrCreateDeviceId());

  // House Code (Multi-user sharing room ID)
  const [houseCode, setHouseCodeState] = useState<string>(getSavedHouseCode);
  const [showHouseModal, setShowHouseModal] = useState<boolean>(false);

  // 0. Active Maps (loads custom layouts from localStorage)
  const [activeMaps, setActiveMaps] = useState<Record<string, MapDefinition>>(() => {
    const loadedMaps: Record<string, MapDefinition> = { ...maps };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('on_house_map_')) {
        const mapId = key.replace('on_house_map_', '');
        try {
          const saved = localStorage.getItem(key);
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.width && parsed.height && Array.isArray(parsed.baseLayer)) {
              loadedMaps[mapId] = parsed;
            }
          }
        } catch (e) {
          console.error(`Failed to load custom map: ${mapId}`, e);
        }
      }
    }
    return loadedMaps;
  });

  // 0.5. Available Map IDs displayed in top bar (1 to 4 maps)
  const [availableMapIds, setAvailableMapIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('on_house_available_map_ids');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= 1 && parsed.length <= 4) {
          return parsed;
        }
      } catch (e) {
        console.error("Failed to parse availableMapIds", e);
      }
    }
    return ['room', 'subway', 'park', 'apt'];
  });

  // 1. Local Player State
  const [localPlayer, setLocalPlayer] = useState<PlayerState>(() => {
    const savedName = localStorage.getItem('on_house_nickname') || generateNickname();
    localStorage.setItem('on_house_nickname', savedName);

    const savedSprite = (localStorage.getItem('on_house_sprite') as any) || 'ninja_blue';
    const savedHue = parseInt(localStorage.getItem('on_house_hue') || '0');
    const rawStatus = localStorage.getItem('on_house_status');
    const savedStatus = (rawStatus === '반가워요!' || !rawStatus) ? '' : rawStatus;

    // Default to My Room spawn point
    const spawn = maps.room.spawnPoints[0];
    return {
      id: deviceId.current,
      nickname: savedName,
      spriteType: savedSprite,
      hue: savedHue,
      mapId: 'room',
      x: spawn.x * 16,
      y: spawn.y * 16,
      dir: 'down',
      isMoving: false,
      isOnline: true,
      statusMessage: savedStatus,
      lastActive: Date.now()
    };
  });

  useEffect(() => {
    localStorage.setItem('on_house_available_map_ids', JSON.stringify(availableMapIds));
    if (availableMapIds.length > 0 && !availableMapIds.includes(localPlayer.mapId)) {
      setLocalPlayer((prev) => ({ ...prev, mapId: availableMapIds[0] }));
    }
  }, [availableMapIds, localPlayer.mapId]);

  // 2. Multi-player lists
  const [otherPlayers, setOtherPlayers] = useState<Record<string, PlayerState>>({});
  const [offlinePlayers, setOfflinePlayers] = useState<Record<string, PlayerState>>(() => getOfflineUsers());

  // 3. UI control states
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [activeDMTarget, setActiveDMTarget] = useState<PlayerState | null>(null);
  const [showAssetViewer, setShowAssetViewer] = useState(false);
  const [interactionTargetPlayer, setInteractionTargetPlayer] = useState<PlayerState | null>(null);
  const [incomingDMRequest, setIncomingDMRequest] = useState<{ requesterId: string; requesterName: string; requesterPlayer: PlayerState } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 3.5. Map Editor states
  const [showProfessionalEditor, setShowProfessionalEditor] = useState(false);

  // 4. In-game logs & popups
  const [chatLogs, setChatLogs] = useState<ChatLogMessage[]>([]);
  const [chatBubbles, setChatBubbles] = useState<Record<string, { text: string; time: number }>>({});
  const [chatInput, setChatInput] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Broadcast Channel reference
  const bcRef = useRef<BroadcastChannel | null>(null);

  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatLogScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat log inside chat box when new messages arrive
  useEffect(() => {
    if (chatLogScrollRef.current) {
      chatLogScrollRef.current.scrollTop = chatLogScrollRef.current.scrollHeight;
    }
  }, [chatLogs]);

  // Global Enter key shortcut to focus chat input
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if editing map or customizing avatar
      if (showProfessionalEditor || isCustomizing || activeDMTarget) {
        return;
      }

      if (e.key === 'Enter') {
        if (document.activeElement !== chatInputRef.current) {
          e.preventDefault();
          chatInputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        if (document.activeElement === chatInputRef.current) {
          e.preventDefault();
          chatInputRef.current?.blur();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showProfessionalEditor, isCustomizing, activeDMTarget]);

  // Mobile responsive detection
  const [isMobile, setIsMobile] = useState(false);
  const [assetVersion, setAssetVersion] = useState<number>(0);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper to fetch custom character asset data for player sync
  const getCustomCharData = (spriteType: string) => {
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
      const list: any[] = saved ? JSON.parse(saved) : [];
      const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};

      const found = list.find((item: any) => item.id === spriteType);
      const override = overrides[spriteType];

      if (override && override.url) {
        return {
          id: spriteType,
          name: found?.name || spriteType,
          url: override.url,
          cols: override.cols || found?.cols || 4,
          rows: override.rows || found?.rows || 7
        };
      }
      if (found) {
        return found;
      }
    } catch (e) {}
    return null;
  };

  const sendPlayerSync = (playerData: PlayerState) => {
    try {
      const customData = getCustomCharData(playerData.spriteType);
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'player_sync',
        payload: {
          ...playerData,
          customCharData: customData
        }
      });
    } catch (e) {}
  };

  // Keep player state ref up-to-date for event handlers
  const localPlayerRef = useRef<PlayerState>(localPlayer);
  useEffect(() => {
    localPlayerRef.current = localPlayer;
    // Save settings immediately
    localStorage.setItem('on_house_nickname', localPlayer.nickname);
    localStorage.setItem('on_house_sprite', localPlayer.spriteType);
    localStorage.setItem('on_house_hue', localPlayer.hue.toString());
    localStorage.setItem('on_house_status', localPlayer.statusMessage);

    // Broadcast player update to Supabase Realtime channel
    sendPlayerSync(localPlayer);
  }, [localPlayer, houseCode]);

  // Supabase House DB fetch & Realtime WebSocket Channel
  useEffect(() => {
    // 1. Load house maps from Supabase DB
    fetchHouseMaps(houseCode).then((mapsData) => {
      setActiveMaps(mapsData);
      const fetchedMapIds = Object.keys(mapsData);
      if (fetchedMapIds.length > 0) {
        setAvailableMapIds((prev) => {
          const merged = Array.from(new Set([...prev, ...fetchedMapIds]));
          localStorage.setItem('on_house_available_map_ids', JSON.stringify(merged));
          return merged;
        });
      }
    });

    // 2. Load house custom assets from Supabase DB & merge with local cache
    fetchHouseAssets(houseCode).then(({ mapTilesets, charSprites }) => {
      let updated = false;
      
      // Merge map tilesets by ID
      const savedMaps = localStorage.getItem('on_house_custom_map_tilesets');
      const localMapsList: any[] = savedMaps ? JSON.parse(savedMaps) : [];
      const mapMap = new Map();
      localMapsList.forEach(m => mapMap.set(m.id, m));
      mapTilesets.forEach(m => mapMap.set(m.id, m));
      const mergedMaps = Array.from(mapMap.values());
      if (mergedMaps.length > 0) {
        localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(mergedMaps));
        updated = true;
      }

      // Merge character sprites by ID
      const savedChars = localStorage.getItem('on_house_custom_char_sprites');
      const localCharsList: any[] = savedChars ? JSON.parse(savedChars) : [];
      const charMap = new Map();
      localCharsList.forEach(c => charMap.set(c.id, c));
      charSprites.forEach(c => charMap.set(c.id, c));
      const mergedChars = Array.from(charMap.values());
      if (mergedChars.length > 0) {
        localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(mergedChars));
        updated = true;
      }

      if (updated) {
        setAssetVersion((v) => v + 1);
      }
    });

    // 3. Connect Supabase Realtime channel for multi-device cross-pc sync
    const channel = supabase.channel(`house:${houseCode}`);

    channel
      .on('broadcast', { event: 'player_sync' }, ({ payload }) => {
        if (!payload || payload.id === deviceId.current) return;

        // If player has custom char data, dynamically update local asset cache & overrides
        if (payload.customCharData && payload.customCharData.id && payload.customCharData.url) {
          try {
            const saved = localStorage.getItem('on_house_custom_char_sprites');
            const current: any[] = saved ? JSON.parse(saved) : [];
            const idx = current.findIndex((item: any) => item.id === payload.customCharData.id);
            let next: any[];
            if (idx >= 0) {
              next = [...current];
              next[idx] = { ...next[idx], ...payload.customCharData };
            } else {
              next = [...current, payload.customCharData];
            }
            localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));

            const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
            const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};
            overrides[payload.customCharData.id] = {
              url: payload.customCharData.url,
              cols: payload.customCharData.cols || 4,
              rows: payload.customCharData.rows || 7
            };
            localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));

            window.dispatchEvent(new Event('on_house_sprites_updated'));
            setAssetVersion((v) => v + 1);
          } catch (e) {}
        }

        setOtherPlayers((prev) => ({
          ...prev,
          [payload.id]: payload
        }));
      })
      .on('broadcast', { event: 'request_player_sync' }, ({ payload }) => {
        if (!payload || payload.fromId === deviceId.current) return;
        // Reply with current local player state immediately!
        sendPlayerSync(localPlayerRef.current);
      })
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        if (!payload || payload.id === deviceId.current) return;
        if (payload.text && !payload.text.startsWith('/')) {
          setChatBubbles((prev) => ({
            ...prev,
            [payload.id]: { text: payload.text, time: Date.now() }
          }));

          setChatLogs((prev) => [
            ...prev,
            {
              id: 'chat_rec_' + Date.now() + Math.random(),
              senderName: payload.senderName || '다른 플레이어',
              text: payload.text,
              time: Date.now()
            }
          ]);
        }
      })
      .on('broadcast', { event: 'map_update' }, ({ payload }) => {
        if (!payload || !payload.mapId || !payload.mapData) return;
        setActiveMaps((prev) => ({
          ...prev,
          [payload.mapId]: payload.mapData
        }));
        setAvailableMapIds((prev) => {
          if (!prev.includes(payload.mapId)) {
            const next = [...prev, payload.mapId];
            localStorage.setItem('on_house_available_map_ids', JSON.stringify(next));
            return next;
          }
          return prev;
        });
      })
      .on('broadcast', { event: 'asset_update' }, ({ payload }) => {
        if (!payload || !payload.assetType || !payload.assetData) return;
        const { assetType, assetData } = payload;
        if (assetType === 'map_tileset') {
          const saved = localStorage.getItem('on_house_custom_map_tilesets');
          const current: any[] = saved ? JSON.parse(saved) : [];
          const idx = current.findIndex((item: any) => item.id === assetData.id);
          let next: any[];
          if (idx >= 0) {
            next = [...current];
            next[idx] = { ...next[idx], ...assetData };
          } else {
            next = [...current, assetData];
          }
          localStorage.setItem('on_house_custom_map_tilesets', JSON.stringify(next));
          window.dispatchEvent(new Event('on_house_sprites_updated'));
          setAssetVersion((v) => v + 1);
        } else if (assetType === 'char_sprite') {
          const saved = localStorage.getItem('on_house_custom_char_sprites');
          const current: any[] = saved ? JSON.parse(saved) : [];
          const idx = current.findIndex((item: any) => item.id === assetData.id);
          let next: any[];
          if (idx >= 0) {
            next = [...current];
            next[idx] = { ...next[idx], ...assetData };
          } else {
            next = [...current, assetData];
          }
          localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(next));

          if (assetData.url) {
            try {
              const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
              const overrides = overridesSaved ? JSON.parse(overridesSaved) : {};
              overrides[assetData.id] = {
                url: assetData.url,
                cols: assetData.cols || 4,
                rows: assetData.rows || 7
              };
              localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));
            } catch (e) {}
          }

          window.dispatchEvent(new Event('on_house_sprites_updated'));
          setAssetVersion((v) => v + 1);
        }
      })
      .on('broadcast', { event: 'dm_request' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        setIncomingDMRequest({
          requesterId: payload.fromId,
          requesterName: payload.fromName,
          requesterPlayer: payload.fromPlayer
        });
      })
      .on('broadcast', { event: 'dm_accept' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        const partner = payload.accepterPlayer || otherPlayers[payload.fromId] || offlinePlayers[payload.fromId];
        if (partner) {
          setActiveDMTarget(partner);
          showToast(`[${payload.fromName}] 님이 1:1 대화 요청을 수락했습니다!`);
        }
      })
      .on('broadcast', { event: 'dm_decline' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        showToast(`[${payload.fromName}] 님이 1:1 대화 요청을 거절했습니다.`);
      })
      .on('broadcast', { event: 'dm_close' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        setActiveDMTarget(null);
        updateUnreadCount();
        showToast(`[${payload.fromName}] 님이 1:1 대화를 종료했습니다.`);
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (!payload) return;
        if (payload.toId === deviceId.current || payload.toId) {
          setChatBubbles((prev) => ({
            ...prev,
            [payload.toId]: { text: payload.emoji, time: Date.now() }
          }));
          if (payload.toId === deviceId.current) {
            showToast(`[${payload.fromName}] 님이 ${payload.emoji} 반응을 보냈습니다!`);
          }
        }
      })
      .on('broadcast', { event: 'dm_msg' }, ({ payload }) => {
        if (!payload || payload.toId !== deviceId.current) return;
        saveDM({
          id: 'dm_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36),
          fromId: payload.fromId,
          fromName: payload.fromName,
          toId: deviceId.current,
          text: payload.text,
          timestamp: payload.timestamp || Date.now(),
          read: false
        });
        updateUnreadCount();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          sendPlayerSync(localPlayerRef.current);
          channel.send({
            type: 'broadcast',
            event: 'request_player_sync',
            payload: { fromId: deviceId.current }
          });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [houseCode]);

  const handleJoinHouse = (newCode: string) => {
    const saved = setSavedHouseCode(newCode);
    setHouseCodeState(saved);
    setShowHouseModal(false);
  };

  // Safety check: Teleport player back inside map ONLY if completely out of bounds (e.g. when map size shrinks)
  useEffect(() => {
    const currentMap = activeMaps[localPlayer.mapId];
    if (currentMap) {
      const maxX = (currentMap.width - 1) * 16;
      const maxY = (currentMap.height - 1) * 16;
      if (localPlayer.x < 0 || localPlayer.x > maxX || localPlayer.y < 0 || localPlayer.y > maxY) {
        const spawn = currentMap.spawnPoints[0] || { x: Math.floor(currentMap.width / 2), y: Math.floor(currentMap.height / 2) };
        setLocalPlayer((p) => ({
          ...p,
          x: spawn.x * 16,
          y: spawn.y * 16
        }));
      }
    }
  }, [localPlayer.mapId, activeMaps, localPlayer.x, localPlayer.y]);

  // Read unread DMs
  const updateUnreadCount = () => {
    const allDMs = getDMs();
    const unreads = allDMs.filter(dm => dm.toId === deviceId.current && !dm.read);
    setUnreadCount(unreads.length);
  };

  // Initialize sync channel
  useEffect(() => {
    const bc = new BroadcastChannel('on_house_sync');
    bcRef.current = bc;

    // Wake up: remove our device from offline lists across all tabs
    removeOfflineUser(deviceId.current);
    setOfflinePlayers(getOfflineUsers());

    // Broadcast our arrival
    bc.postMessage({
      type: 'join',
      player: localPlayerRef.current
    });

    // Handle messages
    bc.onmessage = (e) => {
      const msg = e.data;
      if (!msg || msg.senderId === deviceId.current) return;

      switch (msg.type) {
        case 'join':
          // Another player joined, respond with our state
          setOtherPlayers((prev) => ({
            ...prev,
            [msg.player.id]: msg.player
          }));
          // Remove them from offline list
          removeOfflineUser(msg.player.id);
          setOfflinePlayers(getOfflineUsers());

          bc.postMessage({
            type: 'sync_response',
            player: localPlayerRef.current
          });
          break;

        case 'sync_response':
          // Update player list with existing players
          setOtherPlayers((prev) => ({
            ...prev,
            [msg.player.id]: msg.player
          }));
          // Remove from offline
          removeOfflineUser(msg.player.id);
          setOfflinePlayers(getOfflineUsers());
          break;

        case 'move':
          setOtherPlayers((prev) => {
            const existing = prev[msg.playerId];
            if (!existing) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...existing,
                x: msg.x,
                y: msg.y,
                dir: msg.dir,
                isMoving: msg.isMoving,
                mapId: msg.mapId,
                isOnline: true,
                lastActive: Date.now()
              }
            };
          });
          break;

        case 'chat':
          setOtherPlayers((prev) => {
            const p = prev[msg.playerId];
            if (!p) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...p,
                isOnline: true
              }
            };
          });
          // Add to speech bubble (Do NOT display slash commands starting with '/')
          if (msg.text && !msg.text.startsWith('/')) {
            setChatBubbles((prev) => ({
              ...prev,
              [msg.playerId]: { text: msg.text, time: Date.now() }
            }));
          }
          // Add to chat logs
          setChatLogs((prev) => [
            ...prev,
            {
              id: 'chat_' + Math.random().toString(36).substring(2, 11),
              senderName: msg.senderName,
              text: msg.text,
              time: Date.now()
            }
          ]);
          break;

        case 'status':
          setOtherPlayers((prev) => {
            const p = prev[msg.playerId];
            if (!p) return prev;
            return {
              ...prev,
              [msg.playerId]: {
                ...p,
                statusMessage: msg.statusMessage,
                isOnline: true
              }
            };
          });
          break;

        case 'leave':
          // Mark as offline immediately
          setOtherPlayers((prev) => {
            const copy = { ...prev };
            delete copy[msg.playerId];
            return copy;
          });
          // Update offline users list
          setOfflinePlayers(() => getOfflineUsers());
          break;

        case 'dm':
          // If the message is addressed to us
          if (msg.toId === deviceId.current) {
            const newDM: DirectMessage = {
              id: msg.id,
              fromId: msg.fromId,
              fromName: msg.fromName,
              toId: msg.toId,
              text: msg.text,
              timestamp: msg.timestamp,
              read: false
            };
            saveDM(newDM);
            updateUnreadCount();
          }
          break;

        case 'map_update':
          setActiveMaps((prev) => {
            const targetMap = prev[msg.mapId];
            if (!targetMap) return prev;

            const newBase = targetMap.baseLayer.map((r) => [...r]);
            const newDecor = targetMap.decorLayer.map((r) => [...r]);
            const newCollision = targetMap.collision.map((r) => [...r]);

            if (msg.layer === 'base') {
              newBase[msg.ty][msg.tx] = msg.tileIdx;
            } else if (msg.layer === 'decor') {
              newDecor[msg.ty][msg.tx] = msg.tileIdx;
            } else if (msg.layer === 'collision') {
              newCollision[msg.ty][msg.tx] = msg.tileIdx === 1;
            }

            const updatedMap = {
              ...targetMap,
              baseLayer: newBase,
              decorLayer: newDecor,
              collision: newCollision
            };

            localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(updatedMap));

            return {
              ...prev,
              [msg.mapId]: updatedMap
            };
          });
          break;

        case 'map_full_update':
          if (msg.mapId && msg.mapData) {
            setActiveMaps((prev) => {
              localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(msg.mapData));
              return {
                ...prev,
                [msg.mapId]: msg.mapData
              };
            });
            setAvailableMapIds((prev) => {
              if (!prev.includes(msg.mapId)) {
                const next = [...prev, msg.mapId];
                localStorage.setItem('on_house_available_map_ids', JSON.stringify(next));
                return next;
              }
              return prev;
            });
          }
          break;

        case 'map_reset':
          setActiveMaps((prev) => {
            const updated = {
              ...prev,
              [msg.mapId]: { ...maps[msg.mapId] }
            };
            localStorage.removeItem('on_house_map_' + msg.mapId);
            return updated;
          });
          break;

        case 'map_fill_base':
          setActiveMaps((prev) => {
            const targetMap = prev[msg.mapId];
            if (!targetMap) return prev;
            const newBase = targetMap.baseLayer.map((r) => [...r]);
            for (let y = 0; y < targetMap.height; y++) {
              newBase[y].fill(msg.tileIdx);
            }
            const updatedMap = {
              ...targetMap,
              baseLayer: newBase
            };
            localStorage.setItem('on_house_map_' + msg.mapId, JSON.stringify(updatedMap));
            return {
              ...prev,
              [msg.mapId]: updatedMap
            };
          });
          break;
      }
    };

    // Heartbeat check (every 3 seconds, ping other players)
    const pingInterval = setInterval(() => {
      bc.postMessage({
        type: 'sync_response',
        player: localPlayerRef.current
      });
    }, 3000);

    // Read initial DMs and offline users
    updateUnreadCount();

    // Cleanup: save player as offline and notify others before leaving
    const handleLeave = () => {
      saveOfflineUser(localPlayerRef.current);
      bc.postMessage({
        type: 'leave',
        playerId: deviceId.current
      });
    };

    window.addEventListener('beforeunload', handleLeave);
    window.addEventListener('unload', handleLeave);

    return () => {
      clearInterval(pingInterval);
      handleLeave();
      bc.close();
    };
  }, []);

  // 1. Coordinate & movement updater
  const handleMove = (x: number, y: number, dir: 'down' | 'up' | 'left' | 'right', isMoving: boolean) => {
    setLocalPlayer((prev) => ({
      ...prev,
      x,
      y,
      dir,
      isMoving,
      lastActive: Date.now()
    }));

    // Broadcast coordinate shift
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      x,
      y,
      dir,
      isMoving,
      mapId: localPlayer.mapId
    });
  };

  // 2. Map transitioner
  const handleMapChange = (mapId: string) => {
    const targetMap = activeMaps[mapId] || maps[mapId];
    const spawn = targetMap?.spawnPoints?.[0] || { x: 20, y: 15 };
    const newX = spawn.x * 16;
    const newY = spawn.y * 16;

    setLocalPlayer((prev) => ({
      ...prev,
      mapId,
      x: newX,
      y: newY,
      dir: 'down',
      isMoving: false
    }));

    // Broadcast coordinate shift and map jump
    bcRef.current?.postMessage({
      type: 'move',
      playerId: deviceId.current,
      x: newX,
      y: newY,
      dir: 'down',
      isMoving: false,
      mapId
    });

    // Notify logs
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'system_' + Date.now(),
        senderName: '🚀 시스템',
        text: `[${targetMap?.name || mapId}] 구역으로 이동하였습니다.`,
        time: Date.now()
      }
    ]);
  };

  // 2.5. Add Map and Delete Map Handlers
  const handleAddMap = (presetId?: string, customName?: string) => {
    if (availableMapIds.length >= 4) {
      alert("맵은 최대 4개까지만 설정할 수 있습니다.");
      return;
    }

    let newMapId = '';
    let newMapObj: MapDefinition;

    if (presetId && PRESET_MAP_TEMPLATES[presetId]) {
      newMapId = presetId;
      const saved = localStorage.getItem('on_house_map_' + presetId);
      if (saved) {
        try {
          newMapObj = JSON.parse(saved);
        } catch {
          newMapObj = PRESET_MAP_TEMPLATES[presetId].builder();
        }
      } else {
        newMapObj = PRESET_MAP_TEMPLATES[presetId].builder();
      }
    } else {
      const timestamp = Date.now();
      newMapId = `custom_${timestamp}`;
      const name = customName || `🎨 새 커스텀 맵 ${availableMapIds.length + 1}`;
      newMapObj = createCustomMap(newMapId, name, 'outdoor');
    }

    setActiveMaps((prev) => ({ ...prev, [newMapId]: newMapObj }));
    setAvailableMapIds((prev) => [...prev, newMapId]);
    localStorage.setItem('on_house_map_' + newMapId, JSON.stringify(newMapObj));
    handleMapChange(newMapId);
  };

  const handleDeleteMap = (mapId: string) => {
    if (availableMapIds.length <= 1) {
      alert("최소 1개의 맵은 항상 유지되어야 합니다.");
      return;
    }

    const nextAvailable = availableMapIds.filter((id) => id !== mapId);
    setAvailableMapIds(nextAvailable);

    if (localPlayer.mapId === mapId) {
      handleMapChange(nextAvailable[0]);
    }
  };

  // 3. Status picker updater
  const handleStatusChange = (statusMessage: string) => {
    setLocalPlayer((prev) => ({ ...prev, statusMessage }));

    bcRef.current?.postMessage({
      type: 'status',
      playerId: deviceId.current,
      statusMessage
    });
  };

  // 4. Chat messaging submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) {
      chatInputRef.current?.blur();
      return;
    }

    const text = chatInput.trim();

    // Check for Slash Command Emotes (e.g., /환호, /공격, /댄스)
    if (text.startsWith('/')) {
      const commandName = text.slice(1).trim();
      const charId = localPlayer.spriteType;
      const rowActions = getCharRowActions(charId);
      const foundRowIndex = rowActions.findIndex(act => act.toLowerCase() === commandName.toLowerCase());

      if (foundRowIndex >= 0) {
        setLocalPlayer((prev) => ({
          ...prev,
          currentEmote: commandName,
          emoteUntil: Date.now() + 3500
        }));
      }
    }

    // Trigger local speech bubble (Do NOT display slash commands starting with '/')
    if (!text.startsWith('/')) {
      setChatBubbles((prev) => ({
        ...prev,
        [deviceId.current]: { text, time: Date.now() }
      }));
    }

    // Add to logs
    setChatLogs((prev) => [
      ...prev,
      {
        id: 'chat_me_' + Date.now(),
        senderName: localPlayer.nickname,
        text,
        time: Date.now()
      }
    ]);

    // Broadcast chat via Supabase Realtime channel for cross-device users
    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'chat',
        payload: {
          id: deviceId.current,
          senderName: localPlayer.nickname,
          text
        }
      });
    } catch (e) {}

    // Broadcast chat to other local tabs
    bcRef.current?.postMessage({
      type: 'chat',
      playerId: deviceId.current,
      senderName: localPlayer.nickname,
      text
    });

    setChatInput('');
    chatInputRef.current?.blur();
  };

  // 5. Send DM handler (local tabs + Supabase Realtime across devices)
  const handleSendDM = (toId: string, text: string) => {
    bcRef.current?.postMessage({
      type: 'dm',
      id: 'dm_' + Math.random().toString(36).substring(2, 11),
      fromId: deviceId.current,
      fromName: localPlayer.nickname,
      toId,
      text,
      timestamp: Date.now()
    });

    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'dm_msg',
        payload: {
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          toId,
          text,
          timestamp: Date.now()
        }
      });
    } catch (e) {}
  };

  // Handle click on another player (opens Player Interaction Modal)
  const handlePlayerClick = (p: PlayerState) => {
    if (p.id === deviceId.current) {
      // Clicked self: open customizer
      setIsCustomizing(true);
    } else {
      // Clicked another player: open interaction popup modal with 4 options!
      setInteractionTargetPlayer(p);
    }
  };

  // Send 1:1 DM Request to target player
  const handleRequestDMChat = (target: PlayerState) => {
    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'dm_request',
        payload: {
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          fromPlayer: localPlayer,
          toId: target.id
        }
      });
      showToast(`[${target.nickname}] 님에게 1:1 대화를 신청했습니다. 응답 대기 중...`);
    } catch (e) {}
  };

  // Accept incoming 1:1 DM Request
  const handleAcceptDMRequest = () => {
    if (!incomingDMRequest) return;
    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'dm_accept',
        payload: {
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          accepterPlayer: localPlayer,
          toId: incomingDMRequest.requesterId
        }
      });
    } catch (e) {}

    setActiveDMTarget(incomingDMRequest.requesterPlayer);
    setIncomingDMRequest(null);
  };

  // Decline incoming 1:1 DM Request
  const handleDeclineDMRequest = () => {
    if (!incomingDMRequest) return;
    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'dm_decline',
        payload: {
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          toId: incomingDMRequest.requesterId
        }
      });
    } catch (e) {}
    setIncomingDMRequest(null);
  };

  // Close 1:1 DM Chat session and notify partner
  const handleCloseDMChat = () => {
    if (activeDMTarget) {
      try {
        supabase.channel(`house:${houseCode}`).send({
          type: 'broadcast',
          event: 'dm_close',
          payload: {
            fromId: localPlayer.id,
            fromName: localPlayer.nickname,
            toId: activeDMTarget.id
          }
        });
      } catch (e) {}
    }
    setActiveDMTarget(null);
    updateUnreadCount();
  };

  // Send reaction emoji
  const handleSendReaction = (targetId: string, emoji: string) => {
    try {
      supabase.channel(`house:${houseCode}`).send({
        type: 'broadcast',
        event: 'reaction',
        payload: {
          fromId: localPlayer.id,
          fromName: localPlayer.nickname,
          toId: targetId,
          emoji
        }
      });
    } catch (e) {}
    setChatBubbles((prev) => ({
      ...prev,
      [targetId]: { text: emoji, time: Date.now() }
    }));
  };

  // Leave offline/online note for target
  const handleLeaveNote = (targetId: string, noteText: string) => {
    handleSendDM(targetId, `[📝 메모] ${noteText}`);
    showToast('메모가 정상적으로 전달되었습니다.');
  };

  // Open Inbox / Mailbox
  const handleOpenMailbox = () => {
    // Find who messaged us recently and open chat with the first one
    const dms = getDMs();
    const lastUnread = dms.filter(dm => dm.toId === deviceId.current && !dm.read).pop();
    
    if (lastUnread) {
      // Check if player details exist in memory
      let targetPlayer = otherPlayers[lastUnread.fromId] || offlinePlayers[lastUnread.fromId];
      if (!targetPlayer) {
        // Fallback mockup player state
        targetPlayer = {
          id: lastUnread.fromId,
          nickname: lastUnread.fromName,
          spriteType: 'ninja_blue',
          hue: 0,
          mapId: 'room',
          x: 0, y: 0, dir: 'down', isMoving: false, isOnline: false,
          statusMessage: '부재중', lastActive: Date.now()
        };
      }
      setActiveDMTarget(targetPlayer);
    } else {
      // No unreads, open chat with anyone if we have history
      const lastDM = dms.filter(dm => dm.fromId === deviceId.current || dm.toId === deviceId.current).pop();
      if (lastDM) {
        const partnerId = lastDM.fromId === deviceId.current ? lastDM.toId : lastDM.fromId;
        const partnerName = lastDM.fromId === deviceId.current ? '상대방' : lastDM.fromName;
        let targetPlayer = otherPlayers[partnerId] || offlinePlayers[partnerId];
        if (!targetPlayer) {
          targetPlayer = {
            id: partnerId,
            nickname: partnerName,
            spriteType: 'ninja_blue',
            hue: 0,
            mapId: 'room',
            x: 0, y: 0, dir: 'down', isMoving: false, isOnline: false,
            statusMessage: '부재중', lastActive: Date.now()
          };
        }
        setActiveDMTarget(targetPlayer);
      } else {
        alert('받은 쪽지나 이전 대화 내역이 없습니다. 다른 캐릭터를 클릭하여 쪽지를 먼저 보내보세요!');
      }
    }
    updateUnreadCount();
  };


  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* App Version Badge (Bottom Left) */}
      <div style={{
        position: 'absolute', left: '10px', bottom: isMobile ? '4px' : '8px', zIndex: 99,
        fontSize: '10px', fontWeight: 'bold', color: '#fff', background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)',
        pointerEvents: 'none', fontFamily: 'monospace'
      }}>
        {APP_VERSION}
      </div>

      {/* 1. Main Canvas Game */}
      <CanvasGame
        localPlayer={localPlayer}
        otherPlayers={otherPlayers}
        offlinePlayers={offlinePlayers}
        currentMapId={localPlayer.mapId}
        chatBubbles={chatBubbles}
        onMove={handleMove}
        onPlayerClick={handlePlayerClick}
        isEditMode={false}
        selectedTile={0}
        editLayer="base"
        onPaintTile={() => {}}
        mapData={activeMaps[localPlayer.mapId] || activeMaps[availableMapIds[0]] || maps.room}
        brushSize={1}
        assetVersion={assetVersion}
      />

      {/* 2. Map Selector (Top Left) */}
      <MapSelector
        currentMapId={localPlayer.mapId}
        availableMapIds={availableMapIds}
        activeMaps={activeMaps}
        onMapChange={handleMapChange}
      />



      {/* Toast Notification Banner */}
      {toastMessage && (
        <div style={{
          position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 200, background: 'rgba(20, 20, 30, 0.95)', color: '#fff',
          border: '1px solid var(--accent)', borderRadius: '8px', padding: '10px 18px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)', fontFamily: 'var(--font-pixel)',
          fontSize: '12px', fontWeight: 'bold', pointerEvents: 'none'
        }}>
          {toastMessage}
        </div>
      )}

      {/* Player Interaction Modal (Clicked Player Options Popup) */}
      {interactionTargetPlayer && (
        <PlayerInteractionModal
          localPlayer={localPlayer}
          targetPlayer={interactionTargetPlayer}
          onClose={() => setInteractionTargetPlayer(null)}
          onRequestDMChat={handleRequestDMChat}
          onSendReaction={handleSendReaction}
          onLeaveNote={handleLeaveNote}
        />
      )}

      {/* Incoming 1:1 DM Request Modal (10s auto-dismiss timer) */}
      {incomingDMRequest && (
        <DMRequestModal
          requesterName={incomingDMRequest.requesterName}
          onAccept={handleAcceptDMRequest}
          onDecline={handleDeclineDMRequest}
        />
      )}

      {/* 5. Customizer Panel (Right overlay) */}
      {isCustomizing && (
        <Customizer
          player={localPlayer}
          onChange={(updates) => setLocalPlayer((prev) => ({ ...prev, ...updates }))}
          onClose={() => setIsCustomizing(false)}
        />
      )}

      {/* 6. DM Messenger overlay */}
      {activeDMTarget && (
        <Messenger
          localPlayer={localPlayer}
          activeTarget={activeDMTarget}
          onClose={handleCloseDMChat}
          onSendDM={handleSendDM}
        />
      )}

      {/* 6.5. Asset Viewer (Dev Tool) */}
      {showAssetViewer && (
        <AssetViewer onClose={() => setShowAssetViewer(false)} />
      )}

      {/* 7. Classic Flat Translucent Integrated Chat Box */}
      <div style={{
        position: 'absolute',
        bottom: isMobile ? '6px' : '14px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: isMobile ? 'calc(100% - 12px)' : 'calc(100% - 40px)',
        maxWidth: '680px',
        zIndex: 100,
        background: 'rgba(15, 15, 25, 0.75)',
        backdropFilter: 'blur(10px)',
        borderRadius: '6px',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: isMobile ? '6px 8px' : '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {/* Integrated Scrollable Chat Log History Area */}
        <div
          ref={chatLogScrollRef}
          style={{
            maxHeight: isMobile ? '60px' : '130px',
            minHeight: '30px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            paddingRight: '4px',
            margin: '1px 0'
          }}
        >
          {chatLogs.length === 0 ? (
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '2px 0' }}>
              {isMobile ? "대화 내역이 없습니다." : "대화 내역이 없습니다. (Enter 키를 눌러 대화를 나누세요)"}
            </div>
          ) : (
            chatLogs.map((log) => (
              <div
                key={log.id}
                style={{
                  fontSize: isMobile ? '11px' : '12px',
                  fontFamily: 'var(--font-pixel)',
                  color: '#fff',
                  display: 'flex',
                  gap: '4px',
                  alignItems: 'baseline'
                }}
              >
                <span style={{ color: '#fab387', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>[전체]</span>
                <span style={{ color: '#a6e3a1', fontWeight: 'bold', whiteSpace: 'nowrap', flexShrink: 0 }}>{log.senderName} :</span>
                <span style={{ wordBreak: 'break-word', color: '#e6e9ef' }}>{log.text}</span>
              </div>
            ))
          )}
        </div>

        {/* Integrated Flat Tools & Input Controls Header Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '4px' : '8px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          paddingTop: '4px',
          overflowX: 'auto',
          maxWidth: '100%'
        }}>
          <span style={{
            fontSize: '10px', fontWeight: 'bold', color: '#fab387',
            background: 'rgba(250, 179, 135, 0.15)', padding: '2px 5px',
            borderRadius: '2px', border: '1px solid rgba(250, 179, 135, 0.3)',
            flexShrink: 0, whiteSpace: 'nowrap'
          }}>
            [전체]
          </span>

          {/* Status Picker (😊) */}
          <div style={{ flexShrink: 0 }}>
            <StatusPicker
              currentStatus={localPlayer.statusMessage}
              onStatusChange={handleStatusChange}
            />
          </div>

          {/* Mailbox / DM Button */}
          <button
            onClick={handleOpenMailbox}
            style={{
              background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
              position: 'relative', display: 'flex', alignItems: 'center', padding: '3px', flexShrink: 0
            }}
            title="메일함 / DM"
          >
            <Mail size={14} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-4px', background: 'var(--danger)',
                color: '#fff', fontSize: '8px', width: '13px', height: '13px', borderRadius: '50%',
                display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold'
              }}>
                {unreadCount}
              </span>
            )}
          </button>

          {/* Flat Chat Input Form */}
          <form onSubmit={handleChatSubmit} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: isMobile ? '90px' : '140px' }}>
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isMobile ? "메시지 입력..." : "메시지를 입력하세요 (Enter 키로 전송)..."}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '3px',
                padding: isMobile ? '4px 6px' : '6px 10px',
                fontSize: isMobile ? '11px' : '12px',
                color: '#fff',
                outline: 'none'
              }}
            />
          </form>

          {/* Right Action Icons */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => {
                setShowProfessionalEditor(!showProfessionalEditor);
                setIsCustomizing(false);
              }}
              style={{
                background: showProfessionalEditor ? 'rgba(139,92,246,0.3)' : 'none',
                border: showProfessionalEditor ? '1px solid var(--accent)' : 'none',
                color: showProfessionalEditor ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
              }}
              title="전문 지도 편집기"
            >
              <Hammer size={14} />
            </button>

            <button
              onClick={() => setShowAssetViewer(!showAssetViewer)}
              style={{
                background: showAssetViewer ? 'rgba(139,92,246,0.3)' : 'none',
                border: showAssetViewer ? '1px solid var(--accent)' : 'none',
                color: showAssetViewer ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
              }}
              title="픽셀 에디터"
            >
              <Eye size={14} />
            </button>

            <button
              onClick={() => setIsCustomizing(!isCustomizing)}
              style={{
                background: isCustomizing ? 'rgba(139,92,246,0.3)' : 'none',
                border: isCustomizing ? '1px solid var(--accent)' : 'none',
                color: isCustomizing ? 'var(--accent)' : '#ccc',
                cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '3px', borderRadius: '2px'
              }}
              title="캐릭터 커스텀 설정"
            >
              <Settings size={14} />
            </button>

            {/* House Code Switcher Button */}
            <button
              onClick={() => setShowHouseModal(true)}
              style={{
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold',
                whiteSpace: 'nowrap', flexShrink: 0
              }}
              title="하우스 번호 (클릭하여 변경 및 공유)"
            >
              <Home size={11} />
              <span>{houseCode}</span>
            </button>

            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }} />

            <div style={{ fontSize: '11px', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={12} />
              <span>{localPlayer.nickname}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Professional Map Editor Panel */}
      {showProfessionalEditor && (
        <MapEditorView
          activeMaps={activeMaps}
          availableMapIds={availableMapIds}
          onAddMap={handleAddMap}
          onDeleteMap={handleDeleteMap}
          onSaveMap={(mapId, updatedMap) => {
            setActiveMaps((prev) => {
              const next = { ...prev, [mapId]: updatedMap };
              localStorage.setItem('on_house_map_' + mapId, JSON.stringify(updatedMap));
              
              if (mapId === localPlayer.mapId) {
                setLocalPlayer((p) => ({
                  ...p,
                  x: Math.min(p.x, (updatedMap.width - 2) * 16),
                  y: Math.min(p.y, (updatedMap.height - 2) * 16)
                }));
              }
              return next;
            });

            setAvailableMapIds((prev) => {
              if (!prev.includes(mapId)) {
                const next = [...prev, mapId];
                localStorage.setItem('on_house_available_map_ids', JSON.stringify(next));
                return next;
              }
              return prev;
            });

            // Save to Supabase DB for this House!
            saveHouseMapToDB(houseCode, mapId, updatedMap).then((res) => {
              if (res && !res.success) {
                console.error('Supabase DB save error:', res.error);
                alert(`⚠️ 클라우드 DB 저장 실패: ${res.error || '권한 또는 네트워크 오류'}\n(로컬 브라우저에만 저장되었습니다. 다른 사람에게 공유하려면 Supabase DB 저장이 성공해야 합니다.)`);
              }
            });

            // Broadcast to all devices in real-time!
            try {
              supabase.channel(`house:${houseCode}`).send({
                type: 'broadcast',
                event: 'map_update',
                payload: { mapId, mapData: updatedMap }
              });
            } catch (e) {}

            // Broadcast full map update to other local tabs!
            if (bcRef.current) {
              bcRef.current.postMessage({
                type: 'map_full_update',
                mapId,
                mapData: updatedMap
              });
            }
          }}
          onClose={() => setShowProfessionalEditor(false)}
        />
      )}

      {/* 9. House Join & Switcher Modal */}
      {showHouseModal && (
        <HouseJoinModal
          currentHouseCode={houseCode}
          onJoinHouse={handleJoinHouse}
          onClose={() => setShowHouseModal(false)}
        />
      )}
    </div>
  );
}
