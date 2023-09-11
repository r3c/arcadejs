import { GlShaderFunction } from "../language";
import { standardToLinear } from "./rgb";

const materialType = "Material";

const materialSample: GlShaderFunction<
  [],
  [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string
  ]
> = {
  declare: () => `
struct ${materialType} {
	vec4 albedo;
	float glossiness;
	float metalness;
	float roughness;
	float shininess;
};

${materialType} materialSample(
	in sampler2D albedoMap, in vec4 albedoFactor, in sampler2D glossinessMap, in float glossinessStrength,
	in sampler2D metalnessMap, in float metalnessStrength, in sampler2D roughnessMap, in float roughnessStrength,
	in float shininess, in vec2 coordinate) {
  vec4 albedoSample = texture(albedoMap, coordinate);
	vec4 albedo = albedoFactor * vec4(${standardToLinear.invoke(
    `albedoSample.rgb`
  )}, albedoSample.a);
	float glossiness = glossinessStrength * texture(glossinessMap, coordinate).r;
	float metalness = metalnessStrength * texture(metalnessMap, coordinate).r;
	float roughness = roughnessStrength * texture(roughnessMap, coordinate).r;

	return ${materialType}(
		albedo,
		glossiness,
		clamp(metalness, 0.0, 1.0),
		clamp(roughness, 0.04, 1.0),
		shininess
	);
}`,

  invoke: (
    albedoMap: string,
    albedoFactor: string,
    glossinessMap: string,
    glossinessStrength: string,
    metalnessMap: string,
    metalnessStrength: string,
    roughnessMap: string,
    roughnessStrength: string,
    shininess: string,
    coordinate: string
  ) =>
    `materialSample(${albedoMap}, ${albedoFactor}, ${glossinessMap}, ${glossinessStrength}, ${metalnessMap}, ${metalnessStrength}, ${roughnessMap}, ${roughnessStrength}, ${shininess}, ${coordinate})`,
};

export { materialSample, materialType };
