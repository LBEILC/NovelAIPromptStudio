import {
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  FolderOpen,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import LobeIcon from '@lobehub/ui/es/Icon/index';

const ICONS = {
  check: Check,
  close: X,
  copy: Copy,
  edit: Pencil,
  folder: FolderOpen,
  image: ImageIcon,
  info: Info,
  library: LayoutGrid,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  spark: Sparkles,
  trash: Trash2,
  upload: Upload,
  warning: CircleAlert,
};

export default function Icon({ name, size = 17, strokeWidth = 1.8, ...props }) {
  const Component = ICONS[name] || CircleHelp;
  return <LobeIcon aria-hidden="true" focusable="false" icon={Component} size={size} strokeWidth={strokeWidth} {...props}/>;
}
