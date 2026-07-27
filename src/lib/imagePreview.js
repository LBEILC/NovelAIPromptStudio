export function galleryPreviewActions(info = {}, handlers = {}) {
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
