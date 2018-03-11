#!/usr/bin/env node
'use strict';

const argparse = require("argparse");
const browserify = require("browserify");
const fs = require("fs");
const tsify = require("tsify");
const watchify = require("watchify");

// Read command line arguments
const parser = new argparse.ArgumentParser({
	addHelp:		true,
	description:	'ArcadeJS build CLI.',
	version:		'0.0.1'
});

parser.addArgument(['-w', '--watch'], {
	action:	'storeTrue',
	help:	'Enable watch mode (rebuild on file change).'
});

const args = parser.parseArgs();

// Configure browserify & tsify
const project = browserify({
	cache: {},
	debug: true,
	entries: ["src/main.ts"],
	packageCache: {}
})
	.plugin("tsify");

// Create bundle from current project
const bundle = function () {
	const stream = project.bundle();

	stream
		.on("error", console.error)
		.pipe(fs.createWriteStream(__dirname + "/www/js/bundle.js"));
};

// Enable watchify mode if requested
if (args.watch) {
	project
		.plugin(watchify)
		.on("log", console.log)
		.on("update", bundle);
}

// Initiate first bundle
bundle();
