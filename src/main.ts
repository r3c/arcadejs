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

application.initialize([
	application.declare("s00: blank", s00.scenario),
	application.declare("s01: projection", s01.scenario),
	application.declare("s02: rotation", s02.scenario),
	application.declare("s03: composition", s03.scenario),
	application.declare("s04: rasterization", s04.scenario),
	application.declare("s05: webgl rendering", s05.scenario),
	application.declare("s06: forward lightning", s06.scenario),
	application.declare("s07: directional shadow", s07.scenario),
	application.declare("s08: deferred shading", s08.scenario),
	application.declare("s09: deferred lighting", s09.scenario)
]);
