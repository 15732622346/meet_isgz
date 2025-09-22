'use client';

import * as React from 'react';
import Image from 'next/image';

interface FloatingWrapperProps {
  children: React.ReactNode;
  title?: string;
  initialPosition?: { x: number; y: number };
  width?: number;
  height?: number;
}

// 视频显示状态枚举
enum VideoDisplayState {
  NORMAL = 'normal',
  MAXIMIZED = 'maximized', 
  HIDDEN = 'hidden'
}

export function FloatingWrapper({ 
  children,
  title = '参与者',
  initialPosition = { x: 100, y: 100 },
  width = 300,
  height = 200
}: FloatingWrapperProps) {
  const [position, setPosition] = React.useState(initialPosition);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [displayState, setDisplayState] = React.useState<VideoDisplayState>(VideoDisplayState.NORMAL);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // 获取当前状态下的尺寸和位置
  const getCurrentDimensions = React.useCallback(() => {
    switch (displayState) {
      case VideoDisplayState.MAXIMIZED:
        // 查找最外层的flex容器
        const flexContainer = document.querySelector('div[style*="flex: 1 1 0%"]') as HTMLElement;
        
        if (flexContainer) {
          const rect = flexContainer.getBoundingClientRect();
          
          // 检查是否有底部控制栏，需要为其留出空间
          const footer = document.querySelector('.modern-footer') as HTMLElement;
          let footerHeight = 0;
          if (footer) {
            footerHeight = footer.offsetHeight;
          }
          
          console.log('🔍 找到外层flex容器:', rect);
          
          return {
            width: rect.width - 10, // 留出少量边距
            height: rect.height - footerHeight - 10, // 减去底部控制栏的高度并留出少量边距
            left: rect.left + 5, // 居中放置
            top: rect.top + 5 // 居中放置
          };
        }
        
        // 如果找不到flex容器，回退到查找main-video-display
        const videoDisplay = document.querySelector('.main-video-display') as HTMLElement;
        if (videoDisplay) {
          const rect = videoDisplay.getBoundingClientRect();
          
          console.log('🔍 找到main-video-display:', rect);
          
          return {
            width: rect.width - 10,
            height: rect.height - 10,
            left: rect.left + 5,
            top: rect.top + 5
          };
        }
        
        // 如果都找不到，使用视口尺寸的80%作为后备方案
        console.log('⚠️ 未找到合适的容器，使用默认尺寸');
        
        return {
          width: window.innerWidth * 0.8,
          height: window.innerHeight * 0.8,
          left: window.innerWidth * 0.1,
          top: window.innerHeight * 0.1
        };
        
      case VideoDisplayState.HIDDEN:
        return {
          width: 100,
          height: 40,
          left: position.x,
          top: position.y
        };
      case VideoDisplayState.NORMAL:
      default:
        return {
          width,
          height,
          left: position.x,
          top: position.y
        };
    }
  }, [displayState, position, width, height]);

  // 拖拽开始 - 在正常状态和隐藏状态下允许拖拽
  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    if (displayState === VideoDisplayState.MAXIMIZED || !wrapperRef.current) return;
    
    const rect = wrapperRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  }, [displayState]);

  // 拖拽移动 - 在正常状态和隐藏状态下允许拖拽
  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isDragging || displayState === VideoDisplayState.MAXIMIZED) return;
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const currentDims = getCurrentDimensions();
    
    let newX = e.clientX - dragOffset.x;
    let newY = e.clientY - dragOffset.y;
    
    // 边界检查 - 使用当前状态的尺寸
    newX = Math.max(0, Math.min(newX, windowWidth - currentDims.width));
    newY = Math.max(0, Math.min(newY, windowHeight - currentDims.height));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragOffset, displayState, getCurrentDimensions]);

  // 拖拽结束
  const handleMouseUp = React.useCallback(() => {
    setIsDragging(false);
  }, []);

  // 全局鼠标事件监听
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 处理最小化
  const handleHide = React.useCallback(() => {
    setDisplayState(VideoDisplayState.HIDDEN);
  }, []);

  // 处理恢复
  const handleRestore = React.useCallback(() => {
    setDisplayState(VideoDisplayState.NORMAL);
  }, []);

  // 处理最大化/还原切换
  const handleToggleMaximize = React.useCallback(() => {
    setDisplayState(prev => 
      prev === VideoDisplayState.MAXIMIZED 
        ? VideoDisplayState.NORMAL 
        : VideoDisplayState.MAXIMIZED
    );
  }, []);

  const currentDimensions = getCurrentDimensions();

  // 根据当前状态计算样式
  const getStyles = React.useCallback(() => {
    const dimensions = getCurrentDimensions();
    
    const baseStyles: React.CSSProperties = {
      position: 'fixed',
      left: `${dimensions.left}px`,
      top: `${dimensions.top}px`,
      width: `${dimensions.width}px`,
      height: `${dimensions.height}px`,
      background: '#000',
      border: displayState === VideoDisplayState.MAXIMIZED ? 'none' : '2px solid #444',
      borderRadius: displayState === VideoDisplayState.MAXIMIZED ? '0' : '8px',
      zIndex: displayState === VideoDisplayState.MAXIMIZED ? 100 : 1000,
      overflow: 'hidden',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      cursor: displayState === VideoDisplayState.HIDDEN ? 'grab' : 'auto',
      userSelect: 'none',
      transition: '0.3s'
    };
    
    return baseStyles;
  }, [getCurrentDimensions, displayState]);

  // 简化后的渲染结构
  return (
    <>
      <div
        ref={wrapperRef}
        className="floating-wrapper"
        style={getStyles()}
        onMouseDown={handleMouseDown}
      >
        {displayState === VideoDisplayState.HIDDEN ? (
          <button
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(74, 158, 255, 0.9)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              zIndex: 10001,
              transition: 'background 0.2s',
              whiteSpace: 'nowrap'
            }}
            onClick={handleRestore}
          >
            恢复摄像头区
          </button>
        ) : (
          <>
            {/* 视频内容区域 */}
            {children}
            
            {/* 最小化按钮 - 右上角 */}
            <div 
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 10001
              }}
            >
              <button
                style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                onClick={handleHide}
                title="最小化"
              >
                _
              </button>
            </div>
            
            {/* 最大化/还原按钮 - 右下角 */}
            <div 
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                zIndex: 10001
              }}
            >
              <button
                style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                onClick={handleToggleMaximize}
                title={displayState === VideoDisplayState.MAXIMIZED ? '还原' : '最大化'}
              >
                {displayState === VideoDisplayState.MAXIMIZED ? 
                  <Image src="/images/small.png" width={16} height={16} alt="还原" /> : 
                  <Image src="/images/big.png" width={16} height={16} alt="最大化" />
                }
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
} 