// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var Compiler = require("../src/core/Compiler");
var makeEvaluating = require("./testutil_Compiler").makeEvaluating;


describe("Compiler", function () {

  var evaluating = makeEvaluating(new Compiler());

  evaluating("x .= 3").willBe(3);
  evaluating("x").willBe(3);
  delete x;

  evaluating('[]').willBe([]);
  evaluating('[3, 100, "str"]').willBe([3, 100, "str"]);
  evaluating('[3, 100, ["str"]]').willBe([3, 100, ["str"]]);

  evaluating('{}').willBe({});
  evaluating('{ foo: 13 }').willBe({ foo: 13 });

  evaluating('[3, 1, 5].[1 .+ 1]').willBe(5);
  evaluating('[3, 1, 5].(1 .+ 1)').fail();

  evaluating(
    '{ foo: 13, bar:"string" }'
  ).willBe(
    { foo: 13, bar:"string" }
  );

  evaluating(
    '{',
    '  foo: 13',
    '  bar:"string"',
    '}'
  ).willBe(
    { foo: 13, bar:"string" }
  );

  evaluating(
    '{',
    '  foo:',
    '     13',
    '  bar: "string"',
    '}'
  ).willBe(
    { foo: 13, bar: "string" }
  );

  evaluating(
    '(# a -> { foo: a }) 10'
  ).willBe(
    { foo: 10 }
  );

  evaluating(
    'x .= #() -> -12',
    'x ()'
  ).willBe(-12);
  evaluating(
    'x .= # -> -12',
    'x ()'
  ).willBe(-12);

  evaluating(
    '-> f .= #(a (b .= 10)) ->',
    '     match a',
    '      3 -> b',
    '      (if a) -> a',
    '      _ -> undefined',
    '   f 3'
  ).willBe(
    10
  );

  evaluating('f 4').willBe(4);
  evaluating('f ""').willBe(undefined);

  evaluating(
    '-> f .= [1, true, 3, "str"] ',
    '   match f',
    '    [a, b, c] -> b',
    '    [a, ...v, last] -> v.length',
    '    _ -> undefined'
  ).willBe(
    2
  );

  evaluating(
    '-> f .= [1, true, 3, "str"] ',
    '   match f',
    '    [a]  -> b',
    '    [...v, a, "str"] (if a) -> a',
    '    _  -> undefined'
  ).willBe(
    3
  );

  evaluating(
    '{}.toString ()'
  ).willBe(
    '[object Object]'
  );

  evaluating('{ toString: # -> "foo" }.toString ()').willBe("foo");

  evaluating(
    'if (not true) ->',
    '   42 .* 0.5',
    ' else ->',
    '   42'
  ).willBe(
    42
  );

  evaluating(
    '-> x .= 100',
    '   y .= if x',
    '         -> x.toString ()',
    '         -> 42'
  ).willBe(
    "100"
  );

  evaluating(
    '-> x .= 100',
    '   y .= if x',
    '         if false (Math.pow x 2)',
    '         42'
  ).willBe(
    undefined
  );

  evaluating(
    '-> x .= 100',
    '   y .= if x',
    '         (if true [1, 2, 3] [1, 2]).length',
    '         [1, 2, 3, 4, ].length'
  ).willBe(
    3
  );

  evaluating(
    '-> x .= 100',
    '   y .= if x',
    '         -> z .= x.toString ()',
    '            z.length',
    '         42'
  ).willBe(
    3
  );

  // dots in function expression
  evaluating(
    '-> x .= #(a ...b) -> b.length',
    '   x 3 4 7 10'
  ).willBe(
    3
  );

  evaluating(
    'x 3'
  ).willBe(
    0
  );

  evaluating(
    '-> x .= #(...a b c) -> a.length',
    '   x 3 4 7 10'
  ).willBe(
    2
  );

  evaluating('x 2').willBe(0);
  evaluating('x 2 5').willBe(0);
  evaluating('x 2 5 8').willBe(1);
  evaluating('x 2 5 8 10').willBe(2);

  evaluating(
    '-> x .= #(a b ...c d e) -> c.length',
    '   x 3 4 7 10 2'
  ).willBe(
    1
  );

  evaluating('x 4').willBe(0);
  evaluating('x 4 2').willBe(0);
  evaluating('x 4 2 8').willBe(0);
  evaluating('x 4 2 8 10').willBe(0);
  evaluating('x 4 2 8 10 "foo"').willBe(1);
  evaluating('x 4 2 8 10 "foo" true').willBe(2);
  evaluating('x 4 2 8 10 "foo" true 3').willBe(3);

  evaluating(
    '-> x .= #(a ...b c d) -> c',
    '   x 3 4 7 10 2'
  ).willBe(
    10
  );

  evaluating('x 4').willBe(undefined);
  evaluating('x 4 2').willBe(2);
  evaluating('x 4 2 8').willBe(2);
  evaluating('x 4 2 8 10').willBe(8);
  evaluating('x 4 2 8 10 "foo"').willBe(10);
  evaluating('x 4 2 8 10 "foo" true').willBe("foo");
  evaluating('x 4 2 8 10 "foo" true 3').willBe(true);

  // nullary function call
  evaluating('(# -> arguments.length) ()').willBe(0);
  evaluating('(# -> arguments.length) true').willBe(1);
  evaluating('(# -> arguments.length) true true').willBe(2);

  // opeartors: +
  evaluating('4 .+ 10').willBe(14);
  evaluating('4.5 .+ 10.5').willBe(15);
  evaluating('+ 10 4 1 -3').willBe(12);
  evaluating('+ 3').willBe(3);
  //evaluating('+ ()').willBe(undefined);  // not yet impl'ed.

  evaluating('"foo" .+ 10').willBe("foo10");
  evaluating('"foo" .+ "str"').willBe("foostr");
  evaluating(
    '+ "foo"',
    '  "c"',
    '  25',
    '  "a"'
  ).willBe("fooc25a");

  // opeartors: -
  evaluating('4 .- 10').willBe(-6);
  evaluating('- 10 4 1 -3').willBe(8);
  evaluating('- 3').willBe(-3);
  //evaluating('- ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: *
  evaluating('4 .* 10').willBe(40);
  evaluating('* 10 4 1 -3').willBe(-120);
  evaluating('* 3').willBe(3);
  //evaluating('* ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: /
  evaluating('4 ./ 10').willBe(0.4);
  evaluating('/ 10 4 1 -3').willBe(10 / 4 / 1 / -3);
  evaluating('/ 3').willBe(1 / 3);
  //evaluating('/ ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: %
  evaluating('4 .% 10').willBe(4);
  evaluating('10 .% 4').willBe(2);
  evaluating('-10 .% 4').willBe(-10 % 4);
  evaluating('-10 .% -4').willBe(-10 % -4);
  evaluating('10 .% -4').willBe(10 % -4);
  evaluating('% 107 5 13 -3').willBe(107 % 5 % 13 % -3);
  evaluating('% 3').willBe(3);
  //evaluating('% ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: %
  evaluating('4 .% 10').willBe(4);
  evaluating('10 .% 4').willBe(2);
  evaluating('-10 .% 4').willBe(-10 % 4);
  evaluating('-10 .% -4').willBe(-10 % -4);
  evaluating('10 .% -4').willBe(10 % -4);
  evaluating('% 107 5 13 -3').willBe(107 % 5 % 13 % -3);
  evaluating('% 3').willBe(3);
  //evaluating('% ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: <<
  evaluating('10 .<< 1').willBe(20);
  evaluating('255 .<< 2').willBe(255 * 4);
  evaluating('-10 .<< 4').willBe(-10 << 4);
  evaluating('-10 .<< -4').willBe(-10 << -4);
  evaluating('10 .<< -4').willBe(10 << -4);
  evaluating('<< 10701 1 2 3').willBe(10701 << 1 << 2 << 3);
  evaluating('<< 3').willBe(3);
  //evaluating('<< ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: >>>
  evaluating('10 .>>> 1').willBe(5);
  evaluating('255 .>>> 2').willBe(63);
  evaluating('-10 .>>> 4').willBe(-10 >>> 4);
  evaluating('-10 .>>> -4').willBe(-10 >>> -4);
  evaluating('10 .>>> -4').willBe(10 >>> -4);
  evaluating('>>> 10701 1 2 3').willBe(10701 >>> 1 >>> 2 >>> 3);
  evaluating('>>> 3').willBe(3);
  //evaluating('>>> ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: &&
  evaluating('10 .&& 1').willBe(1);
  evaluating('255 .&& 2').willBe(2);
  evaluating('0 .&& 4').willBe(0 && 4);
  evaluating('0 .&& -4').willBe(0 && -4);
  evaluating('&& 10701 0 2 3').willBe(10701 && 0 && 2 && 3);
  evaluating('&& 3').willBe(3);
  //evaluating('&& ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: ||
  evaluating('10 .|| 1').willBe(10);
  evaluating('255 .|| 2').willBe(255);
  evaluating('0 .|| 4').willBe(0 || 4);
  evaluating('0 .|| -4').willBe(0 || -4);
  evaluating('|| 0 10701 2 3').willBe(0 || 10701 || 2 || 3);
  evaluating('|| 3').willBe(3);
  //evaluating('|| ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: &
  evaluating('10 .& 1').willBe(0);
  evaluating('255 .& 2').willBe(2);
  evaluating('0 .& 4').willBe(0 & 4);
  evaluating('0 .& -4').willBe(0 & -4);
  evaluating('& 10701 0 2 3').willBe(10701 & 0 & 2 & 3);
  evaluating('& 3').willBe(3);
  //evaluating('& ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: |
  evaluating('10 .| 1').willBe(11);
  evaluating('255 .| 2').willBe(255);
  evaluating('0 .| 4').willBe(0 | 4);
  evaluating('0 .| -4').willBe(0 | -4);
  evaluating('| 0 10701 2 3').willBe(0 | 10701 | 2 | 3);
  evaluating('| 3').willBe(3);
  //evaluating('| ()').willBe(undefined);  // not yet impl'ed.

  // opeartors: ^
  evaluating('10 .^ 1').willBe(11);
  evaluating('255 .^ 2').willBe(253);
  evaluating('0 .^ 4').willBe(0 ^ 4);
  evaluating('0 .^ -4').willBe(0 ^ -4);
  evaluating('^ 0 10701 2 3').willBe(0 ^ 10701 ^ 2 ^ 3);
  evaluating('^ 3').willBe(3);
  //evaluating('^ ()').willBe(undefined);  // not yet impl'ed.

  // operators: js==
  evaluating('100 .js== (99 .+ 1)').willBe(true);
  evaluating('"foo0" .js== ("foo" .+ 0)').willBe(true);
  evaluating('js== "foo0" ("foo" .+ 0) (+ "foo" (- 2 2))').willBe(true);
  evaluating('js== "foo0" ("foo" .+ 0) "bar"').willBe(false);
  evaluating('js== { toString: # -> "foo" } "foo"').willBe(true);
  //evaluating('js== "foo0"').fail();  // fail not yet impl'ed.

  // operators: js!=
  evaluating('100 .js!= (99 .+ 1)').willBe(false);
  evaluating('"foo0" .js!= ("foo" .+ 0)').willBe(false);
  evaluating('js!= "foo0" ("foo" .+ 0) (+ "foo" (- 2 2))').willBe(false);
  evaluating('js!= "foo0" ("foo" .+ 0) "bar"').willBe(true);
  evaluating('js!= { toString: # -> "foo" } "foo"').willBe(false);
  //evaluating('js!= "foo0"').fail();  // fail not yet impl'ed.

  // operators: ==
  evaluating('100 .== (99 .+ 1)').willBe(true);
  evaluating('"foo0" .== ("foo" .+ 0)').willBe(true);
  evaluating('== "foo0" ("foo" .+ 0) (+ "foo" (- 2 2))').willBe(true);
  evaluating('== "foo0" ("foo" .+ 0) "bar"').willBe(false);
  evaluating('== { toString: # -> "foo" } "foo"').willBe(false);
  //evaluating('== "foo0"').fail();  // fail not yet impl'ed.

  // operators: !=
  evaluating('100 .!= (99 .+ 1)').willBe(false);
  evaluating('"foo0" .!= ("foo" .+ 0)').willBe(false);
  evaluating('!= "foo0" ("foo" .+ 0) (+ "foo" (- 2 2))').willBe(false);
  evaluating('!= "foo0" ("foo" .+ 0) "bar"').willBe(true);
  evaluating('!= { toString: # -> "foo" } "foo"').willBe(true);
  //evaluating('!= "foo0"').fail();  // fail not yet impl'ed.

  // operators: ++ (pre)
  evaluating(
    'x .= 55',
    '++ x'
  ).willBe(56);

  // operators: -- (pre)
  evaluating(
    'x .= 55',
    '-- x'
  ).willBe(54);

  // operators: <<post++>>
  evaluating(
    'x .= 55',
    '<<post++>> x'
  ).willBe(55);
  evaluating('x').willBe(56);

  // operators: <<post-->>
  evaluating(
    'x .= 55',
    '<<post-->> x'
  ).willBe(55);
  evaluating('x').willBe(54);

  // operators: not
  evaluating('not 55').willBe(false);
  evaluating('not (not false)').willBe(false);

  // operators: !
  evaluating('~ 55').willBe(~ 55);
  evaluating('(~ 24)').willBe(~24);
  evaluating('~ (~ 24)').willBe(~ ~24);

  // operators: +=
  evaluating(
    'x .= 0',
    'y .= 0',
    'x .+= 10',
    'x .+= y .+= 5',
    'x .+= y'
  ).willBe(
    20
  );

  // operators: -=
  evaluating(
    'x .= 0',
    'y .= 0',
    'x .-= 10',
    'x .-= y .+= 5',
    'x .-= y'
  ).willBe(-20);

  // operators: *=
  evaluating(
    'x .= 7',
    'x .*= 3'
  ).willBe(21);

  // operators: /=
  evaluating(
    'x .= 7',
    'x ./= 3'
  ).willBe(7 / 3);

  // operators: %=
  evaluating(
    'x .= 7',
    'x .%= 3'
  ).willBe(1);

  // operators: <<=
  evaluating(
    'x .= 7',
    'x .<<= 3'
  ).willBe(7 << 3);

  // operators: >>=
  evaluating(
    'x .= 7',
    'x .>>= 3'
  ).willBe(7 >> 3);

  // operators: >>>=
  evaluating(
    'x .= -7',
    'x .>>>= 3'
  ).willBe(-7 >>> 3);

  // operators: &=
  evaluating(
    'x .= 17',
    'x .&= 3'
  ).willBe(17 & 3);

  // operators: |=
  evaluating(
    'x .= 17',
    'x .|= 3'
  ).willBe(17 | 3);

  // operators: ^=
  evaluating(
    'x .= 17',
    'x .^= 3'
  ).willBe(17 ^ 3);

  // operators: &&=
  evaluating(
    'x .= 17',
    'x .&&= 3'
  ).willBe(17 && 3);

  evaluating(
    'x .= false',
    'x .&&= 3'
  ).willBe(false && 3);

  evaluating(
    'x .= true',
    'x .&&= 3'
  ).willBe(true && 3);


  // operators: ||=
  evaluating(
    'x .= 17',
    'x .||= 3'
  ).willBe(17 || 3);

  evaluating(
    'x .= false',
    'x .||= 3'
  ).willBe(false || 3);

  evaluating(
    'x .= true',
    'x .||= 3'
  ).willBe(true || 3);

  // operators: (new, delete, void, typeof, in, instanceof) (reg. 2014-06-22)
  evaluating(
    'x .= #(a b) ->',
    '  this.foo .= a',
    '  this.bar .= # -> b',
    '  this',
    'obj .= new x "zoozoo" 3',
    'obj.foo'
  ).willBe(
    'zoozoo'
  );
  evaluating('obj.bar ()').willBe(3);
  evaluating('void |> obj.bar ()').willBe(undefined);

  evaluating('in "bar" obj').willBe(true);
  evaluating('in "baq" obj').willBe(false);
  evaluating('"bar" .in obj').willBe(true);
  evaluating('"baq" .in obj').willBe(false);
  evaluating('typeof obj.bar').willBe("function");
  evaluating('typeof obj.baq').willBe("undefined");

  evaluating(
    'delete obj.bar',
    'typeof obj.bar'
  ).willBe("undefined");

  evaluating('instanceof obj x').willBe(true);
  evaluating('instanceof obj Object').willBe(true);
  evaluating('instanceof obj Date').willBe(false);

  evaluating('obj .instanceof x').willBe(true);
  evaluating('obj .instanceof Object').willBe(true);
  evaluating('obj .instanceof Date').willBe(false);

  // Destructuring bind
  evaluating(
    '[x, y] .= [42, 10]',
    'x .- y'
  ).willBe(32);

  evaluating(
    '[y, x] .= [x, y]',
    'x .- y'
  ).willBe(-32);

  evaluating(
    '[a, b] .= [{}, {}]',
    '[x, y] .= [a, b]',
    '[y, x] .= [x, y]',
    'a .== y'
  ).willBe(true);

  evaluating('b .== x').willBe(true);

  evaluating(
    'obj .= {',
    '  foo: # -> ++ @bar',
    '  bar: 42',
    '}',
    'obj.foo ()',
    'obj.bar .= 14',
    'obj.foo ()'
  ).willBe(15);

  // macro
  evaluating(
    '-> x .= # a ->',
    '     macro aif (a b c) ->',
    '       `(if ,b ,a ,c)',
    '     aif "foo" false a',
    '   x 10'
  ).willBe(
    10
  );

  evaluating(
    'x .= # a ->',
    '  macro aif (a b c) ->',
    '    symbol-macro iff () -> \'\'if',
    '    `( ,iff ,b ,a ,c)',
    '  aif "foo" true a',
    'x 10'
  ).willBe(
    "foo"
  );

  evaluating(
    'x .= # a ->',
    '  macro aif (a b c) ->',
    '    symbol-macro iff () -> \'\'if',
    '    `(iff ,b ,a ,c)',         // iff cannot be found.
    '  aif "foo" true a',
    'x 10'
  ).fail();

  // symbol-macro
  evaluating(
    '-> x .= # a ->',
    '     meta -> s .= 100',
    '     symbol-macro foo ->',
    '       ++ s',
    '       s',
    '     foo',
    '     foo',
    '     foo .+ a',
    '   x 10'
  ).willBe(
    113
  );

  evaluating(
    's .= "runtime"',
    'x .= # ->',
    '  symbol-macro s -> "compiletime"',
    '  # () -> s',
    '(x ()) ()'
  ).willBe(
    "compiletime"
  );

  evaluating(
    's .= "runtime"',
    'x .= # ->',
    '  symbol-macro s -> "compiletime"',
    '  # s -> s',
    '(x ()) ()'
  ).fail();

  evaluating(
    '-> s .= "runtime"',
    '   meta -> s .= "compiletime"',
    '   symbol-macro s -> s',
    '   s'
  ).willBe("compiletime");

  evaluating(
    's .= "runtime"',
    'meta -> s .= "compiletime"',
    'symbol-macro s -> s',
    's'
  ).willBe("compiletime");

  evaluating(
    'x .= #(v) ->',
    '  v .or return v',
    '  typeof v',
    'x false'
  ).willBe(false);

  evaluating(
    'x true'
  ).willBe("boolean");

  evaluating(
    'x .= #(v) ->',
    '  y .= v .or return v',
    '  typeof y',
    'x false'
  ).willBe(false);

  evaluating(
    'x true'
  ).willBe("boolean");

  evaluating(
    'x .= { a: 100, b: 20 }',
    '{ a: a } .= x',
    'a'
  ).willBe(100);

  evaluating(
    '{ b: b, a: a } .= x',
    'b'
  ).willBe(20);

  // Object literal without colons

  evaluating(
    'b .= a .= 0',
    '{ b, a } .= x',
    'a .+ b'
  ).willBe(120);

  evaluating(
    'xx .= { a, b }',
    'xx.a .+ xx.b'
  ).willBe(120);

  // try statement

  evaluating(
    'x .= # ->',
    '  try ->',
    '     y .= {}.inexistent ()',
    '     y .+ 1',
    '   catch e ->',
    '     "err"',
    'x ()'
  ).willBe("err");

  evaluating(
    'x .= # ->',
    '  try ->',
    '     y .= {}.inexistent ()',
    '     y .+ 1',
    '   catch (typeof "number") ->',
    '     "err"',
    '   catch (typeof "object") -> "objerr"',
    'x ()'
  ).willBe("objerr");

  evaluating(
    'y .= 0',
    'x .= # ->',
    '  try (y .= {}.inexistent ())',
    '   catch _ "err"',
    '   finally (++ y)',
    'x () .+ y'
  ).willBe("err1");

  // for, for-in statement

  evaluating(
    'values .= [10, 0, 4, 2]',
    'acc .= 0',
    'for (i .= 0, i .< values.length, ++ i) ->',
    '  acc .+= values.[i]',
    'acc'
  ).willBe(10 + 0 + 4 + 2);

  evaluating(
    'values .= [10, 0, 4, 2]',
    'acc .= 0',
    'for (i .= 0',
    '     i .< values.length',
    '     ++ i) ->',
    '  acc .+= values.[i]',
    'acc'
  ).willBe(10 + 0 + 4 + 2);

  evaluating(
    'values .= [10, 1, 4, 2]',
    'acc .= 1',
    'for (k .in values) ->',
    '  acc .*= values.[k]',
    'acc'
  ).willBe(10 * 1 * 4 * 2);

  evaluating(
    'values .= [10, 1, 4, 2]',
    'acc .= ""',
    'for ((k, v) .in values) ->',
    '  acc .+= + k ":" v " "',
    'acc'
  ).willBe("0:10 1:1 2:4 3:2 ");

  evaluating(
    'ancestor .= { a: 100 }',
    'descendant .= Object.create ancestor',
    'descendant.b .= 42',
    'descendant.z .= 5',
    'acc .= 0',
    'for ((k, v) .in descendant) ->',
    '  acc .+= v',
    'acc'
  ).willBe(147)

  evaluating(
    'acc .= 0',
    'for-own ((k, v) .in descendant) ->',
    '  acc .+= v',
    'acc'
  ).willBe(47)

  evaluating(
    'values .= [1, 0, 3, -1]',
    'acc .= 0',
    'for (i .= 0',
    '     -> kacc .= 0',
    '        for (k .in values) ->',
    '          kacc .+= values.[k]',
    '        i .< kacc',
    '     ++ i) ->',
    '  acc .+= values.[i]',
    'acc'
  ).willBe(1 + 0 + 3);

  // break/continue

  evaluating(
    'x .= 1',
    'for () ->',
    '  x .*= 2',
    '  if (x .>= 1000) -> break',
    'x'
  ).willBe(1024);

  evaluating(
    'values .= [10, 1, 4, 2]',
    'acc .= 1',
    'for (k .in values) ->',
    '  if (k .== "3") -> break',
    '  acc .*= values.[k]',
    'acc'
  ).willBe(10 * 1 * 4);

  evaluating(
    'values .= [10, 1, 4, 2]',
    'acc .= 1',
    'for (k .in values) ->',
    '  if (k .== "2") -> continue',
    '  acc .*= values.[k]',
    'acc'
  ).willBe(10 * 1 * 2);

  // labelled break/continue

  evaluating(
    'values .= [[1, 2], [3, 5], [10, 100, 0, 2], [4]]',
    'acc .= 0',
    'for-own ((k, v) .in values) (label outer) ->',
    '  for (j .= 0, j .< v.length, ++ j) (label inner) ->',
    '    if (v.[j] .== 0) -> break outer',
    '    acc .+= v.[j]',
    'acc'
  ).willBe(1 + 2 + 3 + 5 + 10 + 100);

  evaluating(
    'values .= [[1, 2], [3, 5], [10, 100, 0, 2], [4]]',
    'acc .= 0',
    'for-own ((k, v) .in values) (label outer) ->',
    '  for (j .= 0, j .< v.length, ++ j) (label inner) ->',
    '    if (v.[j] .== 100) -> continue outer',
    '    acc .+= v.[j]',
    'acc'
  ).willBe(1 + 2 + 3 + 5 + 10 + 0 + 4);

  // while

  evaluating(
    'values .= [10, 0, 4, 2]',
    'acc .= 0',
    'i .= 0',
    'while (i .< values.length)  ->',
    '  if (i .== 0) ->',
    '    ++ i',
    '    continue',
    '  acc .+= values.[i]',
    '  ++ i',
    'acc'
  ).willBe(0 + 4 + 2);

  evaluating(
    'values .= [10, 0, 4, 2]',
    'acc .= 0',
    'i .= 0',
    'while (i .< values.length) (label loop) ->',
    '  if (i .== 0) ->',
    '    ++ i',
    '    continue loop',
    '  acc .+= values.[i]',
    '  ++ i',
    'acc'
  ).willBe(0 + 4 + 2);

  // if ignored

  evaluating(
    '-> if 3 4 (void 0)',
    '   10'
  ).willBe(10);

  // ?.

  evaluating(
    "x .= {}",
    "x.foo?.value"
  ).willBe(undefined);

  evaluating(
    "x .= {foo: {value: 1 }}",
    "x.foo?.value"
  ).willBe(1);

  evaluating(
    "x .= {foo: {}}",
    "x.foo?.value?.zoo.boo"
  ).willBe(undefined);

  evaluating(
    "x .= {foo: {value: {t:1} }}",
    "typeof x.foo?.value?.t"
  ).willBe("number");

  evaluating(
    "typeof {foo: {value: {t:1} }}.foo?.value?.t"
  ).willBe("number");

  evaluating(
    "x .= {foo: {value: #() -> 1 }}",
    "-> x.foo?.value 100",
    "   42"
  ).willBe(42);

  // .?

  evaluating(
    "x .= {foo: {value: 1 }}",
    "x.foo?.value .? 100"
  ).willBe(1);

  // string interpolation

  evaluating('#"foo bar zoo#aa"').willBe("foo bar zoo#aa");

  evaluating(
    'foo .= 3',
    '#"#{foo}"'
  ).willBe("3");

  evaluating('#"#{"foo"}"').willBe("foo");

  evaluating(
    'xx .= "XX"',
    '#"aa {bb #{xx} cc}"'
  ).willBe(
    "aa {bb XX cc}"
  );

  evaluating('#"foo #{ 1 }dsa"').willBe("foo 1dsa");

  evaluating(
    'foo .= #(a, b) -> b .+ (a .* 100)',
    '#"foo #{ foo 1 "sl" }dsa"'
  ).willBe(
    "foo sl100dsa"
  );

  evaluating(
    'x .= 15',
    '#"foo #{ foo 1 "sl" }dsa#{- x}"'
  ).willBe(
    "foo sl100dsa-15"
  );

  evaluating(
    'foo .= # (a b) -> + b a b',
    'x .= # a -> a .+ a',
    '#"foo #{ foo #"inside #{ x "foo" } endinside" "ABC" }dsa"'
  ).willBe(
    "foo ABCinside foofoo endinsideABCdsa"
  );

  // regexp

  evaluating(
    '"aafoOOoobARRrrrrbbbfoooBarrccc".replace //foo+bar+/gi "-"'
  ).willBe(
    "aa-bbb-ccc"
  );

  evaluating(
    're .= //fo(o+b)ar+/',
    'm .= "foooobarrrr".match re',
    'm.[1]'
  ).willBe(
    "ooob"
  );

});

