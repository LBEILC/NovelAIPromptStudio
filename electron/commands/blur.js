// @ts-check
/** @param {Pick<import('./index.js').Services, 'database' | 'preferences' | 'emit'>} services */
export function blurCommands(services) {
  /** @type {Pick<import('./index.js').Handlers, 'library.nsfw.mark' | 'settings.blur.get' | 'settings.blur.save'>} */
  const handlers = {
    'library.nsfw.mark': (input) => {
      const { states, changed } = services.database.nsfw.mark(input.ids, input.value);
      services.emit?.({ type: 'nsfw-changed', states: changed });
      return { states };
    },
    'settings.blur.get': () => {
      if (!services.preferences) throw Error('Preferences unavailable');
      return services.preferences.blurSettings();
    },
    'settings.blur.save': (input) => {
      if (!services.preferences) throw Error('Preferences unavailable');
      const previous = services.preferences.blurSettings();
      const settings = services.preferences.saveBlurSettings(input.settings);
      const states = services.database.nsfw.setWords(settings.words);
      services.emit?.({ type: 'blur', settings });
      if (JSON.stringify(previous.words) !== JSON.stringify(settings.words))
        services.emit?.({ type: 'nsfw-changed', states });
      return settings;
    },
  };
  return handlers;
}
