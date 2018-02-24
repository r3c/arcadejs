let browserify = require("browserify");
let fs = require("fs");
let tsify = require("tsify");
let watchify = require("watchify");

let browserifyOptions = {
	cache: {},
	debug: true,
	entries: ['ts/main.ts'],
	packageCache: {}
};

let typescriptOptions = {
	strict: true,
	target: "es6"
};

project = browserify(browserifyOptions)
	.plugin("tsify", typescriptOptions)
	.plugin(watchify);

let bundle = function () {
	project
		.bundle()
		.on('error', console.error)
		.pipe(fs.createWriteStream(__dirname + "/dist/bundle.js"));
}

project
	.on('log', console.log)
	.on('update', bundle);

bundle();
