# chinese-learning-app

LinguaLens: AI Chinese tutor — snap a photo to learn words, then practice with live voice & roleplay. React 19 + Gemini.

## Business Context

- **Category:** education product
- **Audience:** learners, teachers, parents, and education operators who need a clearer learning or exam-prep workflow.
- **Repository status:** Public repository. Keep examples, docs, and issues free of credentials, private data, and machine-specific paths.
- **Topics:** ai, chinese-learning, gemini, language-learning, react, spaced-repetition, typescript, webapp

## What This Project Is For

- LinguaLens: AI Chinese tutor — snap a photo to learn words, then practice with live voice & roleplay. React 19 + Gemini.
- Give users a concrete learning workflow instead of a loose collection of content.
- Make practice, feedback, review, or recommendation steps easier to repeat.

## Where It Fits

This repository supports productized learning workflows: diagnostic input, guided practice, review loops, and clearer handoff between learner, teacher, and software.

## Technical Overview

- **Primary language:** TypeScript
- **Detected stack:** TypeScript, Node.js, Vite, React
- **Default branch:** `main`
- **Visibility:** `PUBLIC`
- **License:** MIT License

> **API boundary:** Snap uses a same-origin server proxy. Live and Roleplay receive single-use, short-lived Gemini tokens; the permanent key stays on the server. The included Vite API is restricted to local development. A public deployment still needs server-verified authentication and per-user quotas.

## ✨ Features

## Repository Map

- `src`
- `.env.example`
- `LICENSE`
- `README.md`
- `SECURITY.md`
- `tests`
- `index.css`
- `index.html`
- `index.tsx`
- `metadata.json`

## Quick Start

Use the commands that match the current project state:

```bash
npm ci
npm run dev
npm run build
npm run preview
```

Use Node.js `^20.19.0 || >=22.12.0`, as required by the locked Vite React plugin. Preview serves an existing build; run `npm run build` first.

> Gemini features require a backend. Set `GEMINI_API_KEY` in the server process environment before starting development; Vite does not load environment files. Never use a `VITE_` variable for credentials.

## 📖 Usage

- **Snap** — Grant camera access, point at an object, and capture. You get the word + pinyin + meaning; use **Add to SRS Review** to save a review card.
- **Live** — Grant microphone access and start a voice session to practice speaking and listening.
- **Roleplay** — Choose a scenario and converse in character with the AI.
- **Review** — Work through your SRS queue to lock in vocabulary.
- **Profile** — Check XP, level, quests, and learning progress.

## 🗺️ Status

Active, in-public project. Core modes (Snap, Live, Roleplay, SRS, Quests/Profile) are working. Learning data persists locally. The development API proxies image analysis and issues Live tokens; production authentication and richer content remain pending. Issues and ideas are welcome.

## 🤝 Connect / About

Built by **Tony (Sheng)** — a Chinese-language teacher with 6,000+ students, building AI + Chinese-teaching tools in public.

If LinguaLens is useful or interesting, please **⭐ Star this repo** and **[Follow @shengdabai](https://github.com/shengdabai)** to see what ships next.

More Chinese-learning and AI tools in the works:

- **[chinese-mission](https://github.com/shengdabai/chinese-mission)**
- **[LinguaLens](https://github.com/shengdabai/LinguaLens)**
- **[hsk-prep-platform](https://github.com/shengdabai/hsk-prep-platform)**

## License

Released under the [MIT License](./LICENSE).

---

# 中文

**[English](#chinese-learning-app) | 中文**

[![Last commit](https://img.shields.io/github/last-commit/shengdabai/chinese-learning-app)](https://github.com/shengdabai/chinese-learning-app/commits)
[![Stars](https://img.shields.io/github/stars/shengdabai/chinese-learning-app?style=social)](https://github.com/shengdabai/chinese-learning-app/stargazers)
[![关注 @shengdabai](https://img.shields.io/github/followers/shengdabai?style=social)](https://github.com/shengdabai)

> 把镜头对准你身边的世界，和 AI 老师对话，从真实生活里学中文——而不是死记卡片。

LinguaLens 把手机镜头和麦克风变成一位中文老师。对任何东西拍一张照，立刻得到它的中文词、拼音、声调，点击 Add to SRS Review 后保存一张间隔复习卡；再通过实时语音对话和角色扮演把它练熟——全部由 Google Gemini 驱动。

## 为什么

课本词汇之所以容易忘，是因为它和你的生活脱节。LinguaLens 让每个新词都对应你看得见的东西和一段你真正发生过的对话，于是它就记住了。本项目由一位拥有 6000+ 学员的中文老师公开打造。

## 它能做什么

LinguaLens 使用 React 界面和本地学习存储。图片识别通过服务端调用 Gemini；实时会话使用服务端发放的短期令牌，长期密钥不进入浏览器。

## ✨ 功能

- **📸 拍照即学** — 用镜头对准任意物体，Gemini 识别后返回中文词、拼音和释义；点击 **Add to SRS Review** 保存复习卡。
- **🎥 直播模式** — 使用 Gemini 原生音频模型与 AI 老师实时语音对话，练习发音和听力。
- **🎭 角色扮演场景** — 选择真实生活场景（点餐、打车等），在角色中进行引导式对话。
- **🔁 SRS 间隔复习** — 内置间隔重复系统，自动安排你拍到的词进行复习，并提供进度统计。
- **🎯 任务与档案** — 每日拍照/口语任务、XP 与等级让你持续回来；个人档案在本地记录进度。
- **🔐 本地登录与存储** — 轻量登录 + 设备本地持久化，无需后端即可上手。

## 🧱 技术栈

- **React 19** + **TypeScript**
- **Vite 6** 构建工具
- **Google GenAI**（`@google/genai`）—— 视觉用 `gemini-2.5-flash`，实时语音用 `gemini-2.5-flash-native-audio-preview`
- **Tailwind CSS**（CDN 引入）+ **lucide-react** 图标
- **Web Audio API** 处理实时音频，**React 状态 + 本地存储** 做持久化（AI 调用经服务端）

## 🚀 快速开始

**前置要求：** Node.js `^20.19.0 || >=22.12.0`（锁文件中的 Vite React 插件要求）和一个 [Google Gemini API Key](https://ai.google.dev/)。推荐使用基于 Chromium 的浏览器以获得相机和麦克风权限。

```bash
# 1. 克隆
git clone https://github.com/shengdabai/chinese-learning-app.git
cd chinese-learning-app

# 2. 安装依赖
npm ci

# 3. 从你的密钥管理器向服务端进程环境提供 GEMINI_API_KEY
# 不使用 VITE_ 前缀；应用不自动读取 .env 文件

# 4. 启动（开发服务器：http://localhost:3000）
npm run dev
```

构建并预览生产版本：

```bash
npm run build
```

| Command | Purpose |
|---|---|
| `npm ci` | Install the exact dependencies from the lockfile. |
| `npm run dev` | vite |
| `npm run preview` | Preview the output of `npm run build`. |
| `npm run build` | vite build |
| `npm run typecheck` | Check TypeScript without emitting files. |
| `npm test` | Run offline media lifecycle and component regression tests. |

## Local Verification

```bash
npm run typecheck
npm test
npm run build
```

Tests use fake media tracks, audio contexts, local storage and Gemini clients. They cover exit/error cleanup, late permission/connection results, repeated starts, and paused video/audio sending. They do not request devices or call paid APIs. The component harness checks event wiring and lifecycle; it does not replace React DOM or browser tests.

Before accepting a release, check desktop and mobile layouts in a real browser. In Live and Roleplay, verify permission denial, token issuance failure, connection failure, exit while connecting, and ending an active session. Confirm that camera/microphone indicators stop after exit, Live video pause stops frames, and resume restores video. Live Gemini validation requires separate authorization and a configured server key.

## Server Integration

`npm run dev` mounts `/api/gemini/snap` and `/api/gemini/live-token` on `http://localhost:3000`. Requests must come from a loopback connection with that exact Host and Origin. Start the app at that URL. The server reads `GEMINI_API_KEY` only when an authorized request needs the SDK. No keys or tokens are persisted or logged by the handler.

`npm run build` emits static frontend assets only. `npm run preview` does **not** run the API. For a public deployment, mount `createGeminiHandler` from `server/geminiApi.ts` behind the same origin and supply `getClient` and a server-verified `authorize` callback that enforces identity, origin/CSRF checks and per-user quotas. The handler denies all requests by default. The localStorage login is a local demo feature and must never authorize server requests. Do not reuse `authorizeLocalDev` for production.

Snap accepts only bounded JPEG data and a fixed server prompt/model. Live tokens allow one connection, a 60-second connection window and a 10-minute lifetime, constrained to the existing audio model. This pinned SDK uses `v1alpha`; see [Google's ephemeral-token documentation](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens). Upstream compatibility has only been verified against local SDK types and mocks, not a paid call.

Invalid saved SRS entries are excluded from the working list, and invalid profiles fall back to independent defaults. Before replacing either stored collection, the first previous raw value is retained under its `_recovery` key. Profile charts are labeled sample data; roleplay coaching tips are scripted, not pronunciation assessment. Local account data isolation remains pending.

## Operating Notes

- Keep real credentials out of the repository. Use local environment files, GitHub repository secrets, or the deployment platform secret manager.
- If a `.env.example` file exists, treat it as documentation only; never commit filled-in `.env` files.
- Before publishing screenshots, demos, or client examples, remove private names, internal paths, account IDs, and API endpoints.
- The `Repository Hygiene` workflow is a lightweight guardrail, not a replacement for product-specific tests.

## Delivery Checklist

- [ ] README describes the user, business outcome, and operating boundary.
- [ ] Setup or preview commands are current and do not rely on private machine state.
- [ ] No real secrets, private user data, or machine-local state are tracked.
- [ ] Screenshots, demos, or sample outputs are safe to share publicly when the repository is public.
- [ ] Product-specific tests or smoke checks are documented before production use.

## Roadmap

- Tighten the fastest path from clone to useful demo.
- Add project-specific screenshots, sample outputs, or a short walkthrough where useful.
- Promote repeated manual steps into scripts, tests, or documented workflows.
- Keep security, privacy, and licensing boundaries explicit as the project evolves.

## Maintainer Notes

Maintained by [Tony Sheng](https://github.com/shengdabai). This README is written as a business-facing handoff: it should help a future collaborator, client, or reviewer understand why the repository exists, how to inspect it, and what must be true before it is reused or shipped.
