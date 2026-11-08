import type { AISettings } from '../shared/types';

type AIReadiness = Pick<AISettings, 'baseUrl' | 'model'> &
  Partial<Pick<AISettings, 'provider' | 'chatgpt'>>;

/** 内置 AI 能不能用：按当前选中的服务判断（#14）。ChatGPT 看有没有登录，API Key 看有没有选模型 */
export function aiConfigured(settings: AIReadiness): boolean {
  return settings.provider === 'chatgpt' ? !!settings.chatgpt?.signedIn : !!settings.model?.trim();
}

/** 同意弹窗里写的发送目标，也用来分开记"已同意"。没配置好时是空字符串 */
export function aiTarget(settings: AIReadiness): string {
  if (!aiConfigured(settings)) return '';
  return settings.provider === 'chatgpt' ? 'ChatGPT' : settings.baseUrl;
}
