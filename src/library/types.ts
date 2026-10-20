import type {
  Collection,
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
  coverImage?: LibraryCard['work_cover'];
  grouping: Grouping;
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
  onOpenWorkbench: (project: LibraryCard | ImageRecord) => void;
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
  ) => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
  onImport: () => void;
  onImportClipboard: () => void;
}
