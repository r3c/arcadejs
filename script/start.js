#!/usr/bin/env node

"use strict";

import express from 'express';
import url from 'url';

const base = url.fileURLToPath(new URL('.', import.meta.url));
const port = process.env.PORT || 8080;
const app = express();

app.use(express.static(base + "/../dist"));
app.listen(port);

console.log(`server started on http://localhost:${port}/`);
