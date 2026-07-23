import React, { useState } from 'react';
import type { PlayerState } from '../game/syncManager';
import { User, Palette, Trash2 } from 'lucide-react';

interface CustomizerProps {
  player: PlayerState;
  onChange: (updates: Partial<PlayerState>) => void;
  onClose: () => void;
}

const DEFAULT_CHARACTERS = [
  { id: 'ninja_blue', name: '🥷 닌자 (Ninja)' },
  { id: 'samurai_blue', name: '⚔️ 블루 무사' },
  { id: 'samurai_green', name: '🌿 그린 무사' },
  { id: 'pig', name: '🐷 아기 돼지' },
];

export const Customizer: React.FC<CustomizerProps> = ({ player, onChange, onClose }) => {
  // Load custom created character sprites from localStorage
  const [customChars, setCustomChars] = useState<Array<{ id: string; name: string }>>(() => {
    try {
      const saved = localStorage.getItem('on_house_custom_char_sprites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleDeleteCustomChar = (e: React.MouseEvent, charId: string, charName: string) => {
    e.stopPropagation();
    if (!window.confirm(`[${charName}] 커스텀 캐릭터를 삭제하시겠습니까?`)) return;

    const nextCustoms = customChars.filter((c) => c.id !== charId);
    setCustomChars(nextCustoms);
    localStorage.setItem('on_house_custom_char_sprites', JSON.stringify(nextCustoms));

    try {
      const overridesSaved = localStorage.getItem('on_house_char_image_overrides');
      if (overridesSaved) {
        const overrides = JSON.parse(overridesSaved);
        delete overrides[charId];
        localStorage.setItem('on_house_char_image_overrides', JSON.stringify(overrides));
      }
    } catch (err) {}

    if (player.spriteType === charId) {
      onChange({ spriteType: 'ninja_blue' });
    }

    window.dispatchEvent(new Event('on_house_sprites_updated'));
  };

  const allCharOptions = Array.from(
    new Map([...DEFAULT_CHARACTERS, ...customChars].map((c) => [c.id, c])).values()
  );

  return (
    <div className="glass-panel" style={{
      position: 'absolute', 
      right: window.innerWidth < 768 ? '15px' : '20px',
      left: window.innerWidth < 768 ? '15px' : 'auto',
      top: window.innerWidth < 768 ? '70px' : '80px',
      width: window.innerWidth < 768 ? 'auto' : '320px',
      padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px',
      zIndex: 100, border: '1px solid rgba(255, 255, 255, 0.15)',
      animation: 'pulse-glow 3s infinite'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="pixel-text" style={{ fontSize: '18px', color: 'var(--accent)' }}>
          캐릭터 꾸미기
        </h3>
        <button 
          onClick={onClose}
          style={{
            background: 'rgba(0,0,0,0.3)', color: 'var(--text-secondary)',
            padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: 'none'
          }}
        >
          닫기
        </button>
      </div>

      {/* Nickname input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          닉네임 변경
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={player.nickname}
            onChange={(e) => onChange({ nickname: e.target.value.substring(0, 12) })}
            style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: '13px' }}
            placeholder="닉네임 입력..."
          />
          <User size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* Sprite Type selection (Includes Dropdown Selectbox & Grid Buttons) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            캐릭터 베이스 외형 선택
          </label>
          <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>
            총 {allCharOptions.length}종
          </span>
        </div>

        {/* Dropdown Selectbox for Character Selection */}
        <select
          value={player.spriteType}
          onChange={(e) => onChange({ spriteType: e.target.value })}
          style={{
            width: '100%', background: '#0d0d12', border: '1px solid var(--accent)',
            borderRadius: '6px', padding: '10px 12px', color: '#fff', fontSize: '12px',
            fontWeight: 'bold', outline: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        >
          {allCharOptions.map((char) => (
            <option key={char.id} value={char.id}>
              {char.name.startsWith('👤') || char.name.startsWith('⚔️') || char.name.startsWith('🥷') || char.name.startsWith('🌿') || char.name.startsWith('🐷') || char.name.startsWith('🐶')
                ? char.name
                : `👤 ${char.name}`}
            </option>
          ))}
        </select>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
          maxHeight: '160px', overflowY: 'auto', paddingRight: '4px'
        }}>
          {allCharOptions.map((char) => {
            const isCustom = !DEFAULT_CHARACTERS.some(d => d.id === char.id);
            const isSelected = player.spriteType === char.id;

            return (
              <div key={char.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button
                  onClick={() => onChange({ spriteType: char.id })}
                  style={{
                    flex: 1, padding: isCustom ? '10px 24px 10px 8px' : '10px 8px', borderRadius: '6px',
                    background: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.3)',
                    color: '#fff', border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-glass)',
                    fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
                    textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                  }}
                  title={char.name}
                >
                  {char.name.startsWith('👤') || char.name.startsWith('⚔️') || char.name.startsWith('🥷') || char.name.startsWith('🌿') || char.name.startsWith('🐷') || char.name.startsWith('🐶')
                    ? char.name
                    : `👤 ${char.name}`}
                </button>

                {isCustom && (
                  <button
                    onClick={(e) => handleDeleteCustomChar(e, char.id, char.name)}
                    style={{
                      position: 'absolute', right: '4px', background: 'rgba(243, 139, 168, 0.25)',
                      border: '1px solid rgba(243, 139, 168, 0.4)', color: '#ff6b6b',
                      borderRadius: '4px', padding: '3px', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center'
                    }}
                    title="커스텀 캐릭터 삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Color Dye (Hue Slider) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="pixel-text" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            의상/머리 염색
          </label>
          <span className="pixel-text" style={{ fontSize: '11px', color: 'var(--accent)' }}>
            {player.hue}°
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Palette size={18} style={{ color: 'var(--text-muted)' }} />
          <input
            type="range"
            min="0"
            max="360"
            value={player.hue}
            onChange={(e) => onChange({ hue: parseInt(e.target.value) })}
            style={{
              flex: 1, accentColor: 'var(--primary)', cursor: 'pointer',
              height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, red, yellow, green, cyan, blue, magenta, red)'
            }}
          />
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
          * 염색 원리: 피부톤(살구색)을 보존하고 의상, 머리카락, 장식 픽셀의 색상(Hue)을 0°~360°로 실시간 전환합니다.
        </p>
      </div>
    </div>
  );
};
