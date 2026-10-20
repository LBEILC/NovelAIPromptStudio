// 工作台（doc/design.md 2.9、2.14）：三栏，左边版本（配置了 NovelAI 账号时才有）、中间舞台、右边提示词栏。
// 切换标签页：图片朝新标签页的方向换内容，提示词栏只淡出淡入。提示词栏左边线可以拖宽（最窄 --prompt-min-w）。
import { useLayoutEffect, useRef, useState } from 'react';
import { WorkbenchEditor, type EditorProps } from './Prompt';
import { WorkbenchImage } from './Image';
import { GenerationBar, GenerationSetup } from './GenerationBar';
import { Versions } from './Versions';
import { useGeneration } from '../state/generation';
import { activeWorkbenchTab } from '../lib/workbenchSession.js';
import { WORKBENCH_SOURCE_PANEL_WIDTH_KEY } from '../lib/panelLayout.js';
import { EmptyMark, Icon } from '../kit/controls';
import { ms } from '../kit/motion';
import { useResizable } from '../kit/resize';
import type { WorkbenchSession } from '../state/workbench';
import type { ImageProject, Vibe } from '../shared/types';

export interface WorkbenchPageProps
  extends Pick<
    EditorProps,
    'onCopyText' | 'onConfirm' | 'onNotify' | 'onTranslateTags' | 'onUpdateProject'
  > {
  session: WorkbenchSession;
  onShowMaterials?: (kind?: string, id?: string) => void;
  beforeGeneration?: () => Promise<void>;
  onConfigureGeneration: () => void;
  error: string;
  loading: boolean;
  onChooseImage: () => void;
  onClipboardImage: () => void;
  onBrowseLibrary?: () => void;
  onReset: () => void;
  onCopyImage: (project: ImageProject) => void;
  onDownloadImage: (project: ImageProject) => void;
  onSaveLibrary: () => void;
  onReveal: () => void;
  onRevealVibe: (vibe: Vibe) => void;
  onUpdateViewState: (tabId: string, state: EditorProps['viewState']) => void;
  /** 下面这些旧接口还留着，新界面不用 */
  onActivateTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onReorderTab?: (id: string, target: string) => void;
  focusScopeKey?: string;
  focusTagId?: string | null;
}
export default function WorkbenchPage(p: WorkbenchPageProps) {
  const generation = useGeneration();
  const [proposal, setProposal] = useState(false);
  const tab = activeWorkbenchTab(p.session);
  const prompt = useRef<HTMLDivElement>(null);
  const rz = useResizable(prompt, {
    key: 'prompt',
    edge: 'left',
    min: () => ms('--prompt-min-w') || 440,
    max: () =>
      Math.max(
        ms('--prompt-w'),
        innerWidth - (generation.settings.hasToken ? ms('--versions-w') : 0) - ms('--popover-w'),
      ),
    def: () => ms('--prompt-w'),
    storage: WORKBENCH_SOURCE_PANEL_WIDTH_KEY,
    label: '提示词栏宽度',
  });
  // 图片朝新标签页的方向换内容
  const previous = useRef(p.session.activeTabId);
  const order = p.session.tabs.map((t) => t.id);
  const dir = Math.sign(order.indexOf(tab?.id || '') - order.indexOf(previous.current));
  useLayoutEffect(() => {
    previous.current = tab?.id || '';
  });
  // 每个标签页记住提示词栏滚到哪里
  const scrolls = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = prompt.current?.querySelector<HTMLElement>('.pane-swap > .scroll');
    if (!el || !tab) return;
    el.scrollTop = scrolls.current.get(tab.id) || 0;
    const remember = () => scrolls.current.set(tab.id, el.scrollTop);
    el.addEventListener('scroll', remember);
    return () => el.removeEventListener('scroll', remember);
  }, [tab?.id]);
  if (!tab)
    return (
      <div className="body" data-enter="fade">
        <div className="empty">
          <EmptyMark />
          <h3>将 NovelAI 图片拖到此处</h3>
          <p>读取提示词和全部参数，整理修改后可直接生成新版本。</p>
          <div className="acts">
            <button className={`btn ink ${p.loading ? 'loading' : ''}`} onClick={p.onChooseImage}>
              <Icon name={p.loading ? 'loader-4-line' : 'folder-open-line'} />
              打开图片
            </button>
            {p.onBrowseLibrary && (
              <button className="btn" onClick={p.onBrowseLibrary}>
                从图片库打开
              </button>
            )}
            <button className="btn quiet" onClick={p.onClipboardImage}>
              从剪贴板打开
            </button>
          </div>
          <span className="fine">打开图片不会修改原图，也不会自动存进图片库。</span>
          {p.error && (
            <div className="banner danger">
              <Icon name="error-warning-line" />
              <span className="selectable">{p.error}</span>
            </div>
          )}
        </div>
      </div>
    );
  return (
    <div className="body wb-body" data-project-id={tab.source.projectId || tab.project?.id}>
      {generation.settings.hasToken && <Versions tab={tab} before={p.beforeGeneration} />}
      <WorkbenchImage
        tab={tab}
        dir={dir}
        onCopyImage={p.onCopyImage}
        onDownloadImage={p.onDownloadImage}
        onReset={p.onReset}
        onSaveLibrary={p.onSaveLibrary}
        onReveal={p.onReveal}
        onRevealVibe={p.onRevealVibe}
      />
      <div className="col prompt" ref={prompt}>
        {rz.handle}
        {p.error && (
          <div className="stage-banner">
            <div className="banner danger">
              <Icon name="error-warning-line" />
              <span className="selectable">{p.error}</span>
            </div>
          </div>
        )}
        {tab.project && (
          <div className="prompt-in" key={tab.id} data-enter="fade">
            <WorkbenchEditor
              {...p}
              project={tab.project}
              tabId={tab.id}
              before={p.beforeGeneration}
              onProposalChange={setProposal}
              viewState={tab.viewState}
              onViewStateChange={(state) => p.onUpdateViewState(tab.id, state)}
              footer={
                generation.settings.hasToken ? (
                  <GenerationBar tab={tab} before={p.beforeGeneration} proposal={proposal} />
                ) : (
                  <GenerationSetup onConfigure={p.onConfigureGeneration} />
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
