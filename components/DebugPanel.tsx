'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRoomContext, useParticipants, useLocalParticipant } from '@livekit/components-react';
import { parseParticipantMetadata } from '../lib/token-utils';

interface DebugPanelProps {
  onClose?: () => void;
}

export function DebugPanel({ onClose }: DebugPanelProps) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const localMetadata = localParticipant?.metadata ?? null;
  const localParsedMeta = React.useMemo(() => parseParticipantMetadata(localMetadata), [localMetadata]);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isMinimized, setIsMinimized] = useState(false);
  const [maxMicSlots, setMaxMicSlots] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevRole = useRef<any>(null);
  const prevMicStatus = useRef<any>(null);
  const prevDisplayStatus = useRef<any>(null);
  const prevLastAction = useRef<any>(null);
  const [eventListenerStatus, setEventListenerStatus] = useState('未设置');
  const [selectedParticipant, setSelectedParticipant] = useState<string | null>(null);
  
  // 获取选中参与者的详细信息
  const selectedParticipantInfo = React.useMemo(() => {
    if (!selectedParticipant) return null;

    const participant = participants.find(p => p.identity === selectedParticipant);
    if (!participant) return null;

    const metadata = participant.metadata ?? null;
    const parsedMeta = parseParticipantMetadata(metadata);

    let metadataRaw: string;
    if (metadata) {
      try {
        metadataRaw = JSON.stringify(JSON.parse(metadata), null, 2);
      } catch {
        metadataRaw = metadata;
      }
    } else {
      metadataRaw = 'null';
    }

    return {
      name: participant.name,
      identity: participant.identity,
      metadata,
      parsedMeta,
      metadataRaw,
    };
  }, [selectedParticipant, participants]);
  
  // 手动触发调试信息弹窗
  const showDebugAlert = () => {
    if (!selectedParticipantInfo) return;
    
    const debugInfo = `
调试信息 - ${selectedParticipantInfo.name}:
- 参与者ID: ${selectedParticipantInfo.identity}
- 原始 metadata: ${selectedParticipantInfo.metadataRaw}
- 是否禁用: ${selectedParticipantInfo.parsedMeta.isDisabledUser}
- isDisabledUser: ${selectedParticipantInfo.parsedMeta.isDisabledUser}
- 值类型: ${typeof selectedParticipantInfo.parsedMeta.isDisabledUser}
    `;
    
    alert(debugInfo);
  };

  // 监听房间元数据变化
  useEffect(() => {
    if (!room) return;
    
    // 初始加载房间元数据
    try {
      const metadata = room.metadata ? JSON.parse(room.metadata) : {};
      setMaxMicSlots(metadata.maxMicSlots || null);
    } catch (e) {
      console.error('解析房间元数据失败:', e);
    }
    
    // 监听元数据变化
    const handleRoomUpdate = () => {
      try {
        const metadata = room.metadata ? JSON.parse(room.metadata) : {};
        setMaxMicSlots(metadata.maxMicSlots || null);
      } catch (e) {
        console.error('解析房间元数据失败:', e);
      }
    };
    
    room.on('roomMetadataChanged', handleRoomUpdate);
    
    return () => {
      room.off('roomMetadataChanged', handleRoomUpdate);
    };
  }, [room]);

  // 🎯 增强：监听所有相关的状态变化
  useEffect(() => {
    if (!localParticipant) {
      return;
    }

    setEventListenerStatus('已设定');

    const updateCachedState = () => {
      const parsed = parseParticipantMetadata(localParticipant.metadata);
      prevRole.current = parsed.role;
      prevMicStatus.current = parsed.micStatus;
      prevDisplayStatus.current = parsed.displayStatus;
      prevLastAction.current = parsed.lastAction;
    };

    const handleParticipantMetadataChanged = () => {
      updateCachedState();
    };

    updateCachedState();
    localParticipant.on('participantMetadataChanged', handleParticipantMetadataChanged);

    return () => {
      localParticipant.off('participantMetadataChanged', handleParticipantMetadataChanged);
      setEventListenerStatus('已清除');
    };
  }, [localParticipant]);

  // 拖拽处理  // 拖拽处理
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.debug-content')) return;
    
    setIsDragging(true);
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 300, e.clientY - dragOffset.y))
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  return (
    <div
      ref={panelRef}
      className="debug-panel"
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: '400px',
        background: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        borderRadius: '8px',
        zIndex: 10000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        fontFamily: 'monospace',
        fontSize: '12px',
        overflow: 'hidden',
        resize: 'both',
        maxHeight: '80vh',
        cursor: isDragging ? 'grabbing' : 'grab'
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="debug-header" style={{
        padding: '8px',
        background: '#333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        cursor: 'grab'
      }}>
        <span>🛠️ 踢下麦状态追踪调试（增强版）</span>
        <div>
          <button onClick={() => setIsMinimized(!isMinimized)} style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            marginRight: '8px',
            cursor: 'pointer'
          }}>
            {isMinimized ? '📋' : '🗗'}
          </button>
          <button onClick={onClose} style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer'
          }}>✖</button>
        </div>
      </div>
      
      {!isMinimized && (
        <div className="debug-content" style={{ padding: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
          <h4 style={{ margin: '4px 0', color: '#4a9eff' }}>📋 当前状态</h4>
          <div style={{ background: '#222', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
            <p style={{ margin: '2px 0' }}>👤 用户: {localParticipant?.name}</p>
            <p style={{ margin: '2px 0' }}>🔷 角色: {localParsedMeta.role} (string)</p>
            <p style={{ margin: '2px 0' }}>🎤 麦位: {localParsedMeta.micStatus}</p>
            <p style={{ margin: '2px 0' }}>👁️ 显示: {localParsedMeta.displayStatus}</p>
            <p style={{ margin: '2px 0' }}>⚡ 用户禁用: {localParsedMeta.isDisabledUser ? '已禁用' : '未禁用'}</p>
            <p style={{ margin: '2px 0' }}>⚙️ 事件监听状态: {eventListenerStatus}</p>
          </div>
          
          <h4 style={{ margin: '4px 0', color: '#4a9eff' }}>🏠 房间信息</h4>
          <div style={{ background: '#222', padding: '8px', borderRadius: '4px', marginBottom: '8px' }}>
            <p style={{ margin: '2px 0' }}>🔢 最大麦位数: <strong style={{ color: '#ffcc00' }}>{maxMicSlots !== null ? maxMicSlots : '未设置'}</strong></p>
            <p style={{ margin: '2px 0' }}>🆔 房间名: {room?.name}</p>
          </div>

          {/* 选择参与者 */}
          <div style={{ marginBottom: '15px' }}>
            <label>选择参与者:</label>
            <select 
              value={selectedParticipant || ''} 
              onChange={(e) => setSelectedParticipant(e.target.value || null)}
              style={{
                width: '100%',
                padding: '5px',
                marginTop: '5px',
                background: '#444',
                color: '#fff',
                border: '1px solid #555'
              }}
            >
              <option value="">-- 选择参与者 --</option>
              {participants.map(p => (
                <option key={p.identity} value={p.identity}>
                  {p.name} ({p.identity})
                </option>
              ))}
            </select>
          </div>

          {/* 参与者信息 */}
          {selectedParticipantInfo && (
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ marginTop: 0 }}>参与者信息</h4>
              <div style={{ background: '#222', padding: '10px', borderRadius: '4px' }}>
                <p><strong>名称:</strong> {selectedParticipantInfo.name}</p>
                <p><strong>ID:</strong> {selectedParticipantInfo.identity}</p>
                <p><strong>禁用状态:</strong> {selectedParticipantInfo.parsedMeta.isDisabledUser ? '已禁用' : '正常'}</p>
                <p><strong>isDisabledUser:</strong> {selectedParticipantInfo.parsedMeta.isDisabledUser?.toString() || '未设置'}</p>
                <p><strong>值类型:</strong> {typeof selectedParticipantInfo.parsedMeta.isDisabledUser}</p>
                
                <div>
                  <strong>所有属性:</strong>
                  <pre style={{ 
                    background: '#111', 
                    padding: '8px', 
                    borderRadius: '4px',
                    overflow: 'auto',
                    maxHeight: '100px',
                    fontSize: '12px'
                  }}>
                    {selectedParticipantInfo.metadataRaw}
                  </pre>
                </div>
              </div>
              
              <button
                onClick={showDebugAlert}
                style={{
                  background: '#4a5568',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  marginTop: '10px',
                  cursor: 'pointer'
                }}
              >
                显示调试弹窗
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 