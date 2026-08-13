# NovelAI Prompt Studio 宣传视频

这是独立于桌面应用的 Remotion 视频工程。当前主合成为 16:9、1920×1080、30fps、约 83 秒的中文口播 Demo。

口播使用用户提供的 MiniMax 成品音频，完整文案与时间轴见 [voiceover-script.md](./voiceover-script.md)。字幕采用 Remotion Caption JSON，并根据静音区间与人工校正后的转写编排。

## 本地预览

```console
npm ci
npm run dev
```

在 Remotion Studio 中选择 `NovelAIPromptStudio-Demo-16x9`。九个场景也分别注册为独立 Composition，便于单独调整。

## 检查与渲染

```console
npm run lint
npm run build
npm run render:demo
```

成片输出到 `out/novelai-prompt-studio-demo-16x9-minimax.mp4`。`out/` 不提交到 Git。

## 素材

视频使用 `public/assets/` 内复制的应用图标和 v0.4.2 宣传截图。若主项目截图更新，需要手动同步到本目录后重新渲染。配音位于 `public/audio/`，字幕位于 `public/captions/`。
