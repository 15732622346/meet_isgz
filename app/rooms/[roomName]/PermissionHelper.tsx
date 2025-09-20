'use client';

import React from 'react';

interface PermissionHelperProps {
  onPermissionGranted: () => void;
  onPermissionDenied: (error: string) => void;
}

export function PermissionHelper({ onPermissionGranted, onPermissionDenied }: PermissionHelperProps) {
  const [checking, setChecking] = React.useState(true);
  const [success, setSuccess] = React.useState(false);
  const [permissionStatus, setPermissionStatus] = React.useState<{
    camera: PermissionState | 'unknown';
    microphone: PermissionState | 'unknown';
  }>({
    camera: 'unknown',
    microphone: 'unknown',
  });

  const checkPermissions = React.useCallback(async () => {
    setChecking(true);
    try {
      if ('permissions' in navigator) {
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' as PermissionName });
          const microphonePermission = await navigator.permissions.query({ name: 'microphone' as PermissionName });

          setPermissionStatus({
            camera: cameraPermission.state,
            microphone: microphonePermission.state,
          });

          if (cameraPermission.state === 'granted' && microphonePermission.state === 'granted') {
            setSuccess(true);
            setTimeout(() => {
              onPermissionGranted();
            }, 1000);
            return;
          }
        } catch (error) {
          // permissions API 查询失败时，继续尝试直接申请权限
        }
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        stream.getTracks().forEach(track => track.stop());
        setSuccess(true);
        setTimeout(() => {
          onPermissionGranted();
        }, 1000);
      } catch (error: any) {
        console.error('获取设备权限失败:', error);

        let errorMessage = '无法访问摄像头和麦克风。';

        if (error.name === 'NotAllowedError') {
          errorMessage = '您拒绝了摄像头和麦克风的访问权限，可以选择跳过，仅音频模式加入会议。';
        } else if (error.name === 'NotFoundError') {
          errorMessage = '未找到摄像头或麦克风设备，将以仅音频模式加入会议。';
        } else if (error.name === 'NotReadableError') {
          errorMessage = '摄像头或麦克风被其他应用占用，可以选择跳过，仅音频模式加入。';
        } else if (error.name === 'OverconstrainedError') {
          errorMessage = '设备不支持当前的高级参数，将以标准模式加入会议。';
        } else if (error.name === 'SecurityError') {
          errorMessage = '安全策略限制访问，请确认站点使用 HTTPS 打开。';
        }

        onPermissionDenied(errorMessage);
      }
    } finally {
      setChecking(false);
    }
  }, [onPermissionGranted, onPermissionDenied]);

  const skipPermissions = React.useCallback(() => {
    onPermissionGranted();
  }, [onPermissionGranted]);

  React.useEffect(() => {
    checkPermissions();
  }, [checkPermissions]);

  return (
    <>
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100%',
          background: '#1a1a1a',
          color: 'white',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            width: '400px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: 0 }}>
            {success ? '权限获取成功' : checking ? '正在检查设备权限...' : '设备权限检测'}
          </h2>

          <p style={{ color: '#ccc', lineHeight: '1.5' }}>
            {success ? (
              '已经成功获取摄像头和麦克风权限，正在进入会议...'
            ) : checking ? (
              '正在申请摄像头和麦克风权限，请在浏览器弹窗中点击“允许”。'
            ) : (
              <>
                为了获得最佳会议体验，请允许访问摄像头和麦克风。
                {typeof location !== 'undefined' && location.protocol !== 'https:' && (
                  <>
                    <br />
                    <span style={{ color: '#ff6b6b' }}>
                      注意：当前使用的是 HTTP 连接，部分浏览器可能禁止访问本地媒体设备。
                    </span>
                  </>
                )}
              </>
            )}
          </p>

          {permissionStatus.camera !== 'unknown' && (
            <div
              style={{
                background: '#2a2a2a',
                padding: '15px',
                borderRadius: '8px',
                textAlign: 'left',
              }}
            >
              <div>
                摄像头权限：
                <span
                  style={{
                    color: permissionStatus.camera === 'granted' ? '#4ade80' : '#ef4444',
                  }}
                >
                  {permissionStatus.camera === 'granted' ? '已允许' : permissionStatus.camera === 'denied' ? '已拒绝' : '待确认'}
                </span>
              </div>
              <div>
                麦克风权限：
                <span
                  style={{
                    color: permissionStatus.microphone === 'granted' ? '#4ade80' : '#ef4444',
                  }}
                >
                  {permissionStatus.microphone === 'granted'
                    ? '已允许'
                    : permissionStatus.microphone === 'denied'
                    ? '已拒绝'
                    : '待确认'}
                </span>
              </div>
            </div>
          )}

          {success ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  backgroundColor: '#4ade80',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                }}
              >
                ✓
              </div>
              <span style={{ color: '#4ade80' }}>权限已就绪，正在进入会议...</span>
            </div>
          ) : checking ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #4ade80',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                }}
              />
              <span>正在获取权限...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                className="lk-button"
                onClick={checkPermissions}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#4ade80',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                重新检查权限
              </button>

              <button
                className="lk-button"
                onClick={skipPermissions}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                跳过（仅音频）
              </button>
            </div>
          )}

          <div style={{ fontSize: '14px', color: '#888' }}>
            <p>如果权限被拒绝，可以尝试：</p>
            <ol style={{ textAlign: 'left', paddingLeft: '20px' }}>
              <li>点击地址栏左侧的锁形图标</li>
              <li>将摄像头和麦克风权限设置为“允许”</li>
              <li>刷新页面后重新加入会议</li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
