// 关闭主窗口时问一次（doc/design.md 2.28，1.5.2，只在 Windows）：主进程拦下关闭、发 close-request，
// 这里问"最小化到托盘"还是"退出"。"不再询问"默认不勾（用户 10-21 定）；×、Esc、点遮罩是取消，窗口不关。
import { useEffect, useState } from 'react';
import { Dialog } from '../kit/dialog';
import { CheckRow } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';

export function CloseAsk() {
  const notify = useNotifications();
  const { jobs } = useGeneration();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  useEffect(
    () =>
      window.studio?.onCommandEvent((event) => {
        if (event.type !== 'close-request') return;
        setRemember(false);
        setOpen(true);
      }),
    [],
  );
  const busy = jobs.filter((j) => j.state === 'generating' || j.state === 'queued').length;
  const choose = (action: 'tray' | 'quit') => {
    setOpen(false);
    invokeUI('window.close-choice', { action, remember }).catch((e) =>
      notify({ text: `操作失败：${(e as Error).message}`, tone: 'error' }),
    );
  };
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      label="关闭窗口"
      className="close-ask"
      initialFocus=".acts .btn.ink"
    >
      <h3>关闭窗口</h3>
      <p>
        {busy
          ? '最小化到托盘后生成会继续；退出会中断正在进行的生成。'
          : '最小化到托盘后软件在后台继续运行，可以从托盘图标打开。'}
      </p>
      <div className="acts">
        <CheckRow className="lcheck ca-remember" on={remember} onChange={setRemember}>
          不再询问
        </CheckRow>
        <button className="btn quiet" onClick={() => choose('quit')}>
          退出
        </button>
        <button className="btn ink" onClick={() => choose('tray')}>
          最小化到托盘
        </button>
      </div>
    </Dialog>
  );
}
