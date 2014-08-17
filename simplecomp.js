// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var fs = require("fs");
var Compiler = require("./src/core/Compiler");

var args = require("minimist")(process.argv.slice(2));
var comp = new Compiler();

if (!args["min"]) {
  var macs = require("./src/sifonlib/builtin_macros").builtin_macros;
  comp.registerRootMacros(macs);
}

if (args["opt"]) {
  var optimizer = require("./src/lib/Reducer");
  comp.registerOptimizer(optimizer);
}

function compileAndPrintErrors (src, filename) {
  var r = comp.compile(src, filename);
  //r.errors.forEach(function (e) { console.log(e.toString()); });

  var errs = r.errors.filter(function (e) { return e.type !== "info"; });
  if (errs.length > 0) {
    errs.forEach(function (e) { console.log(e.toString()); });
  }

  if (r.exception)
    throw r.exception;
  return r.code;
}

var infile = args["c"];
if (infile) {
  var outfile = args["o"] || (infile.replace(/\.sifon$/, "") + ".js");

  console.log("COMPILING - " + infile + " => " + outfile);

  var content = "" + fs.readFileSync(infile);

  var code = compileAndPrintErrors(content, infile);
  if (code !== undefined) {
    console.log(code);
    fs.writeFileSync(outfile, code, 'utf8');
  }
}

var oneliner = args["e"];
if (oneliner) {
  var code = compileAndPrintErrors(oneliner, "(commandline-argument)");
  if (code !== undefined) {
    console.log("--- COMPILED ---");
    console.log(code);
  }
}

