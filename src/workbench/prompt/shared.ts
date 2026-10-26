import { type ReactNode } from 'react';
import { CAT_VAR } from '../../kit/categories';
import type { ImageProject, TagCategory } from '../../shared/types';
import type { WorkbenchTab } from '../../state/workbench';
import { type DocumentTag } from '../model';
export interface EditorProps {
  tabId?: string;
  project: ImageProject;
  viewState: WorkbenchTab['viewState'];
  onViewStateChange: (value: WorkbenchTab['viewState']) => void;
  onUpdateProject: (project: ImageProject) => void;
  onCopyText: (
    text: string,
    count: number,
    selected: boolean,
    ignored?: number,
    label?: string,
    automaticIgnored?: number,
  ) => void;
  onTranslateTags: (
    entries: { scopeKey: string; tag: ImageProject['tags'][number] }[],
  ) => void | Promise<unknown>;
  onNotify: (text: string, tone?: string) => void;
  onShowMaterials?: (kind?: string, id?: string) => void;
  before?: () => Promise<void>;
  onProposalChange?: (value: boolean) => void;
  onConfirm: (options: {
    title: string;
    message: string;
    detail?: string;
    okText: string;
    danger?: boolean;
  }) => Promise<boolean>;
  /** 底栏（有账号时是 GenerationBar，没有时是 GenerationSetup） */
  footer?: ReactNode;
  /** 页签那一行（提示词 / 参数 / 参考），放在列头上面 */
  header?: ReactNode;
  /** 参数或参考页签的内容；没有时显示提示词。key 变了就换内容 */
  pane?: { key: string; node: ReactNode } | null;
}
export const LANG_VIEW: Record<string, string> = {
  original: 'tags-view-en',
  translated: 'tags-view-zh',
  bilingual: '',
};
export const catVar = (c?: string) => CAT_VAR[(c as TagCategory) || 'Unsorted'] || 'unsorted';
export const syntaxNote = (t: DocumentTag['tag']) =>
  t.syntax_issue === 'control_only'
    ? '单独的 :: 是结束控制符，不是 Tag，建议删除'
    : t.syntax_issue === 'emphasis_closer'
      ? '多余的 :: 结束符；前面没有强调时相当于权重 1'
      : t.syntax_issue === 'unclosed_weight'
        ? '前一段权重没写结束的 ::，V4.5 会读成别的样子'
        : '';
export const blockKey = (si: number, bi: number) => `${si}:${bi}`;
export const findTag = (root: ParentNode | null | undefined, key: string) =>
  [...(root?.querySelectorAll<HTMLElement>('[data-tag-key]') || [])].find(
    (el) => el.dataset.tagKey === key,
  ) || null;
export const tagRef = (key: string) => ({
  get current() {
    return findTag(document.querySelector('.col.prompt'), key);
  },
});
