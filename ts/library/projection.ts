import * as math from "mathjs";
import * as render from "./render";

const perspective = function (projection: mathjs.Matrix, modelView: mathjs.Matrix, screenSize: render.Point2D, vertex: render.Point3D): render.Point2D {
	const halfWidth = screenSize.x / 2;
	const halfHeight = screenSize.y / 2;

	const modelViewProjection = math.multiply(projection, modelView);
	const projected = math.multiply(modelViewProjection, math.matrix([vertex.x, vertex.y, vertex.z, 1]));

	const x = projected.get([0]);
	const y = projected.get([1]);
	const w = projected.get([3]);

	return {
		x: x * halfWidth / w + halfWidth,
		y: y * halfHeight / w + halfHeight
	};
};

export { perspective };