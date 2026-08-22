export default function WorkbenchTabDragOverlay({ active = false, dirty = false, imageSrc = '', position = 1 }) {
  return <div
    aria-hidden="true"
    className={`workbench-tab-drag-overlay ${active ? 'active' : ''}`}
  >
    <span className="workbench-tab-label">
      <span className="workbench-tab-thumbnail">
        {imageSrc ? <img alt="" draggable="false" src={imageSrc}/> : null}
      </span>
      <span className="workbench-tab-position">{position}</span>
      {dirty && <span className="workbench-tab-dirty"/>}
      <span className="workbench-tab-close">×</span>
    </span>
  </div>;
}
