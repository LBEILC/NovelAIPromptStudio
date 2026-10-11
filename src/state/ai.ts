import { useEffect, useRef, useState } from 'react';
import type { AISettings } from '../shared/types';

export function useAISettings() {
  const [settings, setSettings] = useState<AISettings & { apiKey: string }>({
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    apiKey: '',
    translationPrompt: '',
    classificationPrompt: '',
    defaultPrompts: { translation: '', classification: '' },
    hasApiKey: false,
    encryptionAvailable: true,
  });
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    let active = true;
    window.studio
      ?.getAISettings()
      .then((saved) => {
        if (active) {
          loaded.current = true;
          setSettings({ ...saved, apiKey: '' });
        }
      })
      .catch((e: Error) => {
        if (active) setMessage(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (action: 'save' | 'models' | 'test') => {
    if (!window.studio || busy) return;
    setBusy(true);
    try {
      // Preserve the existing API contract: model discovery and testing use saved credentials.
      const saved = await window.studio.saveAISettings(settings);
      setSettings({ ...saved, apiKey: '' });
      if (action === 'models') {
        const result = await window.studio.listAIModels();
        if (!result.ok) throw new Error(result.error);
        setModels(result.models);
        setMessage(`已读取 ${result.models.length} 个模型`);
      } else if (action === 'test') {
        const result = await window.studio.testAIModel();
        if (!result.ok) throw new Error(result.error);
        setMessage(`连接成功 · ${result.model || saved.model}`);
      } else setMessage('AI 服务设置已安全保存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return { settings, setSettings, models, busy, message, run };
}
