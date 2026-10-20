import type { CommandName, CommandInput, CommandOutput, ProgressTopics } from '../shared/commands';
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
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

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
