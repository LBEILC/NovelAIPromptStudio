import { invokeUI } from '../lib/commands';
import {
  Disclosure,
  TransitionSurface,
  useMovingIndicator,
  useNavigationSelection,
} from '../ui/transitions';
import { writeClipboardText } from '../lib/clipboard';
import {
  Activity,
  Fragment,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Button,
  Progress,
  Input,
  TextArea,
  Select,
  OptionGroup,
  Switch,
  Dialog,
  Shortcut,
  useScrollArea,
} from '../ui';
import { SettingsFrame } from './PageFrame';
import { useAppearance } from '../state/appearance';
import { useAISettings } from '../state/ai';
import { useStorage } from '../state/storage';
import { useUpdates } from '../state/updates';
import { BUNDLED_FONTS, partitionFontFamilies, quoteFontFamily } from '../lib/fonts.js';
import { Dictionary } from './Dictionary';
import { BrandMark } from '../shell/Titlebar';
import misansLicense from '../../LICENSES/MiSans/LICENSE?raw';
import newsreaderLicense from '../../LICENSES/Newsreader/LICENSE?raw';
import plexLicense from '../../LICENSES/IBMPlexMono/LICENSE?raw';
import projectLicense from '../../LICENSE?raw';
import remixLicense from '../../LICENSES/RemixIcon/LICENSE?raw';
import dictionaryLicense from '../../third_party/DanbooruSearchOnline/LICENSE?raw';
import type { AppearanceSettings } from '../shared/types';
import './settings.css';
const ReleaseNotes = lazy(() => import('./ReleaseNotes.jsx'));
const sections = [
  ['appearance', '外观', 'contrast-2-line'],
  ['storage', '图片库', 'hard-drive-2-line'],
  ['ai', 'AI 服务', 'translate-2'],
  ['tags', '翻译词典', 'book-2-line'],
  ['agent', 'Agent', 'terminal-box-line'],
  ['updates', '关于与更新', 'information-line'],
];
const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KB`
      : `${(value / 1048576).toFixed(1)} MB`;
function Row({
  title,
  help,
  children,
}: {
  title: string;
  help?: ReactNode | ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="settings-line">
      <div>
        {title}
        {help &&
          (Array.isArray(help) ? help : [help]).map((line, index) => (
            <small key={index}>{line}</small>
          ))}
      </div>
      {children}
    </div>
  );
}
function Agent() {
  const [setup, setSetup] = useState<{
    installed: boolean;
    path: string;
    onPath: boolean;
    skillPath: string;
    platform: string;
    pathFailed?: boolean;
  } | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setInstalledNow(false);
    void invokeUI('agent.setup', {})
      .then((result) => {
        if (!active) return;
        if (result.ok) setSetup(result);
        else setMessage(result.error);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const install = async () => {
    setBusy(true);
    try {
      const result = await invokeUI('agent.install', {});
      if (!result.ok) throw Error(result.error);
      setSetup(result);
      setInstalledNow(true);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const copy = async () => {
    try {
      const result = await invokeUI('agent.skill', {});
      if (!result.ok) throw Error(result.error);
      await writeClipboardText(result.text);
      setMessage('已复制技能内容');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <SettingsFrame
      title="Agent"
      description="让你自己的 Agent（比如 Claude Code、Codex）通过命令行使用这个软件：读提示词、改工作台、搜图片库。"
    >
      <Row
        title="命令行工具"
        help={
          setup?.installed
            ? [
                setup.path,
                ...(setup.platform === 'win32'
                  ? setup.pathFailed
                    ? [
                        '加入 PATH 失败。可以在系统的"编辑账户的环境变量"里把上面的文件夹加进 Path，然后重新打开终端。',
                      ]
                    : installedNow && setup.onPath
                      ? ['已加入 PATH，已经打开的终端要重新打开才能用。']
                      : []
                  : !setup.onPath
                    ? [
                        '这个位置不在 PATH 里。把下面这行加到 ~/.zshrc（用 bash 的加到 ~/.bashrc），然后重新打开终端：',
                        <span className="settings-copy">
                          <code>{'export PATH="$HOME/.local/bin:$PATH"'}</code>
                        </span>,
                      ]
                    : []),
              ]
            : undefined
        }
      >
        <div className="settings-actions">
          <span>{setup?.installed ? '已安装' : '未安装'}</span>
          <Button loading={busy} onClick={() => void install()}>
            {setup?.installed ? '重新安装' : '安装'}
          </Button>
        </div>
      </Row>
      <Row title="Agent 技能" help="一份教 Agent 怎么用这些命令的说明，放进你的 Agent 的技能目录。">
        <div className="settings-actions">
          <Button
            variant="quiet"
            onClick={() => {
              void invokeUI('agent.reveal', {}).then((result) => {
                if (!result.ok) setMessage(result.error);
              });
            }}
          >
            打开所在文件夹
          </Button>
          <Button onClick={() => void copy()}>复制内容</Button>
        </div>
      </Row>
      <Row
        title="Agent 能做什么"
        help={[
          '读提示词和参数，改工作台，搜索和整理图片库，修改翻译词典。',
          '不能永久删除图片，不能改设置，读不到任何密钥。',
        ]}
      >
        {null}
      </Row>
      <p role="status">{message}</p>
    </SettingsFrame>
  );
}
function Appearance() {
  const { appearance, changeAppearance } = useAppearance();
  const [fonts, setFonts] = useState<{ family: string; monospace: boolean }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    invokeUI('fonts.list', {})
      .then((r) => {
        if (!active) return;
        if (r.ok) setFonts(r.fonts);
        else setError(r.error);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  const groups = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    return partitionFontFamilies(
      [
        ...fonts,
        { family: appearance.sansFont, monospace: false },
        { family: appearance.monoFont, monospace: true },
        { family: appearance.proseFont, monospace: false },
      ],
      context
        ? (family: string, sample: string) => {
            context.font = `24px ${quoteFontFamily(family)}, sans-serif`;
            return context.measureText(sample).width;
          }
        : undefined,
    );
  }, [fonts, appearance.sansFont, appearance.monoFont, appearance.proseFont]);
  const save = (patch: Partial<AppearanceSettings>) =>
    void changeAppearance(patch).catch((e: Error) => setError(e.message));
  return (
    <SettingsFrame title="外观" description="更改会立刻应用到整个界面。">
      <Row title="主题">
        <OptionGroup
          label="主题"
          options={[
            { value: 'auto', label: '跟随系统' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ]}
          value={appearance.themeMode}
          onChange={(v) => save({ themeMode: v as AppearanceSettings['themeMode'] })}
        />
      </Row>
      {(
        [
          ['sansFont', '界面字体', '用于界面和中文'],
          ['monoFont', '等宽字体', '用于 Tag、权重和参数'],
          ['proseFont', '段落字体', '用于成段的自然语言'],
        ] as const
      ).map(([key, title, help]) => (
        <Row key={key} title={title} help={help}>
          <Select
            label={title}
            value={appearance[key]}
            options={(key === 'monoFont' ? groups.monospace : groups.proportional).map(
              (family: string) => ({
                value: family,
                label: BUNDLED_FONTS.includes(family)
                  ? `${family}（内置）`
                  : family === 'system-ui'
                    ? '系统界面字体'
                    : family === 'monospace'
                      ? '系统等宽字体'
                      : family,
              }),
            )}
            onChange={(v) => save({ [key]: v })}
          />
        </Row>
      ))}
      <Row title="动效" help="关闭后，所有位置变化都立刻完成">
        <OptionGroup
          label="动效"
          value={appearance.motion}
          options={[
            { value: 'full', label: '完整' },
            { value: 'reduced', label: '跟随系统' },
            { value: 'off', label: '关闭' },
          ]}
          onChange={(v) => save({ motion: v as AppearanceSettings['motion'] })}
        />
      </Row>
      {error && <p role="alert">{error}</p>}
    </SettingsFrame>
  );
}
function AI() {
  const a = useAISettings();
  return (
    <SettingsFrame
      title="AI 服务"
      description="用来补全内置词典没有的 Tag 翻译和分类、翻译段落。不配置也能使用软件的其他功能。"
      footer={
        <>
          <span role="status">{a.dirty ? '有未保存的修改' : a.message}</span>
          <Button disabled={a.busy} onClick={() => void a.run('test')}>
            测试连接
          </Button>
          <Button variant="ink" disabled={a.busy || !a.dirty} onClick={() => void a.run('save')}>
            保存
          </Button>
        </>
      }
    >
      <label className="settings-column">
        服务地址
        <Input
          value={a.settings.baseUrl}
          onChange={(e) => a.setSettings((s) => ({ ...s, baseUrl: e.target.value }))}
        />
        <small>任何兼容 OpenAI 接口格式的服务</small>
      </label>
      <label className="settings-column">
        API Key
        <Input
          type="password"
          value={a.settings.apiKey}
          placeholder={a.settings.hasApiKey ? '已安全保存' : '输入 API Key'}
          onChange={(e) => a.setSettings((s) => ({ ...s, apiKey: e.target.value }))}
        />
        <small>{a.settings.hasApiKey ? '已加密保存；留空可保留现有 Key' : '还未保存'}</small>
        <small>加密后保存在这台电脑上，软件不保存明文</small>
      </label>
      <div className="settings-column">
        模型
        <div className="settings-actions">
          <Input
            aria-label="模型"
            value={a.settings.model}
            placeholder="输入或读取模型 ID"
            onChange={(e) => a.setSettings((s) => ({ ...s, model: e.target.value }))}
          />
          {a.models.length > 0 && (
            <Select
              label="模型列表"
              value={a.settings.model}
              options={a.models.map((value) => ({ value, label: value }))}
              onChange={(model) => a.setSettings((s) => ({ ...s, model }))}
            />
          )}
          <Button variant="quiet" disabled={a.busy} onClick={() => void a.run('models')}>
            重新读取模型列表
          </Button>
        </div>
      </div>
      {!a.settings.encryptionAvailable && (
        <p role="alert">当前系统安全存储不可用，应用不会以明文保存 API Key。</p>
      )}
      <h2>提示词</h2>
      <p>软件会在后面固定附加输出格式、数量和顺序的要求，这里只写翻译和分类的规则。</p>
      {(
        [
          ['translationPrompt', '翻译规则'],
          ['classificationPrompt', '分类规则'],
        ] as const
      ).map(([key, label]) => (
        <label className="settings-column" key={key}>
          {label}
          <TextArea
            value={a.settings[key]}
            onChange={(e) => a.setSettings((s) => ({ ...s, [key]: e.target.value }))}
          />
          <Button
            variant="quiet"
            className="settings-prompt-reset"
            onClick={() =>
              a.setSettings((s) => ({
                ...s,
                [key]:
                  key === 'translationPrompt'
                    ? s.defaultPrompts.translation
                    : s.defaultPrompts.classification,
              }))
            }
          >
            恢复默认
          </Button>
        </label>
      ))}
    </SettingsFrame>
  );
}
function Storage({
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
    const result = await invokeUI('trash.summary', {});
    if (result?.ok) setTrash(result.count);
    else if (result) throw new Error(result.error);
  };
  useEffect(() => {
    void refresh().catch((error: Error) => setTrashError(error.message));
  }, []);
  const emptyTrash = async () => {
    if (trashBusy) return;
    setTrashBusy(true);
    setTrashError('');
    try {
      await onEmptyTrash();
      await refresh();
    } catch (error) {
      setTrashError(error instanceof Error ? error.message : String(error));
    } finally {
      setTrashBusy(false);
    }
  };
  return (
    <SettingsFrame title="图片库" description="导入的图片、缩略图和导出的 Vibe 文件都存在这里。">
      <div className="settings-column">
        <div>图片存放位置</div>
        <code>{s.details?.assetsDirectory || '正在读取…'}</code>
        <small>
          {s.details?.fileCount || 0} 个文件 · 占用 {bytes(s.details?.totalBytes || 0)}
        </small>
        <div className="settings-actions">
          <Button disabled={!s.details || s.busy} onClick={() => void s.reveal()}>
            打开文件夹
          </Button>
          <Button disabled={!s.details || s.busy} onClick={() => void s.change()}>
            更改位置
          </Button>
        </div>
        <small>更改位置会把现有文件移过去。确认文件完整复制之前，原来的文件不会被删除。</small>
      </div>
      {s.busy && (
        <div className="settings-column">
          正在移动到新位置
          <Progress
            max={s.progress?.total || 1}
            value={s.progress?.completed || 0}
            label="迁移进度"
          />
          <small>
            {s.progress
              ? `已复制 ${s.progress.completed} / ${s.progress.total} 个文件 · 可以继续使用，移动完成前不要关闭软件`
              : '准备迁移…'}
          </small>
        </div>
      )}
      {s.error && <p role="alert">{s.error}</p>}
      <h2>数据与备份</h2>
      <Row
        title="数据库"
        help={
          s.database
            ? `${s.database.directory}${s.database.directory.includes('\\') ? '\\' : '/'}${s.database.fileName}`
            : '正在读取…'
        }
      >
        <Button
          disabled={!s.database}
          onClick={() => s.database && void s.revealDatabase(s.database.fileName)}
        >
          打开文件夹
        </Button>
      </Row>
      {s.backups?.map((backup) => (
        <Row
          key={backup.fileName}
          title="升级前的备份"
          help={`软件在升级数据格式之前自动留下的一份副本 · ${backup.fileName} · ${bytes(backup.size)} · ${new Date(backup.modifiedAt).toLocaleString()}`}
        >
          <Button variant="quiet" onClick={() => void s.revealDatabase(backup.fileName)}>
            在文件夹中显示
          </Button>
        </Row>
      ))}
      {s.backups?.length === 0 && (
        <Row title="升级前的备份" help="还没有升级前的备份。软件在升级数据格式之前会自动留一份。">
          {null}
        </Row>
      )}
      {s.databaseError && <p role="alert">{s.databaseError}</p>}
      <Row title="回收站" help={`${trash} 张图片 · 永久删除后无法恢复`}>
        <Button
          variant="danger-outline"
          disabled={!trash || trashBusy}
          onClick={() => void emptyTrash()}
        >
          清空回收站
        </Button>
      </Row>
      {trashError && <p role="alert">{trashError}</p>}
    </SettingsFrame>
  );
}
export function feedbackDiagnostics(version = '—', platform = '') {
  return `NovelAI Prompt Studio v${version}\n平台：${({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[platform] || platform || '未知平台'}`;
}
export function About({ onInstallUpdate }: { onInstallUpdate: () => Promise<unknown> }) {
  const u = useUpdates();
  const [dialog, setDialog] = useState('');
  const [message, setMessage] = useState('');
  const state = u.state;
  const open = (url?: string) =>
    void invokeUI('updates.open-release', { url: url }).catch((e: Error) => setMessage(e.message));
  const copy = async () => {
    try {
      await writeClipboardText(feedbackDiagnostics(state?.currentVersion, state?.platform));
      setMessage('已复制诊断信息');
    } catch {
      setMessage('没能复制诊断信息');
    }
  };
  const hasUpdate =
    !!state &&
    (state.hasUpdate || ['available', 'downloading', 'downloaded'].includes(state.phase));
  return (
    <SettingsFrame title="关于与更新" description="">
      <div className="settings-about-head">
        <BrandMark />
        <div>
          <div className="settings-about-name">NovelAI Prompt Studio</div>
          <code>版本 {state?.currentVersion || '—'}</code>
        </div>
      </div>
      <p>非官方工具，与 NovelAI 没有隶属关系。</p>
      <h2>更新</h2>
      <Row title="自动检查更新" help="启动后检查一次，不会自动安装">
        <Switch
          label="自动检查更新"
          checked={u.autoCheck}
          onChange={(v) => void u.changeAutoCheck(v)}
        />
      </Row>
      <Row
        title={
          hasUpdate
            ? `发现新版本 ${state.latestVersion}`
            : state?.latestVersion
              ? `已是最新版本 · v${state.latestVersion}`
              : '官方稳定版本'
        }
        help={state?.packaged ? undefined : '开发模式只检查官方稳定版本，不会下载或安装更新。'}
      >
        <div className="settings-actions">
          <Button disabled={state?.phase === 'checking'} onClick={() => void u.check()}>
            {state?.phase === 'checking' ? '正在检查…' : '检查更新'}
          </Button>
          {state?.notes && (
            <Button variant="quiet" onClick={() => setDialog('notes')}>
              更新说明
            </Button>
          )}
          {hasUpdate &&
            state.canDownloadUpdate &&
            !['downloading', 'downloaded'].includes(state.phase) && (
              <Button onClick={() => void u.download()}>下载更新</Button>
            )}
          {state?.phase === 'downloaded' && state.canInstallUpdate && (
            <Button variant="ink" onClick={() => void onInstallUpdate()}>
              重启并安装
            </Button>
          )}
          {hasUpdate && (
            <Button onClick={() => open(state.releaseUrl)}>
              {state.platform === 'darwin' && state.updateMode === 'manual'
                ? '下载 macOS 安装包'
                : '打开官方 Release'}
            </Button>
          )}
        </div>
      </Row>
      {state?.phase === 'downloading' && (
        <div className="settings-column">
          正在下载更新 · {Math.round(state.progress)}%
          <Progress max={100} value={state.progress} label="下载更新进度" />
          <small>
            {bytes(state.transferred || 0)} / {bytes(state.total || 0)}
          </small>
        </div>
      )}
      {(u.error || state?.error) && (
        <p role="alert">{u.error || state?.error}。本地功能不受影响，可以稍后重试。</p>
      )}
      {state?.packaged && state.platform === 'darwin' && state.updateMode === 'manual' && (
        <p>
          当前 macOS 版本未签名，无法在应用内直接安装更新。发现新版本后，请从官方 Release
          下载对应安装包并手动替换应用。
        </p>
      )}
      <h2>快捷键</h2>
      <p>macOS 上 Ctrl 对应 Command。在输入框里，Ctrl V 仍然是普通的粘贴。</p>
      {[
        ['打开图片；在图片库里是导入', [['Mod', 'I']]],
        ['从剪贴板打开或导入图片', [['Mod', 'V']]],
        ['聚焦搜索框', [['Mod', 'K']]],
        [
          '下一个 / 上一个标签页',
          [
            ['Mod', 'Tab'],
            ['Mod', 'Shift', 'Tab'],
          ],
        ],
        ['关闭当前标签页', [['Mod', 'W']]],
        ['移动当前 Tag', [['Alt', '方向键']]],
        ['在图片之间移动', [['方向键']]],
        ['在一摞图片里切换', [['←'], ['→']]],
        ['上一组 / 下一组', [['↑'], ['↓']]],
        ['在工作台打开', [['Enter']]],
        ['看大图', [['Space']]],
        ['全选图片', [['Mod', 'A']]],
        ['取消选择；关闭大图', [['Esc']]],
      ].map(([title, bindings]) => (
        <Row key={title as string} title={title as string}>
          <span className="settings-shortcuts">
            {(bindings as string[][]).map((keys, index) => (
              <Fragment key={keys.join('-')}>
                {index > 0 && <span className="settings-shortcut-separator">/</span>}
                <span className="settings-shortcut-binding">
                  {keys.map((key) => (
                    <Shortcut key={key} keys={[key]} />
                  ))}
                </span>
              </Fragment>
            ))}
          </span>
        </Row>
      ))}
      <h2>数据与隐私</h2>
      <Row title="图片和图库数据只存在这台电脑上" help={'位置见"图片库"那一页。软件不会上传图片'}>
        {null}
      </Row>
      <Row
        title="这些时候会联网，都不会发送图片"
        help={[
          '检查和下载更新：访问 GitHub。自动检查可以在上面关掉；更新说明里带图片时，会从图片所在的网站加载',
          '翻译与分类：内置词典里没有的 Tag，会把 Tag 的名字发给 Danbooru，查它属于哪一类；配置了 AI 服务时，还没有译文的 Tag 会再发给你配置的服务',
          '段落的"译成中文""按中文改写英文"：把这一段文字发给你配置的 AI 服务',
          '读取模型列表、测试连接：只和你配置的 AI 服务通信，不带你的提示词',
          '报告问题、提出建议：在浏览器里打开 GitHub，不自动附带任何数据',
        ]}
      >
        {null}
      </Row>
      <Row
        title="API Key 加密后保存在这台电脑上"
        help="用系统自带的加密能力加密，软件不保存明文；诊断信息和报告问题都不会带上它"
      >
        {null}
      </Row>
      <h2>反馈与支持</h2>
      <Row title="报告问题或提出建议" help="会在浏览器里打开 GitHub，不会自动附带任何数据">
        <div className="settings-actions">
          <Button
            onClick={() =>
              open(
                'https://github.com/LBEILC/NovelAIPromptStudio/issues/new?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20',
              )
            }
          >
            报告问题
          </Button>
          <Button
            onClick={() =>
              open(
                'https://github.com/LBEILC/NovelAIPromptStudio/issues/new?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20',
              )
            }
          >
            提出建议
          </Button>
        </div>
      </Row>
      <Row title="诊断信息" help="只包含软件版本和操作系统，不包含图片、提示词和路径">
        <Button variant="quiet" onClick={() => void copy()}>
          复制
        </Button>
      </Row>
      <p role="status">{message}</p>
      <h2>字体与开源组件</h2>
      <Row
        title="界面字体 MiSans · 段落字体 Newsreader · 等宽字体 IBM Plex Mono"
        help="内置 Tag 词典来自 DanbooruSearchOnline"
      >
        <Button variant="quiet" onClick={() => setDialog('licenses')}>
          查看声明
        </Button>
      </Row>
      <Dialog
        open={!!dialog}
        title={dialog === 'notes' ? '更新说明' : '字体与开源组件'}
        cancelLabel="关闭"
        confirmLabel="确定"
        onCancel={() => setDialog('')}
        onConfirm={() => setDialog('')}
      >
        {dialog === 'notes' ? (
          <Suspense fallback={null}>
            <ReleaseNotes>{state?.notes || ''}</ReleaseNotes>
          </Suspense>
        ) : (
          <>
            <p>
              界面字体 MiSans VF（版本
              4.003），版权归北京小米移动软件有限公司所有，按其许可协议随本软件原样分发。段落字体
              Newsreader 与等宽字体 IBM Plex Mono 按 SIL Open Font License 1.1 分发。
            </p>
            {[
              ['MiSans VF 4.003', misansLicense],
              ['Newsreader', newsreaderLicense],
              ['IBM Plex Mono', plexLicense],
              ['NovelAI Prompt Studio', projectLicense],
              ['Remix Icon', remixLicense],
              ['DanbooruSearchOnline', dictionaryLicense],
            ].map(([name, license]) => (
              <Disclosure
                key={name}
                summary={
                  <>
                    <i className="ri-arrow-right-s-line disclosure-icon" aria-hidden="true" />
                    {name}
                  </>
                }
              >
                <pre className="settings-license">{license}</pre>
              </Disclosure>
            ))}
          </>
        )}
      </Dialog>
    </SettingsFrame>
  );
}
export default function SettingsPage(props: {
  menuDestination?: { section: string } | null;
  onFindTag?: (tag: string) => void;
  onInstallUpdate: () => Promise<unknown>;
  onLibraryChange: () => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
}) {
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (props.menuDestination) setSection(props.menuDestination.section);
  }, [props.menuDestination]);
  useScrollArea(sidebar);
  const [section, setSection] = useState(
    (window as Window & { studioScreenshot?: { section?: string } }).studioScreenshot?.section ||
      'appearance',
  );
  const marker = useRef<HTMLSpanElement>(null);
  const [selected, select] = useNavigationSelection(section, setSection);
  useMovingIndicator(sidebar, marker, '[aria-current=page]', selected);
  const content = useMemo(
    () => (
      <TransitionSurface className="settings-body" change={section} data-settings-section={section}>
        <Activity mode={section === 'appearance' ? 'visible' : 'hidden'}>
          <Appearance />
        </Activity>
        <Activity mode={section === 'storage' ? 'visible' : 'hidden'}>
          <Storage {...props} />
        </Activity>
        <Activity mode={section === 'ai' ? 'visible' : 'hidden'}>
          <AI />
        </Activity>
        <Activity mode={section === 'tags' ? 'visible' : 'hidden'}>
          <Dictionary onFindTag={props.onFindTag} />
        </Activity>
        <Activity mode={section === 'updates' ? 'visible' : 'hidden'}>
          <About {...props} />
        </Activity>
        <Activity mode={section === 'agent' ? 'visible' : 'hidden'}>
          <Agent />
        </Activity>
      </TransitionSurface>
    ),
    [section, props],
  );
  return (
    <main className="studio-settings">
      <nav className="settings-sidebar" aria-label="设置分类" ref={sidebar}>
        {sections.map(([key, label, icon]) => (
          <Button
            key={key}
            variant="quiet"
            aria-current={key === selected ? 'page' : undefined}
            data-settings-target={key}
            onClick={() => select(key)}
          >
            <i className={`ri-${icon}`} aria-hidden="true" />
            {label}
          </Button>
        ))}
        <span
          ref={marker}
          className="nps-moving-indicator settings-nav-indicator"
          aria-hidden="true"
        />
      </nav>
      {content}
    </main>
  );
}
