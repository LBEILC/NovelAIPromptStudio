import { describe, expect, it } from 'vitest';
import { aiConfigured, aiTarget } from './aiService';

const base = { baseUrl: 'https://api.example.test/v1', model: '' };
const chatgpt = (signedIn: boolean) => ({ signedIn, model: 'example-model' }) as never;

describe('aiConfigured', () => {
  it('ChatGPT 已登录、没配 API 模型时可用', () => {
    const s = { ...base, provider: 'chatgpt' as const, chatgpt: chatgpt(true) };
    expect(aiConfigured(s)).toBe(true);
    expect(aiTarget(s)).toBe('ChatGPT');
  });
  it('ChatGPT 已退出、残留 API 模型时不可用', () => {
    const s = {
      ...base,
      model: 'old-model',
      provider: 'chatgpt' as const,
      chatgpt: chatgpt(false),
    };
    expect(aiConfigured(s)).toBe(false);
    expect(aiTarget(s)).toBe('');
  });
  it('API Key 模式看有没有选模型', () => {
    const s = { ...base, provider: 'apiKey' as const, chatgpt: chatgpt(true) };
    expect(aiConfigured(s)).toBe(false);
    expect(aiConfigured({ ...s, model: '  ' })).toBe(false);
    expect(aiConfigured({ ...s, model: 'm' })).toBe(true);
    expect(aiTarget({ ...s, model: 'm' })).toBe(base.baseUrl);
  });
  it('缺少服务字段时按 API 模型判断', () => {
    expect(aiConfigured(base)).toBe(false);
    expect(aiConfigured({ ...base, model: 'm' })).toBe(true);
  });
});
