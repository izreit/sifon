// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2015 Kaname Kizu
// Released under the MIT License.

var fs = require("fs");
var Compiler = require("../core/Compiler");
var program = require("commander");

program
  .version("0.1.0")
  .option("--no-std-macros", "Compile without standard macros (for bootstrapping)")
  .option("-c, --source <filename>", "Specify the source file")
  .option("-o, --output <filename>", "Specify the filename to be written")
  .option("-O, --optimize", "Try to optimize the generated code")
  .option("-d, --debug-oneline <code>", "Print compiled code")
  .parse(process.argv);

function cli(args) {
  var comp = new Compiler();

  if (!args.noStdMacros) {
    var macs = require("../sifonlib/builtin_macros").builtin_macros;
    comp.registerRootMacros(macs);
  }

  if (args.optimize) {
    var optimizer = require("../lib/Reducer");
    comp.registerOptimizer(optimizer);
  }

  function compileAndPrintErrors (src, filename) {
    var r = comp.compile(src, filename);
    var errs = r.errors.filter(function (e) { return e.type !== "info"; });
    if (errs.length > 0) {
      errs.forEach(function (e) { console.log(e.toString()); });
    }
    if (r.exception)
      throw r.exception;
    return r.code;
  }

  var infile = args.source;
  if (infile) {
    var outfile = args.output || (infile.replace(/\.sifon$/, "") + ".js");

    console.log("COMPILING - " + infile + " => " + outfile);

    var content = "" + fs.readFileSync(infile);

    var code = compileAndPrintErrors(content, infile);
    if (code !== undefined) {
      fs.writeFileSync(outfile, code, 'utf8');
    }
  }

  var oneliner = args.debugOneline;
  if (oneliner) {
    var code = compileAndPrintErrors(oneliner, "(commandline-argument)");
    if (code !== undefined) {
      console.log("--- COMPILED ---");
      console.log(code);
    }
  }

  return true;
}

cli(program);

