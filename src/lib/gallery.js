import { filterGalleryProjects } from './galleryFilters.js';
import {
  galleryBasePromptPayloadSimilarity,
  galleryBasePromptSimilarityPayload,
  galleryGroupingBoundaryFingerprint,
  galleryGroupingFingerprint,
  isExactGalleryGrouping,
  normalizeGalleryGrouping,
} from './galleryGrouping.js';

function galleryProjectDate(project) {
  return new Date(project.created_at || 0).getTime() || 0;
}

function completeLinkSimilarityClusters(projects, threshold) {
  const ordered = [...projects].sort((left, right) => (
    galleryProjectDate(left) - galleryProjectDate(right)
    || String(left.id).localeCompare(String(right.id))
  ));
  const payloads = ordered.map(galleryBasePromptSimilarityPayload);
  const similarities = Array.from({ length: ordered.length }, () => Array(ordered.length).fill(0));
  const edges = [];
  for (let left = 0; left < ordered.length; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) {
      const score = galleryBasePromptPayloadSimilarity(payloads[left], payloads[right]);
      similarities[left][right] = score;
      similarities[right][left] = score;
      if (score >= threshold) edges.push({ left, right, score });
    }
  }
  edges.sort((a, b) => b.score - a.score || a.left - b.left || a.right - b.right);

  const parents = ordered.map((_project, index) => index);
  const clusterMembers = new Map(ordered.map((_project, index) => [index, new Set([index])]));
  const find = (index) => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    let cursor = index;
    while (parents[cursor] !== cursor) {
      const next = parents[cursor];
      parents[cursor] = root;
      cursor = next;
    }
    return root;
  };

  for (const edge of edges) {
    const leftRoot = find(edge.left);
    const rightRoot = find(edge.right);
    if (leftRoot === rightRoot) continue;
    const leftMembers = clusterMembers.get(leftRoot);
    const rightMembers = clusterMembers.get(rightRoot);
    const compatible = [...leftMembers].every((left) => (
      [...rightMembers].every((right) => similarities[left][right] >= threshold)
    ));
    if (!compatible) continue;
    const [nextRoot, mergedRoot] = leftRoot < rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot];
    parents[mergedRoot] = nextRoot;
    clusterMembers.set(nextRoot, new Set([...clusterMembers.get(nextRoot), ...clusterMembers.get(mergedRoot)]));
    clusterMembers.delete(mergedRoot);
  }

  return [...clusterMembers.values()].map((indices) => [...indices].map((index) => ordered[index]));
}

function finalizeGalleryGroup(group, grouping, exact = false) {
  const members = [...group.members].sort((left, right) => galleryProjectDate(right) - galleryProjectDate(left));
  const requestedCover = exact
    ? members.find((project) => members.some((member) => member.group_cover_id === project.id))
    : null;
  const cover = requestedCover || members[0];
  return {
    ...group,
    cover,
    canSetCover: exact && Boolean(group.fingerprint),
    grouping,
    members,
    id: group.key,
    latestAt: members[0]?.created_at || '',
    count: members.length,
  };
}

function groupSimilarGalleryProjects(projects, grouping) {
  const buckets = new Map();
  for (const project of projects) {
    const boundary = galleryGroupingBoundaryFingerprint(project, grouping);
    if (!buckets.has(boundary)) buckets.set(boundary, []);
    buckets.get(boundary).push(project);
  }
  const threshold = grouping.similarityThreshold / 100;
  return [...buckets.entries()].flatMap(([boundary, members]) => (
    completeLinkSimilarityClusters(members, threshold).map((cluster) => finalizeGalleryGroup({
      key: `similar:${grouping.similarityThreshold}:${boundary}:${cluster.map((project) => project.id).sort().join('|')}`,
      fingerprint: '',
      members: cluster,
    }, grouping, false))
  ));
}

export function groupGalleryProjects(projects = [], groupingValue) {
  const grouping = normalizeGalleryGrouping(groupingValue);
  if (grouping.promptScope === 'similar') return groupSimilarGalleryProjects(projects, grouping);
  const exact = isExactGalleryGrouping(grouping);
  const groups = new Map();
  for (const project of projects) {
    const fingerprint = galleryGroupingFingerprint(project, grouping);
    const key = fingerprint ? `group:${fingerprint}` : `project:${project.id}`;
    if (!groups.has(key)) groups.set(key, { key, fingerprint, members: [] });
    groups.get(key).members.push(project);
  }
  return [...groups.values()].map((group) => finalizeGalleryGroup(group, grouping, exact));
}

export function sortGalleryGroups(groups = [], sort = 'recent') {
  return [...groups].sort((left, right) => {
    if (sort === 'oldest') return new Date(left.latestAt || 0) - new Date(right.latestAt || 0);
    if (sort === 'name') return String(left.cover?.name || '').localeCompare(String(right.cover?.name || ''), 'zh-CN', { numeric: true });
    return new Date(right.latestAt || 0) - new Date(left.latestAt || 0);
  });
}

export function galleryViewGroups(projects = [], filters, grouping, sort = 'recent', nowValue = new Date()) {
  const filteredProjects = filterGalleryProjects(projects, filters, nowValue);
  return sortGalleryGroups(groupGalleryProjects(filteredProjects, grouping), sort);
}

export function gallerySelectionProjectIds(groups = [], selectedGroupIds = []) {
  const selected = new Set(selectedGroupIds);
  return groups.filter((group) => selected.has(group.id)).flatMap((group) => group.members.map((project) => project.id));
}

export function galleryScrubMemberIndex(pointerX, boundsLeft, boundsWidth, memberCount) {
  const count = Math.max(0, Math.trunc(Number(memberCount) || 0));
  const width = Number(boundsWidth);
  if (count <= 1 || !Number.isFinite(width) || width <= 0) return 0;
  const progress = (Number(pointerX) - Number(boundsLeft)) / width;
  const normalizedProgress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return Math.min(count - 1, Math.floor(normalizedProgress * count));
}

export function galleryGroupMember(group, projectId) {
  return group?.members?.find((project) => project.id === projectId) || group?.cover;
}

export function isGalleryBlankClickTarget(target) {
  return !target?.closest?.('.gallery-card');
}

export function shouldCollapseGalleryPreview(target, pinned = false) {
  return !pinned && isGalleryBlankClickTarget(target);
}

export function reconcileGallerySelection(groups = [], selectedGroupIds = []) {
  const visible = new Set(groups.map((group) => group.id));
  return selectedGroupIds.filter((id) => visible.has(id));
}

export function galleryGroupMenuLabels(group) {
  const grouped = Number(group?.count || group?.members?.length || 0) > 1;
  return {
    rename: grouped ? (group?.canSetCover ? '重命名头图' : '重命名当前图片') : '重命名',
  };
}

export function gallerySelectionMenuItems({
  activeCollection,
  collections = [],
  groupCount = 0,
  imageCount = 0,
  onCollectionProjectsChange,
  onPermanentDelete,
  onRestore,
  onTrash,
  projectIds = [],
  view = 'all',
}) {
  const scopeLabel = `${groupCount} 组 · ${imageCount} 张图片`;
  if (view === 'trash') return [
    { key: 'restore-selection', label: `恢复已选 ${scopeLabel}`, onClick: () => onRestore?.() },
    { key: 'permanent-selection', label: `永久删除已选 ${scopeLabel}`, danger: true, onClick: () => onPermanentDelete?.() },
  ];
  const manualCollections = collections.filter((collection) => collection.kind === 'manual');
  return [
    ...(manualCollections.length ? [{
      children: manualCollections.map((collection) => ({
        key: `add-selection-to-${collection.id}`,
        label: collection.name,
        onClick: () => onCollectionProjectsChange?.(collection.id, projectIds, 'add'),
      })),
      key: 'add-selection-to-collection',
      label: `将已选 ${groupCount} 组加入收藏集`,
      type: 'submenu',
    }] : []),
    ...(activeCollection?.kind === 'manual' ? [{
      key: 'remove-selection-from-collection',
      label: `将已选 ${groupCount} 组移出“${activeCollection.name}”`,
      onClick: () => onCollectionProjectsChange?.(activeCollection.id, projectIds, 'remove'),
    }] : []),
    ...((manualCollections.length || activeCollection?.kind === 'manual') ? [{ key: 'selection-divider', type: 'divider' }] : []),
    { key: 'trash-selection', label: `将已选 ${scopeLabel} 移入回收站`, danger: true, onClick: () => onTrash?.() },
  ];
}

export function galleryEmptyState(view = 'all', filtered = false) {
  if (filtered) {
    return {
      description: '尝试其他关键词，或调整筛选条件。',
      icon: 'search',
      title: '没有匹配的图片',
    };
  }
  if (view === 'trash') {
    return {
      description: '移入回收站的图片会显示在这里。',
      icon: 'trash',
      title: '回收站为空',
    };
  }
  return {
    description: '拖入图片，或点击右上角“导入图片”。',
    icon: 'image',
    title: '图片库为空',
  };
}

export function adjacentGallerySelection(groups = [], currentGroupId, removedProjectId) {
  const groupIndex = groups.findIndex((group) => group.id === currentGroupId);
  const group = groups[groupIndex];
  if (!group) return { groupId: '', projectId: '' };
  const memberIndex = group.members.findIndex((project) => project.id === removedProjectId);
  const remaining = group.members.filter((project) => project.id !== removedProjectId);
  if (remaining.length) {
    return {
      groupId: group.id,
      projectId: remaining[Math.min(memberIndex, remaining.length - 1)].id,
    };
  }
  const adjacent = groups[groupIndex + 1] || groups[groupIndex - 1];
  return { groupId: adjacent?.id || '', projectId: adjacent?.cover?.id || '' };
}
