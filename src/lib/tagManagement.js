import { formatTagLabel } from './prompt.js';

export function tagPresentation(tag, language = 'original') {
  const original = formatTagLabel(tag);
  if (language === 'translated') {
    return {
      primary: tag.translation || tag.tag,
      secondary: '',
      title: tag.translation ? `原文：${original}` : `暂无翻译 · 原文：${original}`,
      fallback: !tag.translation,
    };
  }
  if (language === 'bilingual') {
    return {
      primary: original,
      secondary: tag.translation || '暂无翻译',
      title: tag.translation ? `原文：${original}\n翻译：${tag.translation}` : `原文：${original}\n暂无翻译`,
      fallback: !tag.translation,
    };
  }
  return {
    primary: original,
    secondary: '',
    title: tag.translation ? `翻译：${tag.translation}` : '暂无翻译',
    fallback: false,
  };
}
