import { useState } from 'react';
import { Button, Input, Progress, Switch, OptionGroup, Dialog } from '../ui';
import { Collapse } from '../ui/transitions';
import { SettingsFrame } from './PageFrame';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';

export function GenerationPreferences({ agent = false }: { agent?: boolean }) {
  const state = useGeneration(),
    s = state.settings;
  const [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  const save = (input: Parameters<typeof invokeUI<'settings.generation.save'>>[1]) =>
    void invokeUI('settings.generation.save', input).catch((e) => setError(e.message));
  return (
    <>
      <h2>{agent ? 'Agent 生成' : '连续生成'}</h2>
      <div className="settings-line">
        <div>
          {agent ? '生成方式' : '无人值守连续生成'}
          <small>
            {agent
              ? '默认由 Agent 加入队列，在标题栏确认后逐张发送。'
              : '开启后张数可选“持续生成”，直到手动停止。请求仍逐张发送。'}
          </small>
          {!agent && (
            <small>
              NovelAI 的接口说明写着“所有生成请求必须由人的操作发起”。开启前会再次提醒，风险自负。
            </small>
          )}
        </div>
        {agent ? (
          <OptionGroup
            label="生成方式"
            value={s.agentMode}
            options={[
              { value: 'confirm', label: '排好队等我确认' },
              { value: 'direct', label: '直接生成' },
            ]}
            onChange={(value) =>
              value === 'direct' ? setConfirm(true) : save({ agentMode: 'confirm' })
            }
          />
        ) : (
          <Switch
            label="无人值守连续生成"
            checked={s.continuous}
            onChange={(value) => (value ? setConfirm(true) : save({ continuous: false }))}
          />
        )}
      </div>
      {agent && (
        <>
          <div className="settings-line">
            <div>
              花费上限
              <small>默认关闭。开启后可设置每日 Anlas 上限，达到上限时暂停 Agent 的生成。</small>
            </div>
            <Switch
              label="花费上限"
              checked={s.limitEnabled}
              onChange={(value) => save({ limitEnabled: value })}
            />
          </div>
          <Collapse open={s.limitEnabled}>
            <div className="settings-actions">
              每日上限{' '}
              <Input
                aria-label="每日上限"
                type="number"
                min={0}
                value={s.dailyLimit}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isSafeInteger(n) && n >= 0) save({ dailyLimit: n });
                }}
              />{' '}
              Anlas · 今日已用 {s.spentToday || 0}
            </div>
          </Collapse>
        </>
      )}
      {error && <p role="status">{error}</p>}
      <Dialog
        open={confirm}
        cancelLabel="取消"
        title={agent ? '允许 Agent 直接生成？' : '开启无人值守连续生成？'}
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          save(agent ? { agentMode: 'direct' } : { continuous: true });
          setConfirm(false);
        }}
        confirmLabel={agent ? '直接生成' : '仍然开启'}
      >
        <p>
          {agent
            ? '开启后，Agent 发起的生成无需确认，将直接发送并消耗 Anlas。NovelAI 的接口说明里写着：'
            : 'NovelAI 的接口说明里写着：'}
        </p>
        <blockquote>
          “All generation requests must be initiated by a human action.”
          {!agent && '（所有生成请求必须由人的操作发起）'}
        </blockquote>
        <p>
          {agent
            ? '建议同时开启下面的“花费上限”。'
            : '连续生成可能不符合 NovelAI 的服务条款，账号受到的影响由你自行承担。请求仍逐张发送。'}
        </p>
      </Dialog>
    </>
  );
}
export function NovelAIAccount() {
  const state = useGeneration(),
    [editing, setEditing] = useState(false),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save() {
    setBusy(true);
    setError('');
    try {
      await invokeUI('account.save', { token });
      setToken('');
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsFrame
      title="NovelAI 账号"
      description="用你自己的 NovelAI 账号在这里生成图片。本软件是非官方工具，与 NovelAI 没有隶属关系；这样使用是否符合 NovelAI 的服务条款，由你自己判断并承担。"
    >
      <div className="settings-field">
        <label>持久令牌</label>
        <div className="settings-actions">
          {editing || !state.settings.hasToken ? (
            <>
              <Input
                aria-label="持久令牌"
                type="password"
                placeholder="粘贴新的持久令牌"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <Button variant="ink" loading={busy} onClick={() => void save()}>
                保存
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  setEditing(false);
                  setToken('');
                }}
              >
                取消
              </Button>
            </>
          ) : (
            <>
              <span>已保存 ••••••••</span>
              <Button onClick={() => setEditing(true)}>更换</Button>
            </>
          )}
        </div>
        <p className="nps-help">
          在 NovelAI 网站的账号设置里创建持久令牌（Persistent API
          Token）。加密后保存在这台电脑上，软件不保存明文。
        </p>
      </div>
      {state.settings.hasToken && (
        <div className="settings-line">
          <div>
            余额
            <small>
              {
                ['未订阅', 'Tablet', 'Scroll', 'Opus'][
                  state.subscription?.active ? state.subscription.tier : 0
                ]
              }{' '}
              · 每次生成前显示本次消耗
            </small>
          </div>
          <div className="settings-actions">
            <span>{state.balance.toLocaleString('en-US')} Anlas</span>
            <Button
              variant="quiet"
              loading={busy}
              onClick={() => {
                setBusy(true);
                void invokeUI('account.refresh', {})
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              刷新
            </Button>
          </div>
        </div>
      )}
      {!!state.subscription?.active && (
        <div className="settings-field">
          <label>V5 免费用量</label>
          <Progress label="V5 免费用量" value={state.subscription.usage?.percent || 0} />
          <p className="nps-help">
            已用 {state.subscription.usage?.percent || 0}%，大约每{' '}
            {Math.ceil((state.subscription.usage?.timeUntilNextPercent || 0) / 60)} 分钟恢复
            1%。用完后 V5 的生成要花 Anlas；V4.5 及更早的模型不受这个限制。
          </p>
        </div>
      )}
      {(error || state.accountError) && <p role="status">{error || state.accountError}</p>}
      <GenerationPreferences />
    </SettingsFrame>
  );
}
