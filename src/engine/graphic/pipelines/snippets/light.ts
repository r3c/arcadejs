const sourceTypeDirectional = "DirectionalLight";
const sourceTypePoint = "PointLight";
const sourceTypeResult = "ResultLight";

const sourceDeclare = (shadowMacro: string) => `
struct ${sourceTypeDirectional} {
	vec3 color;
	vec3 direction;
#ifdef ${shadowMacro}
	bool castShadow;
	mat4 shadowViewMatrix;
#endif
};

struct ${sourceTypePoint} {
	vec3 color;
	vec3 position;
	float radius;
};

struct ${sourceTypeResult} {
	vec3 color;
	vec3 direction;
	float power;
};

${sourceTypeResult} lightSourceDirectional(in ${sourceTypeDirectional} light, in vec3 distanceCamera) {
	return ${sourceTypeResult}(
		light.color,
		normalize(distanceCamera),
		1.0
	);
}

${sourceTypeResult} lightSourcePoint(in ${sourceTypePoint} light, in vec3 distanceCamera) {
	return ${sourceTypeResult}(
		light.color,
		normalize(distanceCamera),
		max(1.0 - length(distanceCamera) / light.radius, 0.0)
	);
}`;

const sourceInvokeDirectional = (light: string, distanceCamera: string) =>
	`lightSourceDirectional(${light}, ${distanceCamera})`;

const sourceInvokePoint = (light: string, distanceCamera: string) =>
	`lightSourcePoint(${light}, ${distanceCamera})`;

export { sourceDeclare, sourceInvokeDirectional, sourceInvokePoint, sourceTypeDirectional, sourceTypePoint, sourceTypeResult }