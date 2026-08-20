export function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

export function shouldResetImageStageLoading(previousFilePath, filePath) {
  return previousFilePath !== filePath;
}
