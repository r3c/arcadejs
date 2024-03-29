import { GlShaderFunction } from "../language";

const linearDepth: GlShaderFunction<[], [string, string, string]> = {
  declare: () => `
// Linearize depth
// See: http://glampert.com/2014/01-26/visualizing-the-depth-buffer/
vec3 linearizeDepth(in float depth, in float zNear, in float zFar)
{
  return vec3(2.0 * zNear / (zFar + zNear - depth * (zFar - zNear)));
}`,

  invoke: (depth: string, zNear: string, zFar: string) =>
    `linearizeDepth(${depth}, ${zNear}, ${zFar})`,
};

export { linearDepth };
