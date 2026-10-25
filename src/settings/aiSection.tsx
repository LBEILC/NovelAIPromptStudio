import { useCallback, useEffect, useState } from 'react';
import { Icon, Seg } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import type { AISettings } from '../shared/types';
import { useAISettings } from '../state/ai';
import { ChatGPTAccount } from './ChatGPT';
import { Col, Dropdown, Row, SetPage, Swap, errorText } from './parts';

// ---------- AI 服务 ----------
export function AI() {
  const notify = useNotifications();
  const a = useAISettings((text) => notify({ tone: 'success', text }));
  const [replacing, setReplacing] = useState(false);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!a.busy && a.settings.hasApiKey && !a.settings.apiKey) setReplacing(false);
  }, [a.busy]);
  const safe = a.settings.encryptionAvailable;
  const keyEdit = !safe || !a.settings.hasApiKey || replacing;
  const pick = !a.modelsError && (a.models.length > 0 || (!!a.settings.model && !manual));
  const models = [...new Set([a.settings.model, ...a.models].filter(Boolean))];
  const t = a.testResult;
  // 1.5：ChatGPT 账号 / API Key。旧版本的设置里没有这两项时，填过 API Key 的算 API Key
  const provider = a.settings.provider ?? (a.settings.hasApiKey ? 'apiKey' : 'chatgpt');
  const settings: AISettings = {
    ...a.settings,
    provider,
    chatgpt: a.settings.chatgpt ?? {
      mode: 'official',
      signedIn: false,
      email: null,
      model: '',
      introShown: false,
      quota: null,
      limited: null,
    },
  };
  const accept = useCallback(
    (s: AISettings) => a.setSettings((d) => ({ ...d, provider: s.provider, chatgpt: s.chatgpt })),
    [a.setSettings],
  );
  const choose = (next: 'chatgpt' | 'apiKey') => {
    a.setSettings((d) => ({ ...d, provider: next }));
    void invokeUI('settings.ai.save', { settings: { provider: next } })
      .then(accept)
      .catch((e) => notify({ text: errorText(e), tone: 'error' }));
  };
  const chat = provider === 'chatgpt';
  const foot = (
    <>
      <span className="row foot-status" role="status">
        {t && !t.ok && (
          <span className="foot-err selectable" data-enter="fade">
            {t.text}
          </span>
        )}
        {t?.ok && (
          <span className="banner ok foot-ok" data-enter="fade">
            {t.text}
          </span>
        )}
        {a.dirty && !chat && (
          <span className="foot-note" data-enter="fade">
            有未保存的修改
          </span>
        )}
        {!t && !a.dirty && a.message && (
          <span className="foot-err selectable" data-enter="fade">
            {a.message}
          </span>
        )}
      </span>
      <span className="sp" />
      {(!chat || settings.chatgpt.signedIn) && (
        <button
          className={`btn ${a.operation === 'test' ? 'loading' : ''}`}
          disabled={a.busy}
          onClick={() => void a.run('test')}
        >
          {a.operation === 'test' && <Icon name="loader-4-line" />}
          {a.operation === 'test' ? '测试中' : '测试连接'}
        </button>
      )}
      {!chat && (
        <button
          className="btn ink"
          disabled={a.busy || !a.dirty}
          data-tip={!a.dirty ? '没有需要保存的修改' : undefined}
          onClick={() => void a.run('save')}
        >
          保存
        </button>
      )}
    </>
  );
  return (
    <SetPage
      title="AI 服务"
      desc="用来根据提示词起名、补全内置词典没有的 Tag 翻译和分类、翻译段落、整理提示词。不配置也能使用软件的其他功能。"
      foot={foot}
    >
      <Row title="使用方式" help="ChatGPT 账号用你的 Plus 或 Pro 套餐额度；API Key 按用量另外付费">
        <Seg
          label="使用方式"
          items={[
            ['chatgpt', 'ChatGPT 账号'],
            ['apiKey', 'API Key'],
          ]}
          value={provider}
          onChange={(v) => v !== provider && choose(v)}
        />
      </Row>
      <Swap k={`ai-${provider}`}>
        {chat ? (
          <ChatGPTAccount
            settings={settings}
            onSettings={accept}
            onUseApiKey={() => choose('apiKey')}
          />
        ) : (
          <div className="ai-key">
            {!safe && (
              <div className="banner warn set-banner">
                <Icon name="alert-line" />
                <span>
                  这台电脑的系统加密不可用，无法保存 API
                  Key。软件不会以明文保存密钥；系统加密恢复后再填写。
                </span>
              </div>
            )}
            <Col title="服务地址" help="任何兼容 OpenAI 接口格式的服务">
              <label className="field mono">
                <input
                  aria-label="服务地址"
                  value={a.settings.baseUrl}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => a.setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
                />
              </label>
            </Col>
            <Col
              title="API Key"
              help={
                safe
                  ? '加密后保存在这台电脑上，软件不保存明文'
                  : '系统加密不可用，填写后只在这次使用中有效，关闭软件后需要重新填写'
              }
            >
              <Swap k={`aikey-${keyEdit}`}>
                <div className="row">
                  {keyEdit ? (
                    <>
                      <label className="field sm mono set-key">
                        <input
                          autoFocus={replacing}
                          type="password"
                          aria-label="API Key"
                          placeholder={
                            a.settings.hasApiKey && safe ? '粘贴新的 API Key' : '粘贴 API Key'
                          }
                          value={a.settings.apiKey}
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => a.setSettings((s) => ({ ...s, apiKey: e.target.value }))}
                        />
                      </label>
                      {safe && a.settings.hasApiKey && (
                        <button
                          className="btn quiet sm"
                          onClick={() => {
                            a.setSettings((s) => ({ ...s, apiKey: '' }));
                            setReplacing(false);
                          }}
                        >
                          取消
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="field sm mono">已保存 ••••••••</span>
                      <button className="btn sm" onClick={() => setReplacing(true)}>
                        更换
                      </button>
                    </>
                  )}
                </div>
              </Swap>
            </Col>
            <Col
              title="模型"
              help={
                a.modelsError
                  ? `读取模型列表失败：${a.modelsError}，可以直接输入模型 ID`
                  : undefined
              }
            >
              <div className="row">
                {pick ? (
                  <Dropdown
                    label="模型"
                    className="set-dd-model"
                    menuClass="font-menu scroll"
                    value={<span className="mono">{a.settings.model || '选择模型'}</span>}
                    items={models.map((m) => ({
                      label: <span className="mono">{m}</span>,
                      checked: m === a.settings.model,
                      onSelect: () => a.setSettings((s) => ({ ...s, model: m })),
                    }))}
                  />
                ) : (
                  <label className="field sm mono set-model">
                    <input
                      aria-label="模型"
                      value={a.settings.model}
                      placeholder="输入模型 ID"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => {
                        setManual(true);
                        a.setSettings((s) => ({ ...s, model: e.target.value }));
                      }}
                    />
                  </label>
                )}
                <button
                  className={`btn quiet sm ${a.operation === 'models' ? 'loading' : ''}`}
                  disabled={a.busy}
                  onClick={() => void a.run('models')}
                >
                  {a.operation === 'models' && <Icon name="loader-4-line" />}
                  {a.operation === 'models' ? '读取中' : '重新读取模型列表'}
                </button>
              </div>
            </Col>
          </div>
        )}
      </Swap>
    </SetPage>
  );
}
