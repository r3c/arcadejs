import * as mathjs from "mathjs";
import * as math from "./math";

const project = function (projection: mathjs.Matrix, modelView: mathjs.Matrix, screenSize: math.Point2D, vertex: math.Point3D): math.Point2D {
	const halfWidth = screenSize.x / 2;
	const halfHeight = screenSize.y / 2;

	const modelViewProjection = mathjs.multiply(projection, modelView);
	const projected = mathjs.multiply(modelViewProjection, mathjs.matrix([vertex.x, vertex.y, vertex.z, 1]));

	const x = projected.get([0]);
	const y = projected.get([1]);
	const w = projected.get([3]);

	return {
		x: x * halfWidth / w + halfWidth,
		y: y * halfHeight / w + halfHeight
	};
};

export { project };