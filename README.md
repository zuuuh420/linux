# LinuxMastery 本地增强版

Linux 期末复习训练工具，包含本地题库、练习记录、错题复习、指令实验室、AI 判分和截图导题。

## 功能

- 章节练习、题型练习、模拟考试、错题回顾、智能复习
- 选择题和判断题自动判分
- 简答题和 Shell 编程题使用 AI 对照标准答案判分
- 本地浏览器保存练习记录、错题和导入题库
- 指令实验室支持常见 Linux 命令、文件树、简化编辑器和脚本执行
- 支持文本、Markdown、PNG/JPG 截图导入题目

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:5173/
```

## AI 配置

复制 `.env.example` 为 `.env.local`，填入自己的 Agnes API Key：

```env
AGNES_API_KEY=your_agnes_api_key_here
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1
AGNES_MODEL=agnes-2.0-flash
AGNES_TIMEOUT_MS=60000
```

`.env.local` 不会提交到 GitHub。AI 请求会经过本地 Express API 代理，避免把 API Key 打包进前端。

## 常用命令

```bash
npm run dev      # 同时启动前端和本地 API
npm run build    # 生产构建检查
npm run lint     # 代码检查
```

## 数据说明

- 内置题库：`src/data/questions.json`
- 练习记录：浏览器 localStorage，键名前缀 `linux-mastery:*`
- 导入题目：浏览器 localStorage，不会自动上传到服务器
