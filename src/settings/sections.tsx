// 设置的各页（doc/design.md 2.11、2.22、2.23）：外观、图片库、NovelAI 账号、AI 服务、Agent。
// 翻译词典在 Dictionary.tsx，关于与更新在 About.tsx。
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { BUNDLED_FONTS, partitionFontFamilies, quoteFontFamily } from '../lib/fonts.js';
import { Icon, Seg, Switch } from '../kit/controls';
import { Confirm, type ConfirmOptions } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { useAppearance } from '../state/appearance';
import { useAISettings } from '../state/ai';
import { useStorage } from '../state/storage';
import { useGeneration } from '../state/generation';
import { Col, Dropdown, Expand, Row, SetPage, Swap, bytes, errorText } from './parts';
import type { AppearanceSettings } from '../shared/types';

/** 确认框：ask() 返回用户是否确认 */
export function useAsk() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const answer = useRef<(ok: boolean) => void>(() => {});
  const ask = (o: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      answer.current = resolve;
      setOptions(o);
    });
  const node = (
    <Confirm
      options={options}
      onAnswer={(ok) => {
        setOptions(null);
        answer.current(ok);
      }}
    />
  );
  return [node, ask] as const;
}

const Fail = ({ children }: { children: ReactNode }) =>
  children ? (
    <div className="banner danger set-banner" data-enter="fade">
      <Icon name="error-warning-line" />
      <span className="selectable">{children}</span>
    </div>
  ) : null;

// ---------- 外观 ----------
export function Appearance() {
  const notify = useNotifications();
  const { appearance, changeAppearance } = useAppearance();
  const [fonts, setFonts] = useState<{ family: string; monospace: boolean }[]>([]);
  useEffect(() => {
    let live = true;
    invokeUI('fonts.list', {})
      .then((r) => {
        if (!live) return;
        if (r.ok) setFonts(r.fonts);
        else notify({ text: `读取字体列表失败：${r.error}`, tone: 'error' });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const groups = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return partitionFontFamilies(
      [
        ...fonts,
        { family: appearance.sansFont, monospace: false },
        { family: appearance.monoFont, monospace: true },
        { family: appearance.proseFont, monospace: false },
      ],
      ctx
        ? (family: string, sample: string) => {
            ctx.font = `24px ${quoteFontFamily(family)}, sans-serif`;
            return ctx.measureText(sample).width;
          }
        : undefined,
    ) as { proportional: string[]; monospace: string[] };
  }, [fonts, appearance.sansFont, appearance.monoFont, appearance.proseFont]);
  const save = (patch: Partial<AppearanceSettings>) =>
    void changeAppearance(patch).catch((e) => notify({ text: errorText(e), tone: 'error' }));
  const name = (family: string) =>
    BUNDLED_FONTS.includes(family)
      ? `${family}（内置）`
      : family === 'system-ui' || family === 'monospace'
        ? '系统默认'
        : family;
  const font = (key: 'sansFont' | 'monoFont' | 'proseFont', title: string, help: string) => {
    const list = key === 'monoFont' ? groups.monospace : groups.proportional;
    return (
      <Row title={title} help={help}>
        <Dropdown
          label={title}
          className="set-dd"
          menuClass="font-menu scroll"
          value={
            <span style={{ fontFamily: quoteFontFamily(appearance[key]) }}>
              {name(appearance[key])}
            </span>
          }
          items={list.map((family) => ({
            label: <span style={{ fontFamily: quoteFontFamily(family) }}>{name(family)}</span>,
            checked: appearance[key] === family,
            onSelect: () => save({ [key]: family }),
          }))}
        />
      </Row>
    );
  };
  return (
    <SetPage title="外观" desc="更改会立即应用到整个界面。">
      <Row title="主题">
        <Seg
          label="主题"
          items={[
            ['auto', '跟随系统'],
            ['light', '浅色'],
            ['dark', '深色'],
          ]}
          value={appearance.themeMode}
          onChange={(themeMode) => save({ themeMode })}
        />
      </Row>
      {font('sansFont', '界面字体', '用于界面和中文')}
      {font('monoFont', '等宽字体', '用于 Tag、权重和参数')}
      {font('proseFont', '段落字体', '用于成段的自然语言')}
      <Row title="动效" help="关闭后不播放过渡动画，变化立即完成">
        <Seg
          label="动效"
          items={[
            ['full', '完整'],
            ['reduced', '跟随系统'],
            ['off', '关闭'],
          ]}
          value={appearance.motion}
          onChange={(motion) => save({ motion })}
        />
      </Row>
    </SetPage>
  );
}

// ---------- 图片库 ----------
export function Storage({
  onLibraryChange,
  onEmptyTrash,
}: {
  onLibraryChange: () => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
}) {
  const s = useStorage(onLibraryChange);
  const [trash, setTrash] = useState(0);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState('');
  const refresh = async () => {
    const r = await invokeUI('trash.summary', {});
    if (r?.ok) setTrash(r.count);
    else if (r) throw new Error(r.error);
  };
  useEffect(() => {
    void refresh().catch((e) => setTrashError(errorText(e)));
    // 图片库里删除或还原后回到这一页，数字要跟着变
    const onFocus = () => void refresh().catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const emptyTrash = async () => {
    if (trashBusy) return;
    setTrashBusy(true);
    setTrashError('');
    try {
      await onEmptyTrash();
      await refresh();
    } catch (e) {
      setTrashError(errorText(e));
    } finally {
      setTrashBusy(false);
    }
  };
  const sep = s.database?.directory.includes('\\') ? '\\' : '/';
  const progress = s.progress;
  return (
    <SetPage title="图片库" desc="导入的图片、缩略图和生成的图片都保存在这里。">
      <div className="setcol">
        <div>图片存放位置</div>
        <Swap k={s.details?.assetsDirectory || ''} className="path">
          <span className="selectable">{s.details?.assetsDirectory || '正在读取…'}</span>
        </Swap>
        <small>
          {(s.details?.fileCount || 0).toLocaleString('en-US')} 个文件 · 占用{' '}
          {bytes(s.details?.totalBytes || 0)}
        </small>
        <div className="row">
          <button className="btn sm" disabled={!s.details} onClick={() => void s.reveal()}>
            打开文件夹
          </button>
          <button
            className="btn sm"
            disabled={!s.details || s.busy}
            data-tip={s.busy ? '正在移动' : undefined}
            onClick={() => void s.change()}
          >
            更改位置
          </button>
        </div>
        <small>更改位置时会把现有文件移到新位置，复制完成前不会删除原文件。</small>
      </div>
      <Expand open={s.busy || s.moved}>
        <Swap k={s.busy ? 'run' : s.moved ? 'done' : 'none'}>
          {s.busy ? (
            <div className="setcol">
              <div>正在移动到新位置</div>
              <div className="progress ink">
                <i
                  style={{
                    width: `${progress?.total ? (progress.completed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                已复制 {progress?.completed || 0} / {progress?.total || 0} 个文件 ·
                移动期间可以继续使用，完成前请勿关闭软件
              </small>
            </div>
          ) : s.moved ? (
            <div className="setcol">
              <div className="banner ok">
                <Icon name="check-line" />
                已移动到新位置，原位置的文件已删除
              </div>
            </div>
          ) : null}
        </Swap>
      </Expand>
      <Fail>{s.error}</Fail>
      <Col
        title="数据库"
        help="收藏集、名称、版本记录、翻译词典和设置都在这里"
        after={
          <div className="row">
            <button
              className="btn sm"
              disabled={!s.database}
              onClick={() => s.database && void s.revealDatabase(s.database.fileName)}
            >
              打开文件夹
            </button>
          </div>
        }
      >
        <div className="path">
          <span className="selectable mono">
            {s.database ? `${s.database.directory}${sep}${s.database.fileName}` : '正在读取…'}
          </span>
        </div>
      </Col>
      {s.backups?.length === 0 && (
        <Row
          title="升级前的备份"
          help="还没有升级前的备份。软件在升级数据格式之前会自动留一份，升级出问题时可以用它恢复。"
        />
      )}
      {s.backups?.map((b) => (
        <Row
          key={b.fileName}
          title="升级前的备份"
          help={`${new Date(b.modifiedAt).toLocaleString()} · ${b.fileName} · ${bytes(b.size)}。升级出问题时可以用它恢复`}
        >
          <button className="btn sm" onClick={() => void s.revealDatabase(b.fileName)}>
            打开所在文件夹
          </button>
        </Row>
      ))}
      <Fail>{s.databaseError}</Fail>
      <Row title="回收站" help={`${trash} 张图片 · 永久删除后无法恢复`}>
        <button
          className={`btn line-danger sm ${trashBusy ? 'loading' : ''}`}
          disabled={!trash || trashBusy}
          data-tip={!trash ? '回收站为空' : undefined}
          onClick={() => void emptyTrash()}
        >
          {trashBusy && <Icon name="loader-4-line" />}
          清空回收站
        </button>
      </Row>
      <Fail>{trashError}</Fail>
    </SetPage>
  );
}

// ---------- NovelAI 账号 ----------
const TIERS = ['未订阅', 'Tablet', 'Scroll', 'Opus'];
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
  return (
    <SetPage
      title="NovelAI 账号"
      desc="用你自己的 NovelAI 账号在这里生成图片。本软件是非官方工具，与 NovelAI 没有隶属关系；这样使用是否符合 NovelAI 的服务条款，由你自己判断并承担。"
    >
      <Col
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
      {has && <GenerationPreferences />}
    </SetPage>
  );
}

/** 连续生成（账号页）和 Agent 生成（Agent 页）：开启前都要再确认一次 */
export function GenerationPreferences({ agent = false }: { agent?: boolean }) {
  const s = useGeneration().settings;
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const [limit, setLimit] = useState(String(s.dailyLimit));
  useEffect(() => setLimit(String(s.dailyLimit)), [s.dailyLimit]);
  const save = (input: Parameters<typeof invokeUI<'settings.generation.save'>>[1]) =>
    void invokeUI('settings.generation.save', input).catch((e) =>
      notify({ text: errorText(e), tone: 'error' }),
    );
  const quote = '“All generation requests must be initiated by a human action.”';
  if (!agent)
    return (
      <>
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
    if (Number.isSafeInteger(n) && n >= 0) save({ dailyLimit: n });
    else setLimit(String(s.dailyLimit));
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
                body: '开启后，Agent 发起的生成无需确认，将直接发送并消耗 Anlas。NovelAI 的接口说明里写着：',
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
        help="默认关闭。开启后可设置每日 Anlas 上限，达到上限时暂停 Agent 的生成。"
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
            <span className="label">Anlas · 今日已用 {s.spentToday || 0}</span>
          </div>
        </Expand>
      </div>
      {dialog}
    </>
  );
}

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
        {a.dirty && (
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
      <button
        className={`btn ${a.operation === 'test' ? 'loading' : ''}`}
        disabled={a.busy}
        onClick={() => void a.run('test')}
      >
        {a.operation === 'test' && <Icon name="loader-4-line" />}
        {a.operation === 'test' ? '测试中' : '测试连接'}
      </button>
      <button
        className="btn ink"
        disabled={a.busy || !a.dirty}
        data-tip={!a.dirty ? '没有需要保存的修改' : undefined}
        onClick={() => void a.run('save')}
      >
        保存
      </button>
    </>
  );
  return (
    <SetPage
      title="AI 服务"
      desc="用来根据提示词起名、补全内置词典没有的 Tag 翻译和分类、翻译段落。不配置也能使用软件的其他功能。"
      foot={foot}
    >
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
                    placeholder={a.settings.hasApiKey && safe ? '粘贴新的 API Key' : '粘贴 API Key'}
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
        help={a.modelsError ? `读取模型列表失败：${a.modelsError}，可以直接输入模型 ID` : undefined}
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
    </SetPage>
  );
}

// ---------- Agent ----------
type AgentSetup = {
  installed: boolean;
  path: string;
  onPath: boolean;
  skillPath: string;
  platform: string;
  pathFailed?: boolean;
};
export function Agent() {
  const notify = useNotifications();
  const [setup, setSetup] = useState<AgentSetup | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void invokeUI('updates.status', {})
      .then((r) => live && setVersion(r.currentVersion))
      .catch(() => {});
    void invokeUI('agent.setup', {})
      .then((r) => {
        if (!live) return;
        if (r.ok) setSetup(r);
        else setError(r.error);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, []);
  const install = async () => {
    setBusy(true);
    try {
      const r = await invokeUI('agent.install', {});
      if (!r.ok) throw Error(r.error);
      setSetup(r);
      setInstalledNow(true);
      setError('');
      notify({ text: setup?.installed ? '已重新安装' : '已安装', tone: 'success' });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const copySkill = async () => {
    try {
      const r = await invokeUI('agent.skill', {});
      if (!r.ok) throw Error(r.error);
      await writeClipboardText(r.text);
      notify({ text: '已复制技能内容', tone: 'success' });
    } catch (e) {
      notify({ text: `复制失败：${errorText(e)}`, tone: 'error' });
    }
  };
  const dir = setup?.path.replace(/[\\/][^\\/]*$/, '') || '';
  const help: ReactNode[] = !setup
    ? ['正在读取…']
    : !setup.installed
      ? ['未安装']
      : [
          `已安装 · nai-studio${version ? ` ${version}` : ''}`,
          !setup.onPath && (
            <span className="warn-t">
              命令所在的文件夹不在 PATH 里，终端里找不到 nai-studio。把下面的文件夹加进
              PATH，再重新打开终端。
            </span>
          ),
          <span className="path selectable">{dir}</span>,
          setup.platform === 'win32'
            ? setup.pathFailed
              ? '加入 PATH 失败。可以在系统的“编辑账户的环境变量”里把上面的文件夹加进 Path，然后重新打开终端。'
              : installedNow && setup.onPath
                ? '已加入 PATH，已经打开的终端要重新打开才能用。'
                : null
            : !setup.onPath && (
                <>
                  这个位置不在 PATH 里。把下面这行加到 ~/.zshrc（用 bash 的加到
                  ~/.bashrc），然后重新打开终端：
                  <span className="path selectable">{'export PATH="$HOME/.local/bin:$PATH"'}</span>
                </>
              ),
        ];
  return (
    <SetPage
      title="Agent"
      desc="让你的 Agent（如 Claude Code、Codex）通过命令行使用本软件：读取提示词、修改工作台、搜索图片库、添加生成任务。"
    >
      <Fail>{error && `安装失败：${error}`}</Fail>
      <Row title="命令行工具" help={help}>
        <span className="row set-nowrap">
          {setup?.installed && !setup.onPath && (
            <button
              className="btn quiet sm"
              onClick={() =>
                void writeClipboardText(dir).then(() =>
                  notify({ text: '已复制命令所在的文件夹', tone: 'success' }),
                )
              }
            >
              复制位置
            </button>
          )}
          <button
            className={`btn sm ${busy ? 'loading' : ''}`}
            disabled={busy || !setup}
            onClick={() => void install()}
          >
            {busy && <Icon name="loader-4-line" />}
            {setup?.installed ? '重新安装' : '安装'}
          </button>
        </span>
      </Row>
      <Row title="Agent 技能" help="说明这些命令用法的技能文件，放入 Agent 的技能目录即可使用。">
        <span className="row">
          <button
            className="btn quiet sm"
            onClick={() =>
              void invokeUI('agent.reveal', {}).then((r) => {
                if (!r.ok) notify({ text: r.error, tone: 'error' });
              })
            }
          >
            打开所在文件夹
          </button>
          <button className="btn sm" onClick={() => void copySkill()}>
            复制内容
          </button>
        </span>
      </Row>
      <Row
        title="Agent 能做什么"
        help={[
          '读提示词和参数，改工作台，搜索和整理图片库，修改翻译词典，排队生成。',
          '不能永久删除图片、修改设置或读取任何密钥。',
        ]}
      />
      <GenerationPreferences agent />
    </SetPage>
  );
}
