const browserify = require("browserify");
const fs = require("fs");
const tsify = require("tsify");
const watchify = require("watchify");

const browserifyOptions = {
	cache: {},
	debug: true,
	entries: ['src/main.ts'],
	packageCache: {}
};

const project = browserify(browserifyOptions)
	.plugin("tsify")
	.plugin(watchify);

const bundle = function () {
	project
		.bundle()
		.on('error', console.error)
		.pipe(fs.createWriteStream(__dirname + "/www/js/bundle.js"));
}

project
	.on('log', console.log)
	.on('update', bundle);

bundle();
