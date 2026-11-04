// The BDD scenarios of features/*.feature, each run in both storage locations. A scenario that passes in one
// location and fails in the other is a defect: where the item files live is a storage setting, nothing more.
import test from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFeatures, runScenario } from '../../features/support/gherkin.js';
import { LOCATIONS, makeWorld } from '../../features/support/world.js';
import '../../features/steps/cli.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'features');
const only = process.env.FEATURE_LOCATION ? [process.env.FEATURE_LOCATION] : LOCATIONS;
for (const feature of loadFeatures(dir)) {
  for (const scenario of feature.scenarios) {
    for (const location of only) {
      test(`${feature.name} / ${scenario.name} [${location}]`, async t => {
        const world = makeWorld(location);
        t.after(() => world.dispose());
        await runScenario(feature, scenario, world);
      });
    }
  }
}
