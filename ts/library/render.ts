import * as mathjs from "mathjs";
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

const draw = (screen: display.Screen, projection: mathjs.Matrix, modelView: mathjs.Matrix, mesh: Mesh) => {
	const halfWidth = screen.getWidth() * 0.5;
	const halfHeight = screen.getHeight() * 0.5;

	const modelViewProjection = mathjs.multiply(projection, modelView);
	const vertices = mesh.vertices;

	for (let i = 0; i + 2 < vertices.length; i += 3) {
		drawTriangle(screen.context,
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 0]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 1]),
			projectToScreen(modelViewProjection, halfWidth, halfHeight, vertices[i + 2])
		);
	}
};

const projectToScreen = (modelViewProjection: mathjs.Matrix, halfWidth: number, halfHeight: number, vertex: math.Point3D): math.Point2D => {
	const point = mathjs.multiply(modelViewProjection, mathjs.matrix([vertex.x, vertex.y, vertex.z, 1]));

	const x = point.get([0]);
	const y = point.get([1]);
	const w = point.get([3]);

	return {
		x: x / w * halfWidth + halfWidth,
		y: y / w * halfHeight + halfHeight
	};
};

export { draw };