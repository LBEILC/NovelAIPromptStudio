// Electron.write restores the standard formats together. Calling writeBuffer
// repeatedly would replace the previous format on each call.
export function preserveClipboard(clipboard) {
  const formats = clipboard.availableFormats();
  const unknown = formats.filter(
    (format) =>
      !/^(?:text\/(?:plain|html|rtf)|image\/(?:png|jpeg|bmp)|public\.(?:utf8-plain-text|html|rtf|png|tiff)|text\/x-moz-url)$/.test(
        format,
      ),
  );
  if (unknown.length)
    throw Error(`剪贴板包含 Electron 无法完整恢复的格式，未改动剪贴板：${unknown.join(', ')}`);
  const image = clipboard.readImage();
  const data = {};
  if (formats.some((format) => /text|unicode|string/i.test(format)))
    data.text = clipboard.readText();
  if (formats.some((format) => /html/i.test(format))) data.html = clipboard.readHTML();
  if (formats.some((format) => /rtf|rich text/i.test(format))) data.rtf = clipboard.readRTF();
  if (!image.isEmpty()) data.image = image;
  const bookmark = clipboard.readBookmark();
  if (bookmark.url) {
    data.text = bookmark.url;
    data.bookmark = bookmark.title;
  }
  return () => {
    if (formats.length) clipboard.write(data);
    else clipboard.clear();
    return (
      (!Object.hasOwn(data, 'text') || clipboard.readText() === data.text) &&
      (!data.html || clipboard.readHTML() === data.html) &&
      (!data.rtf || clipboard.readRTF() === data.rtf) &&
      (!data.image || clipboard.readImage().toPNG().equals(data.image.toPNG()))
    );
  };
}
