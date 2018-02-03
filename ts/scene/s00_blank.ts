import * as application from "../engine/application";
import * as display from "../engine/display";
import * as math from "../engine/math";
import * as software from "../engine/render/software";

interface State {
	renderer: software.Renderer
}

const prepare = async () => {
	const runtime = application.runtime(display.Context2DScreen);

	return {
		renderer: new software.Renderer(runtime.screen)
	};
};

const render = (state: State) => {
	state.renderer.clear();
};

const update = () => {
};

const scenario = {
	prepare: prepare,
	render: render,
	update: update
};

export { scenario };
