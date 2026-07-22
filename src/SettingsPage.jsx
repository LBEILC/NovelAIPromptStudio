import { useEffect, useState } from 'react';
import LobeAlert from '@lobehub/ui/es/Alert/index';
import LobeAutoComplete from '@lobehub/ui/es/AutoComplete/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeCollapse from '@lobehub/ui/es/Collapse/index';
import LobeColorSwatches from '@lobehub/ui/es/ColorSwatches/index';
import LobeInput from '@lobehub/ui/es/Input/Input';
import LobeInputPassword from '@lobehub/ui/es/Input/InputPassword';
import LobeTextArea from '@lobehub/ui/es/Input/TextArea';
import LobeSegmented from '@lobehub/ui/es/base-ui/Segmented/Segmented';
import { findCustomThemeName, primaryColors } from '@lobehub/ui/es/styles/index';
import Icon from './components/Icon.jsx';

const PRIMARY_COLOR_OPTIONS = [
  ['red', '红色'], ['volcano', '火山橙'], ['orange', '橙色'], ['gold', '金色'],
  ['yellow', '黄色'], ['lime', '青柠'], ['green', '绿色'], ['cyan', '青色'],
  ['blue', '蓝色'], ['geekblue', '靛蓝'], ['purple', '紫色'], ['magenta', '洋红'],
].map(([key, title]) => ({ color: primaryColors[key], key, title }));

export default function SettingsPage({ appearance, onAppearanceChange, onClose, showToast, studio }) {
  const [section, setSection] = useState('appearance');
  const [aiSettings, setAISettings] = useState({
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    translationPrompt: '',
    classificationPrompt: '',
    defaultPrompts: { translation: '', classification: '' },
    hasApiKey: false,
    encryptionAvailable: true,
  });
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    studio.getAISettings().then((settings) => setAISettings((current) => ({ ...current, ...settings, apiKey: '' }))).catch(() => {});
  }, [studio]);

  const saveAI = async () => {
    setBusy('save');
    try {
      const saved = await studio.saveAISettings({
        baseUrl: aiSettings.baseUrl,
        model: aiSettings.model,
        apiKey: aiSettings.apiKey,
        translationPrompt: aiSettings.translationPrompt,
        classificationPrompt: aiSettings.classificationPrompt,
      });
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

  return <main className="settings-page">
    <aside className="settings-nav">
      <header><h1>设置</h1></header>
      <nav aria-label="设置分类">
        <LobeButton block className={section === 'appearance' ? 'active' : ''} icon={<Icon name="settings"/>} onClick={() => setSection('appearance')} type="text"><strong>外观</strong></LobeButton>
        <LobeButton block className={section === 'ai' ? 'active' : ''} icon={<Icon name="spark"/>} onClick={() => setSection('ai')} type="text"><strong>AI 服务</strong></LobeButton>
      </nav>
      <LobeButton className="settings-back" onClick={onClose}><Icon name="close" size={14}/>返回</LobeButton>
    </aside>
    <section className="settings-content">
      {section === 'appearance' ? <>
        <header className="settings-heading"><h2>外观</h2></header>
        <div className="settings-group">
          <div className="settings-row"><strong>主题</strong><LobeSegmented aria-label="界面主题" className="settings-segment" options={[{ label: '跟随系统', value: 'auto' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]} value={appearance.themeMode} onChange={(value) => onAppearanceChange({ themeMode: value })}/></div>
          <div className="settings-row settings-color-row">
            <span><strong>主题色</strong><small>用于主要操作与选中状态</small></span>
            <LobeColorSwatches
              aria-label="界面主题色"
              colors={PRIMARY_COLOR_OPTIONS}
              onChange={(color) => {
                const primaryColor = findCustomThemeName('primary', color);
                if (primaryColor) onAppearanceChange({ primaryColor });
              }}
              size={26}
              value={primaryColors[appearance.primaryColor] || primaryColors.blue}
            />
          </div>
          <div className="settings-row"><span><strong>字体</strong><small>统一应用到界面与 Prompt</small></span><LobeSegmented aria-label="界面字体" className="settings-segment" options={[{ label: '非衬线', value: 'sans' }, { label: '等宽', value: 'mono' }]} value={appearance.fontFamily} onChange={(value) => onAppearanceChange({ fontFamily: value })}/></div>
          <div className="settings-row"><strong>动效</strong><LobeSegmented aria-label="界面动效" className="settings-segment" options={[{ label: '完整', value: 'full' }, { label: '跟随系统', value: 'reduced' }, { label: '关闭', value: 'off' }]} value={appearance.motion} onChange={(value) => onAppearanceChange({ motion: value })}/></div>
        </div>
      </> : <>
        <header className="settings-heading"><h2>AI 服务</h2><p>用于 Tag 翻译和分类。</p></header>
        <div className="settings-group ai-settings-group">
          <label><span><strong>API Base URL</strong><small>兼容 OpenAI API 格式的服务地址</small></span><LobeInput value={aiSettings.baseUrl} onChange={(event) => setAISettings((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://api.openai.com/v1"/></label>
          <label><span><strong>API Key</strong><small>{aiSettings.hasApiKey ? '已加密保存；留空可保留现有 Key' : '尚未保存'}</small></span><LobeInputPassword value={aiSettings.apiKey} onChange={(event) => setAISettings((current) => ({ ...current, apiKey: event.target.value }))} placeholder={aiSettings.hasApiKey ? '已安全保存' : '输入 API Key'}/></label>
          <label><span><strong>默认模型</strong><small>翻译与分类任务共用</small></span><div className="settings-model-input"><LobeAutoComplete options={models.map((model) => ({ value: model }))} value={aiSettings.model} onChange={(value) => setAISettings((current) => ({ ...current, model: value }))} placeholder="输入或读取模型 ID"/><LobeButton onClick={loadModels} disabled={Boolean(busy)}><Icon name="refresh" size={14}/>{busy === 'models' ? '读取中' : '读取模型'}</LobeButton></div></label>
        </div>
        <LobeCollapse
          className="ai-advanced-settings"
          items={[{
            key: 'prompts',
            label: '高级设置',
            desc: '自定义翻译与分类 Prompt',
            children: <div className="ai-prompt-settings">
              <label>
                <span><strong>翻译 Prompt</strong><small>定义 Tag 的翻译语言、风格和术语处理</small></span>
                <LobeTextArea autoSize={{ minRows: 5, maxRows: 12 }} onChange={(event) => setAISettings((current) => ({ ...current, translationPrompt: event.target.value }))} value={aiSettings.translationPrompt}/>
                <LobeButton onClick={() => setAISettings((current) => ({ ...current, translationPrompt: current.defaultPrompts.translation }))} size="small" type="text">恢复默认</LobeButton>
              </label>
              <label>
                <span><strong>分类 Prompt</strong><small>定义 Artist、Character、Clothing、Scene、Style 与 Unsorted 的边界</small></span>
                <LobeTextArea autoSize={{ minRows: 6, maxRows: 14 }} onChange={(event) => setAISettings((current) => ({ ...current, classificationPrompt: event.target.value }))} value={aiSettings.classificationPrompt}/>
                <LobeButton onClick={() => setAISettings((current) => ({ ...current, classificationPrompt: current.defaultPrompts.classification }))} size="small" type="text">恢复默认</LobeButton>
              </label>
              <small className="ai-prompt-contract">程序会固定附加 JSON 格式、数量和顺序约束。</small>
            </div>,
          }]}
          variant="outlined"
        />
        <div className="settings-actions"><LobeButton onClick={testConnection} disabled={Boolean(busy)}>测试连接</LobeButton><LobeButton type="primary" onClick={saveAI} disabled={Boolean(busy)}>{busy === 'save' ? '保存中…' : '保存 AI 设置'}</LobeButton></div>
        {!aiSettings.encryptionAvailable && <LobeAlert className="settings-warning" message="当前系统安全存储不可用，应用不会以明文保存 API Key。" type="warning" variant="outlined"/>}
      </>}
    </section>
  </main>;
}
