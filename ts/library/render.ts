import * as display from "./display";
import * as math from "./math";

interface Mesh {
	normals?: math.Point3D[];
	vertices: math.Point3D[];
}

const drawTriangle = (context: CanvasRenderingContext2D, p1: math.Point2D, p2: math.Point2D, p3: math.Point2D) => {
	context.strokeStyle = 'white';
	context.beginPath();
	context.moveTo(p1.x, p1.y);
	context.lineTo(p2.x, p2.y);
	context.lineTo(p3.x, p3.y);
	context.lineTo(p1.x, p1.y);
	context.stroke();
};

const draw = (screen: display.Screen, projection: math.Matrix, modelView: math.Matrix, mesh: Mesh) => {
	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = projection.multiply(modelView);
	const vertices = mesh.vertices;

	for (let i = 0; i + 2 < vertices.length; i += 3) {
		drawTriangle(screen.context,
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 0]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 1]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 2])
		);
	}
};

const projectToScreen = (modelViewProjection: math.Matrix, halfWidth: number, halfHeight: number, vertex: math.Point3D): math.Point2D => {
	const point = modelViewProjection.transform(vertex);

	return {
		x: point.x * halfWidth + halfWidth,
		y: point.y * halfHeight + halfHeight
	};
};

export { draw };
