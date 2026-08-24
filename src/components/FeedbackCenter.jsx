import { Button as LobeButton } from '@lobehub/ui/base-ui';
import Icon from './Icon.jsx';

const PROJECT_URL = 'https://github.com/LBEILC/NovelAIPromptStudio/';
const REPORT_URL = `${PROJECT_URL}issues/new?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20`;
const SUGGEST_URL = `${PROJECT_URL}issues/new?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`;

function platformLabel(platform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform || '未知平台';
}

export function feedbackDiagnostics(currentVersion = '—', platform = '') {
  return [`NovelAI Prompt Studio v${currentVersion}`, `平台：${platformLabel(platform)}`].join('\n');
}

export default function FeedbackCenter({ currentVersion = '—', platform = '', showToast, studio }) {
  const openProjectLink = async (url) => {
    try {
      const result = await studio.openReleasePage(url);
      if (!result?.ok) showToast?.(result?.error || '无法打开浏览器');
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : String(error));
    }
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(feedbackDiagnostics(currentVersion, platform));
      showToast?.('诊断信息已复制');
    } catch {
      showToast?.('无法复制诊断信息');
    }
  };

  return <>
    <header className="settings-heading">
      <h2>反馈与支持</h2>
      <p>报告问题、提出建议，或复制不含个人内容的诊断信息。</p>
    </header>
    <section aria-labelledby="settings-feedback-title" className="help-feedback" style={{ marginTop: 0 }}>
      <div>
        <span>GitHub</span>
        <h3 id="settings-feedback-title">帮助我们改进 NovelAI Prompt Studio</h3>
        <p>反馈不会自动包含图片、Prompt、文件路径、API 地址、API Key 或日志；诊断信息仅包含应用版本和系统平台。</p>
      </div>
      <div className="help-feedback-actions">
        <LobeButton icon={<Icon name="copy" size={14}/>} onClick={copyDiagnostics}>复制诊断信息</LobeButton>
        <LobeButton icon={<Icon name="externalLink" size={14}/>} onClick={() => openProjectLink(REPORT_URL)}>报告问题</LobeButton>
        <LobeButton icon={<Icon name="externalLink" size={14}/>} onClick={() => openProjectLink(SUGGEST_URL)}>提出建议</LobeButton>
      </div>
    </section>
  </>;
}
