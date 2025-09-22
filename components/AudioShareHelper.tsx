import React from 'react';

interface AudioShareHelperProps {
  isVisible: boolean;
  onClose: () => void;
}

export function AudioShareHelper({ isVisible, onClose }: AudioShareHelperProps) {
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '15px',
        padding: '30px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          background: 'linear-gradient(45deg, #667eea, #764ba2)',
          color: 'white',
          padding: '20px',
          borderRadius: '10px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '24px' }}>🔊 屏幕分享音频指南</h2>
          <p style={{ margin: '10px 0 0 0', opacity: 0.9 }}>让学生们听到视频声音的完整指南</p>
        </div>

        <div style={{ lineHeight: '1.6', color: '#333' }}>
          <h3 style={{ color: '#2196f3', marginTop: 0 }}>📋 操作步骤</h3>
          <ol style={{ paddingLeft: '20px' }}>
            <li style={{ marginBottom: '10px' }}>
              <strong>点击"📺 共享屏幕+🔊"按钮</strong>
            </li>
            <li style={{ marginBottom: '10px' }}>
              <strong>在弹出窗口中选择分享内容：</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>整个屏幕</li>
                <li>应用程序窗口</li>
                <li>Chrome标签页（推荐播放视频时使用）</li>
              </ul>
            </li>
            <li style={{ marginBottom: '10px' }}>
              <strong style={{ color: '#e74c3c' }}>🔊 重要：勾选音频选项</strong>
              <ul style={{ marginTop: '5px', paddingLeft: '20px' }}>
                <li>"分享系统音频"</li>
                <li>"分享音频"</li>
                <li>"Share audio"</li>
              </ul>
            </li>
            <li style={{ marginBottom: '10px' }}>
              <strong>点击"分享"按钮</strong>
            </li>
          </ol>

          <div style={{
            background: '#e8f5e8',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            padding: '15px',
            margin: '20px 0'
          }}>
            <h4 style={{ color: '#2e7d32', margin: '0 0 10px 0' }}>✅ 成功后的效果</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>学生们可以看到您的屏幕画面</li>
              <li>学生们可以听到视频、音乐、系统声音</li>
              <li>适合播放纪录片、教学视频等内容</li>
            </ul>
          </div>

          <div style={{
            background: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '8px',
            padding: '15px',
            margin: '20px 0'
          }}>
            <h4 style={{ color: '#856404', margin: '0 0 10px 0' }}>⚠️ 常见问题</h4>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li><strong>学生听不到声音</strong>：重新分享并勾选音频选项</li>
              <li><strong>找不到音频选项</strong>：确保使用Chrome浏览器74+版本</li>
              <li><strong>音频选项灰色</strong>：选择的内容源可能不支持音频</li>
            </ul>
          </div>

          <h3 style={{ color: '#2196f3' }}>🌐 浏览器支持</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
            <div style={{ padding: '10px', background: '#e8f5e8', borderRadius: '5px' }}>
              <strong style={{ color: '#2e7d32' }}>✅ 完全支持</strong><br/>
              Chrome 74+<br/>
              Edge 79+
            </div>
            <div style={{ padding: '10px', background: '#fff3cd', borderRadius: '5px' }}>
              <strong style={{ color: '#856404' }}>⚠️ 部分支持</strong><br/>
              Firefox<br/>
              (需手动选择)
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '30px' }}>
          <button
            onClick={onClose}
            style={{
              background: '#2196f3',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 30px',
              fontSize: '16px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
} 