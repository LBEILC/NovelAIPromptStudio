import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { writeClipboardText } from '../lib/clipboard';
import { invokeUI } from '../lib/commands';
import type { AgentSkills } from '../shared/commands';
import { GenerationPreferences } from './accountSection';
import { Row, SetPage, errorText } from './parts';
import { Fail } from './sectionShared';

// ---------- Agent ----------
export type AgentSetup = {
  installed: boolean;
  path: string;
  onPath: boolean;
  skillPath: string;
  platform: string;
  pathFailed?: boolean;
  skills?: AgentSkills;
};

export function Agent() {
  const notify = useNotifications();
  const [setup, setSetup] = useState<AgentSetup | null>(null);
  const [installedNow, setInstalledNow] = useState(false);
  const [version, setVersion] = useState('');
  const [cliBusy, setCliBusy] = useState<'' | 'install' | 'uninstall'>('');
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    void invokeUI('updates.status', {})
      .then((r) => live && setVersion(r.currentVersion))
      .catch(() => {});
    void invokeUI('agent.setup', {})
      .then((r) => {
        if (!live) return;
        if (r.ok) setSetup(r);
        else setError(r.error);
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, []);
  const install = async (remove = false) => {
    setCliBusy(remove ? 'uninstall' : 'install');
    try {
      const r = await invokeUI(remove ? 'agent.uninstall' : 'agent.install', {});
      if (!r.ok) throw Error(r.error);
      setSetup(r);
      setInstalledNow(!remove);
      setError('');
      notify({
        text: remove ? '已卸载命令行工具' : setup?.installed ? '已重新安装' : '已安装',
        tone: 'success',
      });
    } catch (e) {
      setError(`${remove ? '卸载' : '安装'}失败：${errorText(e)}`);
    } finally {
      setCliBusy('');
    }
  };
  // 把技能装进 Claude Code 或 Codex 的全局技能目录
  const [skillBusy, setSkillBusy] = useState('');
  const installSkill = async (target: 'claude' | 'codex', remove = false) => {
    const name = target === 'claude' ? 'Claude Code' : 'Codex';
    setSkillBusy(`${target}:${remove ? 'remove' : 'add'}`);
    try {
      const r = await invokeUI(remove ? 'agent.skill-uninstall' : 'agent.skill-install', {
        target,
      });
      if (!r.ok) throw Error(r.error);
      setSetup((cur) => (cur ? { ...cur, skills: r.skills } : cur));
      notify({
        text: remove ? `已从 ${name} 里卸载技能` : `已把技能装进 ${name}`,
        tone: 'success',
      });
    } catch (e) {
      notify({ text: `${remove ? '卸载' : '安装'}技能失败：${errorText(e)}`, tone: 'error' });
    } finally {
      setSkillBusy('');
    }
  };
  const copySkill = async () => {
    try {
      const r = await invokeUI('agent.skill', {});
      if (!r.ok) throw Error(r.error);
      await writeClipboardText(r.text);
      notify({ text: '已复制技能内容', tone: 'success' });
    } catch (e) {
      notify({ text: `复制失败：${errorText(e)}`, tone: 'error' });
    }
  };
  const dir = setup?.path.replace(/[\\/][^\\/]*$/, '') || '';
  const help: ReactNode[] = !setup
    ? ['正在读取…']
    : !setup.installed
      ? ['未安装']
      : [
          `已安装 · nai-studio${version ? ` ${version}` : ''} · 软件更新后自动跟着更新`,
          !setup.onPath && (
            <span className="warn-t">
              命令所在的文件夹不在 PATH 里，终端里找不到 nai-studio。把下面的文件夹加进
              PATH，再重新打开终端。
            </span>
          ),
          <span className="path selectable">{dir}</span>,
          setup.platform === 'win32'
            ? setup.pathFailed
              ? '加入 PATH 失败。可以在系统的“编辑账户的环境变量”里把上面的文件夹加进 Path，然后重新打开终端。'
              : installedNow && setup.onPath
                ? '已加入 PATH，已经打开的终端要重新打开才能用。'
                : null
            : !setup.onPath && (
                <>
                  这个位置不在 PATH 里。把下面这行加到 ~/.zshrc（用 bash 的加到
                  ~/.bashrc），然后重新打开终端：
                  <span className="path selectable">{'export PATH="$HOME/.local/bin:$PATH"'}</span>
                </>
              ),
        ];
  return (
    <SetPage
      title="Agent"
      desc="让你的 Agent（如 Claude Code、Codex）通过命令行使用本软件：读取提示词、修改工作台、搜索图片库、添加生成任务。"
    >
      <Fail>{error}</Fail>
      <Row title="命令行工具" help={help}>
        <span className="row set-nowrap">
          {setup?.installed && !setup.onPath && (
            <button
              className="btn quiet sm"
              onClick={() =>
                void writeClipboardText(dir).then(() =>
                  notify({ text: '已复制命令所在的文件夹', tone: 'success' }),
                )
              }
            >
              复制位置
            </button>
          )}
          {setup?.installed && (
            <button
              className={`btn quiet sm ${cliBusy === 'uninstall' ? 'loading' : ''}`}
              disabled={!!cliBusy}
              data-tip="删掉软件装的命令，不改 PATH"
              onClick={() => void install(true)}
            >
              {cliBusy === 'uninstall' && <Icon name="loader-4-line" />}
              卸载
            </button>
          )}
          <button
            className={`btn sm ${setup?.installed ? 'quiet' : ''} ${cliBusy === 'install' ? 'loading' : ''}`}
            disabled={!!cliBusy || !setup}
            onClick={() => void install()}
          >
            {cliBusy === 'install' && <Icon name="loader-4-line" />}
            {setup?.installed ? '重新安装' : '安装'}
          </button>
        </span>
      </Row>
      <Row
        title="Agent 技能"
        help="说明这些命令用法的技能文件。装进 Agent 的全局技能目录后，新开的会话就能用；也可以自己复制。"
      >
        <span className="row">
          <button
            className="btn quiet sm"
            onClick={() =>
              void invokeUI('agent.reveal', {}).then((r) => {
                if (!r.ok) notify({ text: r.error, tone: 'error' });
              })
            }
          >
            打开所在文件夹
          </button>
          <button className="btn sm" onClick={() => void copySkill()}>
            复制内容
          </button>
        </span>
      </Row>
      {(['claude', 'codex'] as const).map((target) => {
        const info = setup?.skills?.[target];
        const name = target === 'claude' ? 'Claude Code' : 'Codex';
        const state = info?.state;
        return (
          <Row
            key={target}
            className="set-sub"
            title={name}
            help={
              !info
                ? '正在检查…'
                : state === 'unavailable'
                  ? `这台电脑上没找到 ${name}`
                  : state === 'missing'
                    ? '还没装技能'
                    : state === 'outdated'
                      ? '软件更新了技能，装的是旧的，点“更新”换成新的'
                      : [
                          '已安装，新开的会话就能用',
                          <span className="path selectable">{info.path}</span>,
                        ]
            }
          >
            {info && state !== 'unavailable' && (
              <span className="row set-nowrap">
                {state !== 'missing' && (
                  <button
                    className={`btn quiet sm ${skillBusy === `${target}:remove` ? 'loading' : ''}`}
                    disabled={!!skillBusy}
                    onClick={() => void installSkill(target, true)}
                  >
                    {skillBusy === `${target}:remove` && <Icon name="loader-4-line" />}
                    卸载
                  </button>
                )}
                <button
                  className={`btn sm ${state === 'installed' ? 'quiet' : ''} ${skillBusy === `${target}:add` ? 'loading' : ''}`}
                  disabled={!!skillBusy}
                  onClick={() => void installSkill(target)}
                >
                  {skillBusy === `${target}:add` && <Icon name="loader-4-line" />}
                  {state === 'missing' ? '安装' : state === 'outdated' ? '更新' : '重新安装'}
                </button>
              </span>
            )}
          </Row>
        );
      })}
      <Row
        title="Agent 能做什么"
        help={[
          '读提示词和参数，改工作台，搜索和整理图片库，修改翻译词典，排队生成。',
          '不能永久删除图片、修改设置或读取任何密钥。',
        ]}
      />
      <GenerationPreferences agent />
    </SetPage>
  );
}
