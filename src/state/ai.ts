import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { AISettings } from '../shared/types';

type SettingsDraft = AISettings & { apiKey: string };
const editableFields = [
  'baseUrl',
  'apiKey',
  'model',
  'translationPrompt',
  'classificationPrompt',
] as const;
type EditableField = (typeof editableFields)[number];

export function useAISettings() {
  const [draft, updateDraft] = useState<{ settings: SettingsDraft; edited: EditableField[] }>({
    edited: [],
    settings: {
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      apiKey: '',
      translationPrompt: '',
      classificationPrompt: '',
      defaultPrompts: { translation: '', classification: '' },
      hasApiKey: false,
      encryptionAvailable: true,
    },
  });
  const settings = draft.settings;
  const baseline = useRef<SettingsDraft | null>(null);
  const dirty = baseline.current
    ? editableFields.some((key) => settings[key] !== baseline.current![key])
    : draft.edited.length > 0;
  const setSettings = useCallback((action: SetStateAction<SettingsDraft>) => {
    updateDraft((current) => {
      const next = typeof action === 'function' ? action(current.settings) : action;
      return {
        settings: next,
        edited: [
          ...new Set([
            ...current.edited,
            ...editableFields.filter((key) => next[key] !== current.settings[key]),
          ]),
        ],
      };
    });
  }, []);
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
        if (active && !loaded.current) {
          loaded.current = true;
          baseline.current = { ...saved, apiKey: '' };
          // Keep edits made while the initial read was pending, including edits
          // retained by Activity while this effect was disconnected.
          updateDraft((current) => ({
            ...current,
            settings: {
              ...saved,
              apiKey: '',
              ...Object.fromEntries(current.edited.map((key) => [key, current.settings[key]])),
            },
          }));
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
      loaded.current = true;
      baseline.current = { ...saved, apiKey: '' };
      updateDraft({ settings: { ...saved, apiKey: '' }, edited: [] });
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
  return { settings, setSettings, models, busy, message, run, dirty };
}
