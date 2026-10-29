/**
 * 中转站预设（doc/design.md 2.33，用户 10-28 定）：只列实测过能用的站。
 * 选了预设就填好 address，用户只填 Key；选中哪个预设由已保存的地址推断，不另外存。
 * 适配走通用规则（按内容识别返回格式、按模型列表开关功能）；个别站的特殊约定单独标在那一条上，
 * 对方改成官方约定后删掉。
 * site 是"打开网站"去的地方，主进程只打开这里列出的网址。
 */
export interface RelayPreset {
  id: string;
  name: string;
  /** 填进地址栏的值，经 resolveRelayEndpoints 规范化后不变 */
  address: string;
  site: string;
  /** 能用什么、不能用什么，地址栏下面一行小字 */
  note: string;
  /**
   * 局部重绘（action: infill）的 model 填基础模型名、由中转站自己转到重绘模型，
   * 判断能不能重绘也按基础模型（TaleAPI 10-28 的约定；它支持官方 -inpainting 名后删掉）
   */
  inpaintBaseModel?: true;
}

export const RELAY_PRESETS: readonly RelayPreset[] = [
  {
    id: 'taleapi',
    name: 'TaleAPI',
    address: 'https://api.taleapi.asia/v1/ai/generate-image',
    site: 'https://taleapi.asia/',
    note: '可以文生图、图生图、局部重绘和扩图，只能用免费档（不超过 1MP、28 步）；增强、放大和新 Vibe 编码暂不可用，生成时没有进度预览',
    inpaintBaseModel: true,
  },
  {
    id: 'hamubox',
    name: 'hamubox',
    address: 'https://api.hamubox.com/v1/novelai',
    site: 'https://api.hamubox.com/',
    note: '文生图、图生图、增强、局部重绘和扩图都能用，生成时有进度预览',
  },
  {
    id: 'chr1',
    name: '小忆API开放平台',
    address: 'https://api.chr1.com',
    site: 'https://api.chr1.com/',
    note: '文生图、图生图、增强、局部重绘和扩图都能用，生成时有进度预览',
  },
];

export const relayPresetFor = (address: string) =>
  RELAY_PRESETS.find((p) => p.address === address.trim()) ?? null;

/**
 * 中转站的"额度"（1.9.12，用户 10-29 定）：各站网站上显示的那个数，统一写"额度"，不带 $ 或站点自己的符号，
 * 也不换算成钱（各站一个额度值多少钱是它们自己定的）。最多三位小数，去掉末尾的 0。
 */
export const quotaText = (n: number) => String(Number(n.toFixed(3)));
