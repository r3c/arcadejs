const enum Channel {
	Red = 0,
	Green = 1,
	Blue = 2,
	Alpha = 3
}

// Read image data from URL
const loadFromURL = async (url: string) => {
	return new Promise<ImageData>((resolve, reject) => {
		const image = new Image();

		image.crossOrigin = "anonymous";
		image.onabort = () => reject(`image load aborted on URL "${url}"`);
		image.onerror = () => reject(`image load failed on URL "${url}"`);
		image.onload = () => {
			const canvas = document.createElement("canvas");

			canvas.height = image.height;
			canvas.width = image.width;

			const context = canvas.getContext("2d");

			if (context === null)
				return reject(`image loaded failed (cannot get canvas 2d context) on URL "${url}"`);

			context.drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

			resolve(context.getImageData(0, 0, canvas.width, canvas.height));
		};

		image.src = url;
	});
};

// Swap channels of given image data
const mapChannels = (imageData: ImageData, channels: Channel[]): ImageData => {
	if (channels.length < 1)
		return imageData;

	const indices = channels.concat([Channel.Red, Channel.Green, Channel.Blue, Channel.Alpha].slice(channels.length));
	const output = new ImageData(imageData.width, imageData.height);

	for (let i = imageData.width * imageData.height; i > 0; --i) {
		const offset = (i - 1) * 4;

		for (let channel = 0; channel < 4; ++channel)
			output.data[offset + channel] = imageData.data[offset + indices[channel]];
	}

	return output;
};

export { Channel, loadFromURL, mapChannels }