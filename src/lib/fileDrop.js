export function installFileDrop(element, { assess, onChange, onDrop }) {
  let depth = 0;
  const containsFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
  const reset = () => {
    depth = 0;
    onChange({ active: false });
  };
  const preventNavigation = (event) => {
    if (containsFiles(event)) event.preventDefault();
  };
  const update = (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    onChange({ active: true, ...assess(Array.from(event.dataTransfer.files || [])) });
  };
  const enter = (event) => {
    if (containsFiles(event)) {
      depth++;
      update(event);
    }
  };
  const leave = (event) => {
    if (containsFiles(event) && --depth <= 0) reset();
  };
  const drop = (event) => {
    if (!containsFiles(event)) return;
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    reset();
    if (files.length) onDrop(files);
  };
  element.addEventListener('dragenter', enter);
  element.addEventListener('dragover', update);
  element.addEventListener('dragleave', leave);
  element.addEventListener('drop', drop);
  window.addEventListener('dragover', preventNavigation);
  window.addEventListener('drop', preventNavigation);
  window.addEventListener('dragend', reset);
  window.addEventListener('blur', reset);
  return () => {
    element.removeEventListener('dragenter', enter);
    element.removeEventListener('dragover', update);
    element.removeEventListener('dragleave', leave);
    element.removeEventListener('drop', drop);
    window.removeEventListener('dragover', preventNavigation);
    window.removeEventListener('drop', preventNavigation);
    window.removeEventListener('dragend', reset);
    window.removeEventListener('blur', reset);
  };
}
