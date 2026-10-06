/**
 * Stand-in for `three/webgpu`, aliased in vite.config.ts.
 *
 * three-render-objects (inside react-force-graph-3d) imports WebGPURenderer
 * from `three/webgpu` but only uses it when created with `useWebGPU: true`,
 * which this site never passes — it always takes the WebGLRenderer path.
 * Without this alias the graph chunk carried the whole WebGPU build of
 * three.js: a second copy of three alongside the one Game and Archive share.
 */
export const WebGPURenderer = undefined;
