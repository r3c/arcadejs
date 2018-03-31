import * as application from "./engine/application";
import * as s00 from "./scene/s00-blank";
import * as s01 from "./scene/s01-software";
import * as s02 from "./scene/s02-webgl";
import * as s03 from "./scene/s03-forward-lightning";
import * as s04 from "./scene/s04-directional-shadow";
import * as s05 from "./scene/s05-deferred-shading";
import * as s06 from "./scene/s06-deferred-lighting";

application.initialize({
	"Blank screen": s00.process,
	//"Software rendering": s01.process,
	"Basic WebGL rendering": s02.process,
	"Forward rendering": s03.process,
	"Directional shadow": s04.process,
	"Deferred shading": s05.process,
	"Deferred lighting": s06.process
});
