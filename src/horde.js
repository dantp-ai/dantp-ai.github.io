// A small "Horde" of General Value Functions, one SwiftTD predictor per target
// slot. Every predictor sees the SAME shared feature vector each tick but learns
// its own weights toward its own cumulant: predictor k's cumulant is 1 on the
// tick slot k is clicked, else 0. So v_k = "how imminent is a click on slot k?".
//
// This mirrors the predictive-knowledge / Horde framing from the SwiftTD paper:
// many cheap predictions learned in parallel from one online stream, no replay.

import createModule from '../public/swift_td.mjs';
import { FEATURE_CONFIG } from './features.js';

// Defaults tuned for ~30 Hz ticks and a few-second approach horizon.
export const DEFAULT_PARAMS = {
  numFeatures: FEATURE_CONFIG.NUM_FEATURES,
  lambda: 0.9,
  initialAlpha: 1e-4,
  gamma: 0.9,
  eps: 1e-8,
  maxStepSize: 0.1,
  stepSizeDecay: 0.999,
  metaStepSize: 1e-3,
};

let modulePromise = null;
function getModule() {
  if (!modulePromise) modulePromise = createModule();
  return modulePromise;
}

function makePredictor(Module, p) {
  return new Module.SwiftTDSparse(
    p.numFeatures, p.lambda, p.initialAlpha, p.gamma, p.eps,
    p.maxStepSize, p.stepSizeDecay, p.metaStepSize,
  );
}

export async function createHorde(nSlots = FEATURE_CONFIG.N_SLOTS, params = {}) {
  const Module = await getModule();
  let p = { ...DEFAULT_PARAMS, ...params };
  let predictors = Array.from({ length: nSlots }, () => makePredictor(Module, p));
  let lastValues = new Array(nSlots).fill(0);

  return {
    get params() { return { ...p }; },
    get values() { return lastValues.slice(); },

    // Advance every predictor one tick. `rewards[k]` is the cumulant for slot k.
    step(features, rewards) {
      for (let k = 0; k < predictors.length; k++) {
        lastValues[k] = predictors[k].step(features, rewards[k] || 0);
      }
      return lastValues.slice();
    },

    // Read-only value of predictor `slot` for arbitrary features (heatmap probes).
    predict(slot, features) {
      return predictors[slot].predict(features);
    },

    actualRateOfLearning(slot) {
      return predictors[slot].actualRateOfLearning();
    },

    // Rebuild every predictor from scratch with (optionally) new hyperparameters.
    reset(params = {}) {
      p = { ...p, ...params };
      for (const pr of predictors) pr.delete();
      predictors = Array.from({ length: nSlots }, () => makePredictor(Module, p));
      lastValues = new Array(nSlots).fill(0);
    },

    dispose() {
      for (const pr of predictors) pr.delete();
      predictors = [];
    },
  };
}
