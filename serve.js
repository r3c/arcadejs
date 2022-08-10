#!/usr/bin/env node
"use strict";

const express = require("express");
const port = process.env.PORT || 8080;
const app = express();

app.use(express.static(__dirname + "/www"));
app.listen(port);

console.log(
  "server started, open http://localhost:" + port + "/ in your browser."
);
