import { allPromptTags } from './promptStructure.js';
import { expandSearch, normalizeSearch } from './prompt.js';

export function groupGalleryProjects(projects = []) {
  const groups = new Map();
  for (const project of projects) {
    const fingerprint = String(project.prompt_fingerprint || '');
    const key = fingerprint ? `prompt:${fingerprint}` : `project:${project.id}`;
    if (!groups.has(key)) groups.set(key, { key, fingerprint, members: [] });
    groups.get(key).members.push(project);
  }
  return [...groups.values()].map((group) => {
    const members = [...group.members].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
    const requestedCover = members.find((project) => project.id === members[0]?.group_cover_id)
      || members.find((project) => project.id === project.group_cover_id);
    const cover = requestedCover || members[0];
    return {
      ...group,
      cover,
      members,
      id: group.key,
      latestAt: members[0]?.created_at || '',
      count: members.length,
    };
  });
}

export function filterAndSortGalleryGroups(groups = [], query = '', sort = 'recent') {
  const needles = expandSearch(query);
  const matched = needles.length ? groups.filter((group) => group.members.some((project) => (
    [project.name, ...allPromptTags(project).flatMap((tag) => [tag.tag, tag.translation])]
      .some((value) => needles.some((needle) => normalizeSearch(value).includes(needle)))
  ))) : groups;
  return [...matched].sort((left, right) => {
    if (sort === 'oldest') return new Date(left.latestAt || 0) - new Date(right.latestAt || 0);
    if (sort === 'name') return String(left.cover?.name || '').localeCompare(String(right.cover?.name || ''), 'zh-CN', { numeric: true });
    return new Date(right.latestAt || 0) - new Date(left.latestAt || 0);
  });
}

export function gallerySelectionProjectIds(groups = [], selectedGroupIds = []) {
  const selected = new Set(selectedGroupIds);
  return groups.filter((group) => selected.has(group.id)).flatMap((group) => group.members.map((project) => project.id));
}

export function reconcileGallerySelection(groups = [], selectedGroupIds = []) {
  const visible = new Set(groups.map((group) => group.id));
  return selectedGroupIds.filter((id) => visible.has(id));
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
