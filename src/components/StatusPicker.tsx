import React, { useState, useRef, useEffect } from 'react';
import { Smile, HelpCircle } from 'lucide-react';

interface StatusPickerProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
}

const PRESETS = ['일하는중', '출근중', '식사중', '공부중', '휴식중', '회의중', '자리비움', '게임중', '음악감상', '오프라인'];

export const StatusPicker: React.FC<StatusPickerProps> = ({ currentStatus, onStatusChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [coords, setCoords] = useState<{ bottom: number; left: number }>({ bottom: 50, left: 10 });

  const toggleOpen = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        bottom: Math.max(10, window.innerHeight - rect.top + 6),
        left: Math.max(10, Math.min(rect.left, window.innerWidth - 250))
      });
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown on outside click or ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (status: string) => {
    onStatusChange(status);
    setIsOpen(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customText.trim()) {
      onStatusChange(customText.trim().substring(0, 12));
      setCustomText('');
      setIsOpen(false);
    }
  };

  return (
    <div style={{ display: 'inline-block' }}>
      {/* Current status display button - Flat sharp translucent style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <button
          ref={buttonRef}
          onClick={toggleOpen}
          style={{
            padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px',
            color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '3px', fontSize: '11px', background: 'rgba(0, 0, 0, 0.55)',
            cursor: 'pointer', outline: 'none', transition: 'all 0.15s ease'
          }}
          title="상태 메시지 변경"
        >
          <Smile size={14} style={{ color: '#fab387' }} />
          <span>상태: {currentStatus || '설정없음'}</span>
        </button>

        {/* Info button */}
        <div 
          style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <HelpCircle size={14} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />
          
          {showTooltip && (
            <div style={{
              position: 'fixed', bottom: `${coords.bottom + 10}px`, left: `${coords.left + 50}px`,
              width: '220px', padding: '10px', zIndex: 99999, fontSize: '11px', lineHeight: '1.4',
              color: '#cdd6f4', background: 'rgba(15, 15, 25, 0.95)', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px', pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.6)'
            }}>
              💡 <strong>오프라인 상태 유지</strong>: 브라우저를 닫더라도 설정하신 상태가 캐릭터 머리 위에 계속 유지됩니다!
            </div>
          )}
        </div>
      </div>

      {/* Fixed position popover - NEVER clipped by chat container overflow! */}
      {isOpen && (
        <>
          {/* Overlay to close when clicking outside */}
          <div
            onClick={() => setIsOpen(false)}
            style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              zIndex: 99990, background: 'transparent'
            }}
          />

          <div 
            style={{
              position: 'fixed', bottom: `${coords.bottom}px`, left: `${coords.left}px`, width: '240px',
              padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px',
              zIndex: 99999, border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '6px', background: 'rgba(20, 20, 32, 0.96)',
              backdropFilter: 'blur(16px)', boxShadow: '0 12px 32px rgba(0,0,0,0.8)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
              <span className="pixel-text" style={{ fontSize: '11px', color: '#fab387', fontWeight: 'bold' }}>
                😊 나의 상태 설정
              </span>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '12px', padding: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => handleSelect(preset)}
                  style={{
                    padding: '5px 8px', fontSize: '10px', borderRadius: '3px',
                    background: currentStatus === preset ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                    color: currentStatus === preset ? '#fff' : '#ddd',
                    border: currentStatus === preset ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.12)',
                    cursor: 'pointer', fontWeight: currentStatus === preset ? 'bold' : 'normal'
                  }}
                >
                  {preset}
                </button>
              ))}
              <button
                onClick={() => handleSelect('')}
                style={{
                  padding: '5px 8px', fontSize: '10px', borderRadius: '3px',
                  background: currentStatus === '' ? 'var(--primary)' : 'rgba(243, 139, 168, 0.15)',
                  color: '#ff6b6b', border: '1px solid rgba(243, 139, 168, 0.3)', cursor: 'pointer'
                }}
              >
                지우기
              </button>
            </div>

            {/* Custom entry */}
            <form onSubmit={handleCustomSubmit} style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
              <input
                type="text"
                placeholder="직접 입력..."
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                style={{
                  flex: 1, padding: '5px 8px', fontSize: '11px', borderRadius: '3px',
                  background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', outline: 'none'
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '5px 10px', fontSize: '11px', borderRadius: '3px',
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                설정
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
