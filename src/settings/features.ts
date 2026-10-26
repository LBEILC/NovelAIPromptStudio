// 功能一览（doc/design.md 2.36）：人工维护的一份，帮助页和引导最后一页共用。
// 每次发版写更新说明时，新功能在这里补一行（功能名 + 一句话 + 跳到哪）。不从更新说明自动生成：那边的标题是"这次改了什么"的写法。
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
  go: FeatureTarget;
}
export const FEATURES: { group: string; items: Feature[] }[] = [
  {
    group: '工作台',
    items: [
      {
        name: '找回提示词',
        text: '把 NovelAI 生成的图拖进窗口、粘贴或打开，就能看到它的提示词和参数',
        go: 'workbench',
      },
      {
        name: '按块整理',
        text: '提示词按块显示，Tag 带分类颜色和中文译文；拖动换位置，右键调整',
        go: 'workbench',
      },
      {
        name: '复制提示词',
        text: '一键复制整段提示词，也可以只复制一块',
        go: 'workbench',
      },
      {
        name: '权重和括号',
        text: '点 Tag 改译文、调权重；花括号加强、方括号减弱',
        go: 'workbench',
      },
      {
        name: '文本方式',
        text: '按 Ctrl E 换成像 NovelAI 网页那样直接改文字，再按一次换回按块',
        go: 'workbench',
      },
      {
        name: '翻译和用中文写',
        text: '段落可以翻译成中文，也可以用中文写、让 AI 改写成英文',
        go: 'workbench',
      },
      {
        name: '角色',
        text: '角色提示词各自一节，可以加角色、调角色位置',
        go: 'workbench',
      },
      {
        name: 'V5 控制词',
        text: 'V5 的控制词显示中文名，节标题上的"V5 控制词"可以选',
        go: 'workbench',
      },
      {
        name: '参数和参考',
        text: '"参数"页签换模型、调步数和采样器；"参考"页签放 Vibe、精确参考和底图',
        go: 'workbench',
      },
      {
        name: '版本和分支',
        text: '每次生成是新的一版，写着改了什么；从旧版本生成会分出分支，可以改名和删除',
        go: 'workbench',
      },
      {
        name: '作为新作品打开',
        text: '改了很多以后，从一张图另起一个作品，两边能互相跳',
        go: 'workbench',
      },
      {
        name: '新建空白作品',
        text: '标签栏最右边的"+"，从空的提示词开始写',
        go: 'workbench',
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
      },
      {
        name: '费用和免费范围',
        text: '"生成"旁边一直写着要花多少；不在免费范围时说明原因，可以一键改回',
        go: 'workbench',
      },
      {
        name: '中转站',
        text: '生成可以走中转站，填地址和 Key，测试连接会列出它有哪些模型',
        go: 'settings:novelai',
      },
      {
        name: '放大和增强',
        text: '图片下面的"放大""增强"，浮层里先写好结果尺寸和价格',
        go: 'workbench',
      },
      {
        name: '图生图',
        text: '"参考"页签放一张底图，调强度和噪声，按它出图',
        go: 'workbench',
      },
      {
        name: '局部重绘',
        text: '在大图上涂要修的地方，按免费尺寸重画后自动贴回原来的位置',
        go: 'workbench',
      },
      {
        name: '两张图对比',
        text: '并排或叠在一起拖分界线看，下面写着两版提示词和参数的差异',
        go: 'workbench',
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
      },
      {
        name: '导入文件夹',
        text: '按里面的文件夹建好收藏集',
        go: 'gallery',
      },
      {
        name: '搜索和筛选',
        text: '按 Tag、模型、日期等条件找图',
        go: 'gallery',
      },
      {
        name: '收藏集',
        text: '自己建的收藏集和按条件自动收图的智能收藏集',
        go: 'gallery',
      },
      {
        name: '合并方式',
        text: '同一个作品的图合成一组显示，也可以换别的合并方式',
        go: 'gallery',
      },
      {
        name: '大图',
        text: '空格看大图，滚轮缩放、拖动平移；透明图可以换棋盘格、白、黑底色',
        go: 'gallery',
      },
      {
        name: '回收站',
        text: '删掉的图先进回收站，可以恢复；永久删除只删不再被用到的文件',
        go: 'gallery',
      },
      {
        name: '图片模糊',
        text: '只模糊 NSFW 的图或所有图片，标题栏一键切换；右键标"标为 NSFW""不是 NSFW"',
        go: 'settings:appearance',
      },
      {
        name: '素材',
        text: '常用块、角色和 Vibe 库，在提示词里随手插入',
        go: 'materials',
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
      },
      {
        name: '内置 AI',
        text: '起名、翻译、整理提示词，可以用 ChatGPT 账号登录，也可以填 API Key',
        go: 'settings:ai',
      },
      {
        name: '翻译词典',
        text: '所有 Tag 的译文和分类，按使用次数排序，可以就地修改',
        go: 'settings:tags',
      },
      {
        name: '备份与恢复',
        text: '把图片库和设置导出成一个文件，换电脑时导入',
        go: 'settings:backup',
      },
      {
        name: '图片库位置',
        text: '图片库存在哪里、占了多少空间，可以搬到别的位置',
        go: 'settings:storage',
      },
      {
        name: '网络和代理',
        text: '连不上 NovelAI 时，可以用系统代理或者自己填代理',
        go: 'settings:network',
      },
      {
        name: '外观和关闭行为',
        text: '浅色、深色、跟随系统，动效，关闭窗口时退出还是留在托盘',
        go: 'settings:appearance',
      },
      {
        name: '检查更新',
        text: '发现新版本时可以在软件里下载和安装，每一版的更新说明都能看',
        go: 'settings:updates',
      },
    ],
  },
];
