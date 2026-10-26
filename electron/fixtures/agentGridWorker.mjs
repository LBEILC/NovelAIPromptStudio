import { createAgentImages } from '../agentImages.js';

const [directory, source] = process.argv.slice(2);
console.log(JSON.stringify(await createAgentImages(directory).grid(source)));
