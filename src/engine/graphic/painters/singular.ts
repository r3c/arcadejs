import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

class Painter<State> implements webgl.Painter<State> {
	private readonly shader: webgl.Shader<State>;

	public constructor(shader: webgl.Shader<State>) {
		this.shader = shader;
	}

	public paint(target: webgl.Target, subjects: Iterable<webgl.Subject>, view: matrix.Matrix4, state: State) {
		const shader = this.shader;

		shader.activate();

		for (const subject of subjects) {
			// Assign per-call property uniforms
			for (const binding of shader.getPropertyPerTargetBindings())
				binding(state);

			// Assign per-call texture uniforms
			let textureIndex = 0;

			for (const binding of shader.getTexturePerTargetBindings())
				textureIndex += binding(state, textureIndex);

			// Draw subject nodes
			this.draw(target, subject.mesh.nodes, subject.matrix, view, textureIndex);
		}
	}

	private draw(target: webgl.Target, nodes: Iterable<webgl.Node>, parentTransform: matrix.Matrix4, viewMatrix: matrix.Matrix4, textureIndex: number) {
		const shader = this.shader;

		for (const node of nodes) {
			const transform = parentTransform.compose(node.transform);

			this.draw(target, node.children, transform, viewMatrix, textureIndex);

			for (const primitive of node.primitives) {
				const geometry = primitive.geometry;
				const material = primitive.material;
				const state = {
					normalMatrix: viewMatrix.compose(transform).getTransposedInverse3x3(),
					transform: transform
				};

				// Assign per-material property uniforms
				for (const binding of shader.getPropertyPerMaterialBindings())
					binding(material);

				// Assign per-material texture uniforms
				for (const binding of shader.getTexturePerMaterialBindings())
					textureIndex += binding(material, textureIndex);

				// Assign per-geometry property uniforms
				for (const binding of shader.getPropertyPerNodeBindings())
					binding(state);

				// Assign per-geometry attributes
				for (const binding of shader.getAttributePerGeometryBindings())
					binding(geometry);

				// Perform draw call
				target.draw(geometry.indexBuffer, geometry.count, geometry.indexType);
			}
		}
	}
}

export { Painter }