import * as matrix from "../../math/matrix";
import * as webgl from "../webgl";

class Painter<State> implements webgl.Painter<State> {
	private readonly context: WebGLRenderingContext;
	private readonly shader: webgl.Shader<State>;

	public constructor(gl: WebGLRenderingContext, shader: webgl.Shader<State>) {
		this.context = gl;
		this.shader = shader;
	}

	public paint(subjects: Iterable<webgl.Subject>, view: matrix.Matrix4, state: State) {
		const gl = this.context;
		const shader = this.shader;

		gl.useProgram(shader.program);

		for (const subject of subjects) {
			// Assign per-call property uniforms
			for (const binding of shader.getPropertyPerTargetBindings())
				binding(gl, state);

			// Assign per-call texture uniforms
			let textureIndex = 0;

			for (const binding of shader.getTexturePerTargetBindings())
				textureIndex += binding(gl, state, textureIndex);

			// Draw subject nodes
			this.draw(subject.mesh.nodes, subject.matrix, view, textureIndex);
		}
	}

	private draw(nodes: Iterable<webgl.Node>, parentTransform: matrix.Matrix4, viewMatrix: matrix.Matrix4, textureIndex: number) {
		const gl = this.context;
		const shader = this.shader;

		for (const node of nodes) {
			const transform = parentTransform.compose(node.transform);

			this.draw(node.children, transform, viewMatrix, textureIndex);

			for (const primitive of node.primitives) {
				const geometry = primitive.geometry;
				const material = primitive.material;

				// Assign per-material property uniforms
				for (const binding of shader.getPropertyPerMaterialBindings())
					binding(gl, material);

				// Assign per-material texture uniforms
				for (const binding of shader.getTexturePerMaterialBindings())
					textureIndex += binding(gl, material, textureIndex);

				// Assign per-geometry property uniforms
				for (const binding of shader.getPropertyPerNodeBindings()) {
					binding(gl, {
						normalMatrix: viewMatrix.compose(transform).getTransposedInverse3x3(),
						transform: transform
					});
				}

				// Assign per-geometry attributes
				for (const binding of shader.getAttributePerGeometryBindings())
					binding(gl, geometry);

				// Perform draw call
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
				gl.drawElements(gl.TRIANGLES, geometry.count, geometry.indexType, 0);
			}
		}
	}
}

export { Painter }