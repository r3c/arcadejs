#!/usr/bin/env node

"use strict";

const https = require('https');
const fs = require('fs');
const path = require('path');

function downloadFiles(files) {

  for (const { destination, url } of files) {
    try {
      fs.accessSync(destination);

      continue;
    }
    catch {
      // Destination doesn't exist and should be downloaded
    }

    const directory = path.dirname(destination);

    try {
      fs.accessSync(directory);
    }
    catch {
      fs.mkdirSync(directory, { recursive: true });
    }

    const file = fs.createWriteStream(destination);

    https.get(url, function (response) {
      response.pipe(file);

      file.on("finish", () => {
        file.close();

        console.log(`Downloaded ${destination}`);
      });
    });
  }
}

downloadFiles([
  {
    destination: "www/obj/cube/mybricks1_AO.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_AO.png"
  },
  {
    destination: "www/obj/cube/mybricks1_basecolor.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_basecolor.png"
  },
  {
    destination: "www/obj/cube/mybricks1_gloss.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_gloss.png"
  },
  {
    destination: "www/obj/cube/mybricks1_height.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_height.png"
  },
  {
    destination: "www/obj/cube/mybricks1_metallic.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_metallic.png"
  },
  {
    destination: "www/obj/cube/mybricks1_normal.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_normal.png"
  },
  {
    destination: "www/obj/cube/mybricks1_roughness.png",
    url: "https://raw.githubusercontent.com/r3c/arcadejs/resource/model/mybricks1/mybricks1_roughness.png"
  }
]);
