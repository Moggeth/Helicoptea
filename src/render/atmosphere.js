// The outdoor sky's colours, shared by the sky dome (garden.js), the scene's haze and the far hills, which
// pre-mix their colours toward the same haze (world/areas/horizon.js). Linear RGB. A clear summer afternoon:
// a soft blue overhead, a pale blue-white haze at the horizon, warm sunlight.
export const SKY = {
  zenith: [0.3, 0.52, 0.86],
  horizon: [0.8, 0.86, 0.9],
  below: [0.46, 0.54, 0.38],      // looking down past the horizon (only ever seen over the world's edge)
};
// The haze (scene fog) is the horizon's colour, so far things fade into the sky behind them.
export const HAZE_HEX = 0xe7eef3;   // sRGB of SKY.horizon
