#!/usr/bin/env node

"use strict";

const express = require("express");
const port = process.env.PORT || 8080;
const app = express();

app.use(express.static(__dirname + "/dist"));
app.listen(port);

console.log(`server started on http://localhost:${port}/`);
