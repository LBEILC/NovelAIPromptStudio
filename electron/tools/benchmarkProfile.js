import { Session } from 'node:inspector';
import fs from 'node:fs';
import path from 'node:path';

// Only the guarded disposable benchmark opts into main-process CPU sampling.
export async function startBenchmarkProfile(mode) {
  if (!mode?.fullLibraryBenchmark) return;
  const session = new Session();
  session.connect();
  const post = (method) =>
    new Promise((resolve, reject) =>
      session.post(method, (error, result) => (error ? reject(error) : resolve(result))),
    );
  await post('Profiler.enable');
  await post('Profiler.start');
  mode.stopMainProfile = async () => {
    const { profile } = await post('Profiler.stop');
    fs.writeFileSync(
      path.join(mode.output, `main-${mode.run}.cpuprofile`),
      JSON.stringify(profile),
    );
    session.disconnect();
  };
}
