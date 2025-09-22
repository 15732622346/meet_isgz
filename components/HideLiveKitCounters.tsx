import { useEffect } from 'react';

/**
 * HideLiveKitCounters组件
 * 用于隐藏页面上未被HTML标签包裹的纯数字文本节点
 */
export function HideLiveKitCounters() {
  useEffect(() => {
    // 处理函数：隐藏未包裹的纯数字文本
    const hideUnwrappedNumbers = () => {
      // 使用MutationObserver监听DOM变化
      const observer = new MutationObserver(() => {
        // 处理未包裹的纯数字文本节点
        handleUnwrappedNumbers();
      });

      // 开始观察DOM变化
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // 初始执行一次
      handleUnwrappedNumbers();

      // 每500ms强制检查一次（确保动态添加的元素也被处理）
      const intervalId = setInterval(() => {
        handleUnwrappedNumbers();
      }, 500);

      // 清理函数
      return () => {
        observer.disconnect();
        clearInterval(intervalId);
      };
    };

    // 处理未包裹的纯数字文本节点
    const handleUnwrappedNumbers = () => {
      // 使用TreeWalker遍历DOM查找文本节点
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Text | null;
      while ((node = walker.nextNode() as Text)) {
        // 检查是否为纯数字文本
        const text = node.textContent?.trim();
        if (text && /^\d+$/.test(text)) {
          // 检查父节点 - 如果是直接挂在.lk-video-conference或其子元素上的纯数字文本节点
          let parent = node.parentElement;
          
          // 检查是否为视频会议容器内的直接文本节点（没有被HTML标签包裹）
          if (!parent) {
            // 如果没有父元素，则是直接文本节点，清除内容
            node.textContent = '';
            continue;
          }
          
          // 检查是否为.lk-video-conference容器内的直接文本节点
          let isInVideoConference = false;
          let current: Element | null = parent;
          let conferenceContainer: Element | null = null;
          
          // 向上查找是否在视频会议容器内
          while (current) {
            if (
              current.classList && 
              (current.classList.contains('lk-video-conference') || 
              current.classList.contains('lk-video-conference-inner'))
            ) {
              isInVideoConference = true;
              conferenceContainer = current;
              break;
            }
            current = current.parentElement;
          }
          
          // 如果在视频会议容器内，并且直接挂在容器上（即没有被其他HTML元素包裹）
          if (isInVideoConference && conferenceContainer && parent === conferenceContainer) {
            node.textContent = '';
          }
        }
      }
    };

    // 启动监听
    hideUnwrappedNumbers();
  }, []);

  return null;
}

export default HideLiveKitCounters; 