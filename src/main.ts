import * as application from "./engine/application";
import * as s00 from "./scene/s00-blank";
import * as s01 from "./scene/s01-projection";
import * as s02 from "./scene/s02-rotation";
import * as s03 from "./scene/s03-composition";
import * as s04 from "./scene/s04-software";
import * as s05 from "./scene/s05-webgl";
import * as s06 from "./scene/s06-forward-phong";
import * as s07 from "./scene/s07-forward-pbr";
import * as s08 from "./scene/s08-directional-shadow";
import * as s09 from "./scene/s09-deferred-shading";
import * as s10 from "./scene/s10-deferred-lighting";

application.initialize({
	"Blank screen": s00.process,
	"Projection to screen": s01.process,
	"Rotating mesh": s02.process,
	"Matrix composition": s03.process,
	"Software rendering": s04.process,
	"Basic WebGL rendering": s05.process,
	"Forward Phong lighting": s06.process,
	"Forward PBR lighting": s07.process,
	"Directional shadow": s08.process,
	"Deferred shading": s09.process,
	"Deferred lighting": s10.process
});
