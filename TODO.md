Arcade.js TODO file
===================

TODO
----

- Fix lighting saturation in deferred lighting
- Implement point light shadow maps
- Implement ambient occlusion
- Draw lights using quads instead of spheres in deferred {shading,lighting}

OPEN
----

- Stencil buffer + full sphere instead of front face culling for deferred rendering?
  - http://ogldev.atspace.co.uk/www/tutorial37/tutorial37.html
  - https://learnopengl.com/Advanced-Lighting/Deferred-Shading

DONE
----

- Yield + errors in OBJ loader
- Return T from io.readURL, not Request<T>
- Load images from graphic loader
- Rename baseColor into ambientColor
- Implement parallax mapping (~name?)
- No default material map
- Implement directional light shadow maps
- Allow reading projection matrix, possibly by moving it out of target
- Do not repeat model matrix for successive rendering passes
- Reject unknown material names when loading model
- Merge Target implementations in a single class with "setColorTexture" / "setDepthTexture" methods
- Fix vertices rotation when loading model
- Implement deferred shading
- Implement deferred lighing
