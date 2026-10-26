export function mediaUrl(filePath, options = {}) {
  return filePath
    ? `novelai-media://file?path=${encodeURIComponent(filePath)}${options.blur ? '&blur=1' : ''}`
    : '';
}

export function shouldResetImageStageLoading(previousFilePath, filePath) {
  return previousFilePath !== filePath;
}
