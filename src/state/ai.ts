import { invokeUI } from '../lib/commands';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { AISettings } from '../shared/types';

type SettingsDraft = AISettings & { apiKey: string };
const editableFields = ['baseUrl', 'apiKey', 'model'] as const;
type EditableField = (typeof editableFields)[number];

export function useAISettings(notify?: (text: string) => void) {
  const revision = useRef(0);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [operation, setOperation] = useState('');
  const [draft, updateDraft] = useState<{ settings: SettingsDraft; edited: EditableField[] }>({
    edited: [],
    settings: {
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      apiKey: '',
      hasApiKey: false,
      encryptionAvailable: true,
      provider: 'chatgpt' as const,
      chatgpt: {
        mode: 'official' as const,
        signedIn: false,
        email: null,
        model: '',
        introShown: false,
        quota: null,
        limited: null,
      },
    },
  });
  const settings = draft.settings;
  const baseline = useRef<SettingsDraft | null>(null);
  const dirty = baseline.current
    ? editableFields.some((key) => settings[key] !== baseline.current![key])
    : draft.edited.length > 0;
  const setSettings = useCallback((action: SetStateAction<SettingsDraft>) => {
    revision.current++;
    setTestResult(null);
    setMessage('');
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
  const [modelsError, setModelsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    let active = true;
    invokeUI('settings.ai.get', {})
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
    setOperation(action);
    const requestRevision = revision.current;
    try {
      // Preserve the existing API contract: model discovery and testing use saved credentials.
      // provider 和 ChatGPT 账号由各自的操作即时保存，这里只存 API Key 那一半
      const { provider: _p, chatgpt: _c, ...apiKeySettings } = settings;
      const saved = await invokeUI('settings.ai.save', { settings: apiKeySettings });
      loaded.current = true;
      baseline.current = { ...saved, apiKey: '' };
      updateDraft((current) => {
        const retained = editableFields.filter((key) => current.settings[key] !== settings[key]);
        return {
          settings: {
            ...saved,
            apiKey: '',
            ...Object.fromEntries(retained.map((key) => [key, current.settings[key]])),
          },
          edited: retained,
        };
      });
      if (action === 'models') {
        setModelsError('');
        const result = await invokeUI('ai.models', {});
        if (!result.ok) throw new Error(result.error);
        setModels(result.models);
        notify?.(`已读取 ${result.models.length} 个模型`);
      } else if (action === 'test') {
        const started = performance.now();
        const result = await invokeUI('ai.test', {});
        if (!result.ok) throw new Error(result.error);
        if (revision.current === requestRevision)
          setTestResult({
            ok: true,
            text: `连接正常 · ${((performance.now() - started) / 1000).toFixed(1)} 秒`,
          });
      } else notify?.('已保存');
    } catch (error) {
      if (action === 'models') setModels([]);
      const text = error instanceof Error ? error.message : String(error);
      if (action === 'models') setModelsError(text);
      if (action === 'test' && revision.current === requestRevision)
        setTestResult({ ok: false, text: `连接失败：${text}` });
      else setMessage(text);
    } finally {
      setBusy(false);
      setOperation('');
    }
  };
  return {
    settings,
    setSettings,
    models,
    modelsError,
    busy,
    message,
    run,
    dirty,
    testResult,
    operation,
  };
}
