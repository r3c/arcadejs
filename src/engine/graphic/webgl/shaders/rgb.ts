// Formula based on:
// http://entropymine.com/imageworsener/srgbformula/

import { createSingletonFunction, shader } from "../shader";

const linearToStandard = createSingletonFunction<{ linear: string }>(
  shader`\
vec3 rgbLinearToStandard(vec3 linear) {
  return pow(linear.rgb, vec3(1.0 / 2.2));
}`,
  ({ linear }) => `rgbLinearToStandard(${linear})`,
);

const luminance = createSingletonFunction<{ color: string }>(
  shader`\
float rgbLuminance(vec3 color) {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}`,
  ({ color }) => `rgbLuminance(${color})`,
);

const standardToLinear = createSingletonFunction<{ standard: string }>(
  shader`\
vec3 rgbStandardToLinear(vec3 standard) {
  return pow(standard.rgb, vec3(2.2));
}`,
  ({ standard }) => `rgbStandardToLinear(${standard})`,
);

export { linearToStandard, luminance, standardToLinear };
