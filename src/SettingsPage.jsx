import { useEffect, useState } from 'react';
import LobeAlert from '@lobehub/ui/es/Alert/index';
import LobeAutoComplete from '@lobehub/ui/es/AutoComplete/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeInput from '@lobehub/ui/es/Input/Input';
import LobeInputPassword from '@lobehub/ui/es/Input/InputPassword';
import LobeSegmented from '@lobehub/ui/es/base-ui/Segmented/Segmented';
import Icon from './components/Icon.jsx';

export default function SettingsPage({ appearance, onAppearanceChange, onClose, showToast, studio }) {
  const [section, setSection] = useState('appearance');
  const [aiSettings, setAISettings] = useState({ baseUrl: 'https://api.openai.com/v1', model: '', apiKey: '', hasApiKey: false, encryptionAvailable: true });
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    studio.getAISettings().then((settings) => setAISettings((current) => ({ ...current, ...settings, apiKey: '' }))).catch(() => {});
  }, [studio]);

  const saveAI = async () => {
    setBusy('save');
    try {
      const saved = await studio.saveAISettings({ baseUrl: aiSettings.baseUrl, model: aiSettings.model, apiKey: aiSettings.apiKey });
      setAISettings((current) => ({ ...current, ...saved, apiKey: '' }));
      showToast('AI 服务设置已安全保存');
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setBusy('');
    }
  };

  const loadModels = async () => {
    if (!(await saveAI())) return;
    setBusy('models');
    const result = await studio.listAIModels();
    setBusy('');
    if (!result?.ok) { showToast(result?.error || '无法读取模型列表'); return; }
    setModels(result.models || []);
    showToast(`已读取 ${result.models?.length || 0} 个模型`);
  };

  const testConnection = async () => {
    if (!(await saveAI())) return;
    setBusy('test');
    const result = await studio.testAIModel();
    setBusy('');
    showToast(result?.ok ? `连接成功 · ${result.model || aiSettings.model}` : result?.error || '连接测试失败');
  };

  const platform = navigator.platform.startsWith('Mac') ? 'macOS' : navigator.platform.startsWith('Win') ? 'Windows' : 'Desktop';
  return <main className="settings-page">
    <aside className="settings-nav">
      <header><span>SETTINGS / 01</span><h1>软件设置</h1><p>设置保存在当前设备，不会写入图片 metadata。</p></header>
      <nav aria-label="设置分类">
        <LobeButton block className={section === 'appearance' ? 'active' : ''} icon={<Icon name="settings"/>} onClick={() => setSection('appearance')} type="text"><span><strong>外观与可读性</strong><small>主题、字号、密度、动效</small></span></LobeButton>
        <LobeButton block className={section === 'ai' ? 'active' : ''} icon={<Icon name="spark"/>} onClick={() => setSection('ai')} type="text"><span><strong>AI 服务</strong><small>翻译、分类与安全存储</small></span></LobeButton>
      </nav>
      <LobeButton className="settings-back" onClick={onClose}><Icon name="close" size={14}/>返回</LobeButton>
    </aside>
    <section className="settings-content">
      {section === 'appearance' ? <>
        <header className="settings-heading"><span>APPEARANCE</span><h2>保持工作台清楚、安静</h2><p>沿用现有 Lobe UI 规范，只调整阅读密度，不增加新的视觉系统。</p></header>
        <div className="settings-group">
          <div className="settings-row"><div><strong>界面主题</strong><small>跟随系统可响应 Windows 或 macOS 的外观设置。</small></div><LobeSegmented aria-label="界面主题" className="settings-segment" options={[{ label: '跟随系统', value: 'auto' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]} value={appearance.themeMode} onChange={(value) => onAppearanceChange({ themeMode: value })}/></div>
          <div className="settings-row"><div><strong>界面字号</strong><small>默认使用“较大”，改善中文与长时间阅读。</small></div><LobeSegmented aria-label="界面字号" className="settings-segment" options={[{ label: '标准', value: 'default' }, { label: '较大', value: 'large' }, { label: '特大', value: 'larger' }]} value={appearance.fontScale} onChange={(value) => onAppearanceChange({ fontScale: value })}/></div>
          <div className="settings-row"><div><strong>界面密度</strong><small>只改变留白和控件高度，不隐藏功能。</small></div><LobeSegmented aria-label="界面密度" className="settings-segment" options={[{ label: '紧凑', value: 'compact' }, { label: '舒适', value: 'comfortable' }]} value={appearance.density} onChange={(value) => onAppearanceChange({ density: value })}/></div>
          <div className="settings-row"><div><strong>界面动效</strong><small>关闭后只保留必要的状态变化。</small></div><LobeSegmented aria-label="界面动效" className="settings-segment" options={[{ label: '完整', value: 'full' }, { label: '跟随系统', value: 'reduced' }, { label: '关闭', value: 'off' }]} value={appearance.motion} onChange={(value) => onAppearanceChange({ motion: value })}/></div>
        </div>
        <aside className="settings-platform-note"><Icon name="info"/><div><strong>{platform} 当前生效</strong><span>字体与窗口行为继续遵循现有跨平台设置。</span></div></aside>
      </> : <>
        <header className="settings-heading"><span>AI SERVICE</span><h2>翻译与分类使用同一安全连接</h2><p>API Key 由操作系统安全存储加密，不进入 SQLite、日志或图片文件。</p></header>
        <div className="settings-group ai-settings-group">
          <label><span><strong>API Base URL</strong><small>兼容 OpenAI API 格式的服务地址</small></span><LobeInput value={aiSettings.baseUrl} onChange={(event) => setAISettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1"/></label>
          <label><span><strong>API Key</strong><small>{aiSettings.hasApiKey ? '已加密保存；留空可保留现有 Key' : '尚未保存'}</small></span><LobeInputPassword value={aiSettings.apiKey} onChange={(event) => setAISettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? '已安全保存' : '输入 API Key'}/></label>
          <label><span><strong>默认模型</strong><small>翻译与分类任务共用</small></span><div className="settings-model-input"><LobeAutoComplete options={models.map((model) => ({ value: model }))} value={aiSettings.model} onChange={(value) => setAISettings((current) => ({ ...current, model: value }))} placeholder="输入或读取模型 ID"/><LobeButton onClick={loadModels} disabled={Boolean(busy)}><Icon name="refresh" size={14}/>{busy === 'models' ? '读取中' : '读取模型'}</LobeButton></div></label>
        </div>
        <div className="settings-actions"><LobeButton onClick={testConnection} disabled={Boolean(busy)}>测试连接</LobeButton><LobeButton type="primary" onClick={saveAI} disabled={Boolean(busy)}>{busy === 'save' ? '保存中…' : '保存 AI 设置'}</LobeButton></div>
        {!aiSettings.encryptionAvailable && <LobeAlert className="settings-warning" message="当前系统安全存储不可用，应用不会以明文保存 API Key。" type="warning" variant="outlined"/>}
      </>}
    </section>
  </main>;
}
