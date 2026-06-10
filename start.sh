#!/usr/bin/env bash
# 双击或在终端运行：自动检测 Node、首次装依赖、启动 GUI。
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "[x] 没找到 Node.js。请先安装：https://nodejs.org/  装完再运行本文件。"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖（用本机 Chrome，跳过浏览器下载）..."
  if ! PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install; then
    echo "[x] 依赖安装失败，请检查网络后重试。"
    exit 1
  fi
fi

echo ""
echo "启动中... 浏览器会自动打开 http://localhost:4599"
echo "用完关掉浏览器，然后在终端按 Ctrl+C 结束。"
echo ""
npm start
