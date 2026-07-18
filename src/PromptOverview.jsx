import { useState } from 'react';
import { countPromptTags, getPromptScopes, updatePromptScope } from './lib/promptStructure.js';

function compactPosition(center) {
  return `${Math.round(Number(center?.x ?? 0.5) * 100)} / ${Math.round(Number(center?.y ?? 0.5) * 100)}`;
}

function ScopeTags({ scope, dragging, onDragStart, onDragEnd, onDrop, onEditTag, onKeyboardMove }) {
  return <div className={`overview-scope ${scope.polarity === 'undesired' ? 'undesired' : ''}`}>
    <div className="overview-scope-heading">
      <span>{scope.polarity === 'undesired' ? 'UNDESIRED CONTENT' : 'PROMPT'}</span>
      <b>{scope.tags.length}</b>
    </div>
    <div className="overview-tags" role="list" aria-label={scope.label}>
      {scope.tags.map((tag, index) => <button
        key={tag.id}
        className={`overview-tag cat-${String(tag.category || 'Unsorted').toLowerCase()} ${dragging?.scopeKey === scope.key && dragging.index === index ? 'dragging' : ''}`}
        draggable
        onDragStart={(event) => onDragStart(scope.key, index, event)}
        onDragEnd={onDragEnd}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => onDrop(scope, index, event)}
        onClick={() => onEditTag(scope.key, tag.id)}
        onKeyDown={(event) => onKeyboardMove(scope, index, event)}
        role="listitem"
        title={`${tag.translation || tag.tag} · 点击编辑，拖动排序`}
      >
        <span>{tag.tag}</span>
        {Math.abs(Number(tag.weight) - 1) >= 0.001 && <em>{Number(tag.weight).toFixed(2)}</em>}
      </button>)}
      {!scope.tags.length && <button className="overview-empty-tag" onClick={() => onEditTag(scope.key, null)}>+ 在右侧添加 Tag</button>}
    </div>
  </div>;
}

export default function PromptOverview({ project, updateProject, onEditTag }) {
  const [dragging, setDragging] = useState(null);
  const scopes = getPromptScopes(project);
  const baseScopes = scopes.filter((scope) => scope.kind === 'base');
  const characterScopes = scopes.filter((scope) => scope.kind === 'character');
  const structure = project.prompt_structure;

  const moveTag = (scope, sourceIndex, targetIndex) => {
    if (sourceIndex === targetIndex || sourceIndex < 0 || targetIndex < 0 || targetIndex >= scope.tags.length) return;
    const tags = [...scope.tags];
    const [moved] = tags.splice(sourceIndex, 1);
    tags.splice(targetIndex, 0, moved);
    updateProject(updatePromptScope(project, scope.key, tags));
  };

  const beginDrag = (scopeKey, index, event) => {
    setDragging({ scopeKey, index });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/json', JSON.stringify({ scopeKey, index }));
  };

  const dropTag = (scope, targetIndex, event) => {
    event.preventDefault();
    let source = dragging;
    try {
      source = JSON.parse(event.dataTransfer.getData('application/json')) || source;
    } catch {
      // Some desktop drag implementations only preserve the in-memory fallback.
    }
    if (source?.scopeKey === scope.key) moveTag(scope, Number(source.index), targetIndex);
    setDragging(null);
  };

  const keyboardMove = (scope, index, event) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    moveTag(scope, index, index + direction);
  };

  return <div className="prompt-overview">
    <header className="overview-header">
      <div>
        <span className="overview-kicker">PROMPT MAP / V4</span>
        <h2>Prompt 总览</h2>
        <p>拖动 Tag 调整顺序，点击任意 Tag 在右侧打开详细编辑。</p>
      </div>
      <div className="overview-stats">
        <span><b>{countPromptTags(project)}</b> TAGS</span>
        <span><b>{structure.characters.length}</b> CHARACTERS</span>
      </div>
    </header>

    <div className="overview-content">
      <section className="overview-layer base-layer">
        <div className="overview-layer-marker"><span>BASE</span><i/></div>
        <div className="overview-layer-body">
          <div className="overview-layer-heading"><div><strong>Base Prompt</strong><small>场景、构图、风格与角色数量</small></div><span>GLOBAL</span></div>
          {baseScopes.map((scope) => <ScopeTags key={scope.key} scope={scope} dragging={dragging} onDragStart={beginDrag} onDragEnd={() => setDragging(null)} onDrop={dropTag} onEditTag={onEditTag} onKeyboardMove={keyboardMove}/>) }
        </div>
      </section>

      {structure.characters.map((character, index) => {
        const sections = characterScopes.filter((scope) => scope.characterId === character.id);
        return <section className="overview-layer character-layer" key={character.id}>
          <div className="overview-layer-marker"><span>{String(index + 1).padStart(2, '0')}</span><i/></div>
          <div className="overview-layer-body">
            <div className="overview-layer-heading">
              <div><strong>{character.label}</strong><small>独立角色描述与排除内容</small></div>
              <button onClick={() => onEditTag(sections[0]?.key, null)}>{structure.use_coords ? `POSITION ${compactPosition(character.center)}` : 'AI POSITION'}</button>
            </div>
            {sections.map((scope) => <ScopeTags key={scope.key} scope={scope} dragging={dragging} onDragStart={beginDrag} onDragEnd={() => setDragging(null)} onDrop={dropTag} onEditTag={onEditTag} onKeyboardMove={keyboardMove}/>) }
          </div>
        </section>;
      })}

      {!structure.characters.length && <button className="overview-add-character" onClick={() => onEditTag('base:prompt', null)}>
        <span>＋</span><div><strong>还没有 Character Prompt</strong><small>在右侧 Prompt 面板添加角色，最多支持 6 个。</small></div>
      </button>}
    </div>
  </div>;
}
