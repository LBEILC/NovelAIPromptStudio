import {
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  Download,
  FolderOpen,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Pencil,
  Plus,
  RotateCcw,
  Star,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Icon as LobeIcon } from '@lobehub/ui';

const ICONS = {
  check: Check,
  close: X,
  copy: Copy,
  download: Download,
  edit: Pencil,
  folder: FolderOpen,
  image: ImageIcon,
  info: Info,
  library: LayoutGrid,
  plus: Plus,
  previous: ChevronLeft,
  next: ChevronRight,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  spark: Sparkles,
  star: Star,
  restore: RotateCcw,
  trash: Trash2,
  upload: Upload,
  warning: CircleAlert,
};

export default function Icon({ name, size = 17, strokeWidth = 1.8, ...props }) {
  const Component = ICONS[name] || CircleHelp;
  return <LobeIcon aria-hidden="true" focusable="false" icon={Component} size={size} strokeWidth={strokeWidth} {...props}/>;
}
