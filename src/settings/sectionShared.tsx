import { type ReactNode } from 'react';
import { Icon } from '../kit/controls';
import type { SecretStore } from '../shared/types';

export const Fail = ({ children }: { children: ReactNode }) =>
  children ? (
    <div className="banner danger set-banner" data-enter="fade">
      <Icon name="error-warning-line" />
      <span className="selectable">{children}</span>
    </div>
  ) : null;

/** 1.9.5（106）：macOS 钥匙串没有允许读取已保存的密钥。设置里 NovelAI 账号、AI 服务、ChatGPT 三处共用 */
export const KeychainBanner = ({ store }: { store?: SecretStore }) =>
  store === 'denied' ? (
    <div className="banner warn set-banner kc-banner" data-enter="fade">
      <Icon name="lock-line" />
      <span>
        钥匙串没有允许本软件读取已保存的密钥。退出并重新打开软件，系统询问时选"始终允许"，已保存的不用重新填写。
        <small>
          软件只用钥匙串里自己的"NovelAI Prompt Studio Safe Storage"一项，不会读取或改动其他密码。
        </small>
      </span>
    </div>
  ) : null;

/** 已保存密钥的"更换"。钥匙串被拒绝时这次存不进新的，按钮停用并说明（1.9.5） */
export function ReplaceButton({ store, onClick }: { store?: SecretStore; onClick: () => void }) {
  return store === 'denied' ? (
    <button
      className="btn sm is-off"
      aria-disabled
      data-tip="钥匙串没有授权，这次存不进新的。重新打开软件并允许后再更换"
      onClick={() => {}}
    >
      更换
    </button>
  ) : (
    <button className="btn sm" onClick={onClick}>
      更换
    </button>
  );
}
