// 设置·AI 服务的"ChatGPT 账号"（doc/design.md 2.27）。和 API Key 那一半不同，这里的操作都即时生效：
// 登录、退出、选模型、开关 Codex 方式都直接保存，不走页底的"保存"。
// 未登录：一句说明和"登录 ChatGPT"；等待网页上完成时按钮转圈，旁边"取消"。
// 已登录：账号（Codex 方式带"非官方"）、模型、用量（官方方式是"正在使用 ChatGPT 套餐 · 管理用量"，Codex 方式是剩余额度）、退出登录。
// 第一次登录成功弹一次说明；用完时横幅写"已达到用量上限"，主按钮是"管理用量"。
import { useEffect, useState } from 'react';
import { errorCode, invokeUI } from '../lib/commands';
import { Icon, Switch } from '../kit/controls';
import { useAsk } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { Col, Dropdown, Row, Swap, errorText } from './parts';
import type { AISettings, AISettingsInput, ChatGPTQuota } from '../shared/types';

/** "2 小时 14 分后重置"（一天以内）或"10 月 24 日 09:00 重置" */
export function resetText(iso: string | null, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.round((t - now) / 60000));
  if (min < 60) return `${Math.max(1, min)} 分钟后重置`;
  if (min < 24 * 60)
    return min % 60
      ? `${Math.floor(min / 60)} 小时 ${min % 60} 分后重置`
      : `${min / 60} 小时后重置`;
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0'),
    mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${hh}:${mm} 重置`;
}

function Quota({
  quota,
  busy,
  onRefresh,
}: {
  quota: ChatGPTQuota | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const failed = !quota || (!!quota.error && !quota.windows.length);
  return (
    <Row
      title="剩余额度"
      help={failed ? '额度获取失败，不影响使用' : undefined}
      className="cg-quota-row"
    >
      <div className="cg-quota">
        {!failed &&
          quota!.windows.map((w) => (
            <div className="cg-win" key={w.label}>
              <span className="cg-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, w.remainingPercent))}%` }} />
              </span>
              <span className="help">
                {w.label}：剩余 {Math.round(w.remainingPercent)}%
                {w.resetsAt ? ` · ${resetText(w.resetsAt)}` : ''}
              </span>
            </div>
          ))}
      </div>
      <button
        className={`btn quiet sm ${busy ? 'loading' : ''}`}
        disabled={busy}
        onClick={onRefresh}
      >
        {busy && <Icon name="loader-4-line" />}
        {failed ? '重试' : '刷新'}
      </button>
    </Row>
  );
}

export function ChatGPTAccount({
  settings,
  onSettings,
  onUseApiKey,
}: {
  settings: AISettings;
  /** 命令返回了新的设置 */
  onSettings: (s: AISettings) => void;
  onUseApiKey: () => void;
}) {
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const a = settings.chatgpt;
  const codex = a.mode === 'codex';
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [models, setModels] = useState<{ slug: string; name: string }[]>([]);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const save = (input: AISettingsInput) =>
    invokeUI('settings.ai.save', { settings: input })
      .then(onSettings)
      .catch((e) => notify({ text: errorText(e), tone: 'error' }));
  // 登录、退出、额度变了：命令层发 ai-settings 事件，重新取一次
  useEffect(
    () =>
      window.studio?.onCommandEvent((e) => {
        if ((e as { type: string }).type === 'ai-settings')
          void invokeUI('settings.ai.get', {})
            .then(onSettings)
            .catch(() => {});
      }),
    [onSettings],
  );
  useEffect(() => {
    if (!a.signedIn) return setModels([]);
    let live = true;
    void invokeUI('ai.chatgpt.models', {})
      .then((r) => live && setModels(r.models))
      .catch(() => live && setModels([]));
    return () => {
      live = false;
    };
  }, [a.signedIn, a.mode]);
  // 第一次登录成功：说明一次，以后不再弹
  useEffect(() => {
    if (!a.signedIn || a.introShown) return;
    void ask({
      title: '已登录 ChatGPT',
      body: '起名、翻译和整理提示词会发给 ChatGPT，用你登录的账号和套餐额度，不另外收费。可以在 ChatGPT 的“设置 → 用量”里查看和限制这个软件的用量。',
      ok: '知道了',
      single: true,
    }).then(() => void save({ introShown: true }));
  }, [a.signedIn, a.introShown]);
  const signIn = async () => {
    setError(null);
    setSigning(true);
    try {
      onSettings(await invokeUI('ai.chatgpt.sign-in', {}));
    } catch (e) {
      const code = errorCode(e);
      if (code !== 'canceled')
        setError({
          code,
          text:
            code === 'not_eligible'
              ? 'ChatGPT 免费账号不能使用套餐额度。升级到 Plus 或 Pro 后再登录，或者改用 API Key。'
              : code === 'denied'
                ? '没有授权，未登录。'
                : `登录失败：${errorText(e)}`,
        });
    } finally {
      setSigning(false);
    }
  };
  const signOut = async () => {
    try {
      const r = await invokeUI('ai.chatgpt.sign-out', {});
      onSettings(r);
      notify({
        text: r.remoteRevoked
          ? '已退出 ChatGPT。要彻底断开，请在 ChatGPT 的设置里移除 NovelAI Prompt Studio。'
          : '已退出 ChatGPT，这台电脑上的登录信息已清除；ChatGPT 那边暂时没有确认，可以在 ChatGPT 的设置里移除 NovelAI Prompt Studio。',
      });
    } catch (e) {
      notify({ text: `退出失败：${errorText(e)}`, tone: 'error' });
    }
  };
  const manage = () =>
    void invokeUI('ai.chatgpt.manage-usage', {}).catch((e) =>
      notify({ text: errorText(e), tone: 'error' }),
    );
  const refreshQuota = async () => {
    setQuotaBusy(true);
    try {
      const quota = await invokeUI('ai.chatgpt.quota', {});
      onSettings({ ...settings, chatgpt: { ...a, quota } });
    } catch (e) {
      notify({ text: `额度获取失败：${errorText(e)}`, tone: 'error' });
    } finally {
      setQuotaBusy(false);
    }
  };
  const toggleCodex = async (on: boolean) => {
    if (on) {
      const ok = await ask({
        title: '改用 Codex 的方式登录？',
        body: (
          <span className="dlg-points">
            <span>可能不符合 OpenAI 的使用条款，账号受到的影响由你自行承担。</span>
            <span>用量会算在 Codex 名下，你在 ChatGPT 设置里给这个软件设的上限管不到它。</span>
            <span>Codex 更新后可能随时失效，到时请改回默认方式。</span>
          </span>
        ),
        ok: '仍然改用',
      });
      if (!ok) return;
    }
    setError(null);
    await save({ codexMode: on });
  };
  const model = models.find((m) => m.slug === a.model);
  return (
    <>
      {!settings.encryptionAvailable && (
        <div className="banner warn set-banner">
          <Icon name="alert-line" />
          <span>这台电脑的系统加密不可用，无法保存登录信息。系统加密恢复后再登录。</span>
        </div>
      )}
      {a.signedIn && a.limited && (
        <div className="banner warn set-banner" data-enter="fade">
          <Icon name="alert-line" />
          <span>
            已达到用量上限
            {codex && a.limited.resetsAt ? `，${resetText(a.limited.resetsAt)}` : ''}。
          </span>
          <button className="btn sm ink" onClick={manage}>
            管理用量
          </button>
        </div>
      )}
      {error && (
        <div
          className={`banner ${error.code === 'not_eligible' ? 'warn' : 'danger'} set-banner`}
          data-enter="fade"
        >
          <Icon name="alert-line" />
          <span className="selectable">{error.text}</span>
          {error.code === 'not_eligible' && (
            <button className="btn sm" onClick={onUseApiKey}>
              改用 API Key
            </button>
          )}
        </div>
      )}
      <Swap k={`cg-${a.signedIn}-${a.mode}`}>
        {a.signedIn ? (
          <div className="cg-in">
            <Row
              title={
                <span className="row cg-acct">
                  <span className="selectable">{a.email || 'ChatGPT 账号'}</span>
                  {codex && <span className="src">非官方</span>}
                </span>
              }
              help="已登录 ChatGPT"
            >
              <button className="btn quiet sm" onClick={() => void signOut()}>
                退出登录
              </button>
            </Row>
            <Row title="模型" help={models.length ? undefined : '正在读取这个账号能用的模型…'}>
              <Dropdown
                label="ChatGPT 模型"
                className="set-dd-model"
                menuClass="font-menu scroll"
                disabled={!models.length}
                value={<span>{model?.name || a.model || '选择模型'}</span>}
                items={models.map((m) => ({
                  label: m.name,
                  checked: m.slug === a.model,
                  onSelect: () => void save({ chatgptModel: m.slug }),
                }))}
              />
            </Row>
            {codex ? (
              <Quota quota={a.quota} busy={quotaBusy} onRefresh={() => void refreshQuota()} />
            ) : (
              <Row title="用量" help="正在使用 ChatGPT 套餐">
                <button className="btn quiet sm" onClick={manage}>
                  管理用量
                </button>
              </Row>
            )}
          </div>
        ) : (
          <Col
            title="ChatGPT 账号"
            help="登录后，起名、翻译和整理提示词用你的 ChatGPT 套餐额度（Plus 或 Pro），不用另外配置 API Key、另外付费。"
          >
            <div className="row">
              <button
                className={`btn cg-signin ${signing ? 'loading' : ''}`}
                disabled={signing || !settings.encryptionAvailable}
                onClick={() => void signIn()}
              >
                <Icon name={signing ? 'loader-4-line' : 'openai-fill'} />
                {signing ? '等待在浏览器里完成登录…' : '登录 ChatGPT'}
              </button>
              {signing && (
                <button
                  className="btn quiet sm"
                  onClick={() => void invokeUI('ai.chatgpt.cancel-sign-in', {}).catch(() => {})}
                >
                  取消
                </button>
              )}
            </div>
          </Col>
        )}
      </Swap>
      <Row
        title="用 Codex 的方式登录（非官方）"
        help="可以看到剩余额度。软件会以 Codex CLI 的方式登录，不是 OpenAI 给其他软件开放的方式。"
        style={{ borderBottom: 0 }}
      >
        <Switch label="用 Codex 的方式登录" on={codex} onChange={(v) => void toggleCodex(v)} />
      </Row>
      {dialog}
    </>
  );
}
