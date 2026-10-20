import path from 'node:path';
import { clipboard } from 'electron';

/** Failure states use the real renderer and command boundary, with isolated service failures. */
export async function settingsExceptionChecks({ h, commandHandlers, preferences, mode }) {
  const names = [
    'settings.ai.get',
    'ai.models',
    'agent.setup',
    'agent.install',
    'updates.status',
    'updates.check',
    'updates.open-release',
  ];
  const originals = Object.fromEntries(names.map((name) => [name, commandHandlers[name]]));
  const invoke = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>r.data)`,
    );
  const installed = await invoke('agent.setup');
  const status = await invoke('updates.status');
  let opened = '';
  try {
    h.category('设置·异常状态');
    commandHandlers['settings.ai.get'] = () => ({
      ...preferences.publicSettings(),
      encryptionAvailable: false,
    });
    commandHandlers['ai.models'] = () => ({ ok: false, error: '合成服务不提供模型' });
    await h.reload();
    await h.section('AI 服务');
    await h.wait('document.body.innerText.includes("这台电脑的系统加密不可用")');
    await h.check(
      '安全存储不可用时说明仅本次使用',
      'document.body.innerText.includes("关闭软件后需要重新填写")',
    );
    await h.click('重新读取模型列表');
    await h.wait('!!document.querySelector(\'input[aria-label="模型"]\')');
    await h.input('input[aria-label="模型"]', 'manual-model');
    await h.click('保存', 'document.querySelector(".set-foot")');
    await h.until(() => preferences.publicSettings().model === 'manual-model', '手填模型保存');
    await h.check(
      '模型失败仍可保存手填 ID',
      () => preferences.publicSettings().model === 'manual-model',
    );
    await h.screenshot('032-ai-manual-model');
    commandHandlers['agent.setup'] = () => ({
      ...installed,
      ok: true,
      installed: true,
      onPath: false,
    });
    commandHandlers['agent.install'] = () => ({ ok: false, error: '合成安装失败' });
    await h.reload();
    await h.section('Agent');
    await h.wait('document.body.innerText.includes("命令所在的文件夹不在 PATH 里")');
    await h.click('复制位置');
    await h.until(() => clipboard.readText() === path.dirname(installed.path), '命令目录复制完成');
    await h.check(
      'PATH 异常复制的是命令目录',
      () =>
        clipboard.readText() === path.dirname(installed.path) &&
        installed.path.startsWith(mode.root),
    );
    await h.click('重新安装');
    await h.wait('document.body.innerText.includes("安装失败：合成安装失败")');
    await h.check(
      '重新安装失败保留重试入口',
      `![...document.querySelectorAll('button')].find(b=>b.textContent==='重新安装').disabled`,
    );
    await h.screenshot('032-agent-failed');
    commandHandlers['updates.status'] = () => ({
      ...status,
      ok: true,
      phase: 'current',
      hasUpdate: false,
      error: '',
    });
    commandHandlers['updates.check'] = () => ({ ok: false, error: '合成检查失败' });
    await h.reload();
    await h.section('关于与更新');
    await h.click('检查更新');
    await h.wait('document.body.innerText.includes("检查更新失败")');
    await h.check(
      '检查失败提供重试入口',
      `[...document.querySelectorAll('button')].some(b=>b.textContent==='重试'&&!b.disabled)`,
    );
    await h.screenshot('032-update-failed');
    commandHandlers['updates.status'] = () => ({
      ...status,
      ok: true,
      platform: 'darwin',
      packaged: true,
      phase: 'available',
      hasUpdate: true,
      latestVersion: '99.0.0',
      updateMode: 'manual',
      canDownloadUpdate: false,
      releaseUrl: 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v99.0.0',
      error: '',
    });
    commandHandlers['updates.open-release'] = ({ url }) => {
      opened = url;
      return { ok: true };
    };
    await h.reload();
    await h.section('关于与更新');
    await h.click('前往下载页');
    await h.until(() => !!opened, '下载页命令完成');
    await h.check(
      'macOS 手动更新打开已知发布页',
      () => opened === 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v99.0.0',
    );
    await h.screenshot('032-update-macos');
  } finally {
    for (const name of names) {
      if (originals[name]) commandHandlers[name] = originals[name];
      else delete commandHandlers[name];
    }
  }
}
