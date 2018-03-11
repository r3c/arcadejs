Arcade.js TODO
==============

ToDo
----

- Fix "operation requires zeroing texture data" error
- Fix shininess encoding function used in deferred lighting renderer
- Fix directional/point lighting in forward renderer when not using normal maps
- Inject ambient light in forward renderer
- Compute shadow view matrix from light direction and not the opposite in forward renderer
- Factorize common GLSL methods from renderer implementations
- Implement point light shadow maps
- Implement ambient occlusion
- Draw lights using quads instead of spheres in deferred {shading,lighting}

Done
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
- Fix lighting saturation in deferred lighting
- Fix extra "clear" call required to bypass feedback error in deferred-shading & deferred-lighting
- Fix out of range specular component in light buffer of deferred-lighting renderer
