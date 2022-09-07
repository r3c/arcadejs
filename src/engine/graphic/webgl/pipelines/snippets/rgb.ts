// Formula based on:
// http://entropymine.com/imageworsener/srgbformula/

const linearToStandardDeclare = (): string => `
vec3 rgbLinearToStandard(vec3 linear) {
	return pow(linear.rgb, vec3(1.0 / 2.2));
}`;

const linearToStandardInvoke = (linear: string): string =>
  `rgbLinearToStandard(${linear})`;

const standardToLinearDeclare = (): string => `
vec3 rgbStandardToLinear(vec3 standard) {
	return pow(standard.rgb, vec3(2.2));
}`;

const standardToLinearInvoke = (standard: string): string =>
  `rgbStandardToLinear(${standard})`;

export {
  linearToStandardDeclare,
  linearToStandardInvoke,
  standardToLinearDeclare,
  standardToLinearInvoke,
};
