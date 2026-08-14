export default function WorkbenchTabDragOverlay({ active = false, dirty = false, title }) {
  return <div
    aria-hidden="true"
    className={`workbench-tab-drag-overlay ${active ? 'active' : ''}`}
  >
    <span className="workbench-tab-label">
      {dirty && <span className="workbench-tab-dirty"/>}
      <span className="workbench-tab-title">{title}</span>
      <span className="workbench-tab-close">×</span>
    </span>
  </div>;
}
