import type { ReactNode } from 'react';
import { useRef } from 'react';
import { Presence } from '../kit/motion';
import { readClipboardText, writeClipboardText } from '../lib/clipboard';
import { isImportActive } from '../lib/importProgress.js';
import { previewInvoke } from '../lib/previewCommands.js';
import { CATEGORY_LABELS, CATEGORY_OPTIONS } from '../lib/prompt.js';
import type { StudioApi } from '../shared/ipc';
import type { ImportProgress } from '../shared/types';
import type { EditorProps } from '../workbench/Prompt';
export type Editable = HTMLElement &
  Partial<
    Pick<
      HTMLInputElement,
      'selectionStart' | 'selectionEnd' | 'setSelectionRange' | 'setRangeText' | 'value'
    >
  >;
export type TextAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select-all';
export type Confirmation = Parameters<EditorProps['onConfirm']>[0] & { primaryDanger?: boolean };
export type LegacyMenuItem = {
  key: string;
  type?: string;
  label?: ReactNode;
  icon?: unknown;
  disabled?: boolean;
  onClick?: () => void;
};
export type LocalImportProgress =
  | ImportProgress
  | { phase: 'preparing'; current: string; processed: number; total: number; batchId?: string };
export const studio: Pick<
  StudioApi,
  'invoke' | 'onCommandEvent' | 'onCommandPrepare' | 'pathsForFiles'
> = window.studio || {
  invoke: previewInvoke as StudioApi['invoke'],
  onCommandEvent: () => () => {},
  onCommandPrepare: () => () => {},
  pathsForFiles: () => [],
};
export const TAG_CONTEXT_CATEGORIES = CATEGORY_OPTIONS.map((category) => [
  category,
  CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS],
]);
export function dispatchInput(editable: Editable, inputType: string, data: string | null = null) {
  const event =
    typeof InputEvent === 'function'
      ? new InputEvent('input', { bubbles: true, data, inputType })
      : new Event('input', { bubbles: true });
  editable.dispatchEvent(event);
}
export function captureTextSelection(editable: Editable) {
  const start = typeof editable.selectionStart === 'number' ? editable.selectionStart : null;
  const end = typeof editable.selectionEnd === 'number' ? editable.selectionEnd : null;
  return {
    editable,
    start,
    end,
    hasSelection: start == null || end == null ? true : start !== end,
  };
}
export async function runTextEditAction(
  selection: ReturnType<typeof captureTextSelection>,
  action: TextAction,
) {
  const { editable, start, end } = selection;
  editable.focus({ preventScroll: true });
  if (start != null && end != null && typeof editable.setSelectionRange === 'function')
    editable.setSelectionRange(start, end);
  if (start != null && end != null && typeof editable.setRangeText === 'function') {
    if (action === 'copy' || action === 'cut') {
      await writeClipboardText(String(editable.value || '').slice(start, end));
      if (action === 'cut') {
        editable.setRangeText('', start, end, 'end');
        dispatchInput(editable, 'deleteByCut');
      }
      return;
    }
    if (action === 'paste') {
      const text = await readClipboardText();
      editable.setRangeText(text, start, end, 'end');
      dispatchInput(editable, 'insertFromPaste', text);
      return;
    }
    if (action === 'select-all') {
      editable.setSelectionRange!(0, String(editable.value || '').length);
      return;
    }
  }
  const command = {
    undo: 'undo',
    redo: 'redo',
    cut: 'cut',
    copy: 'copy',
    paste: 'paste',
    'select-all': 'selectAll',
  }[action];
  if (command) document.execCommand(command);
}
export function ImportExperience({
  dragState,
  progress,
  target,
  onCancel,
}: {
  dragState: { active: boolean; valid?: boolean };
  progress: LocalImportProgress | null;
  target: string;
  onCancel: () => void;
}) {
  const importing = isImportActive(progress);
  const last = useRef(progress);
  if (importing) last.current = progress;
  const ip = last.current;
  const done = ip?.processed || 0;
  const total = ip?.total || 0;
  const workbench = target === 'workbench';
  return (
    <>
      {dragState.active && (
        <div className="dropzone app-drop" data-enter="fade">
          {dragState.valid
            ? workbench
              ? '松开后在工作台打开，每张图片一个标签页'
              : '松开后导入图片库'
            : workbench
              ? '只能打开 PNG、JPG、WEBP 图片'
              : '只能导入 PNG、JPG、WEBP 图片和 ZIP'}
        </div>
      )}
      <div className="dock app-dock">
        <Presence show={importing}>
          {(leaving) => (
            <div className={`job ljob ${leaving ? 'leaving' : ''}`} data-enter="up">
              <div className="top">
                <span className="spin" />
                <b>
                  {ip?.phase === 'preparing'
                    ? '正在检查文件'
                    : `正在导入 ${Math.min(done + 1, Math.max(total, 1))} / ${total}`}
                </b>
                <span className="sp" />
                <button className="btn quiet sm" onClick={onCancel}>
                  取消剩余
                </button>
              </div>
              <div className="progress ink">
                <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </div>
              <small>导入不会修改或移动原文件</small>
            </div>
          )}
        </Presence>
      </div>
    </>
  );
}
