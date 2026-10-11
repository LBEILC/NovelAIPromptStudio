import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, X } from 'lucide-react';
import {
  ThemeProvider,
  Button,
  Input,
  Select,
  OptionGroup,
  Tabs,
  Switch,
  Checkbox,
  Slider,
  Stepper,
  Menu,
  ContextMenu,
  MenuItems,
  SuggestionList,
  Autocomplete,
  Popover,
  Dialog,
  DialogContent,
  NotificationProvider,
  NotificationContent,
  useNotifications,
  Tooltip,
  Banner,
  Progress,
  Tag,
  SelectionBar,
  EmptyState,
  ResizablePanel,
  Shortcut,
  iconProps,
  type MenuItem,
  type TagCategory,
  type ButtonProps,
} from '../ui';
import './showcase.css';
import '../fonts.css';
import 'virtual:misans.css';

const params = new URLSearchParams(location.search);
const theme =
  params.get('theme') === 'dark' ? 'dark' : params.get('theme') === 'system' ? 'system' : 'light';
const options = ['原文', '译文', '对照'].map((label) => ({ value: label, label }));
const samplers = ['Euler Ancestral', 'Euler', 'DPM++ 2M'].map((label) => ({ value: label, label }));
const categories: [string, TagCategory][] = [
  ['画师年代', 'artist-era'],
  ['角色组成', 'subject'],
  ['身份物种', 'identity'],
  ['外貌身体', 'body'],
  ['服装配饰', 'clothing'],
  ['动作表情', 'action'],
  ['环境背景', 'environment'],
  ['镜头光影', 'composition'],
  ['风格质量', 'style'],
  ['未分类', 'unsorted'],
];
const menu: MenuItem[] = [
  { id: 'edit', label: '编辑', shortcut: ['Enter'] },
  { id: 'copy', label: '复制 Tag', shortcut: ['Mod', 'C'] },
  { id: 'weight', label: '复制 Tag（含权重）' },
  { id: 'translation', label: '复制译文' },
  { id: 's1', separator: true },
  {
    id: 'move',
    label: '移动到',
    children: [
      { id: 'prompt', label: 'Prompt' },
      { id: 'reference', label: '参考' },
    ],
  },
  { id: 'translate', label: '翻译与分类' },
  { id: 'save', label: '存为常用块', disabled: true },
  { id: 's2', separator: true },
  { id: 'delete', label: '删除', danger: true, shortcut: ['Del'] },
];
const suggestions = [
  { id: '1', text: 'copper hair', translation: '铜色头发', count: '3.2k' },
  { id: '2', text: 'long copper hair', translation: '铜色长发', count: '410' },
  { id: '3', text: 'copper eyes', translation: '铜色眼睛', count: '96' },
];
function Section({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={wide ? 'nps-demo-wide' : undefined}>
      <h5>{title}</h5>
      {children}
    </section>
  );
}
function Row({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="nps-demo-row">
      {label && <span className="nps-demo-caption">{label}</span>}
      {children}
    </div>
  );
}
function Weight() {
  const [value, setValue] = useState(1.2);
  return (
    <Stepper
      value={value}
      onChange={setValue}
      min={-3}
      max={5}
      step={0.05}
      precision={2}
      label="权重"
      decreaseLabel="减少权重"
      increaseLabel="增加权重"
    />
  );
}
function EditContent({ close }: { close: () => void }) {
  const [category, setCategory] = useState('外貌身体');
  return (
    <>
      <label className="nps-demo-fieldrow">
        <span className="nps-help">Tag</span>
        <Input size="small" defaultValue="long copper hair" className="nps-demo-focus" />
      </label>
      <label className="nps-demo-fieldrow">
        <span className="nps-help">译文</span>
        <Input size="small" defaultValue="铜色长发" />
      </label>
      <div className="nps-demo-fieldrow">
        <span className="nps-help">分类</span>
        <Select
          size="small"
          label="分类"
          options={categories.map(([label]) => ({ label, value: label }))}
          value={category}
          onChange={setCategory}
        />
      </div>
      <div className="nps-demo-fieldrow">
        <span className="nps-help">权重</span>
        <Row>
          <Weight />
          <span className="nps-help">1 是普通权重</span>
        </Row>
      </div>
      <div className="nps-demo-edit-actions">
        <Button variant="danger" size="small" onClick={close}>
          删除
        </Button>
        <span>
          <Button variant="quiet" size="small" onClick={close}>
            取消
          </Button>
          <Button variant="ink" size="small" onClick={close}>
            完成
          </Button>
        </span>
      </div>
    </>
  );
}
const closeDialog = {
  title: '关闭已修改的标签？',
  cancelLabel: '取消',
  confirmLabel: '丢弃并关闭',
  destructive: true,
  children: '关闭后会丢弃这个标签里还没生成的改动，其他标签不受影响。图片文件本身不会被修改。',
};
function Showcase() {
  const [sampler, setSampler] = useState('Euler Ancestral');
  const [display, setDisplay] = useState('对照');
  const [tab, setTab] = useState('Prompt');
  const [off, setOff] = useState(false);
  const [on, setOn] = useState(true);
  const [checkOff, setCheckOff] = useState(false);
  const [checkOn, setCheckOn] = useState(true);
  const [slider, setSlider] = useState(0.62);
  const [query, setQuery] = useState('铜色');
  const [popover, setPopover] = useState(false);
  const [dialog, setDialog] = useState(params.get('probe') === 'dialog');
  const [width, setWidth] = useState(340);
  const [selected, setSelected] = useState(true);
  const anchor = useRef<HTMLButtonElement>(null);
  const notify = useNotifications();
  return (
    <main className="nps-demo-sheet" data-showcase="004">
      <Section title="按钮">
        <Row label="默认">
          <Button>复制 Prompt</Button>
          <Button className="nps-demo-hover">悬停</Button>
          <Button className="nps-demo-focus">焦点</Button>
          <Button disabled disabledReason="余额不足，暂时不能生成">
            不可用
          </Button>
        </Row>
        <Row label="墨色">
          <Button variant="ink">在工作台打开</Button>
          <Button variant="ink" className="nps-demo-hover">
            悬停
          </Button>
          <Button variant="ink" loading>
            导入中
          </Button>
        </Row>
        <Row label="朱砂">
          <Button variant="cinnabar">生成</Button>
          <Button variant="cinnabar" className="nps-demo-hover">
            悬停
          </Button>
          <Button variant="cinnabar" loading>
            生成中 2/4
          </Button>
          <span className="nps-help">整个界面只有"生成"用它</span>
        </Row>
        <Row label="安静">
          <Button variant="quiet">筛选</Button>
          <Button variant="quiet" className="nps-demo-hover">
            悬停
          </Button>
          <Button variant="quiet" size="small">
            小号
          </Button>
        </Row>
        <Row label="危险">
          <Button variant="danger">删除</Button>
          <Button variant="danger-outline">丢弃并关闭</Button>
          <span className="nps-help">只用文字或描边，不用实心红底</span>
        </Row>
      </Section>
      <Section title="输入与选择">
        <Row label="输入框">
          <Input placeholder="角色名称" aria-label="角色名称" />
          <Input defaultValue="黍" aria-label="角色名称" className="nps-demo-focus" />
        </Row>
        <Row label="出错">
          <Input error="角色名称不能为空" aria-label="角色名称" />
        </Row>
        <Row label="下拉">
          <Select
            options={samplers}
            value={sampler}
            onChange={setSampler}
            label="采样器"
            size="small"
          />
          <Weight />
        </Row>
        <Row label="选项">
          <OptionGroup label="默认显示" options={options} value={display} onChange={setDisplay} />
        </Row>
        <Row label="页签">
          <Tabs
            label="Prompt 的页签"
            items={['Prompt', '参数', '参考'].map((label) => ({
              value: label,
              label,
              content: null,
            }))}
            value={tab}
            onChange={setTab}
          />
        </Row>
        <Row label="开关">
          <Switch label="自动翻译新出现的 Tag 和段落" checked={off} onChange={setOff} />
          <Switch label="无人值守连续生成" checked={on} onChange={setOn} />
          <Checkbox label="记住这个选择" checked={checkOff} onChange={setCheckOff} />
          <Checkbox label="记住这个选择" checked={checkOn} onChange={setCheckOn} />
        </Row>
        <Row label="滑块">
          <Slider
            value={slider}
            onChange={setSlider}
            min={0}
            max={1}
            step={0.01}
            label="缩略图大小"
            format={(value) => value.toFixed(2)}
          />
        </Row>
      </Section>
      <Section title="Tag 的各种状态" wide>
        <Row>
          <Tag text="long hair" translation="长发" category="body" categoryLabel="外貌身体" />
          <Tag text="悬停" category="body" categoryLabel="外貌身体" className="nps-demo-hover" />
          <Tag
            text="long hair"
            translation="选中"
            category="body"
            categoryLabel="外貌身体"
            state="selected"
          />
          <Tag
            text="long hair"
            translation="有权重"
            category="body"
            categoryLabel="外貌身体"
            weight="1.40"
          />
          <Tag
            text="flat color"
            translation="负权重"
            category="style"
            categoryLabel="风格质量"
            weight="−2"
          />
          <Tag
            text="shu (arknights)"
            translation="翻译中…"
            categoryLabel="未分类"
            state="translating"
          />
          <Tag
            text="year 2026 ::"
            translation="多余的 :: 结束符"
            category="artist-era"
            categoryLabel="画师年代"
            state="syntax"
          />
          <Tag
            text="rain"
            translation="新增"
            category="environment"
            categoryLabel="环境背景"
            state="added"
          />
          <Tag
            text="umbrella"
            translation="移走"
            category="clothing"
            categoryLabel="服装配饰"
            state="removed"
          />
          <Tag
            text="solo"
            translation="被筛选隐藏"
            category="subject"
            categoryLabel="角色组成"
            state="filtered"
          />
          <Tag
            text="side braid"
            translation="拖动中"
            category="body"
            categoryLabel="外貌身体"
            state="dragging"
          />
          <Tag text="输入中文或英文" categoryLabel="" state="add" />
        </Row>
        <Row label="分类色">
          {categories.map(([label, category]) => (
            <Tag key={category} text={label} category={category} categoryLabel={label} />
          ))}
        </Row>
      </Section>
      <Section title="右键菜单与 Tag 提示">
        <div className="nps-demo-stack">
          <div className="nps-menu">
            <MenuItems items={menu} label="右键菜单" closeAll={() => {}} closeLevel={() => {}} />
          </div>
          <div className="nps-menu">
            <SuggestionList
              id="suggestion-preview"
              items={suggestions}
              active={0}
              onSelect={() => {}}
              directAdd={{ label: '直接添加"铜色"', onSelect: () => {} }}
            />
          </div>
        </div>
      </Section>
      <Section title="编辑一个 Tag">
        <div className="nps-popover">
          <EditContent close={() => {}} />
        </div>
      </Section>
      <Section title="对话框">
        <div className="nps-dialog">
          <DialogContent {...closeDialog} onCancel={() => {}} onConfirm={() => {}} />
        </div>
      </Section>
      <Section title="风险提示">
        <div className="nps-dialog">
          <DialogContent
            title="打开无人值守连续生成？"
            cancelLabel="取消"
            confirmLabel="我了解，打开"
            onCancel={() => {}}
            onConfirm={() => {}}
          >
            打开后，软件会按队列一张接一张地生成，中间不需要你操作。NovelAI 的接口说明里写着：
            <blockquote className="nps-quote">
              "all generation requests must be initiated by a human action"
            </blockquote>
            这样使用是否符合它的服务条款，由你自行判断并承担后果。
          </DialogContent>
        </div>
      </Section>
      <Section title="通知、提示与多选操作条">
        <Row>
          <span className="nps-toast">
            <NotificationContent notice={{ text: '已复制 52 个 Tag' }} />
          </span>
          <span className="nps-toast">
            <NotificationContent
              notice={{ text: '已移入回收站', action: { label: '撤销', onClick: () => {} } }}
            />
          </span>
        </Row>
        <Row>
          <span className="nps-tip">复制当前筛选后可见的正向 Prompt</span>
          <span className="nps-tip">
            <Shortcut keys={['Mod', 'K']} />
          </span>
        </Row>
        <div className="nps-demo-selection">
          <SelectionBar visible={selected} label="已选 3 个 Tag">
            <Button variant="quiet" size="small">
              复制
            </Button>
            <Button variant="quiet" size="small">
              移动到
            </Button>
            <Button variant="quiet" size="small">
              翻译与分类
            </Button>
            <Button variant="danger" size="small">
              删除
            </Button>
            <Button variant="quiet" size="small" onClick={() => setSelected(false)}>
              取消
            </Button>
          </SelectionBar>
        </div>
      </Section>
      <Section title="状态横幅与生成进度">
        <Row>
          <Banner>这张图里没有检测到 Vibe。</Banner>
        </Row>
        <Row>
          <Banner tone="warn">这张图片已被移动或删除。可以关闭这个标签，其他标签不受影响。</Banner>
        </Row>
        <Row>
          <Banner
            tone="danger"
            action={
              <Button size="small" variant="quiet">
                查看余额
              </Button>
            }
          >
            没有生成：Anlas 余额不足。
          </Banner>
        </Row>
        <Row>
          <span>正在生成第 2 张，共 4 张</span>
          <Button variant="quiet" size="small" className="nps-demo-end">
            取消剩下的
          </Button>
        </Row>
        <Progress value={38} label="正在生成第 2 张，共 4 张" />
      </Section>
      <Section title="可以实际操作的示例" wide>
        <Row>
          <Menu items={menu} label="右键菜单" />
          <ContextMenu items={menu} label="右键菜单">
            <Tag text="long hair" translation="长发" category="body" categoryLabel="外貌身体" />
          </ContextMenu>
          <Button ref={anchor} onClick={() => setPopover(true)}>
            编辑一个 Tag
          </Button>
          <Popover
            open={popover}
            onClose={() => setPopover(false)}
            anchor={anchor}
            label="编辑一个 Tag"
          >
            <EditContent close={() => setPopover(false)} />
          </Popover>
          <Button onClick={() => setDialog(true)}>关闭已修改的标签？</Button>
          <Dialog
            open={dialog}
            {...closeDialog}
            onCancel={() => setDialog(false)}
            onConfirm={() => setDialog(false)}
          />
          <Tooltip text="复制当前筛选后可见的正向 Prompt">
            <Button onClick={() => notify({ text: '已复制 52 个 Tag' })}>复制 Prompt</Button>
          </Tooltip>
          <Button
            onClick={() =>
              notify({ text: '已移入回收站', action: { label: '撤销', onClick: () => {} } })
            }
          >
            删除
          </Button>
          <Autocomplete
            label="Tag"
            items={suggestions.filter(
              (item) => item.text.includes(query) || item.translation.includes(query),
            )}
            value={query}
            onChange={setQuery}
            onSelect={(item) => setQuery(item.text)}
            directAdd={{ label: `直接添加"${query}"`, onSelect: () => {} }}
          />
        </Row>
        <Row>
          <div className="nps-menu">
            <div role="listbox" aria-label="采样器">
              {samplers.map((item) => (
                <div
                  key={item.value}
                  role="option"
                  aria-selected={item.value === sampler}
                  className={`nps-menu-item ${item.value === sampler ? 'nps-current' : ''}`}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
          <Input
            size="small"
            aria-label="角色名称"
            placeholder="角色名称"
            prefix={<Search {...iconProps} />}
            suffix={<X {...iconProps} />}
          />
          <Input disabled aria-label="角色名称" value="黍" />
          <Switch label="动效" checked={false} onChange={() => {}} disabled />
          <Switch label="动效" checked onChange={() => {}} disabled />
          <Checkbox label="记住这个选择" checked onChange={() => {}} disabled />
          <Checkbox label="记住这个选择" checked={false} onChange={() => {}} disabled />
          <Switch label="动效" checked onChange={() => {}} className="nps-demo-focus" />
          <Checkbox label="记住这个选择" checked onChange={() => {}} className="nps-demo-focus" />
          <Shortcut keys={['Mod', 'V']} />
        </Row>
        <Banner tone="ok">已复制 52 个 Tag</Banner>
        {(
          [
            'default',
            'ink',
            'cinnabar',
            'quiet',
            'danger',
            'danger-outline',
          ] satisfies ButtonProps['variant'][]
        ).map((variant) => (
          <Row key={variant}>
            <Button variant={variant}>默认</Button>
            <Button variant={variant} size="small">
              小号
            </Button>
            <Button variant={variant} className="nps-demo-hover">
              悬停
            </Button>
            <Button variant={variant} className="nps-demo-active">
              按下
            </Button>
            <Button variant={variant} className="nps-demo-focus">
              焦点
            </Button>
            <Button variant={variant} disabled disabledReason="余额不足，暂时不能生成">
              不可用
            </Button>
            <Button variant={variant} loading>
              导入中
            </Button>
          </Row>
        ))}
      </Section>
      <Section title="空状态" wide>
        <EmptyState
          graphic={
            <span className="nps-demo-empty-mark">
              {'{'}
              <span />
              {'}'}
            </span>
          }
          title="把一张 NovelAI 图片拖到这里"
          description="软件会读出它的 Prompt 和参数。可以同时打开多张，每张一个标签。"
          actions={
            <>
              <Button variant="ink">打开图片</Button>
              <Button>从剪贴板打开</Button>
              <Shortcut keys={['Mod', 'V']} />
            </>
          }
          fine="打开图片不会修改原图，也不会自动存进图片库。"
        />
      </Section>
      <Section title="可拖宽的面板" wide>
        <ResizablePanel
          width={width}
          onWidthChange={setWidth}
          defaultWidth={340}
          min={196}
          max={520}
          label="Prompt"
        >
          <Input aria-label="Tag" defaultValue="long copper hair" />
          <Row>
            <Tag text="long hair" translation="长发" category="body" categoryLabel="外貌身体" />
            <span className="nps-mono">{width}</span>
          </Row>
        </ResizablePanel>
      </Section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme} motion={params.get('motion') === 'off' ? 'off' : 'system'}>
      <NotificationProvider>
        <Showcase />
      </NotificationProvider>
    </ThemeProvider>
  </StrictMode>,
);
