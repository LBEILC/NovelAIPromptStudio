import { useEffect, useRef, useState } from 'react';
import { Icon, Seg, Switch } from '../kit/controls';
import { useAsk } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import { MODEL_CAPS, MODEL_ORDER, type ModelId } from '../shared/params';
import { useGeneration } from '../state/generation';
import { Col, Dropdown, Expand, Row, SetPage, Swap, errorText } from './parts';
import { Fail } from './sectionShared';
import { copySecret } from './copySecret';
import { Usage } from './usageSection';

// ---------- NovelAI 账号 ----------
export const TIERS = ['未订阅', 'Tablet', 'Scroll', 'Opus'];

export function Account({ onSaved }: { onSaved?: () => void }) {
  const g = useGeneration();
  const notify = useNotifications();
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const has = g.settings.hasToken;
  const edit = editing || !has;
  const save = async () => {
    if (!token.trim() || busy) return;
    const first = !has;
    setBusy(true);
    setError('');
    try {
      await invokeUI('account.save', { token: token.trim() });
      setToken('');
      setEditing(false);
      notify({ text: '已保存持久令牌', tone: 'success' });
      if (first) onSaved?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => {
    setRefreshing(true);
    void invokeUI('account.refresh', {})
      .catch((e) => setError(errorText(e)))
      .finally(() => setRefreshing(false));
  };
  const sub = g.subscription;
  const relay = g.settings.connection === 'relay';
  const [mode, setMode] = useState<'official' | 'relay'>(relay ? 'relay' : 'official');
  useEffect(() => setMode(relay ? 'relay' : 'official'), [relay]);
  const pick = (v: 'official' | 'relay') => {
    if (v === mode) return;
    setMode(v);
    setError('');
    void invokeUI('account.connection.save', { connection: v }).catch((e) => {
      setMode(relay ? 'relay' : 'official');
      setError(errorText(e));
    });
  };
  const official = (
    <>
      <Col
        feature="token"
        title="持久令牌"
        help="在 NovelAI 网站的账号设置里创建持久令牌（Persistent API Token）。加密后保存在这台电脑上，软件不保存明文。"
      >
        <Swap k={`tok-${edit}`}>
          <div className="row">
            {edit ? (
              <>
                <label className="field sm mono set-key">
                  <input
                    ref={input}
                    autoFocus={editing}
                    type="password"
                    aria-label="持久令牌"
                    placeholder="粘贴新的持久令牌"
                    autoComplete="off"
                    spellCheck={false}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') void save();
                      if (e.key === 'Escape' && has) {
                        e.stopPropagation();
                        setEditing(false);
                        setToken('');
                      }
                    }}
                  />
                </label>
                <button
                  className={`btn ink sm ${busy ? 'loading' : ''}`}
                  disabled={busy || !token.trim()}
                  data-tip={!token.trim() ? '先粘贴持久令牌' : undefined}
                  onClick={() => void save()}
                >
                  {busy && <Icon name="loader-4-line" />}
                  保存
                </button>
                {has && (
                  <button
                    className="btn quiet sm"
                    onClick={() => {
                      setEditing(false);
                      setToken('');
                    }}
                  >
                    取消
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="field sm mono">已保存 ••••••••</span>
                <button className="btn sm" onClick={() => void copySecret('novelai-token', notify)}>
                  复制
                </button>
                <button className="btn sm" onClick={() => setEditing(true)}>
                  更换
                </button>
              </>
            )}
          </div>
        </Swap>
      </Col>
      <Fail>{error || g.accountError}</Fail>
      {has && (
        <Row
          title="余额"
          help={
            sub?.active
              ? `${TIERS[sub.tier] || '已订阅'} · 每次生成前显示本次消耗`
              : '未订阅 · 每次生成都要花 Anlas'
          }
        >
          <span className="row">
            <span className="mono">{g.balance.toLocaleString('en-US')} Anlas</span>
            <button
              className={`btn quiet sm ${refreshing ? 'loading' : ''}`}
              disabled={refreshing}
              onClick={refresh}
            >
              {refreshing && <Icon name="loader-4-line" />}
              {refreshing ? '刷新中' : '刷新'}
            </button>
          </span>
        </Row>
      )}
      {has && !!sub?.active && (
        <Col
          title="V5 免费用量"
          help={`已用 ${sub.usage?.percent || 0}%，大约每 20 分钟恢复 1%。用完后 V5 的生成要花 Anlas；V4.5 及更早的模型不受这个限制。`}
        >
          <div
            className="progress ink"
            role="progressbar"
            aria-label="V5 免费用量"
            aria-valuenow={sub.usage?.percent || 0}
          >
            <i style={{ width: `${sub.usage?.percent || 0}%` }} />
          </div>
        </Col>
      )}
    </>
  );
  return (
    <SetPage
      title="NovelAI 账号"
      desc="用你自己的 NovelAI 账号，或者通过中转站在这里生成图片。本软件是非官方工具，与 NovelAI 没有隶属关系；这样使用是否符合 NovelAI 的服务条款，由你自己判断并承担。"
    >
      <Row
        feature="relay"
        title="连接方式"
        help={
          mode === 'relay'
            ? '中转站是第三方服务，能看到你的提示词和生成的图，按它自己的价格计费。'
            : '直接连 NovelAI，用你自己账号的 Anlas 和订阅。'
        }
      >
        <Seg
          label="连接方式"
          items={[
            ['official', 'NovelAI 官方'],
            ['relay', '中转站'],
          ]}
          value={mode}
          onChange={pick}
        />
      </Row>
      <Swap k={mode}>{mode === 'relay' ? <Relay onSaved={onSaved} /> : official}</Swap>
      {has && mode === (relay ? 'relay' : 'official') && (
        <>
          <GenerationPreferences />
          <Usage />
        </>
      )}
    </SetPage>
  );
}

// 中转站列出的模型里也有局部重绘用的 -inpainting，不在 MODEL_CAPS 里的照原名写
const modelNames = (ids: readonly string[]) =>
  ids.map((id) => MODEL_CAPS[id as ModelId]?.name || id).join('、') || '没有本软件支持的模型';

/** 中转站：地址和 Key，"测试连接"读它挂了哪些模型（doc/design.md 2.33） */
function Relay({ onSaved }: { onSaved?: () => void }) {
  const g = useGeneration();
  const notify = useNotifications();
  const saved = g.settings.relay;
  const [url, setUrl] = useState(saved?.baseUrl || '');
  const [key, setKey] = useState('');
  const [editingKey, setEditingKey] = useState(false);
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('');
  const [error, setError] = useState('');
  const [tested, setTested] = useState<{ models: string[]; other: string[] } | null>(null);
  useEffect(() => setUrl(saved?.baseUrl || ''), [saved?.baseUrl]);
  const hasKey = !!saved?.hasKey;
  const keyEdit = editingKey || !hasKey;
  const dirty = url.trim() !== (saved?.baseUrl || '') || !!key.trim();
  const ready = !!url.trim() && (hasKey || !!key.trim());
  const input = () => ({
    baseUrl: url.trim(),
    ...(key.trim() ? { key: key.trim() } : {}),
  });
  const test = async () => {
    if (busy || !ready) return;
    setBusy('test');
    setError('');
    setTested(null);
    try {
      const r = await invokeUI('account.relay.test', input());
      if (!r.ok) throw new Error(r.error);
      setTested({ models: r.models, other: r.other });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };
  const save = async () => {
    if (busy || !ready || !dirty) return;
    const first = !g.settings.hasToken;
    setBusy('save');
    setError('');
    try {
      await invokeUI('account.relay.save', input());
      setKey('');
      setEditingKey(false);
      setTested(null);
      notify({ text: '已保存中转站', tone: 'success' });
      if (first) onSaved?.();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  };
  const models = saved?.models ?? null;
  const result = tested
    ? `连接成功 · 可以用：${modelNames(tested.models)}`
    : hasKey && saved?.baseUrl && !dirty
      ? models
        ? `可以用：${modelNames(models)}`
        : '没读到这个中转站有哪些模型，所有模型都可以选；它没有的会在生成时报错'
      : '';
  const tip = !url.trim() ? '先填地址' : !ready ? '先填 Key' : undefined;
  return (
    <>
      <Col
        title="地址"
        help="中转站给的接口地址，例如 https://api.example.com，末尾的 /v1 可以不写。"
      >
        <label className="field sm mono set-key">
          <input
            aria-label="中转站地址"
            placeholder="https://"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTested(null);
            }}
            onKeyDown={(e) => !e.nativeEvent.isComposing && e.key === 'Enter' && void save()}
          />
        </label>
      </Col>
      <Col title="Key" help="中转站给的 Key。加密后保存在这台电脑上，软件不保存明文。">
        <Swap k={`key-${keyEdit}`}>
          <div className="row">
            {keyEdit ? (
              <>
                <label className="field sm mono set-key">
                  <input
                    autoFocus={editingKey}
                    type="password"
                    aria-label="中转站 Key"
                    placeholder="粘贴 Key"
                    autoComplete="off"
                    spellCheck={false}
                    value={key}
                    onChange={(e) => {
                      setKey(e.target.value);
                      setTested(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') void save();
                      if (e.key === 'Escape' && hasKey) {
                        e.stopPropagation();
                        setEditingKey(false);
                        setKey('');
                      }
                    }}
                  />
                </label>
                {hasKey && (
                  <button
                    className="btn quiet sm"
                    onClick={() => {
                      setEditingKey(false);
                      setKey('');
                    }}
                  >
                    取消
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="field sm mono">已保存 ••••••••</span>
                <button className="btn sm" onClick={() => void copySecret('relay-key', notify)}>
                  复制
                </button>
                <button className="btn sm" onClick={() => setEditingKey(true)}>
                  更换
                </button>
              </>
            )}
          </div>
        </Swap>
      </Col>
      <Col
        title="连接"
        after={
          <div className="row">
            <button
              className={`btn sm ${busy === 'test' ? 'loading' : ''}`}
              disabled={!!busy || !ready}
              data-tip={tip}
              onClick={() => void test()}
            >
              {busy === 'test' && <Icon name="loader-4-line" />}
              测试连接
            </button>
            <button
              className={`btn ink sm ${busy === 'save' ? 'loading' : ''}`}
              disabled={!!busy || !ready || !dirty}
              data-tip={tip || (!dirty ? '没有改动' : undefined)}
              onClick={() => void save()}
            >
              {busy === 'save' && <Icon name="loader-4-line" />}
              保存
            </button>
          </div>
        }
      >
        <Swap k={error ? '' : result}>
          <small className="relay-result">{error ? '' : result || '还没有连接'}</small>
        </Swap>
      </Col>
      <Fail>{error || g.accountError}</Fail>
      {hasKey && (
        <Row
          title="余额"
          help="中转站按它自己的价格计费，余额请到中转站的网站上查看。生成前不显示 Anlas 消耗。"
        />
      )}
    </>
  );
}

/** 连续生成（账号页）和 Agent 生成（Agent 页）：开启前都要再确认一次 */
export function GenerationPreferences({ agent = false }: { agent?: boolean }) {
  const s = useGeneration().settings;
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  // 中转站按张计费，上限按张数（doc/design.md 2.33）
  const relay = s.connection === 'relay';
  const cap = relay ? s.dailyImageLimit : s.dailyLimit;
  const [limit, setLimit] = useState(String(cap));
  useEffect(() => setLimit(String(cap)), [cap]);
  const offered = relay ? s.relay?.models : null;
  const save = (input: Parameters<typeof invokeUI<'settings.generation.save'>>[1]) =>
    void invokeUI('settings.generation.save', input).catch((e) =>
      notify({ text: errorText(e), tone: 'error' }),
    );
  const quote = '“All generation requests must be initiated by a human action.”';
  if (!agent)
    return (
      <>
        <h2>新建空白作品</h2>
        <Row
          title="模型"
          help="跟随上次生成时，用最近一次生成的参数和尺寸；选了模型时，用这个模型的默认参数。"
        >
          <Dropdown
            label="新建空白作品的模型"
            className="set-dd"
            value={
              !s.blankModel || s.blankModel === 'last'
                ? '跟随上次生成'
                : MODEL_CAPS[s.blankModel].name
            }
            items={[
              {
                label: '跟随上次生成',
                checked: !s.blankModel || s.blankModel === 'last',
                onSelect: () => save({ blankModel: 'last' }),
              },
              'sep',
              ...MODEL_ORDER.map((id) => ({
                label: MODEL_CAPS[id].name,
                checked: s.blankModel === id,
                disabled: offered && !offered.includes(id) ? '中转站没有这个模型' : false,
                onSelect: () => save({ blankModel: id }),
              })),
            ]}
          />
        </Row>
        <h2>连续生成</h2>
        <Row
          title="无人值守连续生成"
          help={[
            '开启后张数可选“持续生成”，直到手动停止。请求仍逐张发送。',
            'NovelAI 的接口说明写着“所有生成请求必须由人的操作发起”。开启前会再次提醒，风险自负。',
          ]}
        >
          <Switch
            label="无人值守连续生成"
            on={s.continuous}
            onChange={async (v) => {
              if (!v) return save({ continuous: false });
              if (
                await ask({
                  title: '开启无人值守连续生成？',
                  body: 'NovelAI 的接口说明里写着：',
                  quote: `${quote}（所有生成请求必须由人的操作发起）`,
                  tail: '连续生成可能不符合 NovelAI 的服务条款，账号受到的影响由你自行承担。请求仍逐张发送。',
                  ok: '仍然开启',
                })
              )
                save({ continuous: true });
            }}
          />
        </Row>
        {dialog}
      </>
    );
  const commitLimit = () => {
    const n = Number(limit);
    if (Number.isSafeInteger(n) && n >= 0) save(relay ? { dailyImageLimit: n } : { dailyLimit: n });
    else setLimit(String(cap));
  };
  return (
    <>
      <h2>Agent 生成</h2>
      <Row title="生成方式" help="默认由 Agent 加入队列，在标题栏确认后逐张发送。">
        <Seg
          label="生成方式"
          items={[
            ['confirm', '排好队等我确认'],
            ['direct', '直接生成'],
          ]}
          value={s.agentMode}
          onChange={async (v) => {
            if (v === s.agentMode) return;
            if (v === 'confirm') return save({ agentMode: 'confirm' });
            if (
              await ask({
                title: '允许 Agent 直接生成？',
                body: `开启后，Agent 发起的生成无需确认，将直接发送并${relay ? '按张计费' : '消耗 Anlas'}。NovelAI 的接口说明里写着：`,
                quote,
                tail: '建议同时开启下面的“花费上限”。',
                ok: '直接生成',
              })
            )
              save({ agentMode: 'direct' });
          }}
        />
      </Row>
      <Row
        title="花费上限"
        help={
          relay
            ? '默认关闭。开启后可设置每天最多生成几张，达到上限时暂停 Agent 的生成。'
            : '默认关闭。开启后可设置每日 Anlas 上限，达到上限时暂停 Agent 的生成。'
        }
        style={{ borderBottom: 0 }}
      >
        <Switch label="花费上限" on={s.limitEnabled} onChange={(v) => save({ limitEnabled: v })} />
      </Row>
      <div className="set-limit">
        <Expand open={s.limitEnabled}>
          <div className="row set-limit-row">
            <span className="label">每日上限</span>
            <label className="field sm mono set-limit-in">
              <input
                aria-label="每日上限"
                inputMode="numeric"
                value={limit}
                tabIndex={s.limitEnabled ? 0 : -1}
                onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))}
                onBlur={commitLimit}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            </label>
            <span className="label">
              {relay
                ? `张 · 今日已生成 ${s.spentImagesToday || 0} 张`
                : `Anlas · 今日已用 ${s.spentToday || 0}`}
            </span>
          </div>
        </Expand>
      </div>
      {dialog}
    </>
  );
}
