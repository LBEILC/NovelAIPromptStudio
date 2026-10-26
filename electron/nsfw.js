import { DEFAULT_NSFW_TAGS, normalizeNsfwWord, positiveNsfwTags } from '../src/shared/nsfw.ts';

// Separate, additive table: older applications can continue reading and writing projects.
export function createNsfwStore(connection) {
  connection.exec(`CREATE TABLE IF NOT EXISTS image_nsfw_marks (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    value INTEGER NOT NULL CHECK (value IN (0, 1))
  );
  CREATE TRIGGER IF NOT EXISTS image_nsfw_marks_delete AFTER DELETE ON projects
  BEGIN DELETE FROM image_nsfw_marks WHERE project_id = OLD.id; END;`);
  let words = [...DEFAULT_NSFW_TAGS];
  let automatic = new Map();
  const observed = new Map();
  const compiled = new Map();
  let wordKeys = new Map(words.map((word) => [normalizeNsfwWord(word), word]));
  const input = (project) => {
    const base_prompt_raw =
      project.prompt_structure?.base_prompt_raw ?? project.metadata?.prompt_raw ?? '';
    const characters = (project.prompt_structure?.characters || []).map((c) => ({
      prompt_raw: c.prompt_raw || '',
    }));
    const raw = JSON.stringify([base_prompt_raw, ...characters.map((c) => c.prompt_raw)]);
    if (!compiled.has(raw))
      compiled.set(raw, JSON.stringify(positiveNsfwTags({ base_prompt_raw, characters })));
    return compiled.get(raw);
  };
  const auto = (key) => {
    if (!automatic.has(key)) {
      const token = JSON.parse(key).find((token) => token && wordKeys.has(token));
      automatic.set(
        key,
        token === undefined
          ? { value: false, source: 'auto' }
          : { value: true, source: 'auto', tag: wordKeys.get(token) },
      );
    }
    return automatic.get(key);
  };
  const resolve = (id, key, marks) => {
    const mark = !id
      ? undefined
      : marks
        ? marks.get(id)
        : connection
            .prepare('SELECT value FROM image_nsfw_marks WHERE project_id = ?')
            .get(id || '')?.value;
    const state = mark === undefined ? auto(key) : { value: Boolean(mark), source: 'manual' };
    if (id) observed.set(id, { key, state });
    return state;
  };
  const snapshot = () => {
    const marks = new Map(
      connection
        .prepare('SELECT * FROM image_nsfw_marks')
        .all()
        .map((r) => [r.project_id, r.value]),
    );
    for (const row of connection
      .prepare(
        'SELECT p.id, m.prompt_raw, m.prompt_structure_json FROM projects p LEFT JOIN generation_metadata m ON m.project_id = p.id',
      )
      .all()) {
      let structure = {};
      try {
        structure = JSON.parse(row.prompt_structure_json || '{}');
      } catch {
        /* Legacy empty metadata. */
      }
      resolve(row.id, input({ prompt_structure: structure, metadata: row }), marks);
    }
    return new Map([...observed].map(([id, entry]) => [id, entry.state]));
  };
  return {
    input,
    state: (project) => resolve(project.id, input(project)),
    cards: () => {
      const marks = new Map(
        connection
          .prepare('SELECT * FROM image_nsfw_marks')
          .all()
          .map((r) => [r.project_id, r.value]),
      );
      return (id, key) => resolve(id, key, marks);
    },
    setWords(next) {
      if (JSON.stringify(words) === JSON.stringify(next)) return {};
      const before = snapshot();
      words = [...next];
      wordKeys = new Map(words.map((word) => [normalizeNsfwWord(word), word]));
      automatic = new Map();
      const states = {};
      for (const [id, entry] of observed) {
        const state = resolve(id, entry.key);
        if (JSON.stringify(before.get(id)) !== JSON.stringify(state)) states[id] = state;
      }
      return states;
    },
    mark(ids, value) {
      const unique = [...new Set(ids)];
      for (const id of unique)
        if (!connection.prepare('SELECT 1 FROM projects WHERE id = ?').get(id))
          throw Object.assign(Error('图片不存在'), { code: 'ENOENT' });
      const before = snapshot();
      const states = {},
        changed = {};
      for (const id of unique) {
        if (value === 'auto')
          connection.prepare('DELETE FROM image_nsfw_marks WHERE project_id = ?').run(id);
        else
          connection
            .prepare(
              'INSERT INTO image_nsfw_marks VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET value = excluded.value',
            )
            .run(id, value === 'nsfw' ? 1 : 0);
        states[id] = resolve(id, observed.get(id).key);
        if (JSON.stringify(before.get(id)) !== JSON.stringify(states[id])) changed[id] = states[id];
      }
      return { states, changed };
    },
  };
}
