export async function expectQueueCompletion(h, id) {
  await h.wait(
    `(async () => {
    const result = await window.studio.invoke('generate.status', { id: ${JSON.stringify(id)} });
    return result.ok && result.data.jobs[0].state === 'completed';
  })()`,
    '生成任务完成',
  );
}
