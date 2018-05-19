import * as directive from "./snippets/directive";
import * as functional from "../../language/functional";
import * as light from "./snippets/light";
import * as materialPainter from "../painters/material";
import * as matrix from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as parallax from "./snippets/parallax";
import * as pbr from "./snippets/pbr";
import * as phong from "./snippets/phong";
import * as rgb from "./snippets/rgb";
import * as singularPainter from "../painters/singular";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const enum LightModel {
	None,
	Phong,
	Physical
}

const lightHeaderShader = `
${light.directionalDeclare("HAS_SHADOW")}
${light.pointDeclare("HAS_SHADOW")}

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform ${light.directionalType} directionalLights[max(MAX_DIRECTIONAL_LIGHTS, 1)];
uniform ${light.pointType} pointLights[max(MAX_POINT_LIGHTS, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
#ifdef HAS_SHADOW
uniform sampler2D directionalLightShadowMaps[max(MAX_DIRECTIONAL_LIGHTS, 1)];
uniform sampler2D pointLightShadowMaps[max(MAX_POINT_LIGHTS, 1)];
#endif`;

const lightVertexShader = `
${lightHeaderShader}

uniform mat4 modelMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform mat4 shadowProjectionMatrix;
uniform mat4 viewMatrix;

in vec2 coords;
in vec3 normals;
in vec3 points;
in vec3 tangents;

out vec3 bitangent; // Bitangent at point in camera space
out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space
out vec3 normal; // Normal at point in camera space
out vec3 tangent; // Tangent at point in camera space

out vec3 directionalLightDirections[max(MAX_DIRECTIONAL_LIGHTS, 1)];
out vec3 directionalLightShadows[max(MAX_DIRECTIONAL_LIGHTS, 1)];

out vec3 pointLightDirections[max(MAX_POINT_LIGHTS, 1)];
out vec3 pointLightShadows[max(MAX_POINT_LIGHTS, 1)];

vec3 toCameraDirection(in vec3 worldDirection) {
	return (viewMatrix * vec4(worldDirection, 0.0)).xyz;
}

vec3 toCameraPosition(in vec3 worldPosition) {
	return (viewMatrix * vec4(worldPosition, 1.0)).xyz;
}

void main(void) {
	vec4 pointWorld = modelMatrix * vec4(points, 1.0);
	vec4 pointCamera = viewMatrix * pointWorld;

	// Process directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			if (directionalLights[i].castShadow) {
				vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * pointWorld;

				directionalLightShadows[i] = pointShadow.xyz;
			}
		#endif

		directionalLightDirections[i] = toCameraDirection(directionalLights[i].direction);
	}

	// Process point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			// FIXME: shadow map code
		#endif

		pointLightDirections[i] = toCameraPosition(pointLights[i].position) - pointCamera.xyz;
	}

	coord = coords;
	eye = -pointCamera.xyz;
	normal = normalize(normalMatrix * normals);
	tangent = normalize(normalMatrix * tangents);
	bitangent = cross(normal, tangent);

	gl_Position = projectionMatrix * pointCamera;
}`;

const lightFragmentShader = `
${lightHeaderShader}

${parallax.perturbDeclare("FORCE_HEIGHT_MAP")}
${normal.perturbDeclare("FORCE_NORMAL_MAP")}
${pbr.lightDeclare}
${phong.getDiffusePowerDeclare}
${phong.getSpecularPowerDeclare}
${rgb.linearToStandardDeclare}
${rgb.standardToLinearDeclare}

uniform vec4 albedoFactor;
uniform sampler2D albedoMap;
uniform bool albedoMapEnabled;
uniform vec4 emissiveFactor;
uniform sampler2D emissiveMap;
uniform bool emissiveMapEnabled;
uniform vec4 glossFactor;
uniform sampler2D glossMap;
uniform bool glossMapEnabled;
uniform sampler2D heightMap;
uniform bool heightMapEnabled;
uniform float heightParallaxBias;
uniform float heightParallaxScale;
uniform sampler2D metalnessMap;
uniform bool metalnessMapEnabled;
uniform float metalnessStrength;
uniform sampler2D normalMap;
uniform bool normalMapEnabled;
uniform sampler2D occlusionMap;
uniform bool occlusionMapEnabled;
uniform float occlusionStrength;
uniform sampler2D roughnessMap;
uniform bool roughnessMapEnabled;
uniform float roughnessStrength;
uniform float shininess;

in vec3 bitangent;
in vec2 coord;
in vec3 eye;
in vec3 normal;
in vec3 tangent;

in vec3 directionalLightDirections[max(MAX_DIRECTIONAL_LIGHTS, 1)];
in vec3 directionalLightShadows[max(MAX_DIRECTIONAL_LIGHTS, 1)];

in vec3 pointLightDirections[max(MAX_POINT_LIGHTS, 1)];
in vec3 pointLightShadows[max(MAX_POINT_LIGHTS, 1)];

layout(location=0) out vec4 fragColor;

vec3 getLight(in vec3 albedo, in vec2 coord, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in vec3 lightColor) {
	#if LIGHT_MODEL == ${LightModel.Phong}
		vec4 materialGloss = ${directive.getBooleanOrUniform("FORCE_GLOSS_MAP", "glossMapEnabled")}
			? glossFactor * texture(glossMap, coord)
			: glossFactor;

		return
			${phong.getDiffusePowerInvoke("normal", "lightDirection")} * lightColor * albedo * float(LIGHT_MODEL_PHONG_DIFFUSE) +
			${phong.getSpecularPowerInvoke("normal", "lightDirection", "eyeDirection", "shininess")} * lightColor * materialGloss.rgb * float(LIGHT_MODEL_PHONG_SPECULAR);
	#elif LIGHT_MODEL == ${LightModel.Physical}
		float metalnessSample = ${directive.getBooleanOrUniform("FORCE_METALNESS_MAP", "metalnessMapEnabled")} ? texture(metalnessMap, coord).r : 1.0;
		float metalness = clamp(metalnessSample * metalnessStrength, 0.0, 1.0);

		float roughnessSample = ${directive.getBooleanOrUniform("FORCE_ROUGHNESS_MAP", "roughnessMapEnabled")} ? texture(roughnessMap, coord).r : 1.0;
		float roughness = clamp(roughnessSample * roughnessStrength, 0.04, 1.0);

		return ${pbr.lightInvoke("normal", "eyeDirection", "lightDirection", "lightColor", "albedo", "roughness", "metalness")};
	#endif
}

void main(void) {
	vec3 b = normalize(bitangent);
	vec3 n = normalize(normal);
	vec3 t = normalize(tangent);

	vec3 eyeDirection = normalize(eye);
	vec2 coordParallax = ${parallax.perturbInvoke("FORCE_HEIGHT_MAP", "coord", "heightMap", "heightMapEnabled", "eyeDirection", "heightParallaxScale", "heightParallaxBias", "t", "b", "n")};
	vec3 modifiedNormal = ${normal.perturbInvoke("FORCE_NORMAL_MAP", "normalMap", "normalMapEnabled", "coordParallax", "t", "b", "n")};

	vec3 albedo = ${directive.getBooleanOrUniform("FORCE_ALBEDO_MAP", "albedoMapEnabled")}
		? albedoFactor.rgb * ${rgb.standardToLinearInvoke("texture(albedoMap, coordParallax).rgb")}
		: albedoFactor.rgb;

	// Apply ambient component
	vec3 color = albedo * ambientLightColor * float(LIGHT_MODEL_AMBIENT);

	// Apply components from directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef HAS_SHADOW
			float shadowMapSample = texture(directionalLightShadowMaps[i], directionalLightShadows[i].xy).r;

			if (directionalLights[i].castShadow && shadowMapSample < directionalLightShadows[i].z)
				continue;
		#endif

		color += ${light.directionalInvoke("directionalLights[i]")} * getLight(
			albedo,
			coordParallax,
			modifiedNormal,
			eyeDirection,
			normalize(directionalLightDirections[i]),
			directionalLights[i].color
		);
	}

	// Apply components from point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		color += ${light.pointInvoke("pointLights[i]", "length(pointLightDirections[i])")} * getLight(
			albedo,
			coordParallax,
			modifiedNormal,
			eyeDirection,
			normalize(pointLightDirections[i]),
			pointLights[i].color
		);
	}

	// Apply occlusion component
	if (${directive.getBooleanOrUniform("FORCE_OCCLUSION_MAP", "occlusionMapEnabled")})
		color = mix(color, color * texture(occlusionMap, coordParallax).r, occlusionStrength);

	// Apply emissive component
	if (${directive.getBooleanOrUniform("FORCE_EMISSIVE_MAP", "emissiveMapEnabled")})
		color += emissiveFactor.rgb * ${rgb.standardToLinearInvoke("texture(emissiveMap, coordParallax).rgb")};

	fragColor = vec4(${rgb.linearToStandardInvoke("color")}, 1.0);
}`;

const shadowVertexShader = `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

in vec4 points;

void main(void) {
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * points;
}`;

const shadowFragmentShader = `
layout(location=0) out vec4 fragColor;

void main(void) {
	fragColor = vec4(1, 1, 1, 1);
}`;

interface Configuration extends LightConfiguration, MaterialConfiguration {
	noMaterialShader?: boolean
}

interface DirectionalLight extends webgl.DirectionalLight {
	shadowMap: WebGLTexture,
	shadowViewMatrix: matrix.Matrix4
}

interface LightConfiguration {
	lightModel: LightModel,
	lightModelPhongNoAmbient?: boolean,
	lightModelPhongNoDiffuse?: boolean,
	lightModelPhongNoSpecular?: boolean,
	lightModelPhysicalNoAmbient?: boolean,
	maxDirectionalLights?: number,
	maxPointLights?: number,
	noShadow?: boolean
}

interface LightState extends State {
	ambientLightColor: vector.Vector3,
	directionalLights: DirectionalLight[],
	pointLights: webgl.PointLight[], // FIXME: extend PointLight with extra properties
	projectionMatrix: matrix.Matrix4,
	shadowProjectionMatrix: matrix.Matrix4
	viewMatrix: matrix.Matrix4
}

interface MaterialConfiguration {
	forceAlbedoMap?: boolean,
	forceEmissiveMap?: boolean,
	forceGlossMap?: boolean,
	forceHeightMap?: boolean,
	forceMetalnessMap?: boolean,
	forceNormalMap?: boolean,
	forceOcclusionMap?: boolean,
	forceRoughnessMap?: boolean
}

interface ShadowState extends State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const loadLight = (gl: WebGLRenderingContext, materialConfiguration: MaterialConfiguration, lightConfiguration: LightConfiguration) => {
	const maxDirectionalLights = functional.coalesce(lightConfiguration.maxDirectionalLights, 0);
	const maxPointLights = functional.coalesce(lightConfiguration.maxPointLights, 0)

	const directives = [
		{ name: "LIGHT_MODEL", value: <number>lightConfiguration.lightModel },
		{ name: "MAX_DIRECTIONAL_LIGHTS", value: maxDirectionalLights },
		{ name: "MAX_POINT_LIGHTS", value: maxPointLights }
	];

	switch (lightConfiguration.lightModel) {
		case LightModel.Phong:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: lightConfiguration.lightModelPhongNoAmbient ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_DIFFUSE", value: lightConfiguration.lightModelPhongNoDiffuse ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_SPECULAR", value: lightConfiguration.lightModelPhongNoSpecular ? 0 : 1 });

			break;

		case LightModel.Physical:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: lightConfiguration.lightModelPhysicalNoAmbient ? 0 : 1 });

			break;
	}

	if (materialConfiguration.forceAlbedoMap !== undefined)
		directives.push({ name: "FORCE_ALBEDO_MAP", value: materialConfiguration.forceAlbedoMap ? 1 : 0 });

	if (materialConfiguration.forceEmissiveMap !== undefined)
		directives.push({ name: "FORCE_EMISSIVE_MAP", value: materialConfiguration.forceEmissiveMap ? 1 : 0 });

	if (materialConfiguration.forceGlossMap !== undefined)
		directives.push({ name: "FORCE_GLOSS_MAP", value: materialConfiguration.forceGlossMap ? 1 : 0 });

	if (materialConfiguration.forceHeightMap !== undefined)
		directives.push({ name: "FORCE_HEIGHT_MAP", value: materialConfiguration.forceHeightMap ? 1 : 0 });

	if (materialConfiguration.forceMetalnessMap !== undefined)
		directives.push({ name: "FORCE_METALNESS_MAP", value: materialConfiguration.forceMetalnessMap ? 1 : 0 });

	if (materialConfiguration.forceNormalMap !== undefined)
		directives.push({ name: "FORCE_NORMAL_MAP", value: materialConfiguration.forceNormalMap ? 1 : 0 });

	if (materialConfiguration.forceOcclusionMap !== undefined)
		directives.push({ name: "FORCE_OCCLUSION_MAP", value: materialConfiguration.forceOcclusionMap ? 1 : 0 });

	if (materialConfiguration.forceRoughnessMap !== undefined)
		directives.push({ name: "FORCE_ROUGHNESS_MAP", value: materialConfiguration.forceRoughnessMap ? 1 : 0 });

	if (!lightConfiguration.noShadow)
		directives.push({ name: "HAS_SHADOW", value: 1 });

	const shader = new webgl.Shader<LightState>(gl, lightVertexShader, lightFragmentShader, directives);

	// Bind geometry attributes
	shader.setupAttributePerGeometry("normals", geometry => geometry.normals);
	shader.setupAttributePerGeometry("points", geometry => geometry.points);

	if (materialConfiguration.forceAlbedoMap !== false ||
		materialConfiguration.forceEmissiveMap !== false ||
		materialConfiguration.forceGlossMap !== false ||
		materialConfiguration.forceHeightMap !== false ||
		materialConfiguration.forceMetalnessMap !== false ||
		materialConfiguration.forceNormalMap !== false ||
		materialConfiguration.forceOcclusionMap !== false ||
		materialConfiguration.forceRoughnessMap !== false)
		shader.setupAttributePerGeometry("coords", geometry => geometry.coords);
	else
		shader.clearAttributePerGeometry("coords");

	if (materialConfiguration.forceHeightMap !== false ||
		materialConfiguration.forceNormalMap !== false)
		shader.setupAttributePerGeometry("tangents", geometry => geometry.tangents);
	else
		shader.clearAttributePerGeometry("tangents");

	// Bind matrix uniforms
	shader.setupMatrixPerNode("modelMatrix", state => state.transform.getValues(), gl => gl.uniformMatrix4fv);
	shader.setupMatrixPerNode("normalMatrix", state => state.normalMatrix, gl => gl.uniformMatrix3fv);
	shader.setupMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.setupMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	if (!lightConfiguration.noShadow)
		shader.setupMatrixPerTarget("shadowProjectionMatrix", state => state.shadowProjectionMatrix.getValues(), gl => gl.uniformMatrix4fv);

	// Bind material uniforms
	if (materialConfiguration.forceAlbedoMap !== false)
		shader.setupTexturePerMaterial("albedoMap", materialConfiguration.forceAlbedoMap !== true ? "albedoMapEnabled" : undefined, webgl.TextureType.Quad, material => material.albedoMap);

	shader.setupPropertyPerMaterial("albedoFactor", material => material.albedoFactor, gl => gl.uniform4fv);

	switch (lightConfiguration.lightModel) {
		case LightModel.Phong:
			if (materialConfiguration.forceGlossMap !== false)
				shader.setupTexturePerMaterial("glossMap", materialConfiguration.forceGlossMap !== true ? "glossMapEnabled" : undefined, webgl.TextureType.Quad, material => material.glossMap);

			shader.setupPropertyPerMaterial("glossFactor", material => material.glossFactor, gl => gl.uniform4fv);
			shader.setupPropertyPerMaterial("shininess", material => material.shininess, gl => gl.uniform1f);

			break;

		case LightModel.Physical:
			if (materialConfiguration.forceMetalnessMap !== false)
				shader.setupTexturePerMaterial("metalnessMap", materialConfiguration.forceMetalnessMap !== true ? "metalnessMapEnabled" : undefined, webgl.TextureType.Quad, material => material.metalnessMap);

			if (materialConfiguration.forceRoughnessMap !== false)
				shader.setupTexturePerMaterial("roughnessMap", materialConfiguration.forceRoughnessMap !== true ? "roughnessMapEnabled" : undefined, webgl.TextureType.Quad, material => material.roughnessMap);

			shader.setupPropertyPerMaterial("metalnessStrength", material => material.metalnessStrength, gl => gl.uniform1f);
			shader.setupPropertyPerMaterial("roughnessStrength", material => material.roughnessStrength, gl => gl.uniform1f);

			break;
	}

	if (materialConfiguration.forceEmissiveMap !== false) {
		shader.setupTexturePerMaterial("emissiveMap", materialConfiguration.forceEmissiveMap !== true ? "emissiveMapEnabled" : undefined, webgl.TextureType.Quad, material => material.emissiveMap);
		shader.setupPropertyPerMaterial("emissiveFactor", material => material.emissiveFactor, gl => gl.uniform4fv);
	}

	if (materialConfiguration.forceHeightMap !== false) {
		shader.setupTexturePerMaterial("heightMap", materialConfiguration.forceHeightMap !== true ? "heightMapEnabled" : undefined, webgl.TextureType.Quad, material => material.heightMap);
		shader.setupPropertyPerMaterial("heightParallaxBias", material => material.heightParallaxBias, gl => gl.uniform1f);
		shader.setupPropertyPerMaterial("heightParallaxScale", material => material.heightParallaxScale, gl => gl.uniform1f);
	}

	if (materialConfiguration.forceNormalMap !== false)
		shader.setupTexturePerMaterial("normalMap", materialConfiguration.forceNormalMap !== true ? "normalMapEnabled" : undefined, webgl.TextureType.Quad, material => material.normalMap);

	if (materialConfiguration.forceOcclusionMap !== false) {
		shader.setupTexturePerMaterial("occlusionMap", materialConfiguration.forceOcclusionMap !== true ? "occlusionMapEnabled" : undefined, webgl.TextureType.Quad, material => material.occlusionMap);
		shader.setupPropertyPerMaterial("occlusionStrength", material => material.occlusionStrength, gl => gl.uniform1f);
	}

	// Bind light uniforms
	const defaultColor = [0, 0, 0];
	const defaultDirection = [1, 0, 0];
	const defaultPosition = [0, 0, 0];

	shader.setupPropertyPerTarget("ambientLightColor", state => vector.Vector3.toArray(state.ambientLightColor), gl => gl.uniform3fv);

	for (let i = 0; i < maxDirectionalLights; ++i) {
		const index = i;

		if (!lightConfiguration.noShadow) {
			shader.setupPropertyPerTarget(`directionalLights[${index}].castShadow`, state => index < state.directionalLights.length && state.directionalLights[index].shadow ? 1 : 0, gl => gl.uniform1i);
			shader.setupMatrixPerTarget(`directionalLights[${index}].shadowViewMatrix`, state => index < state.directionalLights.length ? state.directionalLights[index].shadowViewMatrix.getValues() : matrix.Matrix4.createIdentity().getValues(), gl => gl.uniformMatrix4fv);
			shader.setupTexturePerTarget(`directionalLightShadowMaps[${index}]`, undefined, webgl.TextureType.Quad, state => state.directionalLights[index].shadowMap);
		}

		shader.setupPropertyPerTarget(`directionalLights[${i}].color`, state => index < state.directionalLights.length ? vector.Vector3.toArray(state.directionalLights[index].color) : defaultColor, gl => gl.uniform3fv);
		shader.setupPropertyPerTarget(`directionalLights[${i}].direction`, state => index < state.directionalLights.length ? vector.Vector3.toArray(state.directionalLights[index].direction) : defaultDirection, gl => gl.uniform3fv);
		shader.setupPropertyPerTarget(`directionalLights[${i}].strength`, state => index < state.directionalLights.length ? 1 : 0, gl => gl.uniform1f);
	}

	for (let i = 0; i < maxPointLights; ++i) {
		const index = i;

		shader.setupPropertyPerTarget(`pointLights[${i}].color`, state => index < state.pointLights.length ? vector.Vector3.toArray(state.pointLights[index].color) : defaultColor, gl => gl.uniform3fv);
		shader.setupPropertyPerTarget(`pointLights[${i}].position`, state => index < state.pointLights.length ? vector.Vector3.toArray(state.pointLights[index].position) : defaultPosition, gl => gl.uniform3fv);
		shader.setupPropertyPerTarget(`pointLights[${i}].radius`, state => index < state.pointLights.length ? state.pointLights[index].radius : 0, gl => gl.uniform1f);
		shader.setupPropertyPerTarget(`pointLights[${i}].strength`, state => index < state.pointLights.length ? 1 : 0, gl => gl.uniform1f);
	}

	return shader;
};

const loadShadow = (gl: WebGLRenderingContext) => {
	const shader = new webgl.Shader<ShadowState>(gl, shadowVertexShader, shadowFragmentShader);

	shader.setupAttributePerGeometry("points", geometry => geometry.points);

	shader.setupMatrixPerNode("modelMatrix", state => state.transform.getValues(), gl => gl.uniformMatrix4fv);
	shader.setupMatrixPerTarget("projectionMatrix", state => state.projectionMatrix.getValues(), gl => gl.uniformMatrix4fv);
	shader.setupMatrixPerTarget("viewMatrix", state => state.viewMatrix.getValues(), gl => gl.uniformMatrix4fv);

	return shader;
};

class Pipeline implements webgl.Pipeline {
	public readonly shadowBuffers: WebGLTexture[];

	private readonly gl: WebGLRenderingContext;
	private readonly lightPainter: webgl.Painter<LightState>;
	private readonly maxDirectionalLights: number;
	private readonly maxPointLights: number;
	private readonly shadowPainter: webgl.Painter<ShadowState>;
	private readonly shadowProjectionMatrix: matrix.Matrix4;
	private readonly shadowTargets: webgl.Target[];

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const materialClassifier = (material: webgl.Material) =>
			(material.albedoMap !== undefined ? 1 : 0) +
			(material.emissiveMap !== undefined ? 2 : 0) +
			(material.glossMap !== undefined ? 4 : 0) +
			(material.heightMap !== undefined ? 8 : 0) +
			(material.metalnessMap !== undefined ? 16 : 0) +
			(material.normalMap !== undefined ? 32 : 0) +
			(material.occlusionMap !== undefined ? 64 : 0) +
			(material.roughnessMap !== undefined ? 128 : 0);

		const materialConfigurator = (configuration: MaterialConfiguration, material: webgl.Material) => ({
			forceAlbedoMap: functional.coalesce(configuration.forceAlbedoMap, material.albedoMap !== undefined),
			forceEmissiveMap: functional.coalesce(configuration.forceEmissiveMap, material.emissiveMap !== undefined),
			forceGlossMap: functional.coalesce(configuration.forceGlossMap, material.glossMap !== undefined),
			forceHeightMap: functional.coalesce(configuration.forceHeightMap, material.heightMap !== undefined),
			forceMetalnessMap: functional.coalesce(configuration.forceMetalnessMap, material.metalnessMap !== undefined),
			forceNormalMap: functional.coalesce(configuration.forceNormalMap, material.normalMap !== undefined),
			forceOcclusionMap: functional.coalesce(configuration.forceOcclusionMap, material.occlusionMap !== undefined),
			forceRoughnessMap: functional.coalesce(configuration.forceRoughnessMap, material.roughnessMap !== undefined)
		});

		const maxDirectionalLights = configuration.maxDirectionalLights || 0;
		const maxPointLights = configuration.maxPointLights || 0;
		const targets = functional.range(maxDirectionalLights + maxPointLights, i => new webgl.Target(gl, 1024, 1024));

		this.gl = gl;
		this.lightPainter = configuration.noMaterialShader
			? new singularPainter.Painter(loadLight(gl, configuration, configuration))
			: new materialPainter.Painter(materialClassifier, material => loadLight(gl, materialConfigurator(configuration, material), configuration));
		this.maxDirectionalLights = maxDirectionalLights;
		this.maxPointLights = maxPointLights;
		this.shadowBuffers = targets.map(target => target.setupDepthTexture(webgl.Format.Depth16));
		this.shadowPainter = new singularPainter.Painter(loadShadow(gl));
		this.shadowProjectionMatrix = matrix.Matrix4.createOrthographic(-10, 10, -10, 10, -10, 20);
		this.shadowTargets = targets;
	}

	public process(target: webgl.Target, transform: webgl.Transform, scene: webgl.Scene) {
		const directionalLights = scene.directionalLights || [];
		const gl = this.gl;
		const pointLights = scene.pointLights || [];

		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);

		const obstacles = scene.subjects.filter(subject => !subject.noShadow);
		let bufferIndex = 0;

		// Create shadow maps for directional lights
		const directionalLightStates = [];

		for (let i = 0; i < Math.min(directionalLights.length, this.maxDirectionalLights); ++i) {
			const light = directionalLights[i];
			const shadowDirection = { x: -light.direction.x, y: -light.direction.y, z: -light.direction.z };

			const viewMatrix = matrix.Matrix4
				.createIdentity()
				.translate({ x: 0, y: 0, z: -10 })
				.compose(matrix.Matrix4.createDirection(shadowDirection, { x: 0, y: 1, z: 0 }));

			gl.colorMask(false, false, false, false);
			gl.cullFace(gl.FRONT);

			this.shadowTargets[bufferIndex].clear();
			this.shadowPainter.paint(this.shadowTargets[bufferIndex], obstacles, viewMatrix, {
				projectionMatrix: this.shadowProjectionMatrix,
				viewMatrix: viewMatrix
			});

			directionalLightStates.push({
				color: light.color,
				direction: light.direction,
				shadow: light.shadow,
				shadowMap: this.shadowBuffers[bufferIndex],
				shadowViewMatrix: viewMatrix
			});

			++bufferIndex;
		}

		// TODO: create shadow maps for point lights

		// Draw scene
		gl.colorMask(true, true, true, true);
		gl.cullFace(gl.BACK);

		this.lightPainter.paint(target, scene.subjects, transform.viewMatrix, {
			ambientLightColor: scene.ambientLightColor || vector.Vector3.zero,
			directionalLights: directionalLightStates,
			pointLights: pointLights,
			projectionMatrix: transform.projectionMatrix,
			shadowProjectionMatrix: this.shadowProjectionMatrix,
			viewMatrix: transform.viewMatrix
		});
	}

	public resize(width: number, height: number) {
	}
}

export { Configuration, LightModel, Pipeline }