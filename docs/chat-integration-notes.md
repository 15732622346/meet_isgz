# 聊天功能改造说明

## 当前实现（2025-10-03）
1. UI 已由 `CustomChatPanel` 完全接管，聊天状态通过 React state/props 管理，不再渲染 `<Chat />` 或拼 DOM。
2. 消息发送统一走 `callGatewayApi('/api/v1/chat/send')`，本地先行渲染，随后通过 `RoomEvent.DataReceived` 接收服务端广播。
3. 数据通道监听集中在 `handleDataReceived`，支持 `chat-message` / `chat-mute` / `chat-control` / `mic-mute` 等事件，并自动去重、同步全员禁言。
4. DOM hack（`querySelector`、`checkBlockedWords` 等）已移除，敏感词/禁言提示由 `CustomChatPanel` 的 `bannerMessage`、`validationMessage` 承担。
5. 游客与被禁用户的入口统一由 `chatInputDisabled` + `bannerMessage` 控制，现有 `MESSAGE_COOLDOWN` 继续限制普通用户的发言频率。

## 与 demo 的差异
- demo 里的历史消息拉取尚未接入；当前实现仅展示会话生命周期内的实时消息。
- 服务器广播的 chat payload 需保持 `type`、`message`、`user_uid`、`timestamp` 字段，以配合前端去重逻辑。
- UI 仍沿用现有面板配色，如需完全对齐 demo 需补充头像、系统提示等样式细节。

## 后续关注点
1. 若需要聊天历史或离线漫游，补齐 `/chat/history`（或等价接口）并在房间初始化阶段填充 `chatMessages`。
2. 去重目前依赖 `user_uid + content + timestamp`，如后端提供稳定消息 ID，可同步写入以减少误判。
3. `CustomChatPanel` 暂未处理富文本/表情，业务扩展时需在发送/渲染前做统一转义或 markdown 渲染。
4. 建议在冒烟测试覆盖：游客提示、主持人禁言/解除、普通用户冷却、跨终端同步等场景。

## 验收建议
1. 主持人登录房间发送消息：其他成员实时收到，主持人本地不出现重复气泡。
2. 主持人开启/关闭全员禁言：普通成员看到禁言横幅并被阻止发言，解除后恢复正常。
3. 游客进入房间：点击输入框触发注册提示，`Send` 按钮不可用。
4. 普通成员连续快速发送消息：第二条提示剩余冷却秒数后再允许发送。
