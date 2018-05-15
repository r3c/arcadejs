const directionalDeclare = (shadowMacro: string) => `
struct DirectionalLight {
	vec3 color;
	vec3 direction;
	float strength;
#ifdef ${shadowMacro}
	bool castShadow;
	mat4 shadowViewMatrix;
#endif
};`;

const directionalInvoke = (light: string) =>
	`(${light}.strength)`;

const directionalType = "DirectionalLight";

const pointDeclare = (shadowMacro: string) => `
struct PointLight {
	vec3 color;
	vec3 position;
	float radius;
	float strength;
};`;

const pointInvoke = (light: string, distance: string) =>
	`(max(1.0 - ${distance} / ${light}.radius, 0.0) * ${light}.strength)`;

const pointType = "PointLight";

export { directionalDeclare, directionalInvoke, directionalType, pointDeclare, pointInvoke, pointType }