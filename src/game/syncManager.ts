export interface PlayerState {
  id: string;
  nickname: string;
  spriteType: 'ninja_blue' | 'ninja_red' | 'samurai_blue' | 'samurai_green' | 'pig' | string;
  hue: number; // 0-360
  mapId: string; // 'room' | 'subway' | 'park' | 'apt'
  x: number; // pixel coord
  y: number; // pixel coord
  dir: 'down' | 'up' | 'left' | 'right';
  isMoving: boolean;
  isOnline: boolean;
  isMobile?: boolean;
  statusMessage: string; // e.g. "식사중", "공부중"
  lastActive: number; // timestamp
  currentEmote?: string | null; // active emote action e.g. "환호", "공격"
  emoteUntil?: number | null; // expiration timestamp for emote animation
}

export interface DirectMessage {
  id: string; // msg UUID
  fromId: string;
  fromName: string;
  toId: string;
  text: string;
  timestamp: number;
  read: boolean;
}

// Generate a random guest name
export function generateNickname(): string {
  const adjectives = ['신난', '행복한', '편안한', '귀여운', '조용한', '피곤한', '열일하는', '산책하는'];
  const nouns = ['호랑이', '토끼', '고양이', '강아지', '람쥐', '팬더', '햄스터', '쿼카'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj} ${noun} ${num}`;
}

// Get or create unique device ID
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem('on_house_device_id');
  if (!id) {
    id = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    localStorage.setItem('on_house_device_id', id);
  }
  return id;
}

// --- LOCAL STORAGE PERSISTENCE HELPERS ---
const OFFLINE_USERS_KEY = 'on_house_offline_users';
const DM_HISTORY_KEY = 'on_house_dm_history';

export function getOfflineUsers(): Record<string, PlayerState> {
  const data = localStorage.getItem(OFFLINE_USERS_KEY);
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}

export function saveOfflineUser(user: PlayerState) {
  const users = getOfflineUsers();
  users[user.id] = {
    ...user,
    isOnline: false,
    isMoving: false,
    lastActive: Date.now()
  };
  localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(users));
}

export function removeOfflineUser(id: string) {
  const users = getOfflineUsers();
  if (users[id]) {
    delete users[id];
    localStorage.setItem(OFFLINE_USERS_KEY, JSON.stringify(users));
  }
}

// DM History Helpers
export function getDMs(): DirectMessage[] {
  const data = localStorage.getItem(DM_HISTORY_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

export function saveDM(dm: DirectMessage) {
  const dms = getDMs();
  dms.push(dm);
  localStorage.setItem(DM_HISTORY_KEY, JSON.stringify(dms));
}

export function markDMsAsRead(fromId: string, toId: string) {
  const dms = getDMs();
  let updated = false;
  dms.forEach(dm => {
    if (dm.fromId === fromId && dm.toId === toId && !dm.read) {
      dm.read = true;
      updated = true;
    }
  });
  if (updated) {
    localStorage.setItem(DM_HISTORY_KEY, JSON.stringify(dms));
  }
}
