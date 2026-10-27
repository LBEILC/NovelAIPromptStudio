// 设置里已保存的密钥旁边的"复制"（用户 10-27）：后台解密后直接写进剪贴板，界面拿不到明文；
// 只有界面能用，Agent 和命令行不能复制密钥。不自动清剪贴板（用户 10-27）。
import { invokeUI } from '../lib/commands';
import type { useNotifications } from '../kit/toast';
import type { SecretKind } from '../shared/commands';

const LABEL: Record<SecretKind, string> = {
  'novelai-token': '持久令牌',
  'relay-key': '中转站 Key',
  'ai-api-key': 'API Key',
};

export const copySecret = (kind: SecretKind, notify: ReturnType<typeof useNotifications>) =>
  invokeUI('secret.copy', { kind })
    .then((r) =>
      r?.ok
        ? notify({ text: `已复制${LABEL[kind]}` })
        : notify({ text: r?.error || `复制${LABEL[kind]}失败`, tone: 'error' }),
    )
    .catch((e) => notify({ text: (e as Error).message, tone: 'error' }));
