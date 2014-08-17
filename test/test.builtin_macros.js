// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var Compiler = require("../src/core/Compiler");
var makeEvaluating = require("./testutil_Compiler").makeEvaluating;

var macs = require("../src/sifonlib/builtin_macros").builtin_macros;

describe("builtin_macros", function () {

  var comp = new Compiler();
  comp.registerRootMacros(macs);

  var evaluating = makeEvaluating(comp);

  describe("*if", function () {
    evaluating(
      '-> a .= 0',
      '   a .= 1 *if true',
      '   a .= 2 *if false *if 1',
      '   a'
    ).willBe(
      1
    );
  });

  describe("*unless", function () {
    evaluating(
      "x .= # a ->",
      "  return a *unless a",
      "  typeof a",
      "x 10"
    ).willBe("number");

    evaluating(
      "x null"
    ).willBe(null);
  });

  describe("*++, *--", function () {
    evaluating(
      'x .= 1',
      'y .= |> x *++',
      'z .= (x *++)',
      'x .+ (y .* 100) .+ (z .* 10000)'
    ).willBe(3 + 1 * 100 + 2 * 10000);

    evaluating(
      'x .= 10',
      'y .= |> x *--',
      'z .= (x *--)',
      'x .+ (y .* 100) .+ (z .* 10000)'
    ).willBe(8 + 10 * 100 + 9 * 10000);
  });

  describe("*.", function () {

    evaluating(
      'foo .= {',
      '  v: ""',
      '  bar: # x ->',
      '    @v .+= "bar" .+ x',
      '    this',
      '  buzz: # x ->',
      '    @v .+= "buzz" .+ x',
      '    this',
      '  zee: # x ->',
      '    @v .+= "zee" .+ x',
      '    this',
      '  nullary: # ->',
      '    @v .+= "nullary"',
      '    this',
      '}',
      'foo.bar "a"',
      ' *.buzz 1',
      ' *.zee 42',
      ' *.v'
    ).willBe("barabuzz1zee42");

    evaluating(
      'foo.v .= ""',
      'foo.zee 5 *.buzz 3 *.v'
    ).willBe("zee5buzz3");

    evaluating(
      'foo.v .= ""',
      'foo.zee 5 *.nullary ()',
      '  *.nullary () *.v'
    ).willBe("zee5nullarynullary");

  });

  describe("*when", function () {

    evaluating(
      'x .= # a -> typeof a',
      'x 10',
      ' *when (%it .== "number") -> %it .+ 1'
    ).willBe("number1");

    evaluating(
      'x true',
      ' *when (%it .== "number") -> %it .+ 1'
    ).willBe("boolean");

    evaluating(
      'x true',
      ' *when (%it .== "number") -> %it .+ 1',
      ' *when (%it .== "boolean") -> %it .+ 2'
    ).willBe("boolean2");

    evaluating(
      'x undefined',
      ' *when (%it .== "number") -> %it .+ 1',
      ' *when (%it .== "boolean") -> %it .+ 2'
    ).willBe("undefined");

  });

  describe("*catch, *finally", function () {

    evaluating(
      '{}.foo ()',
      '  *catch e -> 1'
    ).willBe(1);

    evaluating(
      '{}.foo ()',
      '  *catch (typeof "number") -> 3',
      '  *catch e -> 32'
    ).willBe(32);

    evaluating(
      'try ->',
      '   {}.foo ()',
      '  *catch e -> 1',
      ' finally -> console.log'
    ).willBe(1);

    evaluating(
      'try ->',
      '   {}.foo ()',
      '  *catch (typeof "number") -> 3',
      '  *catch e -> 32',
      ' finally -> 0'
    ).willBe(32);

    evaluating(
      'x .= 0',
      '{}.foo ()',
      '  *finally -> ++ x',
      '  *catch e ->',
      'x'
    ).willBe(1);

    evaluating(
      'x .= 0',
      '{}.foo ()',
      '  *finally -> ++ x',
      '  *catch (typeof "number") -> 3',
      '  *finally -> ++ x',
      '  *catch e ->',
      'x'
    ).willBe(2);

  });

  describe("unless", function () {

    evaluating(
      'x .= 0',
      'unless (x .== 1) "ne" "eq"'
    ).willBe("ne");

    evaluating(
      'x .= 0',
      'unless (x .== 1) ->',
      '   "ne"',
      ' else ->',
      '   "eq"'
    ).willBe("ne");

  });

  describe("#+", function () {
    evaluating(
      'x .= { foo: 7, bar: 19 }',
      'x.f .= # a ->',
      '  g .= #+ -> @[a]',
      '  g',
      'y .= x.f "foo"',
      'y ()'
    ).willBe(7);

    evaluating(
      'a .= { bar: 121 }',
      'y .= x.f.call a "bar"',
      'y ()'
    ).willBe(121);
  });

  describe("#match", function () {

    evaluating(
      'x .= #match',
      '      [a, b] -> a .+ b',
      '      [v] -> v',
      '      _ -> 0',
      'x [75]'
    ).willBe(75);

    evaluating('x [71, 6]').willBe(77);
    evaluating('x [71, 6, 100]').willBe(0);

    evaluating(
      'xx .= #match ->',
      ' [a, b] -> a .+ b',
      ' [v] -> v',
      ' _ -> 0',
      'xx [75]'
    ).willBe(75);

    evaluating('xx [71, 6]').willBe(77);
    evaluating('xx [71, 6, 100]').willBe(0);

  });

  describe("#match+", function () {

    evaluating(
      'x .= { foo: 15, bar: 11 }',
      'x.f .= # a ->',
      '  #match+ ->',
      '    [c] -> @[c]',
      '    _ -> @[a]',
      'y .= x.f "foo"',
      'y ()'
    ).willBe(15);

    evaluating(
      'y ["bar"]'
    ).willBe(11);

  });

  describe("do", function () {

    evaluating(
      'x .= 10',
      'do ->',
      '  x *++',
      'x'
    ).willBe(11);

    evaluating(
      'x .= 10',
      'y .= 0',
      'do (x) ->',
      '  x *++',
      '  y .= x',
      '+ y ":" x'
    ).willBe("11:10");

    evaluating(
      'x .= 5',
      'y .= 7',
      'do (x y) ->',
      '  x .= y .= 0',
      '+ y ":" x'
    ).willBe("7:5");

    evaluating(
      'x .= 5',
      'y .= 7',
      'do (x, y) ->',
      '  x .= y .= 0',
      '+ y ":" x'
    ).willBe("7:5");

  });

  describe("loop", function () {

    evaluating(
      'x .= 1',
      'loop ->',
      '  x .*= 2',
      '  break *if (x .> 100)',
      'x'
    ).willBe(128);

    evaluating(
      'x .= i .= 0',
      'loop (label labl) ->',
      '  loop ->',
      '    ++ i',
      '    continue *if (i .== 4)',
      '    x .+= i',
      '    break labl *if (x .> 18)',
      'x'
    ).willBe(1 + 2 + 3 + 5 + 6 + 7);

  });

  describe("case", function () {

    evaluating(
      'x .= # a ->',
      '  case',
      '    (a .== 3) -> "int3"',
      '    (typeof a .== "boolean") -> "bool"',
      '    (a .< 100) -> "lt100"',
      '    (a .== "foo") -> "strfoo"',
      '    _ -> "other"',
      'x 50'
    ).willBe("lt100");

    evaluating('x false').willBe("bool");
    evaluating('x "foo"').willBe("strfoo");
    evaluating('x "bar"').willBe("other");

    evaluating(
      'y .= 10',
      'x .= # a ->',
      '  case',
      '    (a .== 3) -> "int3"',
      '    (typeof a .== "boolean") -> "bool"',
      '    (a .< 100) -> "lt100"',
      '    (a .== "foo") -> "strfoo"',
      'y .= x "bar"',
      ' *catch e -> 0'
    ).willBe(0);

    evaluating(
      'x .= # a -> case ->',
      '  (a .== 3) -> "int3"',
      '  _ -> "other"',
      'x 50'
    ).willBe("other");

  });

  // TODO Add tests for: =freeze, *NODE_DEBUG
  //
  // builtin-macro =freeze (lhs, rhs) ->
  //   if (@optimizing ())
  //    -> `|> ,lhs .= ,rhs
  //    -> `|> ,lhs .= Object.freeze ,rhs
  // 
  // builtin-macro (*NODE_DEBUG) node ->
  //   if (process.env.NODE_DEBUG) node undefined

  describe("reap", function () {
    evaluating(
      "x .= reap ->",
      "  for (i .= 0, i .< 10, ++ i) ->",
      "    sow (i .* i)",
      "x.[3]"
    ).willBe(9);

    evaluating(
      'x .= reap ->',
      '  for (i .= 0, i .< 10, ++ i) ->',
      '    sow i',
      '    sow (i .* i)',
      '+ x.[6] ": " x.[7]'
    ).willBe("3: 9");

    evaluating(
      'x .= reap foo ->',
      '  y .= reap bar ->',
      '    for (i .= 0, i .< 10, ++ i) ->',
      '      sow i bar',
      '      sow (i .* i) foo',
      '+ x.[5] ": " y.[5]'
    ).willBe("25: 5");

    evaluating(
      'x .= reap ->',
      '  sow 1 bar'
    ).fail();
  });

});


