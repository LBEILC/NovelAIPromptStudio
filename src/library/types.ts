import type {
  Collection,
  DetachedRecord,
  GalleryFilters,
  ImageRecord,
  ImageProject,
  LibraryCard,
} from '../shared/types';
import type { MouseEvent } from 'react';

export interface Grouping {
  promptScope: string;
  mergeVibes: boolean;
  similarityThreshold: number;
}
export interface LibraryGroup {
  id: string;
  fingerprint: string;
  cover: LibraryCard;
  members: LibraryCard[];
  grouping: Grouping;
  /** 回收站里"只从某个作品去掉"的一条记录（1.6.0）：这张卡片不是回收站里的图 */
  detached?: DetachedRecord;
}
export type CountedCollection = Collection & { image_count: number | null };
export interface LibraryProps {
  onRequestNameAI?: () => void;
  aiConfigured?: boolean;
  groups: LibraryGroup[];
  collections: CountedCollection[];
  activeCollection: Collection | null;
  editingSmartCollection: Collection | null;
  renameCollectionId?: string;
  filters: GalleryFilters;
  grouping: Grouping;
  filterProjects: LibraryCard[];
  filterCacheSource: LibraryCard[];
  filterScopeKey: string;
  contentKey: string;
  query: string;
  sort: string;
  view: string;
  importing: boolean;
  loading: boolean;
  updating: boolean;
  preview: LibraryCard | null;
  previewGroup: LibraryGroup | null;
  selectedGroupIds: string[];
  selectedImageCount: number;
  allCount?: number;
  trashCount?: number;
  onCollectionSelect: (id: string) => void;
  onCollectionCreate: (
    kind: string,
    name: string,
    options?: { select?: boolean },
  ) => Promise<Collection | boolean | null | undefined>;
  onCollectionRename: (collection: Collection, name: string) => Promise<unknown>;
  onCollectionDelete: (collection: Collection) => Promise<unknown>;
  onCollectionProjectsChange: (id: string, ids: string[], action: string) => Promise<unknown>;
  onCollectionRulesEdit: (collection: Collection) => void;
  onCollectionRulesSave: () => Promise<unknown>;
  onCollectionRulesCancel: () => void;
  onFiltersChange: (patch: Partial<GalleryFilters>) => void;
  onGroupingChange: (patch: Partial<Grouping>) => void;
  onSortChange: (sort: string) => void;
  onQueryChange: (query: string) => void;
  onViewChange: (view: string) => void;
  onPreview: (group: LibraryGroup, project?: LibraryCard) => void;
  /** group：从哪一组打开（作品组时回到这个作品，1.5.6） */
  onOpenWorkbench: (project: Pick<ImageRecord, 'id'>, group?: Pick<LibraryGroup, 'id'>) => void;
  /** 软件生成的图另起一个新作品（doc/design.md 2.23，1.5.5） */
  onOpenAsNewWork?: (project: Pick<ImageRecord, 'id'>) => void;
  onCopyImage: (project: LibraryCard | ImageRecord | ImageProject) => Promise<unknown>;
  onDownloadImage: (project: LibraryCard | ImageRecord | ImageProject) => Promise<unknown>;
  onReveal: (project: LibraryCard | ImageRecord) => void;
  renameRequest?: { id: string; sequence: number };
  onRequestRename?: (id: string) => void;
  onRename: (project: LibraryCard | ImageRecord, name: string) => Promise<boolean>;
  onRenameMany: (ids: string[], name: string) => Promise<boolean>;
  onToggleSelect: (
    group: LibraryGroup,
    event: Pick<MouseEvent, 'shiftKey'> & Partial<Pick<MouseEvent, 'ctrlKey' | 'metaKey'>>,
  ) => void;
  onSelectionChange: (ids: string[]) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onTrash: (ids?: string[] | null, scope?: string) => Promise<unknown>;
  onRestore: (ids?: string[] | null, scope?: string) => Promise<unknown>;
  onPermanentDelete: (
    ids?: string[] | null,
    bytes?: number | null,
    scope?: string,
    /** 一起选中的去掉的记录：确认后一起丢掉 */
    records?: DetachedRecord[],
  ) => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
  /** 放回去掉它的那个作品（1.6.0） */
  onPutBack?: (records: DetachedRecord[]) => Promise<unknown>;
  /** 不再恢复：只丢掉记录，图还在别的作品里 */
  onDiscardDetached?: (records: DetachedRecord[]) => Promise<unknown>;
  onImport: () => void;
  onImportClipboard: () => void;
}
