/**
 * 中转站预设（doc/design.md 2.33，用户 10-28 定）：只列实测过能用的站。
 * 选了预设就填好 address，用户只填 Key；选中哪个预设由已保存的地址推断，不另外存。
 * 适配走通用规则（按内容识别返回格式、按模型列表开关功能），这里不放协议开关。
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
}

export const RELAY_PRESETS: readonly RelayPreset[] = [
  {
    id: 'taleapi',
    name: 'TaleAPI',
    address: 'https://api.taleapi.asia/v1/ai/generate-image',
    site: 'https://taleapi.asia/',
    note: '可以文生图、图生图和增强；暂不支持局部重绘、扩图、放大和新 Vibe 编码，生成时没有进度预览',
  },
  {
    id: 'hamubox',
    name: 'hamubox',
    address: 'https://api.hamubox.com/v1/novelai',
    site: 'https://api.hamubox.com/',
    note: '文生图、图生图、增强、局部重绘和扩图都能用，生成时有进度预览',
  },
];

export const relayPresetFor = (address: string) =>
  RELAY_PRESETS.find((p) => p.address === address.trim()) ?? null;
