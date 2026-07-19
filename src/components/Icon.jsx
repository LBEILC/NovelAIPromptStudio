import {
  Archive,
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  Ellipsis,
  FolderOpen,
  GripVertical,
  History,
  Image as ImageIcon,
  Info,
  Layers3,
  LayoutGrid,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import LobeIcon from '@lobehub/ui/es/Icon/index';

const ICONS = {
  archive: Archive,
  check: Check,
  close: X,
  copy: Copy,
  dots: Ellipsis,
  edit: Pencil,
  folder: FolderOpen,
  grip: GripVertical,
  history: History,
  image: ImageIcon,
  info: Info,
  layers: Layers3,
  library: LayoutGrid,
  lock: LockKeyhole,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  spark: Sparkles,
  star: Star,
  trash: Trash2,
  upload: Upload,
  warning: CircleAlert,
};

export default function Icon({ name, size = 17, strokeWidth = 1.8, ...props }) {
  const Component = ICONS[name] || CircleHelp;
  return <LobeIcon aria-hidden="true" focusable="false" icon={Component} size={size} strokeWidth={strokeWidth} {...props}/>;
}
