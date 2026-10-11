// Keep page/state coverage here as the application migrates.
export const screenshotScenes = [
  { name: 'workbench', page: 'workbench', workbench: true },
  { name: 'workbench-empty', page: 'workbench' },
  { name: 'gallery', page: 'gallery', select: true },
  { name: 'gallery-collections', page: 'gallery', collections: true },
  { name: 'gallery-trash', page: 'gallery', view: 'trash' },
  ...['appearance', 'storage', 'ai', 'tags', 'updates'].map((section) => ({
    name: `settings-${section}`,
    page: 'settings',
    section,
  })),
];
