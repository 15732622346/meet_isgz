# 基于 Participant Attributes 的视频框控制系统

## 📋 概述

这个系统通过 LiveKit 的 `participant.attributes` 功能来实现视频框的动态样式控制和状态管理。它利用 LiveKit 的原生机制，无需额外的状态管理，实现了：

- 🎯 实时状态同步
- 🎨 动态样式控制
- 🔄 事件驱动更新
- 📱 响应式布局

## 🏗️ 架构设计

### 核心组件

1. **AttributeBasedVideoTile** - 主要的视频瓦片组件
2. **token-utils.ts** - 属性解析工具函数
3. **AttributeBasedVideoTile.css** - 样式定义
4. **VideoTileExample.tsx** - 使用示例

### 数据流

```
服务器 UpdateParticipant API
    ↓
participant.attributes 更新
    ↓
attributesChanged 事件触发
    ↓
组件重新渲染
    ↓
样式动态更新
```

## 🎯 Participant Attributes 结构

### 标准属性

```typescript
interface ParticipantAttributes {
  // 基础信息
  role: string;              // "1"=学生, "2"=主持人, "3"=管理员
  
  // 麦位管理
  mic_status: string;        // "off_mic" | "requesting" | "on_mic" | "muted"
  display_status: string;    // "hidden" | "visible"
  
  // 时间戳
  join_time?: string;        // 加入时间
  request_time?: string;     // 申请时间
  approve_time?: string;     // 批准时间
  
  // 操作记录
  last_action?: string;      // 最后操作
  operator_id?: string;      // 操作者ID
}
```

### 使用示例

```typescript
// 获取参与者属性
const attributes = participant.attributes || {};

// 解析属性
const status = parseParticipantAttributes(attributes);

// 检查状态
const isHost = isHostOrAdmin(attributes);
const onMic = isOnMic(attributes);
const requesting = isRequestingMic(attributes);
```

## 🎨 样式控制系统

### CSS 类名规则

```css
/* 基础类 */
.attribute-based-video-tile

/* 角色类 */
.video-tile-host      /* 主持人 */
.video-tile-member    /* 普通成员 */

/* 状态类 */
.video-tile-on-mic        /* 已上麦 */
.video-tile-requesting    /* 申请中 */
.video-tile-muted        /* 被静音 */

/* 尺寸类 */
.video-tile-small     /* 160x120 */
.video-tile-medium    /* 240x180 */
.video-tile-large     /* 320x240 */
```

### 动态样式计算

```typescript
// 根据属性计算样式
const computedStyle = React.useMemo(() => {
  const baseStyle = { /* 基础样式 */ };
  
  // 根据角色调整边框
  if (isHostOrAdmin(attributes)) {
    baseStyle.border = '2px solid #ff6b35';
    baseStyle.boxShadow = '0 0 10px rgba(255, 107, 53, 0.3)';
  } else if (isOnMic(attributes)) {
    baseStyle.border = '2px solid #4CAF50';
    baseStyle.boxShadow = '0 0 10px rgba(76, 175, 80, 0.3)';
  }
  
  return baseStyle;
}, [attributes]);
```

## 🔄 事件监听机制

### attributesChanged 事件

```typescript
React.useEffect(() => {
  const handleAttributesChanged = () => {
    console.log('属性已更新:', participant.attributes);
    setForceUpdate(prev => prev + 1); // 强制重渲染
  };
  
  participant.on('attributesChanged', handleAttributesChanged);
  
  return () => {
    participant.off('attributesChanged', handleAttributesChanged);
  };
}, [participant]);
```

### 服务器端更新

```php
// PHP 后端示例
$updateData = [
    'room_name' => $roomName,
    'participant_identity' => $participantId,
    'attributes' => [
        'mic_status' => 'on_mic',
        'approve_time' => date('Y-m-d H:i:s'),
        'operator_id' => $operatorId
    ]
];

// 调用 LiveKit UpdateParticipant API
$response = $livekitClient->updateParticipant($updateData);
```

## 🎯 使用方法

### 1. 基础使用

```tsx
import { AttributeBasedVideoTile } from './components/AttributeBasedVideoTile';

function MyComponent() {
  const participants = useParticipants();
  
  return (
    <div>
      {participants.map(participant => (
        <AttributeBasedVideoTile
          key={participant.identity}
          participant={participant}
          size="medium"
          onClick={(p) => console.log('点击:', p.name)}
        />
      ))}
    </div>
  );
}
```

### 2. 预设样式组件

```tsx
import { HostVideoTile, MemberVideoTile, CompactVideoTile } from './components/AttributeBasedVideoTile';

// 主持人专用大视频
<HostVideoTile participant={hostParticipant} />

// 普通成员中等视频
<MemberVideoTile participant={memberParticipant} />

// 紧凑小视频
<CompactVideoTile participant={participant} />
```

### 3. 批量创建

```tsx
import { createVideoTilesFromParticipants } from './components/AttributeBasedVideoTile';

const videoTiles = createVideoTilesFromParticipants(participants, {
  size: 'medium',
  onClick: handleParticipantClick,
  showRoleLabel: true
});
```

### 4. 麦位管理布局

```tsx
import { MicManagementLayout } from './components/VideoTileExample';

function MicManagementPage() {
  return (
    <div>
      <MicManagementLayout />
    </div>
  );
}
```

## 🎨 自定义样式

### 1. 通过 CSS 类名

```css
/* 自定义主持人样式 */
.video-tile-host {
  border: 3px solid gold;
  box-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
}

/* 自定义申请中动画 */
.video-tile-requesting {
  animation: customPulse 1.5s infinite;
}

@keyframes customPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
```

### 2. 通过内联样式

```tsx
<AttributeBasedVideoTile
  participant={participant}
  style={{
    border: '2px solid purple',
    borderRadius: '12px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
  }}
/>
```

### 3. 通过自定义类名

```tsx
<AttributeBasedVideoTile
  participant={participant}
  className="my-custom-tile special-border"
/>
```

## 📱 响应式设计

### 移动端适配

```tsx
import { MobileOptimizedLayout } from './components/VideoTileExample';

function MobileApp() {
  return (
    <div className="mobile-app">
      <MobileOptimizedLayout />
    </div>
  );
}
```

### 断点设置

```css
/* 平板 */
@media (max-width: 768px) {
  .video-tile-large { width: 280px; height: 210px; }
  .video-tile-medium { width: 200px; height: 150px; }
}

/* 手机 */
@media (max-width: 480px) {
  .video-tile-large { width: 240px; height: 180px; }
  .video-tile-medium { width: 160px; height: 120px; }
}
```

## 🔧 API 参考

### AttributeBasedVideoTile Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `participant` | `Participant` | 必需 | LiveKit 参与者对象 |
| `size` | `'small' \| 'medium' \| 'large' \| 'auto'` | `'auto'` | 视频框尺寸 |
| `showName` | `boolean` | `true` | 是否显示参与者名称 |
| `showRoleLabel` | `boolean` | `true` | 是否显示角色标签 |
| `showMicStatus` | `boolean` | `true` | 是否显示麦位状态 |
| `onClick` | `(participant: Participant) => void` | - | 点击事件处理 |
| `onDoubleClick` | `(participant: Participant) => void` | - | 双击事件处理 |
| `className` | `string` | `''` | 自定义CSS类名 |
| `style` | `React.CSSProperties` | `{}` | 自定义内联样式 |

### 工具函数

```typescript
// 属性解析
parseParticipantAttributes(attributes: Record<string, string>): ParticipantMicStatus

// 状态检查
isHostOrAdmin(attributes: Record<string, string>): boolean
isOnMic(attributes: Record<string, string>): boolean
isRequestingMic(attributes: Record<string, string>): boolean
isMuted(attributes: Record<string, string>): boolean

// 显示文本
getRoleText(attributes: Record<string, string>): string
getMicStatusText(attributes: Record<string, string>): string
```

## 🐛 常见问题

### Q: 属性更新后视频框样式没有变化？

A: 确保已正确监听 `attributesChanged` 事件，并触发组件重新渲染：

```typescript
const [forceUpdate, setForceUpdate] = React.useState(0);

React.useEffect(() => {
  const handleAttributesChanged = () => {
    setForceUpdate(prev => prev + 1);
  };
  
  participant.on('attributesChanged', handleAttributesChanged);
  return () => participant.off('attributesChanged', handleAttributesChanged);
}, [participant]);
```

### Q: 如何自定义特定状态的样式？

A: 通过 CSS 类名选择器：

```css
.video-tile-host.video-tile-on-mic {
  border: 3px solid #00ff00;
  box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);
}
```

### Q: 移动端显示异常？

A: 检查是否引入了响应式样式，并确保容器有正确的布局：

```css
.video-tiles-container {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
```

## 🚀 最佳实践

1. **性能优化**：使用 `React.memo` 包装组件，避免不必要的重渲染
2. **错误处理**：始终检查 `participant.attributes` 是否存在
3. **样式一致性**：使用 CSS 变量定义颜色和尺寸
4. **可访问性**：添加适当的 ARIA 标签和键盘导航支持
5. **测试**：编写单元测试验证属性变化时的行为

## 📚 相关资源

- [LiveKit 官方文档](https://docs.livekit.io/)
- [React Components 文档](https://docs.livekit.io/reference/components/react/)
- [Participant Attributes API](https://docs.livekit.io/reference/server-api/#update-participant)

---

通过这个系统，您可以完全基于 LiveKit 的原生 `participant.attributes` 机制来控制视频框的显示和样式，实现强大而灵活的视频会议界面。 