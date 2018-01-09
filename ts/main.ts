import * as application from "./engine/application";
import * as s01 from "./scene/s01_perspective";
import * as s02 from "./scene/s02_transform";
import * as s03 from "./scene/s03_colorize";
import * as s04 from "./scene/s04_texturize";
import * as s05 from "./scene/s05_webgl";

application.initialize({
	"perspective": s01.scene,
	"transform": s02.scene,
	"colorize": s03.scene,
	"texturize": s04.scene,
	"webgl": s05.scene
});
