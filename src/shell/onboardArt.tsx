// 引导每一页上面的示意（doc/design.md 2.36）：用产品自己的 Tag、按钮、Seg 这些组件的样子配固定的假数据拼一小块，
// 不截图，深浅色和缩放都跟着走。只做局部，不放整页；整块 inert，点不到、不调命令。
// 提示词和名字都是虚构的。动效只说明"什么变了"（Tag 一个个出现、涂抹出现、版本一行行出现），减少动态效果时关掉。
import type { CSSProperties, ReactNode } from 'react';
import { Icon, Kbd } from '../kit/controls';

const tag = (en: string, zh: string, tc: string, i: number, w?: number) => (
  <span className="tag" data-tc={tc} key={en} style={{ '--i': i } as CSSProperties}>
    <span className="t">
      <span className="en">{en}</span>
      <span className="zh">{zh}</span>
    </span>
    {w && <span className="w">{w}</span>}
  </span>
);
const Frame = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`oba ${className}`} inert aria-hidden="true">
    {children}
  </div>
);

export type ArtId = 'recover' | 'tidy' | 'folder' | 'token' | 'fix' | 'agent' | 'more';
export function OnboardArt({ id }: { id: ArtId }) {
  switch (id) {
    case 'recover':
      return (
        <Frame className="oba-recover">
          <span className="oba-pic">
            <Icon name="image-line" />
          </span>
          <Icon name="arrow-right-line" className="oba-arrow" />
          <div className="oba-card">
            <span className="oba-cap">TAG 块 · 4 个</span>
            <div className="tags">
              {tag('1girl', '1名女孩', 'subject', 0)}
              {tag('rain', '雨', 'environment', 1)}
              {tag('umbrella', '雨伞', 'unsorted', 2)}
              {tag('smile', '微笑', 'action', 3)}
            </div>
            <span className="btn sm oba-copy">
              <Icon name="file-copy-line" />
              复制提示词
            </span>
          </div>
        </Frame>
      );
    case 'tidy':
      return (
        <Frame className="oba-tidy">
          <div className="oba-card">
            <span className="oba-cap">
              TAG 块 · 3 个
              <span className="sp" />
              <span className="oba-seg">
                <i className="on">块</i>
                <i>文本</i>
              </span>
            </span>
            <div className="tags">
              {tag('{night}', '夜晚', 'environment', 0)}
              {tag('street lamp', '路灯', 'environment', 1, 1.2)}
              <span
                className="tag editing"
                data-tc="clothing"
                style={{ '--i': 2 } as CSSProperties}
              >
                <span className="t">
                  <span className="en">raincoat</span>
                  <span className="zh oba-typing">雨衣</span>
                </span>
              </span>
            </div>
            <span className="oba-note">
              <Kbd keys="Mod" />
              <Kbd keys="E" /> 换成文本方式
            </span>
          </div>
        </Frame>
      );
    case 'folder':
      return (
        <Frame className="oba-folder">
          <div className="oba-side">
            <span className="on">
              <Icon name="folder-line" />
              雨天
            </span>
            <span>
              <Icon name="folder-line" />
              人物练习
            </span>
            <span>
              <Icon name="filter-3-line" />
              最近一周
            </span>
          </div>
          <div className="oba-grid">
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} style={{ '--i': i } as CSSProperties} />
            ))}
          </div>
        </Frame>
      );
    case 'token':
      return (
        <Frame className="oba-token">
          <div className="oba-vers">
            <span style={{ '--i': 0 } as CSSProperties}>原图</span>
            <span style={{ '--i': 1 } as CSSProperties}>
              第 2 版 <em className="plus">+red umbrella</em>
            </span>
            <span className="on" style={{ '--i': 2 } as CSSProperties}>
              第 3 版 <em className="wchg">rain 1.0→1.3</em>
            </span>
          </div>
          <div className="oba-bar">
            <span className="mono muted">0 Anlas</span>
            <span className="btn seal sm">生成</span>
          </div>
        </Frame>
      );
    case 'fix':
      return (
        <Frame className="oba-fix">
          <span className="oba-pic big">
            <i className="oba-box" />
            <i className="oba-mask" />
          </span>
          <div className="oba-ops">
            <span className="btn quiet sm">
              <Icon name="expand-diagonal-line" />
              放大
            </span>
            <span className="btn quiet sm">
              <Icon name="magic-line" />
              增强
            </span>
            <span className="btn quiet sm">
              <Icon name="brush-line" />
              局部重绘
            </span>
            <span className="btn quiet sm">
              <Icon name="contrast-2-line" />
              对比
            </span>
          </div>
        </Frame>
      );
    case 'agent':
      return (
        <Frame className="oba-agent">
          <div className="oba-term mono">
            <span style={{ '--i': 0 } as CSSProperties}>
              <b>$</b> nai-studio library.search --json '{`{"query":"rain"}`}'
            </span>
            <span className="muted" style={{ '--i': 1 } as CSSProperties}>
              → 12 张图
            </span>
            <span style={{ '--i': 2 } as CSSProperties}>
              <b>$</b> nai-studio generate.start --json '{`{"tabId":"…","count":2}`}'
            </span>
            <span className="muted" style={{ '--i': 3 } as CSSProperties}>
              → 待确认，等你在软件里点"生成"
            </span>
          </div>
        </Frame>
      );
    default:
      return (
        <Frame className="oba-more">
          {['局部重绘', '两张图对比', '翻译词典', '备份与恢复', '中转站'].map((x, i) => (
            <span key={x} style={{ '--i': i } as CSSProperties}>
              {x}
              <Icon name="arrow-right-s-line" />
            </span>
          ))}
        </Frame>
      );
  }
}
