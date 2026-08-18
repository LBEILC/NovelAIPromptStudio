import {
  Check,
  CircleAlert,
  CircleHelp,
  Copy,
  Download,
  FolderOpen,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Info,
  Layers3,
  LayoutGrid,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  RotateCw,
  Star,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Tags,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Icon as LobeIcon } from '@lobehub/ui';

const ICONS = {
  check: Check,
  close: X,
  copy: Copy,
  download: Download,
  edit: Pencil,
  folder: FolderOpen,
  flipHorizontal: FlipHorizontal,
  flipVertical: FlipVertical,
  image: ImageIcon,
  info: Info,
  library: LayoutGrid,
  layers: Layers3,
  plus: Plus,
  previous: ChevronLeft,
  next: ChevronRight,
  pin: Pin,
  pinOff: PinOff,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  spark: Sparkles,
  star: Star,
  tags: Tags,
  restore: RotateCcw,
  rotateLeft: RotateCcw,
  rotateRight: RotateCw,
  trash: Trash2,
  upload: Upload,
  warning: CircleAlert,
  zoomIn: ZoomIn,
  zoomOut: ZoomOut,
};

export function getIconComponent(name) {
  return ICONS[name] || CircleHelp;
}

export default function Icon({ name, size = 17, strokeWidth = 1.8, ...props }) {
  const Component = getIconComponent(name);
  return <LobeIcon aria-hidden="true" focusable="false" icon={Component} size={size} strokeWidth={strokeWidth} {...props}/>;
}
