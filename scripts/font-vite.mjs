import { checkFont } from './fonts.mjs';

export function bundledMiSans() {
  const id = '\0virtual:misans.css';
  let bytes;
  let building = false;
  return {
    name: 'bundled-misans',
    async configResolved(config) {
      building = config.command === 'build';
      try {
        bytes = await checkFont();
      } catch {
        console.warn('警告：MiSans 缺失或 SHA-256 不符，使用替补字体；运行 npm run fonts 获取。');
      }
    },
    resolveId(source) {
      if (source === 'virtual:misans.css') return id;
    },
    load(source) {
      if (source !== id) return;
      if (!bytes) return '';
      const url = building
        ? `__VITE_ASSET__${this.emitFile({ type: 'asset', name: 'MiSansVF.ttf', source: bytes })}__`
        : '/__fonts/MiSansVF.ttf';
      return ['MiSans', 'NPS MiSans', 'MiSans VF']
        .map(
          (family) =>
            `@font-face { font-family: "${family}"; src: url("${url}") format("truetype"); font-style: normal; font-weight: 150 700; font-display: swap; }`,
        )
        .join('\n');
    },
    configureServer(server) {
      server.middlewares.use('/__fonts/MiSansVF.ttf', (_request, response) => {
        response.statusCode = bytes ? 200 : 404;
        response.setHeader('Content-Type', 'font/ttf');
        response.end(bytes);
      });
    },
  };
}
