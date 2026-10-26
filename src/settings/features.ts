// 功能一览（doc/design.md 2.36，1.8.2）：人工维护的一份，帮助页和引导最后一页共用。
// 每次发版写更新说明时，新功能在这里补一行（功能名 + 一句话 + 在哪 + 跳到哪）。不从更新说明自动生成：那边的标题是"这次改了什么"的写法。
// 1.8.4（2.40）：每行加"在哪"，"去看看"跳过去后按 point 指出控件（src/kit/spotlight.tsx）。
// point.id 是控件上的 data-feature；改界面时 data-feature 跟着控件走，单元测试检查每个 id 在界面代码里都有。
import type { PointSpec } from '../kit/spotlight';

export type FeatureTarget =
  | 'workbench'
  | 'gallery'
  | 'materials'
  | 'settings:appearance'
  | 'settings:storage'
  | 'settings:backup'
  | 'settings:novelai'
  | 'settings:ai'
  | 'settings:network'
  | 'settings:tags'
  | 'settings:agent'
  | 'settings:updates';
export interface Feature {
  name: string;
  text: string;
  /** 在哪：页面 · 位置 · 控件，只能从右键或快捷键进去的靠这一句说清楚 */
  where: string;
  go: FeatureTarget;
  point: PointSpec;
}
// 工作台里要先有一张图的
const IMG = { id: 'open-image', text: '先打开一张图' };
export const FEATURES: { group: string; items: Feature[] }[] = [
  {
    group: '工作台',
    items: [
      {
        name: '找回提示词',
        text: '把 NovelAI 生成的图拖进窗口、粘贴或打开，就能看到它的提示词和参数',
        go: 'workbench',
        where: '工作台 · 把图拖进窗口、Ctrl V 粘贴，或点「打开图片」',
        point: {
          id: 'prompt',
          tip: '提示词和参数都在这里',
          need: { id: 'open-image', text: '把图拖进窗口，或点这里' },
        },
      },
      {
        name: '按块整理',
        text: '提示词按块显示，Tag 带分类颜色和中文译文；拖动换位置，右键调整',
        go: 'workbench',
        where: '工作台 · 提示词栏',
        point: { id: 'blocks', before: 'tab-prompt', tip: '按块显示，拖动 Tag 换位置', need: IMG },
      },
      {
        name: '复制提示词',
        text: '一键复制整段提示词，也可以只复制一块',
        go: 'workbench',
        where: '工作台 · 提示词栏右上角 · 复制',
        point: { id: 'copy', before: 'tab-prompt', need: IMG },
      },
      {
        name: '权重和括号',
        text: '点 Tag 改译文、调权重；花括号加强、方括号减弱',
        go: 'workbench',
        where: '工作台 · 点一个 Tag',
        point: { id: 'tag', before: 'tab-prompt', tip: '点 Tag 改译文、调权重', need: IMG },
      },
      {
        name: '文本方式',
        text: '按 Ctrl E 换成像 NovelAI 网页那样直接改文字，再按一次换回按块',
        go: 'workbench',
        where: '工作台 · 提示词右边的「更多」 · 切换为文本编辑 · Ctrl E',
        point: {
          id: 'text-mode',
          before: 'tab-prompt',
          tip: '更多 → 切换为文本编辑，或按 Ctrl E',
          need: IMG,
        },
      },
      {
        name: '翻译和用中文写',
        text: '段落可以翻译成中文，也可以用中文写、让 AI 改写成英文',
        go: 'workbench',
        where: '工作台 · 段落下面 · 翻译成中文 / 根据中文改写英文',
        point: { id: 'translate', before: 'tab-prompt', need: IMG },
      },
      {
        name: '角色',
        text: '角色提示词各自一节，可以加角色、调角色位置',
        go: 'workbench',
        where: '工作台 · 提示词栏 · 角色 · 添加角色',
        point: { id: 'characters', before: 'tab-prompt', need: IMG },
      },
      {
        name: 'V5 控制词',
        text: 'V5 的控制词显示中文名，节标题上的"V5 控制词"可以选',
        go: 'workbench',
        where: '工作台 · 提示词标题右边 · V5 控制词',
        point: { id: 'controls', before: 'tab-prompt', need: IMG },
      },
      {
        name: '参数和参考',
        text: '"参数"页签换模型、调步数和采样器；"参考"页签放 Vibe、精确参考和底图',
        go: 'workbench',
        where: '工作台 · 提示词栏上面的「参数」「参考」页签',
        point: { id: 'tab-params', tip: '参数和参考在这两个页签里', need: IMG },
      },
      {
        name: '版本和分支',
        text: '每次生成是新的一版，写着改了什么；从旧版本生成会分出分支，可以改名和删除',
        go: 'workbench',
        where: '工作台 · 右边的版本栏',
        point: { id: 'versions', need: IMG },
      },
      {
        name: '作为新作品打开',
        text: '改了很多以后，从一张图另起一个作品，两边能互相跳',
        go: 'workbench',
        where: '工作台 · 在图片上右键 · 作为新作品打开',
        point: { id: 'stage', tip: '在图片上右键 → 作为新作品打开', need: IMG },
      },
      {
        name: '新建空白作品',
        text: '标签栏最右边的"+"，从空的提示词开始写',
        go: 'workbench',
        where: '工作台 · 标签栏最右边的 +',
        point: { id: 'new-blank' },
      },
    ],
  },
  {
    group: '生成和修图',
    items: [
      {
        name: '生成',
        text: '填上 NovelAI 持久令牌就能生成，生成的图自动存进图片库',
        go: 'settings:novelai',
        where: '设置 · NovelAI 账号 · 持久令牌',
        point: { id: 'token' },
      },
      {
        name: '费用和免费范围',
        text: '"生成"旁边一直写着要花多少；不在免费范围时说明原因，可以一键改回',
        go: 'workbench',
        where: '工作台 · 右下角「生成」左边',
        point: { id: 'cost', need: IMG },
      },
      {
        name: '中转站',
        text: '生成可以走中转站，填地址和 Key，测试连接会列出它有哪些模型',
        go: 'settings:novelai',
        where: '设置 · NovelAI 账号 · 连接方式',
        point: { id: 'relay' },
      },
      {
        name: '放大和增强',
        text: '图片下面的"放大""增强"，浮层里先写好结果尺寸和价格',
        go: 'workbench',
        where: '工作台 · 图片下面的操作条 · 放大 / 增强',
        point: { id: 'op-upscale', need: IMG },
      },
      {
        name: '图生图',
        text: '"参考"页签放一张底图，调强度和噪声，按它出图',
        go: 'workbench',
        where: '工作台 · 「参考」页签 · 底图',
        point: { id: 'img2img', before: 'tab-refs', need: IMG },
      },
      {
        name: '局部重绘',
        text: '在大图上涂要修的地方，按免费尺寸重画后自动贴回原来的位置',
        go: 'workbench',
        where: '工作台 · 图片下面的操作条 · 局部重绘',
        point: { id: 'inpaint', need: IMG },
      },
      {
        name: '扩图',
        text: '往四边拉大画布，重画多出来的部分；可以一次画完，也可以按边分块，先写好尺寸和价格',
        go: 'workbench',
        where: '工作台 · 图片下面的操作条 · 扩图',
        point: { id: 'outpaint', need: IMG },
      },
      {
        name: '两张图对比',
        text: '并排或叠在一起拖分界线看，下面写着两版提示词和参数的差异',
        go: 'workbench',
        where: '工作台 · 版本栏 · 右键缩略图「和当前这张对比」，或 Ctrl 点两张',
        point: { id: 'versions', tip: '右键缩略图 → 和当前这张对比', need: IMG },
      },
    ],
  },
  {
    group: '图片库',
    items: [
      {
        name: '导入图片和 ZIP',
        text: '拖进来或者点"导入"，ZIP 里的图先挑再导入，同一张图只存一份',
        go: 'gallery',
        where: '图片库 · 右上角「导入」 · Ctrl I',
        point: { id: 'import' },
      },
      {
        name: '导入文件夹',
        text: '按里面的文件夹建好收藏集',
        go: 'gallery',
        where: '图片库 · 「导入」右边的箭头 · 导入文件夹…',
        point: { id: 'import-folder', tip: '箭头 → 导入文件夹…' },
      },
      {
        name: '搜索和筛选',
        text: '按 Tag、模型、日期等条件找图',
        go: 'gallery',
        where: '图片库 · 上面的搜索框和「筛选」 · Ctrl K',
        point: { id: 'search' },
      },
      {
        name: '收藏集',
        text: '自己建的收藏集和按条件自动收图的智能收藏集',
        go: 'gallery',
        where: '图片库 · 左边栏 · 收藏集',
        point: { id: 'collections' },
      },
      {
        name: '合并方式',
        text: '同一个作品的图合成一组显示，也可以换别的合并方式',
        go: 'gallery',
        where: '图片库 · 「视图」 · 分组',
        point: { id: 'view', tip: '视图 → 分组' },
      },
      {
        name: '大图',
        text: '空格看大图，滚轮缩放、拖动平移；透明图可以换棋盘格、白、黑底色',
        go: 'gallery',
        where: '图片库 · 选中一张按空格',
        point: { id: 'card', tip: '选中一张按空格看大图' },
      },
      {
        name: '导出分享',
        text: '多选几张、一组或整个收藏集，导出成 ZIP 或文件夹；导出的是原图，提示词和参数都在里面',
        go: 'gallery',
        where: '图片库 · 多选后下面的「导出…」；收藏集上右键 · 导出收藏集…',
        point: {
          id: 'export',
          need: { id: 'card', text: 'Ctrl 点几张图，下面的操作条里有「导出…」' },
        },
      },
      {
        name: '回收站',
        text: '删掉的图先进回收站，可以恢复；永久删除只删不再被用到的文件',
        go: 'gallery',
        where: '图片库 · 左边栏最下面',
        point: { id: 'trash' },
      },
      {
        name: '图片模糊',
        text: '只模糊 NSFW 的图或所有图片，标题栏一键切换；右键标"标为 NSFW""不是 NSFW"',
        go: 'settings:appearance',
        where: '设置 · 通用 · 图片模糊；标题栏右边的眼睛',
        point: { id: 'blur' },
      },
      {
        name: '素材',
        text: '常用块、角色和 Vibe 库，在提示词里随手插入',
        go: 'materials',
        where: '素材 · 左边选常用块、角色或 Vibe',
        point: { id: 'materials' },
      },
      {
        name: '随机池',
        text: '一行一条放画师串、动作或背景；提示词里放随机块，每张图生成前各抽一次，抽到什么记在图上',
        go: 'materials',
        where: '素材 · 随机池；工作台提示词的块之间点「随机块」',
        point: { id: 'materials', tip: '左边选「随机池」' },
      },
    ],
  },
  {
    group: 'Agent 与设置',
    items: [
      {
        name: 'Agent',
        text: '装上技能后，Claude Code、Codex 这类 Agent 可以读图、整理图片库、排队生成',
        go: 'settings:agent',
        where: '设置 · Agent · Agent 技能',
        point: { id: 'agent' },
      },
      {
        name: '内置 AI',
        text: '起名、翻译、整理提示词，可以用 ChatGPT 账号登录，也可以填 API Key',
        go: 'settings:ai',
        where: '设置 · AI 服务 · 使用方式',
        point: { id: 'ai' },
      },
      {
        name: '翻译词典',
        text: '所有 Tag 的译文和分类，按使用次数排序，可以就地修改',
        go: 'settings:tags',
        where: '设置 · 翻译词典',
        point: { id: 'dictionary' },
      },
      {
        name: '备份与恢复',
        text: '把图片库和设置导出成一个文件，换电脑时导入',
        go: 'settings:backup',
        where: '设置 · 备份与恢复 · 导出',
        point: { id: 'backup' },
      },
      {
        name: '图片库位置',
        text: '图片库存在哪里、占了多少空间，可以搬到别的位置',
        go: 'settings:storage',
        where: '设置 · 图片库 · 图片存放位置',
        point: { id: 'storage' },
      },
      {
        name: '网络和代理',
        text: '连不上 NovelAI 时，可以用系统代理或者自己填代理',
        go: 'settings:network',
        where: '设置 · 网络 · 连接方式',
        point: { id: 'network' },
      },
      {
        name: '外观和关闭行为',
        text: '浅色、深色、跟随系统，动效，关闭窗口时退出还是留在托盘',
        go: 'settings:appearance',
        where: '设置 · 通用',
        point: { id: 'appearance' },
      },
      {
        name: '检查更新',
        text: '发现新版本时可以在软件里下载和安装，每一版的更新说明都能看',
        go: 'settings:updates',
        where: '设置 · 关于与更新',
        point: { id: 'updates' },
      },
    ],
  },
];
