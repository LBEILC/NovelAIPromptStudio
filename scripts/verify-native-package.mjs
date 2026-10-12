import fs from 'node:fs/promises';
import path from 'node:path';

export async function verifyNativePackage(
  executable,
  platform = process.platform,
  arch = process.arch,
) {
  const resources =
    platform === 'darwin'
      ? path.resolve(path.dirname(executable), '../Resources')
      : path.join(path.dirname(executable), 'resources');
  const modules = path.join(resources, 'app.asar.unpacked/node_modules/@img');
  const runtime = `${platform}-${arch}`;
  const sharp = path.join(modules, `sharp-${runtime}/lib`);
  if (
    !(await fs.readdir(sharp)).some(
      (name) => name.startsWith(`sharp-${runtime}`) && name.endsWith('.node'),
    )
  )
    throw new Error(`Packaged sharp binary missing for ${runtime}`);
  const libvips = path.join(modules, `sharp-libvips-${runtime}/lib`);
  // Windows distributes libvips beside the sharp binary.
  const files = await fs.readdir(platform === 'win32' ? sharp : libvips);
  if (!files.some((name) => /vips.*\.(?:dylib|dll|so)/.test(name)))
    throw new Error(`Packaged libvips missing for ${runtime}`);
  console.log(`Verified unpacked sharp and libvips for ${runtime}`);
}
