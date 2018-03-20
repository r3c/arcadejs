Arcade.js README
================

Build
-----

This project requires Node.js v8.9.4 or above. From repository directory, run
the following to build project files:

    npm install
    npm run build

Run
---

Open `./www/index.html` in your browser.

If you are using Chrome then you'll get cross-origin errors as it denies every
request when using `file://` protocol by default. This can be solved either by
running it with `--allow-file-access-from-files` command-line switch or
starting a local HTTP server with `npm run serve` script.
