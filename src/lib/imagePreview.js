export function imagePreviewActions(info = {}, handlers = {}) {
  const actions = info.actions || {};
  const scale = Number(info.transform?.scale) || 1;
  return [
    { key: 'flip-horizontal', icon: 'flipHorizontal', title: '水平翻转', onClick: actions.onFlipX },
    { key: 'flip-vertical', icon: 'flipVertical', title: '垂直翻转', onClick: actions.onFlipY },
    { key: 'rotate-left', icon: 'rotateLeft', title: '向左旋转', onClick: actions.onRotateLeft },
    { key: 'rotate-right', icon: 'rotateRight', title: '向右旋转', onClick: actions.onRotateRight },
    { key: 'zoom-out', icon: 'zoomOut', title: '缩小', disabled: scale <= 0.32, onClick: actions.onZoomOut },
    { key: 'zoom-in', icon: 'zoomIn', title: '放大', disabled: scale >= 32, onClick: actions.onZoomIn },
    { key: 'copy', icon: 'copy', title: '复制图片', onClick: handlers.onCopy },
    { key: 'download', icon: 'download', title: '下载原图', onClick: handlers.onDownload },
  ];
}

export function fitTabPreviewCanvas(width, height, bounds = {}) {
  const sourceWidth = Number(width);
  const sourceHeight = Number(height);
  const maxWidth = Number(bounds.maxWidth) || 320;
  const maxHeight = Number(bounds.maxHeight) || 360;
  const minWidth = Math.min(maxWidth, Number(bounds.minWidth) || 220);
  const minHeight = Math.min(maxHeight, Number(bounds.minHeight) || 160);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return { width: 260, height: 260 };

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(minWidth, Math.min(maxWidth, Math.round(sourceWidth * scale))),
    height: Math.max(minHeight, Math.min(maxHeight, Math.round(sourceHeight * scale))),
  };
}
