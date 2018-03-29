import * as functional from "../../language/functional";
import * as matrix from "../../math/matrix";
import * as normal from "./snippets/normal";
import * as parallax from "./snippets/parallax";
import * as pbr from "./snippets/pbr";
import * as phong from "./snippets/phong";
import * as rgb from "./snippets/rgb";
import * as vector from "../../math/vector";
import * as webgl from "../webgl";

const enum LightModel {
	None,
	Phong,
	Physical
}

const lightHeaderShader = `
struct DirectionalLight {
	vec3 color;
	vec3 direction;
	float visibility;
#ifdef USE_SHADOW_MAP
	bool castShadow;
	mat4 shadowViewMatrix;
#endif
};

struct PointLight {
	vec3 color;
	vec3 position;
	float radius; // FIXME: ignored by this implementation
	float visibility;
};

const mat4 texUnitConverter = mat4(
	0.5, 0.0, 0.0, 0.0,
	0.0, 0.5, 0.0, 0.0,
	0.0, 0.0, 0.5, 0.0,
	0.5, 0.5, 0.5, 1.0
);

uniform vec3 ambientLightColor;

// Force length >= 1 to avoid precompilation checks, removed by compiler when unused
uniform DirectionalLight directionalLights[max(MAX_DIRECTIONAL_LIGHTS, 1)];
uniform PointLight pointLights[max(MAX_POINT_LIGHTS, 1)];

// FIXME: adding shadowMap as field to *Light structures doesn't work for some reason
#ifdef USE_SHADOW_MAP
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

out vec2 coord; // Texture coordinate
out vec3 eye; // Direction from point to eye in camera space (normal mapping disabled) or tangent space (normal mapping enabled)
out vec3 normal; // Normal at point in same space than eye vector

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
	vec4 point = viewMatrix * modelMatrix * vec4(points, 1.0);
	vec3 pointCamera = point.xyz;

	#ifdef USE_NORMAL_MAP
		vec3 n = normalize(normalMatrix * normals);
		vec3 t = normalize(normalMatrix * tangents);
		vec3 b = cross(n, t);
	#endif

	// Process directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef USE_SHADOW_MAP
			if (directionalLights[i].castShadow) {
				vec4 pointShadow = texUnitConverter * shadowProjectionMatrix * directionalLights[i].shadowViewMatrix * modelMatrix * vec4(points, 1.0);

				directionalLightShadows[i] = pointShadow.xyz;
			}
		#endif

		vec3 lightDirection = normalize(toCameraDirection(directionalLights[i].direction));

		#ifdef USE_NORMAL_MAP
			lightDirection = normalize(vec3(dot(lightDirection, t), dot(lightDirection, b), dot(lightDirection, n)));
		#endif

		directionalLightDirections[i] = lightDirection;
	}

	// Process point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		#ifdef USE_SHADOW_MAP
			// FIXME: shadow map code
		#endif

		vec3 lightDirection = normalize(toCameraPosition(pointLights[i].position) - pointCamera);

		#ifdef USE_NORMAL_MAP
			lightDirection = normalize(vec3(dot(lightDirection, t), dot(lightDirection, b), dot(lightDirection, n)));
		#endif

		pointLightDirections[i] = lightDirection;
	}

	vec3 eyeDirectionCamera = normalize(-pointCamera);

	#ifdef USE_NORMAL_MAP
		eye = vec3(dot(eyeDirectionCamera, t), dot(eyeDirectionCamera, b), dot(eyeDirectionCamera, n));
		normal = vec3(0.0, 0.0, 1.0);
	#else
		eye = eyeDirectionCamera;
		normal = normalize(normalMatrix * normals);
	#endif

	coord = coords;

	gl_Position = projectionMatrix * point;
}`;

const lightFragmentShader = `
${lightHeaderShader}

${parallax.heightDeclare}
${normal.modifyDeclare}
${pbr.lightDeclare}
${phong.getDiffusePowerDeclare}
${phong.getSpecularPowerDeclare}
${rgb.linearToStandardDeclare}
${rgb.standardToLinearDeclare}

uniform vec4 albedoColor;
uniform sampler2D albedoMap;
uniform sampler2D emissiveMap;
uniform float emissiveStrength;
uniform vec4 glossColor;
uniform sampler2D glossMap;
uniform sampler2D heightMap;
uniform sampler2D metalnessMap;
uniform sampler2D normalMap;
uniform sampler2D occlusionMap;
uniform float occlusionStrength;
uniform float parallaxBias;
uniform float parallaxScale;
uniform float perceptualRoughness;
uniform float perceptualMetalness;
uniform sampler2D roughnessMap;
uniform float shininess;

in vec2 coord;
in vec3 eye;
in vec3 normal;

in vec3 directionalLightDirections[max(MAX_DIRECTIONAL_LIGHTS, 1)];
in vec3 directionalLightShadows[max(MAX_DIRECTIONAL_LIGHTS, 1)];

in vec3 pointLightDirections[max(MAX_POINT_LIGHTS, 1)];
in vec3 pointLightShadows[max(MAX_POINT_LIGHTS, 1)];

layout(location=0) out vec4 fragColor;

vec3 getLight(in vec3 materialAlbedo, in vec2 coord, in vec3 normal, in vec3 eyeDirection, in vec3 lightDirection, in vec3 lightColor) {
	#if LIGHT_MODEL == ${LightModel.Phong}
		#ifdef USE_GLOSS_MAP
			vec4 materialGloss = glossColor * texture(glossMap, coord);
		#else
			vec4 materialGloss = glossColor;
		#endif

		return
			${phong.getDiffusePowerInvoke("normal", "lightDirection")} * lightColor * materialAlbedo * float(LIGHT_MODEL_PHONG_DIFFUSE) +
			${phong.getSpecularPowerInvoke("normal", "lightDirection", "eyeDirection", "shininess")} * lightColor * materialGloss.rgb * float(LIGHT_MODEL_PHONG_SPECULAR);
	#elif LIGHT_MODEL == ${LightModel.Physical}
			float materialMetalness = clamp(texture(metalnessMap, coord).r * perceptualMetalness, 0.0, 1.0);
			float materialRoughness = clamp(texture(roughnessMap, coord).r * perceptualRoughness, 0.04, 1.0);
	
			vec3 color = ${pbr.lightInvoke("normal", "eyeDirection", "lightDirection", "lightColor", "materialAlbedo", "materialRoughness", "materialMetalness")};
	
			return color;
	#endif
}

void main(void) {
	vec3 eyeDirection = normalize(eye);

	#ifdef USE_HEIGHT_MAP
		vec2 parallaxCoord = ${parallax.heightInvoke("coord", "heightMap", "eyeDirection", "parallaxScale", "parallaxBias")};
	#else
		vec2 parallaxCoord = coord;
	#endif

	#ifdef USE_NORMAL_MAP
		vec3 modifiedNormal = ${normal.modifyInvoke("normal", "normalMap", "parallaxCoord")};
	#else
		vec3 modifiedNormal = normal;
	#endif

	vec3 materialAlbedo = albedoColor.rgb * ${rgb.standardToLinearInvoke("texture(albedoMap, parallaxCoord).rgb")};
	vec3 outputColor = vec3(0, 0, 0);

	// Apply ambient component
	outputColor += materialAlbedo * ambientLightColor * float(LIGHT_MODEL_AMBIENT);

	// Apply components from directional lights
	for (int i = 0; i < MAX_DIRECTIONAL_LIGHTS; ++i) {
		#ifdef USE_SHADOW_MAP
			float shadowMapSample = texture(directionalLightShadowMaps[i], directionalLightShadows[i].xy).r;

			if (directionalLights[i].castShadow && shadowMapSample < directionalLightShadows[i].z)
				continue;
		#endif

		outputColor += directionalLights[i].visibility * getLight(
			materialAlbedo,
			parallaxCoord,
			modifiedNormal,
			eyeDirection,
			normalize(directionalLightDirections[i]),
			directionalLights[i].color
		);
	}

	// Apply components from point lights
	for (int i = 0; i < MAX_POINT_LIGHTS; ++i) {
		outputColor += pointLights[i].visibility * getLight(
			materialAlbedo,
			parallaxCoord,
			modifiedNormal,
			eyeDirection,
			normalize(pointLightDirections[i]),
			pointLights[i].color
		);
	}

	// Apply emissive component
	#ifdef USE_EMISSIVE_MAP
		outputColor += ${rgb.standardToLinearInvoke("texture(emissiveMap, parallaxCoord).rgb")} * emissiveStrength;
	#endif

	// Apply ambient occlusion component
	#ifdef USE_OCCLUSION_MAP
		outputColor = mix(outputColor, outputColor * texture(occlusionMap, parallaxCoord).r, occlusionStrength);
	#endif

	fragColor = vec4(${rgb.linearToStandardInvoke("outputColor")}, 1.0);
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

interface Configuration {
	lightModel: LightModel,
	lightModelPhongNoAmbient?: boolean,
	lightModelPhongNoDiffuse?: boolean,
	lightModelPhongNoSpecular?: boolean,
	lightModelPhysicalNoAmbient?: boolean,
	maxDirectionalLights?: number,
	maxPointLights?: number,
	useEmissiveMap: boolean
	useGlossMap: boolean,
	useHeightMap: boolean,
	useNormalMap: boolean,
	useOcclusionMap: boolean,
	useShadowMap: boolean
}

interface DirectionalLight extends webgl.DirectionalLight {
	shadowMap: WebGLTexture,
	shadowViewMatrix: matrix.Matrix4
}

interface LightState extends State {
	ambientLightColor: vector.Vector3,
	directionalLights: DirectionalLight[],
	pointLights: webgl.PointLight[], // FIXME: extend PointLight with extra properties
	projectionMatrix: matrix.Matrix4,
	shadowProjectionMatrix: matrix.Matrix4
	viewMatrix: matrix.Matrix4
}

interface ShadowState extends State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

interface State {
	projectionMatrix: matrix.Matrix4,
	viewMatrix: matrix.Matrix4
}

const loadLight = (gl: WebGLRenderingContext, configuration: Configuration) => {
	const maxDirectionalLights = functional.coalesce(configuration.maxDirectionalLights, 0);
	const maxPointLights = functional.coalesce(configuration.maxPointLights, 0)

	const directives = [
		{ name: "LIGHT_MODEL", value: <number>configuration.lightModel },
		{ name: "MAX_DIRECTIONAL_LIGHTS", value: maxDirectionalLights },
		{ name: "MAX_POINT_LIGHTS", value: maxPointLights }
	];

	switch (configuration.lightModel) {
		case LightModel.Phong:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: configuration.lightModelPhongNoAmbient ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_DIFFUSE", value: configuration.lightModelPhongNoDiffuse ? 0 : 1 });
			directives.push({ name: "LIGHT_MODEL_PHONG_SPECULAR", value: configuration.lightModelPhongNoSpecular ? 0 : 1 });

			break;

		case LightModel.Physical:
			directives.push({ name: "LIGHT_MODEL_AMBIENT", value: configuration.lightModelPhysicalNoAmbient ? 0 : 1 });

			break;
	}

	if (configuration.useEmissiveMap)
		directives.push({ name: "USE_EMISSIVE_MAP", value: 1 });

	if (configuration.useGlossMap)
		directives.push({ name: "USE_GLOSS_MAP", value: 1 });

	if (configuration.useHeightMap)
		directives.push({ name: "USE_HEIGHT_MAP", value: 1 });

	if (configuration.useNormalMap)
		directives.push({ name: "USE_NORMAL_MAP", value: 1 });

	if (configuration.useOcclusionMap)
		directives.push({ name: "USE_OCCLUSION_MAP", value: 1 });

	if (configuration.useShadowMap)
		directives.push({ name: "USE_SHADOW_MAP", value: 1 });

	const shader = new webgl.Shader<LightState>(gl, lightVertexShader, lightFragmentShader, directives);

	// Bind geometry attributes
	shader.bindAttributePerGeometry("coords", 2, gl.FLOAT, state => state.geometry.coords);
	shader.bindAttributePerGeometry("normals", 3, gl.FLOAT, state => state.geometry.normals);
	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	if (configuration.useNormalMap)
		shader.bindAttributePerGeometry("tangents", 3, gl.FLOAT, state => state.geometry.tangents);

	// Bind matrix uniforms
	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerModel("normalMatrix", gl => gl.uniformMatrix3fv, state => state.target.viewMatrix.compose(state.subject.matrix).getTransposedInverse3x3());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	if (configuration.useShadowMap)
		shader.bindMatrixPerTarget("shadowProjectionMatrix", gl => gl.uniformMatrix4fv, state => state.shadowProjectionMatrix.getValues());

	// Bind light uniforms
	const defaultColor = [0, 0, 0];
	const defaultDirection = [1, 0, 0];
	const defaultPosition = [0, 0, 0];

	shader.bindPropertyPerMaterial("albedoColor", gl => gl.uniform4fv, state => state.material.albedoColor);
	shader.bindTexturePerMaterial("albedoMap", state => state.material.albedoMap);
	shader.bindPropertyPerTarget("ambientLightColor", gl => gl.uniform3fv, state => vector.Vector3.toArray(state.ambientLightColor));

	switch (configuration.lightModel) {
		case LightModel.Phong:
			if (configuration.useGlossMap)
				shader.bindTexturePerMaterial("glossMap", state => state.material.glossMap);

			shader.bindPropertyPerMaterial("glossColor", gl => gl.uniform4fv, state => state.material.glossColor);
			shader.bindPropertyPerMaterial("shininess", gl => gl.uniform1f, state => state.material.shininess);

			break;

		case LightModel.Physical:
			shader.bindTexturePerMaterial("metalnessMap", state => state.material.metalnessMap);
			shader.bindTexturePerMaterial("roughnessMap", state => state.material.roughnessMap);
			shader.bindPropertyPerTarget("perceptualMetalness", gl => gl.uniform1f, state => 1.0); // FIXME: not available from model
			shader.bindPropertyPerTarget("perceptualRoughness", gl => gl.uniform1f, state => 1.0); // FIXME: not available from model

			break;
	}

	if (configuration.useEmissiveMap) {
		shader.bindTexturePerMaterial("emissiveMap", state => state.material.emissiveMap);
		shader.bindPropertyPerMaterial("emissiveStrength", gl => gl.uniform1f, state => state.material.emissiveStrength);
	}

	if (configuration.useHeightMap) {
		shader.bindTexturePerMaterial("heightMap", state => state.material.heightMap);
		shader.bindPropertyPerMaterial("parallaxBias", gl => gl.uniform1f, state => state.material.parallaxBias);
		shader.bindPropertyPerMaterial("parallaxScale", gl => gl.uniform1f, state => state.material.parallaxScale);
	}

	if (configuration.useNormalMap)
		shader.bindTexturePerMaterial("normalMap", state => state.material.normalMap);

	if (configuration.useOcclusionMap) {
		shader.bindTexturePerMaterial("occlusionMap", state => state.material.occlusionMap);
		shader.bindPropertyPerMaterial("occlusionStrength", gl => gl.uniform1f, state => state.material.occlusionStrength);
	}

	for (let i = 0; i < maxDirectionalLights; ++i) {
		const index = i;

		if (configuration.useShadowMap) {
			shader.bindPropertyPerTarget(`directionalLights[${i}].castShadow`, gl => gl.uniform1i, state => index < state.directionalLights.length && state.directionalLights[index].shadow ? 1 : 0);
			shader.bindMatrixPerTarget(`directionalLights[${i}].shadowViewMatrix`, gl => gl.uniformMatrix4fv, state => index < state.directionalLights.length ? state.directionalLights[index].shadowViewMatrix.getValues() : matrix.Matrix4.createIdentity().getValues());
			shader.bindTexturePerTarget(`directionalLightShadowMaps[${i}]`, state => state.directionalLights[index].shadowMap);
		}

		shader.bindPropertyPerTarget(`directionalLights[${i}].color`, gl => gl.uniform3fv, state => index < state.directionalLights.length ? vector.Vector3.toArray(state.directionalLights[index].color) : defaultColor);
		shader.bindPropertyPerTarget(`directionalLights[${i}].direction`, gl => gl.uniform3fv, state => index < state.directionalLights.length ? vector.Vector3.toArray(state.directionalLights[index].direction) : defaultDirection);
		shader.bindPropertyPerTarget(`directionalLights[${i}].visibility`, gl => gl.uniform1f, state => index < state.directionalLights.length ? 1 : 0);
	}

	for (let i = 0; i < maxPointLights; ++i) {
		const index = i;

		shader.bindPropertyPerTarget(`pointLights[${i}].color`, gl => gl.uniform3fv, state => index < state.pointLights.length ? vector.Vector3.toArray(state.pointLights[index].color) : defaultColor);
		shader.bindPropertyPerTarget(`pointLights[${i}].position`, gl => gl.uniform3fv, state => index < state.pointLights.length ? vector.Vector3.toArray(state.pointLights[index].position) : defaultPosition);
		shader.bindPropertyPerTarget(`pointLights[${i}].radius`, gl => gl.uniform1f, state => index < state.pointLights.length ? state.pointLights[index].radius : 0);
		shader.bindPropertyPerTarget(`pointLights[${i}].visibility`, gl => gl.uniform1f, state => index < state.pointLights.length ? 1 : 0);
	}

	return shader;
};

const loadShadow = (gl: WebGLRenderingContext) => {
	const shader = new webgl.Shader<ShadowState>(gl, shadowVertexShader, shadowFragmentShader);

	shader.bindAttributePerGeometry("points", 3, gl.FLOAT, state => state.geometry.points);

	shader.bindMatrixPerModel("modelMatrix", gl => gl.uniformMatrix4fv, state => state.subject.matrix.getValues());
	shader.bindMatrixPerTarget("projectionMatrix", gl => gl.uniformMatrix4fv, state => state.projectionMatrix.getValues());
	shader.bindMatrixPerTarget("viewMatrix", gl => gl.uniformMatrix4fv, state => state.viewMatrix.getValues());

	return shader;
};

class Renderer implements webgl.Renderer<State> {
	public readonly shadowBuffers: WebGLTexture[];

	private readonly gl: WebGLRenderingContext;
	private readonly lightShader: webgl.Shader<LightState>;
	private readonly maxDirectionalLights: number;
	private readonly maxPointLights: number;
	private readonly shadowProjectionMatrix: matrix.Matrix4;
	private readonly shadowShader: webgl.Shader<ShadowState>;
	private readonly shadowTargets: webgl.Target[];

	public constructor(gl: WebGLRenderingContext, configuration: Configuration) {
		const maxDirectionalLights = configuration.maxDirectionalLights || 0;
		const maxPointLights = configuration.maxPointLights || 0;
		const targets = functional.range(maxDirectionalLights + maxPointLights, i => new webgl.Target(gl, 1024, 1024));

		this.gl = gl;
		this.lightShader = loadLight(gl, configuration);
		this.maxDirectionalLights = maxDirectionalLights;
		this.maxPointLights = maxPointLights;
		this.shadowBuffers = targets.map(target => target.setupDepthTexture(webgl.Format.Depth16));
		this.shadowProjectionMatrix = matrix.Matrix4.createOrthographic(-10, 10, -10, 10, -10, 20);
		this.shadowShader = loadShadow(gl);
		this.shadowTargets = targets;
	}

	public render(target: webgl.Target, scene: webgl.Scene, state: State) {
		const directionalLights = scene.directionalLights || [];
		const gl = this.gl;
		const pointLights = scene.pointLights || [];

		gl.disable(gl.BLEND);

		gl.enable(gl.CULL_FACE);
		gl.enable(gl.DEPTH_TEST);

		const obstacles = scene.subjects.filter(subject => subject.shadow !== false);
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
			this.shadowTargets[bufferIndex].draw(this.shadowShader, obstacles, {
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

		target.draw(this.lightShader, scene.subjects, {
			ambientLightColor: scene.ambientLightColor || vector.Vector3.zero,
			directionalLights: directionalLightStates,
			pointLights: pointLights,
			projectionMatrix: state.projectionMatrix,
			shadowProjectionMatrix: this.shadowProjectionMatrix,
			viewMatrix: state.viewMatrix
		});
	}

	public resize(width: number, height: number) {
	}
}

export { Configuration, LightModel, Renderer, State }