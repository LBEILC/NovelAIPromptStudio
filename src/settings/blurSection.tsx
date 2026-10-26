// 图片模糊（doc/design.md 2.37，1.8.3）：设置·通用里的模式和敏感词表。
// 默认关闭：用 NovelAI 的人很多本来就在生成 NSFW，默认开的话一更新满屏模糊。
// 自动判定只看正向提示词和角色提示词里的完整 Tag；负面提示词里的、权重是负数的不算。
import { useState } from 'react';
import { Icon, Seg } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { saveBlurSettings, useBlurSettings } from '../state/blur';
import type { BlurSettings } from '../shared/types';
import { normalizeNsfwWord, normalizeNsfwWords } from '../shared/nsfw';
import { Row, errorText } from './parts';

export function BlurRows() {
  const notify = useNotifications();
  const s = useBlurSettings();
  const [editing, setEditing] = useState(false);
  // 点了马上换过去（滑块和别处一样跟手），保存回来再以真值为准；保存失败退回原来的
  const [picked, setPicked] = useState<BlurSettings['mode'] | null>(null);
  const save = (patch: Parameters<typeof saveBlurSettings>[0]) =>
    saveBlurSettings(patch).catch((e) => {
      notify({ text: errorText(e), tone: 'error' });
      throw e;
    });
  return (
    <>
      <Row feature="blur" title="图片模糊" help="只影响显示：复制、导出、备份拿到的都是原图">
        <Seg
          label="图片模糊"
          items={[
            ['off', '关闭'],
            ['nsfw', '只模糊 NSFW'],
            ['all', '所有图片都模糊'],
          ]}
          value={picked ?? s?.mode ?? 'off'}
          onChange={(mode) => {
            setPicked(mode);
            void save({ mode })
              .catch(() => {})
              .finally(() => setPicked(null));
          }}
        />
      </Row>
      <Row
        title="敏感词"
        help={`正向提示词里有这些 Tag 就算 NSFW，负面提示词里的不算${s ? ` · ${s.words.length} 个` : ''}`}
      >
        <button className="btn" disabled={!s} onClick={() => setEditing(true)}>
          编辑…
        </button>
      </Row>
      {s && (
        <WordsDialog
          open={editing}
          settings={s}
          onClose={() => setEditing(false)}
          onSave={(words) =>
            save({ words })
              .then(() => setEditing(false))
              .catch(() => {})
          }
        />
      )}
    </>
  );
}

function WordsDialog({
  open,
  settings,
  onClose,
  onSave,
}: {
  open: boolean;
  settings: BlurSettings;
  onClose: () => void;
  onSave: (words: string[]) => void;
}) {
  const [words, setWords] = useState(settings.words);
  const [text, setText] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  // 每次打开都从现在保存的那份开始
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setWords(settings.words);
      setText('');
    }
  }
  const add = () => {
    // 可以一次粘贴好几个，用逗号或换行分开
    const next = normalizeNsfwWords([...words, ...text.split(/[,，\n]/)]);
    setWords(next);
    setText('');
  };
  const isDefault =
    words.length === settings.defaultWords.length &&
    words.every((w, i) => w === settings.defaultWords[i]);
  return (
    <Dialog open={open} onClose={onClose} label="敏感词" className="nsfw-dlg">
      <h3>敏感词</h3>
      <p>
        正向提示词和角色提示词里出现这些 Tag，图片就算 NSFW。只认完整的
        Tag，不分大小写，下划线当空格； 负面提示词里的、权重是负数的不算。手动标记过的图不受影响。
      </p>
      <div className="nsfw-words scroll">
        {words.length ? (
          words.map((w) => (
            <span key={w} className="nsfw-word mono">
              {w}
              <button
                className="btn quiet icon"
                aria-label={`去掉 ${w}`}
                onClick={() => setWords(words.filter((x) => x !== w))}
              >
                <Icon name="close-line" />
              </button>
            </span>
          ))
        ) : (
          <span className="help">没有敏感词时，不会自动把任何图判定为 NSFW</span>
        )}
      </div>
      <div className="nsfw-add">
        <label className="field sm">
          <input
            value={text}
            placeholder="加一个 Tag，可以用逗号分开写几个"
            aria-label="添加敏感词"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button className="btn" disabled={!normalizeNsfwWord(text)} onClick={add}>
          添加
        </button>
      </div>
      <div className="acts">
        <button
          className="btn quiet nsfw-reset"
          disabled={isDefault}
          onClick={() => setWords(settings.defaultWords)}
        >
          恢复默认
        </button>
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button className="btn ink" onClick={() => onSave(words)}>
          保存
        </button>
      </div>
    </Dialog>
  );
}
