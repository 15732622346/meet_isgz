import React from 'react';
import { PageClientImpl } from './PageClientImpl';

// 生成静态路由参数 - 为静态导出提供默认房间
export async function generateStaticParams() {
  return [
    { roomName: 'default' }
  ];
}

export default function Page() {
  return <PageClientImpl />;
}