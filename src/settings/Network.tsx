// 网络（doc/design.md 2.11）：软件自己联网（生成、AI 服务、翻译、检查更新）时走哪条路。
// 和 AI 服务一样有页脚：左边是状态，右边是"测试连接"和"保存"。保存后要等进行中的任务做完才切换，
// 切换的结果由 App 发通知（这一页切走后也能看到）；这一页只显示当前的状态。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, Seg } from '../kit/controls';
import { onNetworkChange, readNetwork, saveNetwork, testNetwork } from '../state/network';
import type { NetworkSettings, NetworkState, NetworkTestResult } from '../shared/types';
import { Dropdown, Expand, Row, SetPage, Swap, errorText } from './parts';

type Mode = NetworkSettings['mode'];
type Manual = Extract<NetworkSettings, { mode: 'manual' }>;
interface Draft {
  mode: Mode;
  protocol: Manual['protocol'];
  host: Manual['host'];
  /** 输入框里的原文；保存前才转成数字 */
  port: string;
}

const HOSTS: Manual['host'][] = ['127.0.0.1', 'localhost', '[::1]'];
const MODE_HELP: Record<Mode, string> = {
  system: '使用系统的代理设置。代理软件开启了“系统代理”时选这一项',
  direct: '不使用任何代理，直接连接',
  manual: '连接这台电脑上运行的代理软件',
};
const NETWORK_FAILURE: Record<NonNullable<NetworkTestResult['failure']>, string> = {
  proxy: '连不上代理。请确认代理软件正在运行，协议、地址和端口与它的设置一致',
  proxy_auth: '代理要求登录。目前只支持不需要账号密码的本机代理',
  timeout: '连接超时：10 秒内没有收到 NovelAI 的响应',
  dns: '找不到 NovelAI 的服务器（域名解析失败）',
  tls: '安全连接失败，可能被代理或防火墙拦截',
  network: '无法连接到 NovelAI',
};

const portOf = (text: string) => {
  const n = /^\d{1,5}$/.test(text) ? Number(text) : NaN;
  return n >= 1 && n <= 65535 ? n : null;
};
const toDraft = (s: NetworkSettings | null): Draft =>
  s?.mode === 'manual'
    ? { mode: 'manual', protocol: s.protocol, host: s.host, port: String(s.port) }
    : { mode: s?.mode || 'system', protocol: 'http', host: '127.0.0.1', port: '' };
const toSettings = (d: Draft): NetworkSettings | null => {
  if (d.mode !== 'manual') return { mode: d.mode };
  const port = portOf(d.port);
  return port === null ? null : { mode: 'manual', protocol: d.protocol, host: d.host, port };
};
/** 比较用：两份设置是不是同一个意思 */
const keyOf = (s: NetworkSettings | Draft | null) =>
  !s ? '' : s.mode === 'manual' ? `manual ${s.protocol} ${s.host} ${s.port}` : s.mode;
/** 已经保存的那一份：正在等待生效的优先 */
const targetOf = (s: NetworkState | null) => (s ? s.pending || s.settings : null);

export function Network() {
  const [state, setState] = useState<NetworkState | null>(null);
  const [draft, setDraft] = useState<Draft>(() => toDraft(null));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<NetworkTestResult | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const shown = useRef<NetworkState | null>(null);
  // 收到新状态：没改过的表单跟着变；切换失败时留着用户填的，方便改了再保存
  const receive = (next: NetworkState) => {
    const prev = shown.current;
    shown.current = next;
    setState(next);
    setLoadError('');
    if (prev && (next.phase === 'error' || next.phase === 'blocked')) return;
    setDraft((d) => (!prev || keyOf(d) === keyOf(targetOf(prev)) ? toDraft(targetOf(next)) : d));
  };
  useEffect(() => {
    let live = true;
    readNetwork()
      .then((s) => live && receive(s))
      .catch((e) => live && setLoadError(`读取网络设置失败：${errorText(e)}`));
    const off = onNetworkChange((s) => live && receive(s));
    return () => {
      live = false;
      off();
    };
  }, []);
  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setResult(null);
    setError('');
  };

  const settings = toSettings(draft);
  const portBad = draft.mode === 'manual' && !!draft.port && !settings;
  const waiting = state?.phase === 'pending' || state?.phase === 'applying';
  const blocked = state?.phase === 'blocked';
  const dirty = !!state && keyOf(draft) !== keyOf(targetOf(state));
  const canSave = !!state && !!settings && !waiting && !saving && (dirty || blocked);

  const save = async () => {
    if (!canSave || !settings) return;
    setSaving(true);
    setError('');
    setResult(null);
    try {
      receive(await saveNetwork(settings));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const test = async () => {
    if (!settings || testing) return;
    setTesting(true);
    setError('');
    setResult(null);
    try {
      setResult(await testNetwork(settings));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setTesting(false);
    }
  };

  const note = (key: string, className: string, children: ReactNode) => (
    <span key={key} className={className} data-enter="fade">
      {children}
    </span>
  );
  const status =
    state?.phase === 'applying'
      ? note(
          'applying',
          'foot-note row',
          <>
            <span className="spin" />
            正在切换
          </>,
        )
      : state?.phase === 'pending'
        ? note(
            'pending',
            'foot-note',
            state.active
              ? `等 ${state.active} 个进行中的任务完成后切换`
              : '等进行中的任务完成后切换',
          )
        : result?.reachable
          ? note('ok', 'banner ok foot-ok', `能连接到 NovelAI · ${result.elapsedMs} 毫秒`)
          : result
            ? note('fail', 'foot-err selectable', NETWORK_FAILURE[result.failure || 'network'])
            : error || loadError
              ? note('error', 'foot-err selectable', error || loadError)
              : state?.phase === 'error'
                ? note('failed', 'foot-err', '切换失败，仍在使用原来的设置')
                : dirty
                  ? note('dirty', 'foot-note', '有未保存的修改')
                  : null;

  const foot = (
    <>
      <span className="row foot-status" role="status">
        {status}
      </span>
      <span className="sp" />
      <button
        className={`btn ${testing ? 'loading' : ''}`}
        disabled={testing || !settings}
        data-tip={
          !settings ? '先填写端口' : testing ? undefined : '只检查能否连到 NovelAI，不检查账号'
        }
        onClick={() => void test()}
      >
        {testing && <Icon name="loader-4-line" />}
        {testing ? '测试中' : '测试连接'}
      </button>
      <button
        className={`btn ink ${saving ? 'loading' : ''}`}
        disabled={!canSave}
        data-tip={
          waiting
            ? '上一次的设置生效后才能再保存'
            : !settings
              ? '先填写端口'
              : !dirty && !blocked
                ? '没有需要保存的修改'
                : undefined
        }
        onClick={() => void save()}
      >
        {saving && <Icon name="loader-4-line" />}
        保存
      </button>
    </>
  );

  return (
    <SetPage
      title="网络"
      desc="生成图片、AI 服务、翻译和检查更新时，软件按这里的设置联网。用浏览器打开的网页不受影响。"
      foot={foot}
    >
      {blocked && (
        <div className="banner danger set-banner net-blocked" data-enter="fade">
          <Icon name="error-warning-line" />
          <span>
            {state?.error === 'initialization_failed'
              ? '启动时没能应用保存的网络设置。'
              : '网络设置切换失败，也没能恢复原来的设置。'}
            为了不绕过代理直接联网，软件暂停了所有联网请求。确认下面的设置后保存一次即可恢复。
          </span>
        </div>
      )}
      <Row
        feature="network"
        title="连接方式"
        help={<Swap k={draft.mode}>{MODE_HELP[draft.mode]}</Swap>}
      >
        <Seg
          label="连接方式"
          items={[
            ['system', '跟随系统'],
            ['direct', '直连'],
            ['manual', '本机代理'],
          ]}
          value={draft.mode}
          onChange={(mode) => edit({ mode })}
        />
      </Row>
      <Expand open={draft.mode === 'manual'}>
        <Row title="协议" help="照代理软件里这个端口的类型选" className="set-sub">
          <Seg
            label="代理协议"
            items={[
              ['http', 'HTTP'],
              ['socks5', 'SOCKS5'],
            ]}
            value={draft.protocol}
            onChange={(protocol) => edit({ protocol })}
          />
        </Row>
        <Row title="地址" help="只支持这台电脑上、不需要账号密码的代理" className="set-sub">
          <Dropdown
            label="代理地址"
            className="set-dd mono"
            value={draft.host}
            place="below-right"
            items={HOSTS.map((host) => ({
              label: <span className="mono">{host}</span>,
              checked: draft.host === host,
              onSelect: () => edit({ host }),
            }))}
          />
        </Row>
        <Row
          title="端口"
          help={
            portBad ? (
              <span className="warn-t">端口是 1 到 65535 之间的整数</span>
            ) : (
              '代理软件设置里的端口号'
            )
          }
          className="set-sub"
        >
          <label className={`field sm mono set-port ${portBad ? 'is-error' : ''}`}>
            <input
              aria-label="代理端口"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={5}
              tabIndex={draft.mode === 'manual' ? 0 : -1}
              value={draft.port}
              onChange={(e) =>
                edit({
                  port: e.target.value
                    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
                    .replace(/\D/g, ''),
                })
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void save();
              }}
            />
          </label>
        </Row>
      </Expand>
    </SetPage>
  );
}
