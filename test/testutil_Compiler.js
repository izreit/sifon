// vim: set ts=2 sw=2 sts=2 et ai:

var expect = require("chai").expect;
var Parser = require("../src/core/Parser");
var Compiler = require("../src/core/Compiler");
var testutil = require("./testutil");
var detectObjectDifference = testutil.detectObjectDifference;

function makeEvaluating(comp) {

  return function evaluating(args___) {
    args___ = Array.prototype.slice.call(arguments);
    var s = args___.join("\n");

    return {

      willBe: function (a) {
        var desc_ans = JSON.stringify(a);
        var desc = "evaluating (" + args___.join("//") + ") should be " + desc_ans;
        it(desc, function () {
          var compiled = comp.compile(s);
          compiled.errors.forEach(function (e) { console.log(e.toString()); });

          if (compiled.code) {
            // console.log(compiled.code);
            var result = ("indirect", eval)(compiled.code);
            var compresult = detectObjectDifference(result, a);
            if (compresult != "") {
              console.log("CompResult: " + compresult);
              console.log("Result: " + JSON.stringify(result));
              console.log("JS: " + compiled.code.replace(/\n/g, "\n    "));
              try {
                var debugparser = new Parser();
                var parsed = testutil.NodeUtil.debugStringify(debugparser.setInput(s).parse());
                console.log("Parsed: " + parsed);
              } catch (e) {
                console.log("Parse Failure: " + e);
              }
            }
            expect(compresult).equal("");
          } else {
            var allerrors = compiled.errors
                               .filter(function (e) { return e.type !== "info"; })
                               .map(function (e) { return e.toString(); }).join("\n");
            expect(allerrors).equal("");
            if (compiled.exception)
              throw compiled.exception;
          }
        });
      },

      fail: function () {
        var desc = "evaluating (" + args___.join("//") + ") should fail";
        it(desc, function () {
          var thrown = false;
          try {
            var compiled = comp.compile(s);
            var js = compiled.code;
            // console.log(js);
            if (compiled.errors.filter(function (e) { return e.type === "error" }).length > 0)
              throw comipled.errors;
            if (compiled.exception)
              throw compiled.exception;
            var result = ("indirect", eval)(js);
          } catch (e) {
            thrown = true;
          }
          if (!thrown) {
            try {
              var debugparser = new Parser();
              debugparser.setInput(s);
              var parsed = testutil.NodeUtil.debugStringify(debugparser.parse());
              console.log("Parsed: " + parsed);
            } catch (e){
              console.log("Parse Failure: " + e);
            }
          }
          expect(thrown).equal(true);
        });
      },

    };

  }
}


module.exports.makeEvaluating = makeEvaluating;

