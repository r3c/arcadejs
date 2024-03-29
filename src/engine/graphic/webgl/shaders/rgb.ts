// Formula based on:
// http://entropymine.com/imageworsener/srgbformula/

import { GlShaderFunction } from "../language";

const linearToStandard: GlShaderFunction<[], [string]> = {
  declare: (): string => `
vec3 rgbLinearToStandard(vec3 linear) {
  return pow(linear.rgb, vec3(1.0 / 2.2));
}`,

  invoke: (linear: string): string => `rgbLinearToStandard(${linear})`,
};

const luminance: GlShaderFunction<[], [string]> = {
  declare: (): string => `
float rgbLuminance(vec3 color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}`,

  invoke: (color: string): string => `rgbLuminance(${color})`,
};

const standardToLinear: GlShaderFunction<[], [string]> = {
  declare: (): string => `
vec3 rgbStandardToLinear(vec3 standard) {
  return pow(standard.rgb, vec3(2.2));
}`,

  invoke: (standard: string): string => `rgbStandardToLinear(${standard})`,
};

export { linearToStandard, luminance, standardToLinear };
