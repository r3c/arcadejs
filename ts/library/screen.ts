let canvas = document.createElement('canvas');

document.body.appendChild(canvas);

canvas.tabIndex = 1;
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;

let contextOrNull = canvas.getContext('2d');

if (contextOrNull === null)
	throw Error("cannot get 2d context");

let context = contextOrNull;
let height = canvas.height;
let width = canvas.width;

export { canvas, context, width, height };