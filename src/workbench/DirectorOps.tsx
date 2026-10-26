// 导演工具（doc/design.md 2.49，1.8.7）：操作条上"扩图"后面一个按钮，点开一个浮层，做法同增强。
// 上面六种工具选一种，上色和换表情多几样参数；下面写送去的尺寸和价格，点"开始"才发。
// 不在菜单里点一下就发：去背景、去杂物一次 65 Anlas，菜单误点太容易。右键菜单的子菜单只是带着选好的工具打开浮层。
// 结果是新的一版（去背景一版三张：抠图、补全、混合），进度走生成队列。中转站不可用。
import { useEffect, useState } from 'react';
import { Icon, Seg } from '../kit/controls';
import { Pop } from '../kit/layer';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import { Dropdown } from '../settings/parts';
import type { DirectorEmotion, DirectorTool } from '../shared/generation';
import { useGeneration } from '../state/generation';

type Estimate = Awaited<ReturnType<typeof invokeUI<'generate.estimate-director'>>>;
type Defry = 0 | 1 | 2 | 3 | 4 | 5;

export const DIRECTOR_TOOLS: { id: DirectorTool; name: string; icon: string; help: string }[] = [
  {
    id: 'bg-removal',
    name: '去背景',
    icon: 'scissors-cut-line',
    help: '去掉背景留下人物，得到三张：抠图、补全被挡住的部分、两者混合',
  },
  { id: 'lineart', name: '线稿', icon: 'pen-nib-line', help: '转成干净的线稿，白底' },
  { id: 'sketch', name: '草图', icon: 'pencil-line', help: '转成铅笔草图，背景也一起' },
  {
    id: 'colorize',
    name: '上色',
    icon: 'palette-line',
    help: '给线稿或草图上色，可以写想要的颜色',
  },
  {
    id: 'emotion',
    name: '换表情',
    icon: 'emotion-happy-line',
    help: '只改脸上的表情，适合正面、清楚的单人脸',
  },
  {
    id: 'declutter',
    name: '去杂物',
    icon: 'eraser-line',
    help: '自动去掉画面里杂乱的小东西；要去掉指定的东西用局部重绘',
  },
];
/** 去背景、去杂物按三倍计价，有 Opus 也收费 */
const PRICEY = new Set<DirectorTool>(['bg-removal', 'declutter']);
// 官方的 24 种表情，按官方顺序
const EMOTIONS: [DirectorEmotion, string][] = [
  ['neutral', '平静'],
  ['happy', '开心'],
  ['sad', '难过'],
  ['angry', '生气'],
  ['scared', '害怕'],
  ['surprised', '惊讶'],
  ['tired', '疲惫'],
  ['excited', '兴奋'],
  ['nervous', '紧张'],
  ['thinking', '思考'],
  ['confused', '困惑'],
  ['shy', '害羞'],
  ['disgusted', '嫌弃'],
  ['smug', '得意'],
  ['bored', '无聊'],
  ['laughing', '大笑'],
  ['irritated', '烦躁'],
  ['aroused', '动情'],
  ['embarrassed', '尴尬'],
  ['worried', '担心'],
  ['love', '喜爱'],
  ['determined', '坚定'],
  ['hurt', '受伤'],
  ['playful', '调皮'],
];
// 接口的 defry 0–5：0 最强，越大越弱（越接近原图）
const STRENGTH: [string, string, string][] = [
  ['0', '正常', '默认，变化最明显'],
  ['1', '稍弱', ''],
  ['2', '弱', ''],
  ['3', '更弱', ''],
  ['4', '很弱', ''],
  ['5', '最弱', '变化最小，最接近原图'],
];

export function DirectorOps({
  tabId,
  imageId,
  width,
  height,
  off,
  open,
  onOpen,
  tool,
  onTool,
}: {
  tabId: string;
  imageId: string;
  width?: number;
  height?: number;
  off?: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  tool: DirectorTool;
  onTool: (tool: DirectorTool) => void;
}) {
  const notify = useNotifications();
  const relay = useGeneration().settings.connection === 'relay';
  const [prompt, setPrompt] = useState('');
  const [extra, setExtra] = useState('');
  const [emotion, setEmotion] = useState<DirectorEmotion>('happy');
  const [defry, setDefry] = useState<Defry>(0);
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = () => ({
    tabId,
    imageId,
    tool,
    ...(tool === 'colorize' ? { prompt: prompt.trim(), defry } : {}),
    ...(tool === 'emotion' ? { emotion, prompt: extra.trim(), defry } : {}),
  });
  // 价格只和工具、尺寸有关；上色的提示词、强度变了不用重新估
  useEffect(() => {
    if (!open || relay) return;
    let live = true;
    setError('');
    setEst(null);
    void invokeUI('generate.estimate-director', {
      tabId,
      imageId,
      tool,
      // 换表情估价也要带上选的表情
      ...(tool === 'emotion' ? { emotion } : {}),
    })
      .then((r) => live && setEst(r))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [open, relay, tabId, imageId, tool, emotion]);
  const go = async () => {
    if (busy || !est || relay) return;
    setBusy(true);
    try {
      await invokeUI('generate.director', input());
      onOpen(false);
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const meta = DIRECTOR_TOOLS.find((t) => t.id === tool)!;
  const price = relay ? '' : !est ? '…' : est.free ? '免费' : `${est.anlas} Anlas`;
  const from = width && height ? `${width} × ${height}` : '';
  const sent = est ? `${est.width} × ${est.height}` : '';
  return (
    <>
      <button
        className={`btn quiet sm ${off || relay ? 'is-off' : ''} ${open ? 'open' : ''}`}
        data-trigger="op-director"
        data-feature="director"
        aria-expanded={open}
        aria-label="导演工具"
        {...(off || relay
          ? {
              'aria-disabled': true,
              'data-tip': off || '中转站不支持导演工具',
              onClick: () => {},
            }
          : {
              'data-tip': '导演工具：去背景、线稿、上色、换表情……',
              onClick: () => onOpen(!open),
            })}
      >
        <Icon name="clapperboard-line" />
        <span className="lbl">导演工具</span>
      </button>
      <Pop
        open={open}
        onClose={() => onOpen(false)}
        anchor='[data-trigger="op-director"]'
        trigger='[data-trigger="op-director"]'
        place="above-left"
        enter="pop-up"
        className="popover op-pop dir-pop"
        label="导演工具"
      >
        <div className="op-h">
          <b>导演工具</b>
          <span className="help">把这张图转一转，结果是新的一版，提示词照旧是这张图那一版的</span>
        </div>
        <div className="dir-tools" role="radiogroup" aria-label="工具">
          {DIRECTOR_TOOLS.map((t) => (
            <button
              key={t.id}
              className={`dir-tool ${tool === t.id ? 'on' : ''}`}
              role="radio"
              aria-checked={tool === t.id}
              data-director-tool={t.id}
              onClick={() => onTool(t.id)}
            >
              <Icon name={t.icon} />
              <span>{t.name}</span>
              {PRICEY.has(t.id) && <small>较贵</small>}
            </button>
          ))}
        </div>
        <span className="help dir-help">{meta.help}</span>
        {tool === 'colorize' && (
          <>
            <div className="frow">
              <span className="label">颜色</span>
              <input
                className="field sm"
                value={prompt}
                placeholder="可选，比如 blue hair, red dress"
                aria-label="上色提示词"
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="frow">
              <span className="label">强度</span>
              <Seg
                label="强度"
                items={STRENGTH.map(([k, n, tip]) => [k, n, tip] as const)}
                value={String(defry)}
                onChange={(v) => setDefry(Number(v) as Defry)}
              />
            </div>
          </>
        )}
        {tool === 'emotion' && (
          <>
            <div className="frow">
              <span className="label">表情</span>
              <Dropdown
                label="表情"
                className="dir-dd"
                value={EMOTIONS.find(([k]) => k === emotion)?.[1]}
                menuClass="dir-emotions"
                items={EMOTIONS.map(([k, n]) => ({
                  label: n,
                  hint: k,
                  checked: k === emotion,
                  onSelect: () => setEmotion(k),
                }))}
              />
            </div>
            <div className="frow">
              <span className="label">强度</span>
              <Seg
                label="强度"
                items={STRENGTH.map(([k, n, tip]) => [k, n, tip] as const)}
                value={String(defry)}
                onChange={(v) => setDefry(Number(v) as Defry)}
              />
            </div>
            <div className="frow">
              <span className="label">补充</span>
              <input
                className="field sm"
                value={extra}
                placeholder="可选，比如 blush, tears"
                aria-label="换表情的附加提示词"
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="op-size">
          {from && <span className="mono muted">{from}</span>}
          {from && sent && <Icon name="arrow-right-line" />}
          {sent && <span className="mono">{sent}</span>}
          {tool === 'bg-removal' && <span className="muted">· 3 张</span>}
        </div>
        <div className="row op-foot">
          <span className="op-price">
            <b>{price}</b>
            {relay ? (
              <span className="help danger">中转站不支持导演工具</span>
            ) : error ? (
              <span className="help danger">{error}</span>
            ) : PRICEY.has(tool) ? (
              <span className="help">{meta.name}按三倍计价，有 Opus 也收费</span>
            ) : null}
          </span>
          <span className="sp" />
          <button
            className={`btn ink sm ${busy ? 'loading' : ''}`}
            disabled={busy || !est || relay}
            onClick={() => void go()}
          >
            {busy && <Icon name="loader-4-line" />}
            {meta.name}
          </button>
        </div>
      </Pop>
    </>
  );
}
