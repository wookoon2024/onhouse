import React, { useEffect, useState } from 'react';
import { MessageSquare, Check, X, Clock } from 'lucide-react';

interface DMRequestModalProps {
  requesterName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export const DMRequestModal: React.FC<DMRequestModalProps> = ({
  requesterName,
  onAccept,
  onDecline
}) => {
  const [timeLeft, setTimeLeft] = useState(10);

  useEffect(() => {
    if (timeLeft <= 0) {
      onDecline();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onDecline]);

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
      zIndex: 160, display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{
        width: '320px', background: 'rgba(25, 25, 38, 0.96)',
        border: '1px solid rgba(139, 92, 246, 0.4)', borderRadius: '10px',
        boxShadow: '0 16px 48px rgba(0, 0, 0, 0.8)', color: '#fff',
        fontFamily: 'var(--font-pixel)', padding: '18px', display: 'flex',
        flexDirection: 'column', gap: '14px'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>
          <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--accent)' }}>
            1:1 대화 요청 도착
          </span>
          <div style={{
            marginLeft: 'auto', fontSize: '11px', color: '#f9e2af',
            display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(249, 226, 175, 0.15)',
            padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(249, 226, 175, 0.3)'
          }}>
            <Clock size={12} />
            <span>{timeLeft}초</span>
          </div>
        </div>

        {/* Message */}
        <div style={{ fontSize: '12px', color: '#cdd6f4', lineHeight: '1.5', textAlign: 'center', padding: '6px 0' }}>
          <strong style={{ color: '#89b4fa' }}>[{requesterName}]</strong> 님이 1:1 대화를 신청했습니다.<br />
          수락하시겠습니까?
        </div>

        {/* 10-Second Progress Bar */}
        <div style={{
          width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', overflow: 'hidden'
        }}>
          <div style={{
            width: `${(timeLeft / 10) * 100}%`, height: '100%',
            background: 'var(--accent)', transition: 'width 1s linear'
          }} />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            onClick={onDecline}
            style={{
              flex: 1, padding: '10px', background: 'rgba(243, 139, 168, 0.15)',
              border: '1px solid rgba(243, 139, 168, 0.3)', borderRadius: '6px',
              color: 'var(--danger)', fontSize: '12px', fontWeight: 'bold',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
              cursor: 'pointer'
            }}
          >
            <X size={15} /> 거절
          </button>

          <button
            onClick={onAccept}
            style={{
              flex: 1, padding: '10px', background: 'var(--primary)',
              border: '1px solid var(--primary-hover)', borderRadius: '6px',
              color: '#fff', fontSize: '12px', fontWeight: 'bold',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px',
              cursor: 'pointer'
            }}
          >
            <Check size={15} /> 수락하기
          </button>
        </div>
      </div>
    </div>
  );
};
