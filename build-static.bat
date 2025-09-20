@echo off
echo 构建前端静态文件...

REM 检查Node.js环境
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未安装Node.js，请先安装Node.js
    pause
    exit /b 1
)

REM 复制生产环境配置
copy .env.production .env.local
echo 已复制生产环境配置文件

REM 安装依赖
if not exist node_modules (
    echo 安装项目依赖...
    npm install
)

REM 构建静态文件
echo 构建静态文件...
set NODE_ENV=production
set STATIC_EXPORT=true
npm run export

REM 检查构建结果
if exist out (
    echo.
    echo =================================
    echo 🎉 静态文件构建完成！
    echo =================================
    echo 📁 静态文件位置: ./out/
    echo 📋 部署说明:
    echo   1. 将 out 目录中的所有文件复制到 Nginx 网站根目录
    echo   2. 配置 Nginx 反向代理 API 请求到后端服务器
    echo   3. 确保 Nginx 配置支持 SPA 路由
    echo =================================
) else (
    echo ❌ 构建失败，请检查错误信息
)

pause 