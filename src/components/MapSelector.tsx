import React from 'react';
import { Map, Trash2 } from 'lucide-react';
import { type MapDefinition } from '../game/MapData';

interface MapSelectorProps {
  currentMapId: string;
  availableMapIds: string[];
  activeMaps: Record<string, MapDefinition>;
  onMapChange: (mapId: string) => void;
  onDeleteMap?: (mapId: string) => void;
}

const BUILTIN_MAPS = ['room', 'village', 'garden', 'cave', 'subway', 'court'];

export const MapSelector: React.FC<MapSelectorProps> = ({
  currentMapId,
  availableMapIds,
  activeMaps,
  onMapChange,
  onDeleteMap
}) => {
  return (
    <div className="glass-panel" style={{
      position: 'absolute', left: '10px', top: '10px',
      padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '6px',
      zIndex: 100, border: '1px solid rgba(255, 255, 255, 0.15)',
      background: 'rgba(20, 20, 32, 0.85)', maxWidth: 'calc(100vw - 20px)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)', borderRadius: '6px'
    }}>
      <Map size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span className="pixel-text" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginRight: '4px', flexShrink: 0 }}>
        이동:
      </span>

      <div style={{
        display: 'flex', gap: '6px', overflowX: 'auto', overflowY: 'hidden',
        flexWrap: 'nowrap', WebkitOverflowScrolling: 'touch', paddingBottom: 0,
        alignItems: 'center', scrollbarWidth: 'none', msOverflowStyle: 'none'
      }}>
        {availableMapIds.map((mId) => {
          const mapObj = activeMaps[mId];
          const mapName = mapObj ? mapObj.name : mId;
          const isCurrent = currentMapId === mId;
          const isCustom = !BUILTIN_MAPS.includes(mId);

          return (
            <div key={mId} style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
              <button
                onClick={() => onMapChange(mId)}
                style={{
                  padding: '5px 10px', fontSize: '11px', borderRadius: '6px',
                  background: isCurrent ? 'var(--primary)' : 'rgba(255, 255, 255, 0.05)',
                  color: '#fff', border: isCurrent ? '1px solid var(--primary-hover)' : '1px solid var(--border-glass)',
                  whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
                  fontWeight: isCurrent ? 'bold' : 'normal', transition: 'all 0.15s ease'
                }}
              >
                {mapName}
              </button>

              {isCustom && onDeleteMap && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`[${mapName}] 맵을 삭제하시겠습니까?`)) {
                      onDeleteMap(mId);
                    }
                  }}
                  style={{
                    background: 'rgba(243, 139, 168, 0.2)', border: '1px solid rgba(243, 139, 168, 0.4)',
                    color: '#ff6b6b', borderRadius: '4px', padding: '3px 4px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="맵 삭제"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
