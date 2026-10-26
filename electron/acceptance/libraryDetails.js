export async function libraryDetailsChecks({ h, database }) {
  const expected = [...database.loadLibrary('all'), ...database.loadLibrary('trash')].map(
    (project) => ({ ...project, random: database.versions.randomForImage(project.id) }),
  );
  await h.check(
    '详情 IPC 保留完整图片数据和逐图随机记录，缺失图片返回 null',
    `(async () => {
      const read = id => window.studio.invoke('library.get',{id}).then(result=>result.ok?result.data.project:result.error.code==='not_found'?null:Promise.reject(Error(result.error.message)));
      for (const project of ${JSON.stringify(expected)}) {
        if (JSON.stringify(await read(project.id)) !== JSON.stringify(project)) return false;
      }
      return await read('missing-acceptance-image') === null;
    })()`,
    undefined,
    'once',
  );
}
