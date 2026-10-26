import { isDeepStrictEqual } from 'node:util';
import { commandFor } from './release186.js';
export async function libraryDetailsChecks({ h, database }) {
  const call = commandFor(h);
  const expected = [...database.loadLibrary('all'), ...database.loadLibrary('trash')].map(
    (project) => {
      const detail = database.loadProject(project.id);
      // Full details also carry version ownership; the legacy list omits it.
      const version = Object.fromEntries(
        ['generated_work_id', 'version_number', 'generation_source']
          .filter((key) => key in detail)
          .map((key) => [key, detail[key]]),
      );
      return { ...project, ...version, random: database.versions.randomForImage(project.id) };
    },
  );
  await h.check(
    '详情 IPC 保留完整图片数据、版本归属和逐图随机记录，缺失图片返回 not_found',
    async () => {
      for (const project of expected) {
        const actual = (await call('library.get', { id: project.id })).project;
        if (
          !isDeepStrictEqual(
            JSON.parse(JSON.stringify(actual)),
            JSON.parse(JSON.stringify(project)),
          )
        )
          return false;
      }
      return h.evaluate(
        `window.studio.invoke('library.get',{id:'missing-acceptance-image'}).then(result=>!result.ok&&result.error.code==='not_found')`,
      );
    },
    undefined,
    'once',
  );
}
