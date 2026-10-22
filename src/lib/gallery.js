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
  const ordered = [...projects].sort(
    (left, right) =>
      galleryProjectDate(left) - galleryProjectDate(right) ||
      String(left.id).localeCompare(String(right.id)),
  );
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
    const compatible = [...leftMembers].every((left) =>
      [...rightMembers].every((right) => similarities[left][right] >= threshold),
    );
    if (!compatible) continue;
    const [nextRoot, mergedRoot] =
      leftRoot < rightRoot ? [leftRoot, rightRoot] : [rightRoot, leftRoot];
    parents[mergedRoot] = nextRoot;
    clusterMembers.set(
      nextRoot,
      new Set([...clusterMembers.get(nextRoot), ...clusterMembers.get(mergedRoot)]),
    );
    clusterMembers.delete(mergedRoot);
  }

  return [...clusterMembers.values()].map((indices) => [...indices].map((index) => ordered[index]));
}

function finalizeGalleryGroup(group, grouping, exact = false) {
  const members = [...group.members].sort(
    (left, right) => galleryProjectDate(right) - galleryProjectDate(left),
  );
  // 封面是组里最早的一张（作品就是第 1 版的第一张）；卡片上实际画哪张由"封面"设置决定（galleryCoverMember）
  const cover = members.at(-1);
  const latestAt = members[0]?.created_at || '';
  // 作品那一组按版本栏的读法排：原图在最前，后面从早到晚（1.5.6）；其他组照旧从新到旧
  if (String(group.key).startsWith('work:')) {
    const probe = { id: group.key, members };
    members.reverse();
    members.sort((a, b) => Number(isGroupOrigin(probe, b)) - Number(isGroupOrigin(probe, a)));
  }
  return {
    ...group,
    cover,
    grouping,
    members,
    id: group.key,
    latestAt,
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
  return [...buckets.entries()].flatMap(([boundary, members]) =>
    completeLinkSimilarityClusters(members, threshold).map((cluster) =>
      finalizeGalleryGroup(
        {
          key: `similar:${grouping.similarityThreshold}:${boundary}:${cluster
            .map((project) => project.id)
            .sort()
            .join('|')}`,
          fingerprint: '',
          members: cluster,
        },
        grouping,
        false,
      ),
    ),
  );
}

export function groupGalleryProjects(projects = [], groupingValue) {
  const grouping = normalizeGalleryGrouping(groupingValue);
  // 按作品（默认，和 1.5.3 以前的样子一样）：生成的图按作品合为一组，其他图片提示词完全相同的合为一组；
  // 选别的选项时，生成的图和其他图片一样按那个选项合并
  // 1.5.6：一张图按 work_refs 进它所属的每个作品组（原图和版本里的图都算，存一份、显示几份）；
  // 没有 work_refs 的旧数据照旧按 generated_work_id
  if (grouping.promptScope === 'work') {
    const works = new Map();
    const inWork = new Set();
    if (!groupingValue?.history)
      for (const p of projects) {
        const ids = p.work_refs?.length
          ? [...new Set(p.work_refs.map((/** @type {{ workId: string }} */ r) => r.workId))]
          : p.generated_work_id
            ? [p.generated_work_id]
            : [];
        for (const id of ids) {
          if (!works.has(id)) works.set(id, []);
          works.get(id).push(p);
          inWork.add(p.id);
        }
      }
    return [
      ...groupGalleryProjects(
        projects.filter((p) => !inWork.has(p.id)),
        { ...grouping, promptScope: 'full' },
      ),
      ...Array.from(works, ([id, members]) =>
        finalizeGalleryGroup(
          { key: `work:${id}`, fingerprint: `work:${id}`, members },
          grouping,
          false,
        ),
      ),
    ];
  }
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

// ---------- 卡片的主图和多张预览（1.5.6，doc/design.md 2.23） ----------
export const GALLERY_COVERS = ['origin', 'earliest', 'latest'];
export const GALLERY_DISPLAY_DEFAULT = Object.freeze({ cover: 'earliest' });
/** 多张预览：大小到这个行高以上、一组 3 张以上就自动显示右边那一列（用户 10-22：不再是开关） */
export const GALLERY_MOSAIC_MIN_ROW = 240;
/** 右边那一列的宽度，按行高的比例 */
export const GALLERY_MOSAIC_RATIO = 0.25;

export function normalizeGalleryDisplay(value = {}) {
  return {
    cover: GALLERY_COVERS.includes(value?.cover) ? value.cover : GALLERY_DISPLAY_DEFAULT.cover,
    // 从"按提示词"切走再切回来时，回到上次选的方式
    promptScope: ['full', 'base', 'similar'].includes(value?.promptScope)
      ? value.promptScope
      : undefined,
  };
}
/** @template {{ created_at?: string }} T @param {T[]} list @returns {T[]} */
const byNewest = (list) => [...list].sort((a, b) => galleryProjectDate(b) - galleryProjectDate(a));
const groupWorkId = (group) =>
  String(group?.id || '').startsWith('work:') ? group.id.slice(5) : '';
/** 这张图是不是这一组（作品）的原图 */
export function isGroupOrigin(group, member) {
  const workId = groupWorkId(group);
  return Boolean(
    workId && member?.work_refs?.some((r) => r.workId === workId && r.role === 'origin'),
  );
}
/**
 * 卡片上的主图：原图 / 最早生成 / 最新生成（成员按新到旧排）。不是作品的一组没有原图，"原图"用最早的那张；
 * "最早""最新"都跳过原图，只算生成的图（组里只有原图时就是它）。
 */
/**
 * @template {{ id: string; work_refs?: { workId: string; role: string }[] }} M
 * @param {{ id: string; cover: M; members: M[] }} group
 * @param {'origin' | 'earliest' | 'latest'} [mode]
 * @returns {M}
 */
export function galleryCoverMember(group, mode = 'earliest') {
  const members = group?.members || [];
  // 按时间从新到旧，不依赖组内的排法（作品组是原图在前、从早到晚）
  const made = byNewest(members.filter((m) => !isGroupOrigin(group, m)));
  if (mode === 'origin')
    return members.find((m) => isGroupOrigin(group, m)) || members.at(-1) || group.cover;
  if (mode === 'latest') return made[0] || group.cover;
  return made.at(-1) || group.cover;
}
/**
 * 多张预览右边那一列：主图不是原图时放原图加最新的几张（看得到起点和现在），主图是原图时放最新的几张；
 * 放不下的算进 more（最后一格写"+N"）。
 */
/**
 * @template {{ id: string; work_refs?: { workId: string; role: string }[] }} M
 * @param {{ id: string; members: M[] }} group
 * @param {M} main
 * @returns {{ picks: M[]; more: number }}
 */
export function galleryMosaicMembers(group, main, max = 3) {
  const others = (group?.members || []).filter((m) => m.id !== main?.id);
  const origin = others.find((m) => isGroupOrigin(group, m));
  const latest = byNewest(others.filter((m) => m !== origin));
  const picks = origin ? [origin, ...latest.slice(0, max - 1)] : latest.slice(0, max);
  return { picks, more: others.length - picks.length };
}

export function sortGalleryGroups(groups = [], sort = 'recent') {
  return [...groups].sort((left, right) => {
    if (sort === 'oldest') return new Date(left.latestAt || 0) - new Date(right.latestAt || 0);
    if (sort === 'name')
      return String(left.cover?.name || '').localeCompare(
        String(right.cover?.name || ''),
        'zh-CN',
        { numeric: true },
      );
    return new Date(right.latestAt || 0) - new Date(left.latestAt || 0);
  });
}

export function galleryViewGroups(
  projects = [],
  filters,
  grouping,
  sort = 'recent',
  nowValue = new Date(),
) {
  const filteredProjects = filterGalleryProjects(projects, filters, nowValue);
  return sortGalleryGroups(groupGalleryProjects(filteredProjects, grouping), sort);
}

export function gallerySelectionProjectIds(groups = [], selectedGroupIds = []) {
  const selected = new Set(selectedGroupIds);
  // 共用的图在几个组里各有一份，按图去重（1.5.6）
  return [
    ...new Set(
      groups
        .filter((group) => selected.has(group.id))
        .flatMap((group) => group.members.map((project) => project.id)),
    ),
  ];
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
    rename: grouped ? '重命名当前图片' : '重命名',
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
  if (view === 'trash')
    return [
      { key: 'restore-selection', label: `恢复已选 ${scopeLabel}`, onClick: () => onRestore?.() },
      {
        key: 'permanent-selection',
        label: `永久删除已选 ${scopeLabel}`,
        danger: true,
        onClick: () => onPermanentDelete?.(),
      },
    ];
  const manualCollections = collections.filter((collection) => collection.kind === 'manual');
  return [
    ...(manualCollections.length
      ? [
          {
            children: manualCollections.map((collection) => ({
              key: `add-selection-to-${collection.id}`,
              label: collection.name,
              onClick: () => onCollectionProjectsChange?.(collection.id, projectIds, 'add'),
            })),
            key: 'add-selection-to-collection',
            label: `把已选 ${groupCount} 组加入收藏集`,
            type: 'submenu',
          },
        ]
      : []),
    ...(activeCollection?.kind === 'manual'
      ? [
          {
            key: 'remove-selection-from-collection',
            label: `把已选 ${groupCount} 组移出“${activeCollection.name}”`,
            onClick: () => onCollectionProjectsChange?.(activeCollection.id, projectIds, 'remove'),
          },
        ]
      : []),
    ...(manualCollections.length || activeCollection?.kind === 'manual'
      ? [{ key: 'selection-divider', type: 'divider' }]
      : []),
    {
      key: 'trash-selection',
      label: `把已选 ${scopeLabel} 移入回收站`,
      danger: true,
      onClick: () => onTrash?.(),
    },
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
