Arcade.js README
================

Experimental WebGL library for real-time 3D graphics.

Requirements
------------

You'll need the following to build and run this project:

* [Node.js](https://nodejs.org/) v8.9.4 or above ;
* Any web browser with support for WebGL2 such as
  [Mozilla Firefox](https://www.mozilla.org/firefox/) (preferred) or
  [Google Chrome](https://www.google.com/chrome/index.html).

Build
-----

From repository directory, run the following to build project files:

    npm install
    npm run build

Once build, open `./www/index.html` in a supported browser.

If you are using Google Chrome then you'll get cross-origin errors as it denies
requests when using `file://` protocol by default. This can be solved either by
running it with `--allow-file-access-from-files` command-line switch or
starting a local HTTP server:

    npm run serve

Then browse to http://localhost:8080/ when prompted.

References
----------

Following materials were used to design this project:

* http://diaryofagraphicsprogrammer.blogspot.fr/2008/03/light-pre-pass-renderer.html
* http://graphicrants.blogspot.fr/2013/08/specular-brdf-reference.html
* http://ogldev.atspace.co.uk/www/tutorial37/tutorial37.html
* http://sunandblackcat.com/other.php?l=eng
* http://www.fastgraph.com/makegames/3drotation/
* http://www.opengl-tutorial.org/fr/intermediate-tutorials/tutorial-13-normal-mapping/
* http://www.opengl-tutorial.org/fr/intermediate-tutorials/tutorial-16-shadow-mapping/
* https://github.com/KhronosGroup/glTF-WebGL-PBR
* https://learnopengl.com/Advanced-Lighting/Deferred-Shading
* https://learnopengl.com/PBR/Theory
* https://webgl2fundamentals.org/webgl/lessons/webgl1-to-webgl2.html#Vertex-Array-Objects
* https://www.marmoset.co/posts/basic-theory-of-physically-based-rendering/
* https://www.yaronet.com/topics/146556-opengl-shaders-et-questions-en-vrac

License
-------

This project is licensed under the MIT License. See the
[LICENSE.md](LICENSE.md) file for details.
