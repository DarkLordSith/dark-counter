// `node --import ./tests/sim/register.mjs` — lets Node run the game's .ts sources (see loader.mjs).
import { register } from 'node:module';

register('./loader.mjs', import.meta.url);
