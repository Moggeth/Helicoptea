// GPU timer queries are optional on phones. Without them, use the observed display cadence and
// exclude frames already dominated by simulation/UI work; a fixed 19.5 ms threshold misses 120 Hz.
export function resolutionPressure(frameMs, gpuMs, nonRenderMs, refreshHz, fpsCap = 0) {
  const hz = Math.min(refreshHz || 60, fpsCap > 0 ? fpsCap : Infinity);
  const budget = 1000 / hz;
  const late = frameMs > budget * 1.2 + 0.5;
  return {
    slow: late && (gpuMs >= 0 ? gpuMs > budget * 0.8 : nonRenderMs < budget * 0.8),
    roomy: gpuMs >= 0
      ? gpuMs < budget * 0.5 && frameMs < budget * 1.1 + 0.5
      : frameMs < budget * 1.05 + 0.25 && nonRenderMs < budget * 0.5,
  };
}
