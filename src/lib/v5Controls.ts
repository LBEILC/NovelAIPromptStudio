// V5 控制词（doc/design.md 待定表，10-25 用户选方案 B）：写在提示词里、NovelAI V5 认得的特殊 Tag。
// 它们和普通 Tag 一样留在提示词里原样发出去；界面只是认出来、给中文名、在浮层里换档位、在面板里点选添加。
// 依据 doc/research/novelai-v5-补充.md（官方 Tagging 文档和视频画面核对过拼写；画面效果未经生成实测）。

export interface ControlTag {
  /** 官方写法 */
  tag: string;
  /** 档位或种类的短名，用在面板和"复杂度·高"这样的中文名里 */
  short: string;
  /** 一句话说明，写在编辑浮层里 */
  help: string;
}
export interface ControlGroup {
  id: string;
  label: string;
  /** 同一组只能写一个（复杂度、年代） */
  exclusive: boolean;
  items: ControlTag[];
}

export const CONTROL_GROUPS: ControlGroup[] = [
  {
    id: 'complexity',
    label: '复杂度',
    exclusive: true,
    items: [
      { tag: 'low complexity', short: '低', help: '画面简单，可能明显改变画风' },
      { tag: 'medium complexity', short: '中', help: '中等复杂度；和 Effort 的 Medium 无关' },
      { tag: 'high complexity', short: '高', help: '一般精细插画的起点，常放在提示词末尾' },
      { tag: 'ultra complexity', short: '极高', help: '极高复杂度，会改变画风，不等于更清晰' },
    ],
  },
  {
    id: 'alpha',
    label: '透明',
    exclusive: false,
    items: [
      { tag: 'transparent background', short: '透明背景', help: '直接生成带透明背景的图' },
      { tag: 'has alpha', short: '透明通道', help: '画面带透明通道，常接在光效、粒子之后' },
      { tag: 'alpha transparency', short: '半透明', help: '让物体或特效本身半透明' },
    ],
  },
  {
    id: 'era',
    label: '年代感',
    exclusive: true,
    items: [
      { tag: 'meta:novel era', short: '偏旧', help: '画风偏旧一些；实际效果可能不明显' },
      { tag: 'meta:golden era', short: '偏新', help: '画风稍偏现代；实际效果可能不明显' },
    ],
  },
  {
    id: 'vn',
    label: '视觉小说',
    exclusive: false,
    items: [
      { tag: 'visual novel art', short: '整体风格', help: '视觉小说的整体画风' },
      { tag: 'visual novel bg', short: '背景', help: '视觉小说背景素材' },
      { tag: 'visual novel cg', short: '剧情 CG', help: '视觉小说的剧情事件图' },
      { tag: 'visual novel sprite', short: '立绘', help: '角色立绘素材，可搭配透明背景' },
      { tag: 'visual novel chibi', short: 'Q 版', help: 'Q 版角色素材，可搭配透明背景' },
    ],
  },
  {
    id: 'other',
    label: '其他',
    exclusive: false,
    items: [
      { tag: 'depthness', short: '明暗层次', help: '加强明暗塑造的深度' },
      { tag: 'attractive male', short: '男性魅力', help: '让男性角色的外貌更有吸引力' },
    ],
  },
];

export interface ControlMatch {
  group: ControlGroup;
  item: ControlTag;
  /** 中文名，例如"复杂度·高" */
  name: string;
  /** 写法和官方不完全一样（多了空格、大小写、下划线），浮层里给"改成官方写法" */
  nonstandard: boolean;
}

// 认的时候不分大小写，下划线当空格，"meta: x" 当 "meta:x"
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\s+/g, ' ')
    .replace(/^meta\s*:\s*/, 'meta:');
const INDEX = new Map(
  CONTROL_GROUPS.flatMap((group) =>
    group.items.map((item) => [norm(item.tag), { group, item }] as const),
  ),
);
// 档位类（复杂度、年代感、视觉小说）带组名；透明和其他的短名本身就说得清
const nameOf = (group: ControlGroup, item: ControlTag) =>
  group.id === 'alpha' || group.id === 'other' ? item.short : `${group.label}·${item.short}`;

/** 这个 Tag 是不是 V5 控制词；不是就返回 null */
export function matchControl(tag: string | null | undefined): ControlMatch | null {
  if (!tag) return null;
  const hit = INDEX.get(norm(tag));
  if (!hit) return null;
  return { ...hit, name: nameOf(hit.group, hit.item), nonstandard: tag.trim() !== hit.item.tag };
}

export const isV5Model = (model: string | null | undefined) =>
  !!model && model.startsWith('nai-diffusion-5');

/** 同一个互斥组里写了不止一个：返回这些 Tag 的标识，用来画黄框 */
export function controlConflicts<T extends { key: string; tag: { tag: string } }>(
  list: T[],
): Map<string, ControlGroup> {
  const byGroup = new Map<ControlGroup, T[]>();
  for (const e of list) {
    const m = matchControl(e.tag.tag);
    if (m?.group.exclusive) byGroup.set(m.group, [...(byGroup.get(m.group) || []), e]);
  }
  const out = new Map<string, ControlGroup>();
  for (const [group, items] of byGroup) {
    // 同一个词写了两遍不算冲突，要有两种不同的档位
    if (new Set(items.map((x) => norm(x.tag.tag))).size < 2) continue;
    for (const x of items) out.set(x.key, group);
  }
  return out;
}

/** 补全：输入的中文或英文能对上哪些控制词（按中文名、组名、英文） */
export function suggestControls(query: string, limit = 4) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: { tag: string; translation: string }[] = [];
  for (const group of CONTROL_GROUPS)
    for (const item of group.items) {
      const name = nameOf(group, item);
      const hay = [item.tag, name, group.label, item.short].join(' ').toLowerCase();
      if (hay.includes(q) || (q.length > 1 && norm(item.tag).startsWith(norm(q))))
        out.push({ tag: item.tag, translation: `${name} · V5` });
    }
  return out.slice(0, limit);
}
