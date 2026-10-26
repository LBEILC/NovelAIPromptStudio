import fs from 'node:fs/promises';
import sharp from 'sharp';
import { EDGE_ORDER } from '../src/shared/outpaint.ts';
import { resolveRandomProject } from './randomPrompt.js';
import {
  outpaintSteps,
  buildOutpaint,
  compositeOutpaint,
  restoreOutpaintMetadata,
} from './outpaint.js';
const read = (source) => (Buffer.isBuffer(source) ? source : fs.readFile(source));

export async function runOutpaint(
  job,
  {
    generate,
    library,
    pools = [],
    publish,
    seed = job.request.parameters.seed,
    beforeBlock = () => {},
    afterBlock = () => {},
  },
) {
  const source = await read(job.operationPath);
  const sourceSize = await sharp(source).metadata();
  const operation = job.operationDetails;
  const resolved = resolveRandomProject(operation.prompt, pools);
  job.random = resolved.record;
  const steps = outpaintSteps(sourceSize, operation.edges, operation.mode, operation.fullSize);
  let result = source,
    completed = 0;
  let metadataSource = source;
  job.blockCount = steps.length;
  for (const step of steps) {
    try {
      if (job.stop) throw new Error('已取消');
      await beforeBlock();
      job.blockIndex = completed + 1;
      job.progress = null;
      publish();
      const previousSize = await sharp(result).metadata();
      const prepared = await buildOutpaint(
        resolved.project,
        result,
        sourceSize,
        step.applied,
        step,
        library,
        { seed, pools },
      );
      if (job.stop) throw new Error('已取消');
      const png = await generate(prepared.request, (progress) => {
        job.progress = progress;
        publish(false);
      });
      await afterBlock();
      result = await compositeOutpaint(prepared.canvas, png, previousSize, step);
      if (job.random.blocks.length) metadataSource = png;
      completed++;
    } catch (error) {
      if (!completed) throw error;
      job.failedEdges = steps
        .slice(completed)
        .flatMap((item) =>
          item.edge ? [item.edge] : EDGE_ORDER.filter((edge) => operation.edges[edge]),
        );
      job.failure = error.message;
      operation.failedEdges = job.failedEdges;
      operation.failure = job.failure;
      break;
    }
  }
  return restoreOutpaintMetadata(metadataSource, result);
}
