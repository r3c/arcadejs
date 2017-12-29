
const canvas = document.createElement('canvas');

document.body.appendChild(canvas);

canvas.tabIndex = 1;
canvas.width = canvas.offsetWidth;
canvas.height = canvas.offsetHeight;
canvas.focus();

const contextOrNull = canvas.getContext('2d');

if (contextOrNull === null)
	throw Error("cannot get 2d context");

const context = contextOrNull;
const height = canvas.height;
const width = canvas.width;

export { canvas, context, width, height };