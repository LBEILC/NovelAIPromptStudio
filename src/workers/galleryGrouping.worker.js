import { galleryViewGroups } from '../lib/gallery.js';

self.onmessage = ({ data }) => {
  const { id, projects, filters, grouping, sort } = data || {};
  try {
    self.postMessage({
      id,
      groups: galleryViewGroups(projects, filters, grouping, sort),
    });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
