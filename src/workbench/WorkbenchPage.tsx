import { useLayoutEffect, useRef, useState } from 'react';
import { Banner, Button, EmptyMark, EmptyState, ResizablePanel } from '../ui';
import { WorkbenchEditor, type EditorProps } from './Editor';
import { WorkbenchImage } from './Image';
import type { WorkbenchSession } from '../state/workbench';
import type { ImageProject, Vibe } from '../shared/types';
import { activeWorkbenchTab } from '../lib/workbenchSession.js';
import { WORKBENCH_SOURCE_PANEL_WIDTH_KEY } from '../lib/panelLayout.js';
import './workbench.css';
import { TransitionSurface } from '../ui/transitions';
import { GenerationBar, GenerationSetup } from './GenerationBar';
import { useGeneration } from '../state/generation';
import { Versions } from './Versions';

export interface WorkbenchPageProps
  extends Pick<
    EditorProps,
    'onCopyText' | 'onConfirm' | 'onNotify' | 'onTranslateTags' | 'onUpdateProject'
  > {
  session: WorkbenchSession;
  onShowMaterials?: (kind?: string) => void;
  beforeGeneration?: () => Promise<void>;
  onConfigureGeneration: () => void;
  error: string;
  loading: boolean;
  onChooseImage: () => void;
  onClipboardImage: () => void;
  onReset: () => void;
  onCopyImage: (project: ImageProject) => void;
  onDownloadImage: (project: ImageProject) => void;
  onSaveLibrary: () => void;
  onReveal: () => void;
  onRevealVibe: (vibe: Vibe) => void;
  onUpdateViewState: (tabId: string, state: EditorProps['viewState']) => void;
}
export default function WorkbenchPage(p: WorkbenchPageProps) {
  const generation = useGeneration();
  const [proposal, setProposal] = useState(false);
  const defaultWidth = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--prompt-w'),
  );
  const [width, setWidth] = useState(
    () => Number(localStorage.getItem(WORKBENCH_SOURCE_PANEL_WIDTH_KEY)) || defaultWidth,
  );
  const tab = activeWorkbenchTab(p.session);
  const previous = useRef(p.session.activeTabId);
  const oldIndex = p.session.tabs.findIndex((item) => item.id === previous.current);
  const index = p.session.tabs.findIndex((item) => item.id === tab?.id);
  const direction = Math.sign(index - oldIndex);
  const scrollPositions = useRef(new Map<string, number>());
  const prompt = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    previous.current = tab?.id || '';
    const node = prompt.current?.querySelector<HTMLElement>('.wb-document-scroll');
    if (!node || !tab) return;
    node.scrollTop = scrollPositions.current.get(tab.id) || 0;
    const remember = () => scrollPositions.current.set(tab.id, node.scrollTop);
    node.addEventListener('scroll', remember);
    return () => {
      node.removeEventListener('scroll', remember);
    };
  }, [tab?.id]);
  if (!tab)
    return (
      <main className="workbench-page wb-empty">
        <EmptyState
          graphic={<EmptyMark />}
          title="把一张 NovelAI 图片拖到这里"
          description="软件会读出它的提示词和参数。可以同时打开多张，每张一个标签页。"
          actions={
            <>
              <Button variant="ink" loading={p.loading} onClick={p.onChooseImage}>
                打开图片
              </Button>
              <Button onClick={p.onClipboardImage}>从剪贴板打开</Button>
            </>
          }
          fine="打开图片不会修改原图，也不会自动存进图片库。"
        />
        {p.error && <Banner tone="danger">{p.error}</Banner>}
      </main>
    );
  return (
    <main
      className="workbench-page workbench-active-page wb-page"
      data-project-id={tab.source.projectId || tab.project?.id}
    >
      {p.error && <Banner tone="danger">{p.error}</Banner>}
      <div className="wb-body">
        {generation.settings.hasToken && <Versions tab={tab} before={p.beforeGeneration} />}
        <TransitionSurface change={tab.id} direction={direction} className="wb-image-transition">
          <WorkbenchImage
            key={tab.id}
            tab={tab}
            onCopyImage={p.onCopyImage}
            onDownloadImage={p.onDownloadImage}
            onReset={p.onReset}
            onSaveLibrary={p.onSaveLibrary}
            onReveal={p.onReveal}
            onRevealVibe={p.onRevealVibe}
          />
        </TransitionSurface>
        <ResizablePanel
          width={width}
          defaultWidth={defaultWidth}
          min={parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--prompt-min-w'),
          )}
          max={Math.max(
            defaultWidth,
            window.innerWidth -
              parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue('--popover-w'),
              ) -
              (generation.settings.hasToken
                ? parseFloat(
                    getComputedStyle(document.documentElement).getPropertyValue('--versions-w'),
                  )
                : 0),
          )}
          edge="left"
          label="提示词栏宽度"
          onWidthChange={(value) => {
            setWidth(value);
            localStorage.setItem(WORKBENCH_SOURCE_PANEL_WIDTH_KEY, String(value));
          }}
        >
          <TransitionSurface change={tab.id} className="wb-prompt-transition" nodeRef={prompt}>
            {tab.project && (
              <WorkbenchEditor
                key={tab.id}
                {...p}
                project={tab.project}
                tabId={tab.id}
                before={p.beforeGeneration}
                onProposalChange={setProposal}
                generationSetup={
                  !generation.settings.hasToken ? (
                    <GenerationSetup onConfigure={p.onConfigureGeneration} />
                  ) : undefined
                }
                generationFooter={
                  generation.settings.hasToken ? (
                    <GenerationBar tab={tab} before={p.beforeGeneration} proposal={proposal} />
                  ) : undefined
                }
                viewState={tab.viewState}
                onViewStateChange={(state) => p.onUpdateViewState(tab.id, state)}
              />
            )}
          </TransitionSurface>
        </ResizablePanel>
      </div>
    </main>
  );
}
