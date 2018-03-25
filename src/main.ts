import * as application from "./engine/application";
import * as s00 from "./scene/s00-blank";
import * as s01 from "./scene/s01-projection";
import * as s02 from "./scene/s02-rotation";
import * as s03 from "./scene/s03-composition";
import * as s04 from "./scene/s04-rasterization";
import * as s05 from "./scene/s05-webgl-rendering";
import * as s06 from "./scene/s06-forward-lightning";
import * as s07 from "./scene/s07-directional-shadow";
import * as s08 from "./scene/s08-deferred-shading";
import * as s09 from "./scene/s09-deferred-lighting";

application.initialize({
	"s00: blank": s00.process,
	"s01: projection": s01.process,
	"s02: rotation": s02.process,
	"s03: composition": s03.process,
	"s04: rasterization": s04.process,
	"s05: webgl rendering": s05.process,
	"s06: forward lightning": s06.process,
	"s07: directional shadow": s07.process,
	"s08: deferred shading": s08.process,
	"s09: deferred lighting": s09.process
});
