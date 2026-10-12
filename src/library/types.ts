import type { Collection, GalleryFilters, ImageRecord, LibraryCard } from '../shared/types';
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
  canSetCover: boolean;
  grouping: Grouping;
}
export type CountedCollection = Collection & { image_count: number | null };
export interface LibraryProps {
  groups: LibraryGroup[];
  collections: CountedCollection[];
  activeCollection: Collection | null;
  editingSmartCollection: Collection | null;
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
  onCopyImage: (project: LibraryCard | ImageRecord) => Promise<unknown>;
  onDownloadImage: (project: LibraryCard | ImageRecord) => Promise<unknown>;
  onReveal: (project: LibraryCard | ImageRecord) => void;
  onSetCover: (group: LibraryGroup, project: LibraryCard | ImageRecord) => Promise<unknown>;
  onRename: (project: LibraryCard | ImageRecord, name: string) => Promise<boolean>;
  onRenameMany: (ids: string[], name: string) => Promise<boolean>;
  onToggleSelect: (group: LibraryGroup, event: Pick<MouseEvent, 'shiftKey'>) => void;
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
