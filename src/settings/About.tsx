// 关于与更新（doc/design.md 2.11）：版本、更新（发现新版本时展开横幅和更新说明）、更新日志、快捷键、数据与隐私、反馈、字体与开源组件。
// 更新日志只读：构建时把仓库里的 release-notes/*.json（1.2.0 起才有）打包进来，离线也能看，不联网。
import { Fragment, lazy, Suspense, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import {
  lastUpdateCheckLabel,
  releaseCounts,
  type ReleaseNotes as Notes,
} from '../lib/releaseNotes.js';
import { Icon, Kbd, Logo, Seg, Switch } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { useUpdates } from '../state/updates';
import { StructuredReleaseNotes } from './StructuredReleaseNotes';
import { Expand, Row, SetPage, errorText } from './parts';
import misansLicense from '../../LICENSES/MiSans/LICENSE?raw';
import newsreaderLicense from '../../LICENSES/Newsreader/LICENSE?raw';
import plexLicense from '../../LICENSES/IBMPlexMono/LICENSE?raw';
import projectLicense from '../../LICENSE?raw';
import remixLicense from '../../LICENSES/RemixIcon/LICENSE?raw';
import dictionaryLicense from '../../third_party/DanbooruSearchOnline/LICENSE?raw';

const ReleaseNotes = lazy(() => import('./ReleaseNotes.jsx'));

export function feedbackDiagnostics(version = '—', platform = '') {
  return `NovelAI Prompt Studio v${version}\n平台：${({ darwin: 'macOS', win32: 'Windows', linux: 'Linux' } as Record<string, string>)[platform] || platform || '未知平台'}`;
}

// 快捷键按在哪里用分成三组；以产品实际绑定的为准
const KEYS: [string, [string, ...string[][]][]][] = [
  [
    '通用',
    [
      ['打开图片；在图片库里是导入', ['Mod', 'I']],
      ['从剪贴板打开或导入图片', ['Mod', 'V']],
      ['聚焦搜索框', ['Mod', 'K']],
      ['下一个 / 上一个标签页', ['Mod', 'Tab'], ['Mod', 'Shift', 'Tab']],
      ['关闭当前标签页', ['Mod', 'W']],
    ],
  ],
  [
    '工作台',
    [
      ['切换按块 / 按文本编辑', ['Mod', 'E']],
      ['移动当前 Tag 或块', ['Alt', '方向键']],
      ['在这一版的图之间切换', ['←'], ['→']],
      ['取消选择', ['Esc']],
    ],
  ],
  [
    '图片库',
    [
      ['在图片之间移动', ['方向键']],
      ['在工作台打开', ['Enter']],
      ['看大图', ['Space']],
      ['大图里换一张 / 换一组', ['← →'], ['↑ ↓']],
      ['全选图片', ['Mod', 'A']],
      ['取消选择；关闭大图', ['Esc']],
    ],
  ],
];
const NET = [
  '生成图片：用你的持久令牌把提示词和参数发给 NovelAI；带 Vibe 的图会带上图里的 Vibe 编码',
  '查询余额：打开软件、每次生成结束和点“刷新”时，向 NovelAI 查询 Anlas 余额和用量',
  '检查和下载更新：访问 GitHub。自动检查可以在上面关掉；更新说明里带图片时，会从图片所在的网站加载',
  '翻译与分类：内置词典里没有的 Tag，会把 Tag 的名字发给 Danbooru，查它属于哪一类；配置了 AI 服务时，还没有译文的 Tag 会再发给你配置的服务',
  '起名：把这张图的提示词发给你配置的 AI 服务',
  '段落的“翻译成中文”“根据中文改写英文”：把这一段文字发给你配置的 AI 服务',
  '整理提示词：把这一版的提示词发给你配置的 AI 服务',
  '用 ChatGPT 账号时：上面发给 AI 服务的内容发给 OpenAI（api.openai.com），算在你登录的账号的套餐里；登录在浏览器里完成，经过 auth.openai.com。打开“用 Codex 的方式登录”后改发到 Codex 用的地址（chatgpt.com），并向它查询剩余额度',
  '读取模型列表、测试连接：只和你配置的 AI 服务通信，不带你的提示词',
  '报告问题、提出建议：在浏览器里打开 GitHub，不自动附带任何数据',
];
const cmpVersion = (a: string, b: string) => {
  const x = a.split('.').map(Number),
    y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
/** 新的在前 */
const CHANGELOG = (
  Object.values(
    import.meta.glob('../../release-notes/*.json', { eager: true, import: 'default' }),
  ) as Notes[]
).sort((a, b) => cmpVersion(b.version, a.version));
const LICENSES = [
  ['MiSans VF 4.003', misansLicense],
  ['Newsreader', newsreaderLicense],
  ['IBM Plex Mono', plexLicense],
  ['NovelAI Prompt Studio', projectLicense],
  ['Remix Icon', remixLicense],
  ['DanbooruSearchOnline', dictionaryLicense],
];
const ISSUES = 'https://github.com/LBEILC/NovelAIPromptStudio/issues/new';

export function About({ onInstallUpdate }: { onInstallUpdate: () => Promise<unknown> }) {
  const notify = useNotifications();
  const u = useUpdates();
  const [notesOpen, setNotesOpen] = useState(true);
  const [licenses, setLicenses] = useState(false);
  const [log, setLog] = useState<string | null>(null);
  const st = u.state;
  const open = (url?: string) =>
    void invokeUI('updates.open-release', { url }).then(
      () => notify({ text: '已在浏览器中打开', tone: 'success' }),
      (e) => notify({ text: errorText(e), tone: 'error' }),
    );
  const copy = async () => {
    try {
      await writeClipboardText(feedbackDiagnostics(st?.currentVersion, st?.platform));
      notify({ text: '已复制诊断信息', tone: 'success' });
    } catch {
      notify({ text: '复制诊断信息失败', tone: 'error' });
    }
  };
  const checking = st?.phase === 'checking';
  const found =
    !!st && (st.hasUpdate || ['available', 'downloading', 'downloaded'].includes(st.phase));
  const failed = !found && !checking && !!(u.error || st?.error);
  const manual = st?.platform === 'darwin' && st.updateMode === 'manual';
  const p = Math.round(st?.progress || 0);
  const banner = found && st && (
    <>
      <div className={`banner info upd ${st.phase === 'downloading' ? 'down' : ''}`}>
        <div className="upd-main">
          <b>
            {st.phase === 'downloaded'
              ? `新版本 ${st.latestVersion} 已下载`
              : `发现新版本 ${st.latestVersion}`}
          </b>
          <small>
            {st.phase === 'downloaded'
              ? '重启后安装，工作台中的标签页和草稿会保留'
              : st.phase === 'downloading'
                ? `正在下载 · ${p}%`
                : manual
                  ? 'macOS 上需要到下载页手动安装（安装包没有签名）'
                  : st.structuredNotes
                    ? releaseCounts(st.structuredNotes)
                    : ''}
          </small>
          <div className="progress ink">
            <i
              style={{
                width: `${st.phase === 'downloaded' ? 100 : st.phase === 'downloading' ? p : 0}%`,
              }}
            />
          </div>
        </div>
        <span className="row">
          <button
            className="btn quiet sm"
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen(!notesOpen)}
          >
            {notesOpen ? '收起说明' : '更新说明'}
          </button>
          {st.phase === 'downloaded' ? (
            <button
              className="btn ink sm"
              disabled={!st.canInstallUpdate}
              onClick={() => void onInstallUpdate()}
            >
              重启并安装
            </button>
          ) : st.phase === 'downloading' ? (
            <button className="btn sm loading" disabled>
              <Icon name="loader-4-line" />
              下载中
            </button>
          ) : manual ? (
            <button className="btn ink sm" onClick={() => open(st.releaseUrl)}>
              前往下载页
            </button>
          ) : (
            <button
              className="btn ink sm"
              disabled={!st.canDownloadUpdate}
              data-tip={!st.canDownloadUpdate ? '开发模式不下载更新' : undefined}
              onClick={() => void u.download()}
            >
              下载
            </button>
          )}
        </span>
      </div>
      <Expand open={notesOpen}>
        {st.structuredNotes ? (
          <StructuredReleaseNotes notes={st.structuredNotes} />
        ) : (
          <Suspense fallback={null}>
            <ReleaseNotes>{st.notes || ''}</ReleaseNotes>
          </Suspense>
        )}
      </Expand>
    </>
  );
  return (
    <SetPage title="关于与更新">
      <div className="about-head">
        <span className="logo about-logo">
          <Logo />
        </span>
        <div>
          <div className="about-name">NovelAI Prompt Studio</div>
          <span className="mono selectable about-ver">版本 {st?.currentVersion || '—'}</span>
        </div>
      </div>
      <div className="help">非官方工具，与 NovelAI 没有隶属关系。</div>
      <h2>更新</h2>
      <Row title="自动检查更新" help="启动后检查一次，不会自动安装">
        <Switch label="自动检查更新" on={u.autoCheck} onChange={(v) => void u.changeAutoCheck(v)} />
      </Row>
      <Row
        title={
          checking
            ? '正在检查更新…'
            : found
              ? `发现新版本 ${st!.latestVersion}`
              : failed
                ? '检查更新失败'
                : '已是最新版本'
        }
        help={[
          <>
            当前版本 <span className="mono selectable">{st?.currentVersion || '—'}</span> ·{' '}
            {failed ? `${u.error || st?.error} · ` : ''}上次检查：
            {lastUpdateCheckLabel(st?.checkedAt)}
          </>,
          st && !st.packaged && '开发模式只检查官方稳定版本，不会下载或安装更新。',
          st?.packaged &&
            manual &&
            '当前 macOS 版本未签名，无法在应用内直接安装更新。发现新版本后，请从官方 Release 下载对应安装包并手动替换应用。',
        ]}
      >
        <button
          className={`btn sm ${checking ? 'loading' : ''}`}
          disabled={checking || found || !st}
          data-tip={found ? '已发现新版本' : undefined}
          onClick={() => void u.check()}
        >
          {checking && <Icon name="loader-4-line" />}
          {checking ? '检查中' : failed ? '重试' : '检查更新'}
        </button>
      </Row>
      <Expand open={found}>{banner}</Expand>
      {CHANGELOG.length > 0 && (
        <Row title="更新日志" help={`${CHANGELOG.at(-1)!.version} 以来每个版本的更新说明`}>
          <button className="btn sm" onClick={() => setLog(CHANGELOG[0].version)}>
            查看
          </button>
        </Row>
      )}
      <h2>快捷键</h2>
      <div className="help">macOS 上 Ctrl 对应 Command。在输入框里，Ctrl V 仍然是普通的粘贴。</div>
      {KEYS.map(([group, rows]) => (
        <div className="key-group" key={group}>
          <span className="label">{group}</span>
          {rows.map(([title, ...binds]) => (
            <div className="setrow keyrow" key={title}>
              <div>{title}</div>
              <span className="keys">
                {binds.map((keys, i) => (
                  <Fragment key={i}>
                    {i > 0 && <span className="key-sep">/</span>}
                    {keys.map((k) => (
                      <Kbd key={k} keys={k} />
                    ))}
                  </Fragment>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
      <h2>数据与隐私</h2>
      <Row
        title="图片和图片库的数据只存在这台电脑上"
        help="位置见“图片库”那一页。软件不会上传图片"
      />
      <Row title="这些时候会联网，都不会发送你的图片" help={NET} />
      <Row
        title="命令行工具只在这台电脑上和软件通信"
        help="不开网络端口；Agent 能做什么见“Agent”那一页"
      />
      <Row
        title="API Key、ChatGPT 登录信息和 NovelAI 持久令牌加密后保存在这台电脑上"
        help="用系统自带的加密能力加密，软件不保存明文；诊断信息和报告问题都不会带上它们"
      />
      <h2>反馈与支持</h2>
      <Row title="报告问题或提出建议" help="会在浏览器里打开 GitHub，不会自动附带任何数据">
        <span className="row">
          <button
            className="btn sm"
            onClick={() => open(`${ISSUES}?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20`)}
          >
            报告问题
          </button>
          <button
            className="btn sm"
            onClick={() => open(`${ISSUES}?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`)}
          >
            提出建议
          </button>
        </span>
      </Row>
      <Row title="诊断信息" help="只包含软件版本和操作系统，不包含图片、提示词和路径">
        <button className="btn quiet sm" onClick={() => void copy()}>
          复制
        </button>
      </Row>
      <h2>字体与开源组件</h2>
      <Row
        title="界面字体 MiSans · 段落字体 Newsreader · 等宽字体 IBM Plex Mono"
        help="内置 Tag 词典来自 DanbooruSearchOnline"
      >
        <button className="btn quiet sm" onClick={() => setLicenses(true)}>
          查看声明
        </button>
      </Row>
      <Dialog
        open={licenses}
        onClose={() => setLicenses(false)}
        label="字体与开源组件"
        className="lic-dlg"
      >
        <h3>字体与开源组件</h3>
        <p>
          界面字体 MiSans VF（版本
          4.003），版权归北京小米移动软件有限公司所有，按其许可协议随本软件原样分发。段落字体
          Newsreader 与等宽字体 IBM Plex Mono 按 SIL Open Font License 1.1 分发。
        </p>
        <div className="lic-list scroll">
          {LICENSES.map(([name, text]) => (
            <details key={name} className="lic">
              <summary>
                <Icon name="arrow-right-s-line" />
                {name}
              </summary>
              <pre className="selectable">{text}</pre>
            </details>
          ))}
        </div>
        <div className="acts">
          <button className="btn ink" onClick={() => setLicenses(false)}>
            关闭
          </button>
        </div>
      </Dialog>
      <Dialog open={!!log} onClose={() => setLog(null)} label="更新日志" className="lic-dlg rn-log">
        <h3>更新日志</h3>
        <Seg
          label="版本"
          className="rn-log-v"
          items={CHANGELOG.map(
            (n) =>
              [
                n.version,
                n.version === st?.currentVersion ? `${n.version} · 当前` : n.version,
              ] as const,
          )}
          value={log || CHANGELOG[0]?.version || ''}
          onChange={setLog}
        />
        <div className="lic-list scroll rn-log-body">
          {CHANGELOG.filter((n) => n.version === log).map((n) => (
            <StructuredReleaseNotes key={n.version} notes={n} />
          ))}
        </div>
        <div className="acts">
          <button className="btn ink" onClick={() => setLog(null)}>
            关闭
          </button>
        </div>
      </Dialog>
    </SetPage>
  );
}
