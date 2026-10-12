import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import sharp from 'sharp';

export async function workbenchReferenceRenderer(output) {
  const root = path.resolve('.');
  const server = createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(
        1,
      );
      if (
        !['design/', 'demo/', 'dist/assets/', 'node_modules/remixicon/fonts/'].some((prefix) =>
          relative.startsWith(prefix),
        )
      )
        throw Error('outside reference assets');
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw Error('outside reference root');
      const type =
        {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.png': 'image/png',
          '.svg': 'image/svg+xml',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
        }[path.extname(file)] || 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': type });
      response.end(await fs.readFile(file));
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const assets = await fs.readdir(path.join(root, 'dist/assets'));
  const face = (family, prefix) =>
    `@font-face{font-family:'${family}';src:url('${base}/dist/assets/${assets.find((name) => name.startsWith(prefix))}');}`;
  const css =
    face('MiSans', 'MiSansVF-') +
    face('Newsreader', 'newsreader-latin-standard-normal-s-') +
    face('IBM Plex Mono', 'ibm-plex-mono-latin-400-') +
    `@import url('${base}/node_modules/remixicon/fonts/remixicon.css');.pv-bar,.pv-notes{display:none}.pv-stage{padding:0}.win{width:1240px;height:760px;margin:0;border:0;border-radius:0;box-shadow:none}html,body{margin:0;overflow:hidden}`;
  const directory = path.join(output, 'workbench-comparisons');
  await fs.mkdir(directory, { recursive: true });
  return {
    async capture(state, theme, applicationFile, window) {
      window.webContents.session.webRequest.onBeforeRequest(
        { urls: ['http://*/*', 'https://*/*'] },
        (request, callback) => callback({ cancel: !request.url.startsWith(base + '/') }),
      );
      await window.loadURL(
        `${base}/design/preview.html?page=wb&sub=${state}&theme=${theme}&stage=1.0`,
      );
      await window.webContents.insertCSS(css);
      await window.webContents.insertCSS(
        await fs
          .readFile(path.join(root, 'node_modules/remixicon/fonts/remixicon.css'), 'utf8')
          .then((s) =>
            s
              .replaceAll('url("', 'url("' + base + '/node_modules/remixicon/fonts/')
              .replaceAll("url('", "url('" + base + '/node_modules/remixicon/fonts/'),
          ),
      );
      await window.webContents.executeJavaScript(
        `(async()=>{document.querySelectorAll('.pv-bar,.pv-notes,.pv-sub').forEach(n=>n.style.display='none');const stage=document.querySelector('.pv-stage');stage.style.padding='0';const win=document.querySelector('.win');Object.assign(win.style,{width:'1240px',height:'760px',margin:'0',border:'0',borderRadius:'0',boxShadow:'none'});document.body.style.margin='0';await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()`,
      );
      const { data } = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
        format: 'png',
        clip: { x: 0, y: 0, width: 1240, height: 760, scale: 1 },
      });
      const reference = Buffer.from(data, 'base64');
      await fs.writeFile(path.join(directory, `${state}-${theme}-reference.png`), reference);
      const file = `${state}-${theme}.png`;
      await sharp({ create: { width: 2480, height: 760, channels: 3, background: '#ffffff' } })
        .composite([
          { input: reference, left: 0, top: 0 },
          { input: applicationFile, left: 1240, top: 0 },
        ])
        .png()
        .toFile(path.join(directory, file));
      return {
        state,
        theme,
        file: 'workbench-comparisons/' + file,
        reference: 'left',
        application: 'right',
      };
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
