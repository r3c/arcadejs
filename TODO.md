Arcade.js TODO
==============

ToDo
----

- Fix "operation requires zeroing texture data" error
- Implement directional light shadow maps for deferred {shading,lighting}
- Implement point light shadow maps
- Implement smooth shadows
- Implement PBR lighting model for deferred {shading,lighting}
- Draw lights using quads instead of spheres in deferred {shading,lighting}
- Detect canvas resizing and stop violating encapsulation [canvas-resize]
- Use RGB standard to linear conversion in deferred shader
- Extract model textures out of materials to factorize bitmaps
- Split scene update and draw to perform batch sorting only on change
- Support animated models and load animations from glTF files

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
- Fix directional/point lighting in forward renderer when not using normal maps
- Fix shininess encoding function used in deferred lighting renderer
- Inject ambient light in forward renderer
- Inject ambient light in deferred lighting renderer
- Factorize common GLSL methods from renderer implementations
- Support specular light color in deferred lighing shader
- Compute shadow view matrix from light direction and not the opposite in forward renderer
- Use same tangent space transform methods in forward and deferred renderers
- Implement point light radius in forward rendering
