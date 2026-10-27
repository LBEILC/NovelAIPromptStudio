import type { CommandName, CommandInput, CommandOutput, ProgressTopics } from '../shared/commands';
import { workbenchErrorMessage } from './workbenchConnection';
import { previewInvoke } from './previewCommands.js';

export function onProgress<K extends keyof ProgressTopics>(
  topic: K,
  callback: (data: ProgressTopics[K]) => void,
) {
  return (
    window.studio?.onCommandEvent((event) => {
      if (event.type === 'progress' && event.topic === topic)
        callback(event.data as ProgressTopics[K]);
    }) || (() => {})
  );
}

/** Unwrap the command envelope without copying large results such as library cards. */
export async function invokeUI<N extends CommandName>(
  name: N,
  input: CommandInput<N>,
): Promise<CommandOutput<N>> {
  if (!window.studio) {
    const result = await previewInvoke(name, input);
    if (!result.ok) throw new Error(result.error?.message || '桌面服务尚未就绪');
    return result.data as CommandOutput<N>;
  }
  const result = await window.studio.invoke(name, input);
  // 错误码挂在抛出的错误上（例如 needs_confirm：界面先确认再重试）
  if (!result.ok)
    throw Object.assign(new Error(workbenchErrorMessage(result.error.message)), {
      code: result.error.code,
      details: (result.error as { details?: unknown }).details,
    });
  return result.data;
}
/** invokeUI 抛出的错误的错误码 */
export const errorCode = (e: unknown) => (e as { code?: string } | null)?.code || '';
/** 错误附带的数据（例如 needs_confirm 时要确认的数量） */
export const errorDetails = <T>(e: unknown) => (e as { details?: T } | null)?.details;

export async function invokeResult<N extends CommandName>(
  name: N,
  input: CommandInput<N>,
): Promise<({ ok: true } & CommandOutput<N>) | { ok: false; error: string }> {
  try {
    return Object.assign({ ok: true as const }, await invokeUI(name, input));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
