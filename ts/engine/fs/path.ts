
const directory = (path: string) => {
	return path.substr(0, path.lastIndexOf('/') + 1);
};

const combine = (head: string, tail: string) => {
	if (head.length > 0 && head[head.length - 1] !== '/')
		head += '/';

	return head + tail;
};

export { directory, combine }
