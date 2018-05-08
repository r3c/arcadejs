import * as functional from "../../language/functional";
import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

interface MaterialBatch {
	material: webgl.Material,
	models: ModelBatch[]
}

interface ModelBatch {
	geometry: webgl.Geometry,
	transform: matrix.Matrix4
}

interface RootBatch<State> {
	shaders: { [variant: number]: ShaderBatch<State> }
}

interface ShaderBatch<State> {
	materials: { [id: string]: MaterialBatch },
	shader: webgl.Shader<State>
}

interface Variant {
	hasAlbedoMap: boolean,
	hasEmissiveMap: boolean,
	hasGlossMap: boolean,
	hasHeightMap: boolean,
	hasNormalMap: boolean,
	hasOcclusionMap: boolean
}

const indexToVariant = (index: number): Variant => ({
	hasAlbedoMap: (index & 1) !== 0,
	hasEmissiveMap: (index & 2) !== 0,
	hasGlossMap: (index & 4) !== 0,
	hasHeightMap: (index & 8) !== 0,
	hasNormalMap: (index & 16) !== 0,
	hasOcclusionMap: (index & 32) !== 0
});

const materialTovariant = (material: webgl.Material) => ({
	hasAlbedoMap: material.albedoMap !== undefined,
	hasEmissiveMap: material.emissiveMap !== undefined,
	hasGlossMap: material.glossMap !== undefined,
	hasHeightMap: material.heightMap !== undefined,
	hasNormalMap: material.normalMap !== undefined,
	hasOcclusionMap: material.occlusionMap !== undefined
});

const variantToIndex = (variant: Variant) =>
	(variant.hasAlbedoMap ? 1 : 0) +
	(variant.hasEmissiveMap ? 2 : 0) +
	(variant.hasGlossMap ? 4 : 0) +
	(variant.hasHeightMap ? 8 : 0) +
	(variant.hasNormalMap ? 16 : 0) +
	(variant.hasOcclusionMap ? 32 : 0);

class Painter<State> implements webgl.Painter<State> {
	private readonly shaderConstructor: (variant: Variant) => webgl.Shader<State>;
	private readonly shaderRepository: webgl.Shader<State>[];

	public constructor(shaderConstructor: (variant: Variant) => webgl.Shader<State>) {
		this.shaderConstructor = shaderConstructor;
		this.shaderRepository = new Array<webgl.Shader<State>>(64);
	}

	public paint(target: webgl.Target, subjects: Iterable<webgl.Subject>, view: matrix.Matrix4, state: State) {
		const batch: RootBatch<State> = {
			shaders: {}
		};

		for (const subject of subjects)
			this.sort(batch, subject.mesh.nodes, subject.matrix);

		this.draw(target, batch, view, state);
	}

	private create(index: number) {
		if (this.shaderRepository[index] === undefined)
			this.shaderRepository[index] = this.shaderConstructor(indexToVariant(index));

		return this.shaderRepository[index];
	}

	private draw(target: webgl.Target, batch: RootBatch<State>, view: matrix.Matrix4, state: State) {
		// Process batch shaders
		for (const shaderIndex in batch.shaders) {
			const shaderBatch = batch.shaders[shaderIndex];
			const shader = shaderBatch.shader;

			shader.activate();

			// Assign per-call properties
			const shaderTextureIndex = shader.bindTarget(state);

			// Process batch materials
			for (const id in shaderBatch.materials) {
				const materialBatch = shaderBatch.materials[id];
				const material = materialBatch.material;

				// Assign per-material properties
				shader.bindMaterial(material, shaderTextureIndex);

				// Process batch models
				for (const model of materialBatch.models) {
					const geometry = model.geometry;

					shader.bindGeometry(geometry);
					shader.bindNode({
						normalMatrix: view.compose(model.transform).getTransposedInverse3x3(),
						transform: model.transform
					});

					target.draw(geometry.indexBuffer, geometry.count, geometry.indexType);
				}
			}
		}
	}

	private sort(batch: RootBatch<State>, nodes: Iterable<webgl.Node>, parent: matrix.Matrix4) {
		for (const node of nodes) {
			const transform = parent.compose(node.transform);

			this.sort(batch, node.children, transform);

			for (const primitive of node.primitives) {
				// Get or create shader batch
				const shaderIndex = variantToIndex(materialTovariant(primitive.material));

				let shaderBatch = batch.shaders[shaderIndex];

				if (shaderBatch === undefined) {
					shaderBatch = {
						materials: {},
						shader: this.create(shaderIndex)
					};

					batch.shaders[shaderIndex] = shaderBatch;
				}

				// Get or create material batch
				let materialBatch = shaderBatch.materials[primitive.material.id];

				if (materialBatch === undefined) {
					materialBatch = {
						material: primitive.material,
						models: []
					};

					shaderBatch.materials[primitive.material.id] = materialBatch;
				}

				// Append to models
				materialBatch.models.push({
					geometry: primitive.geometry,
					transform: transform
				});
			}
		}
	}
}

export { Painter, Variant }