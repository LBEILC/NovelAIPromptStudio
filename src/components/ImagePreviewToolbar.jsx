import { ActionIcon } from '@lobehub/ui';
import { imagePreviewActions } from '../lib/imagePreview.js';
import Icon from './Icon.jsx';

export default function ImagePreviewToolbar({ info, onCopy, onDownload }) {
  return <div className="image-preview-toolbar">
    {imagePreviewActions(info, { onCopy, onDownload }).map((action) => <ActionIcon
      disabled={action.disabled}
      icon={<Icon name={action.icon} size={16}/>}
      key={action.key}
      onClick={action.onClick}
      title={action.title}
    />)}
  </div>;
}
