// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var Parser = require("../src/core/Parser");
var CompilerMessage = require("../src/core/CompilerMessage");
var expect = require("chai").expect;

var NodeUtil = require("./testutil").NodeUtil;
var sym       = NodeUtil.sym,
    quote     = NodeUtil.quote,
    unquote   = NodeUtil.unquote,
    unquote_s = NodeUtil.unquote,
    quote     = NodeUtil.quote,
    dot       = NodeUtil.dot;

var errors = [];
var error_receiver = function (e) { errors.push(e); };
error_receiver.reset = function () { errors = []; };

var parser = new Parser(error_receiver);

function test(s, a) {
  parser.setInput(s);
  error_receiver.reset();
  var parsed = parser.parse();
  var answer = NodeUtil.makePseudoNode(a);
  var ret = NodeUtil.detectNodeDifference(parsed, answer);
  ///*
  if (ret !== true) {
    console.log("PARSED:   " + NodeUtil.debugStringify(parsed));
    console.log("EXPECTED: " + NodeUtil.debugStringify(answer));
  }
  //*/
  return ret;
}

function test_fail(s, line, col) {
  parser.setInput(s);
  error_receiver.reset();
  try {
    var parsed = parser.parse();
  } catch (e) {
    if (!(e instanceof CompilerMessage))
      throw e;
    return (e.line == line && e.col == col)
             || ("Unexpected failure position: expected :" + line + ":" + col
                  + ", given :" + e.line + ":" + e.col);
  }
  var errs = errors.filter(function (e) { return e.type === "error"; });
  var found = errs.some(function (e) { return (e.line == line && e.col == col); });
  return found || "Unexpected Parsing Success";
}

// Wrappers of the above test() for mocha.
function parsing(src__) {
  src__ = Array.prototype.slice.call(arguments, "\n");
  var caption = src__.join("//")
                     .replace(/([\s\S]{0,48})([\s\S]*)/,
                              function(s, a, b) { return a + (b ? "..." : ""); });
  return {
    willBe: function (a) {
      it("should parse " + caption, function () {
        expect(test(src__.join("\n"), a)).equal(true);
      });
    },
    failAt: function (line, col) {
      it("fails to parse " + caption, function () {
        expect(test_fail(src__.join("\n"), line, col)).equal(true);
      });
    },
  }
}

describe("Parser", function () {

  parsing("x").willBe(sym("x"));
  parsing("-100").willBe(-100);
  parsing('"str"').willBe("str");
  parsing("x.y").willBe(dot(sym("x"), sym("y")));

  parsing("foo #x bar").willBe(
    [sym("foo"),
     [sym("#x"),
      sym("bar")]]
  );

  parsing("foo (#x) bar").willBe(
    [sym("foo"),
     sym("#x"),
     sym("bar")]
  );

  parsing("(foo #x) bar").willBe(
    [[sym("foo"),
      sym("#x")],
     sym("bar")]
  );

  parsing("(*qual)").willBe(sym("*qual"));
  parsing("(*qual foo)").failAt(1, 8);

  parsing(
    'x 100 z'
  ).willBe(
    [sym("x"), 100, sym("z")]
  );

  parsing(
    "if 'x |> if 'y 'z"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("if"), quote(sym("y")), quote(sym("z"))]]
  );

  parsing(
    "if 'x |> if 'y",
    "            'z"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("if"), quote(sym("y")), quote(sym("z"))]]
  );

  parsing(
    "if |> if 1",
    "         2",
    "      3"
  ).willBe(
    [sym("if"),
     [sym("if"), 1, 2],
     3]
  );

  parsing(
    "if 'x |> if 'y",
    "         'z"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("if"), quote(sym("y"))],
     quote(sym("z"))]
  );

  parsing(
    "-> foo 2"
  ).willBe(
    [sym("->"),
     [sym("foo"), 2]]
  );

  parsing(
    "foo # -> 2"
  ).willBe(
     [sym("foo"),
      [sym("#"), [sym("->"), 2]]]
  );

  parsing(
    "foo #* -> 2"
  ).willBe(
     [sym("foo"),
      [sym("#*"), [sym("->"), 2]]]
  );

  parsing(
    "foo #match -> 2"
  ).willBe(
     [sym("foo"),
      [sym("#match"), [sym("->"), 2]]]
  );

  parsing(
    "if 'x # -> foo 2"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("#"),
      [sym("->"),
       [sym("foo"), 2]]]]
  );

  parsing(
    "if 'x #* -> foo 2"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("#*"),
      [sym("->"),
       [sym("foo"), 2]]]]
  );

  parsing(
    "if 'x (",
    "  # -> foo 2",
    ")"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("#"),
      [sym("->"),
       [sym("foo"), 2]]]]
  );

  parsing(
    "if 'x (# ->  ",
    "  foo 2",
    ")"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("#"),
      [sym("->"),
       [sym("foo"), 2]]]]
  );

  parsing(
    "if 'x (# -> array.foo (# v ->",
    "  v 2",
    ") 'x)"
  ).willBe(
    [sym("if"),
     quote(sym("x")),
     [sym("#"),
      [sym("->"),
       [dot(sym("array"), sym("foo")),
        [sym("#"),
         sym("v"),
         [sym("->"),
          [sym("v"), 2]]],
        quote(sym("x"))]]]]
  );

  parsing(
    "[ bar: y, foo: 100 ]"
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), sym("bar"), sym("y")],
     [sym(":"), sym("foo"), 100]]
  );

  parsing(
    "{ bar: y, foo: 100 }"
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("bar"), sym("y")],
     [sym(":"), sym("foo"), 100]]
  );

  parsing(
    "{ o: o, foo: foo } .= object"
  ).willBe(
    [sym("="),
     [sym("<<object>>"),
      [sym(":"), sym("o"), sym("o")],
      [sym(":"), sym("foo"), sym("foo")]],
     sym("object")]
  );

  parsing(
    "[ foo: 100, ]"
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), sym("foo"), 100]]
  );

  parsing(
    "{ foo: 100, }"
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("foo"), 100]]
  );

  parsing(
    '[ "@v+": 100, ]'
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), "@v+", 100]]
  );

  parsing(
    '{ type: t, "@v+": v, d: false}'
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("type"), sym("t")],
     [sym(":"), "@v+", sym("v")],
     [sym(":"), sym("d"), sym("false")]]
  );

  parsing(
    "[ bar: y, foo: 100, ] .= x"
  ).willBe(
    [sym("="),
     [sym("<<array>>"),
      [sym(":"), sym("bar"), sym("y")],
      [sym(":"), sym("foo"), 100]],
     sym("x")]
  );

  parsing(
    '{  "@v+": v } { type: "HOGE"  }'
  ).willBe(
    [[sym("<<object>>"),
      [sym(":"), "@v+", sym("v")]],
     [sym("<<object>>"),
      [sym(":"), sym("type"), "HOGE"]]]
  );

  parsing(
    "if |> if (while 'x 'y)",
    "         = bar 100",
    "         'z",
    "      'zoo"
  ).willBe(
    [sym("if"),
    [sym("if"),
     [sym("while"), quote(sym("x")), quote(sym("y"))],
     [sym("="), sym("bar"), 100],
     quote(sym("z"))],
    quote(sym("zoo"))]
  );

  parsing("()").willBe([]);
  parsing("(,)").failAt(1, 3);  // Not (1, 2), the comma is interpreted as an unquote.
  parsing("(300.42)").willBe(300.42);
  parsing("(3, 8)").willBe([sym("<<tuple>>"), 3, 8]);
  parsing("[]").willBe([sym("<<array>>")]);
  parsing("{}").willBe([sym("<<object>>")]);

  parsing(
    "(a b, foo bar zoo,)"
  ).willBe(
    [sym("<<tuple>>"),
     [sym("a"), sym("b")],
     [sym("foo"), sym("bar"), sym("zoo")]]
  );

  parsing(
    '[ foo: 13 ]'
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), sym("foo"), 13]]
  );

  parsing(
    '{ foo: 13 }'
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("foo"), 13]]
  );

  parsing(
    '-> a .= []',
    '   a.length'
  ).willBe(
    [sym("->"),
     [sym("="), sym("a"), [sym("<<array>>")]],
     [sym("<<dot>>"), sym("a"), sym("length")]]
  );

  parsing(
    '-> a .= [',
    '   ]',
    '   a.length'
  ).willBe(
    [sym("->"),
     [sym("="), sym("a"), [sym("<<array>>")]],
     [sym("<<dot>>"), sym("a"), sym("length")]]
  );

  // A case unwanted but no way to reject...
  parsing(
    '-> a .= [',
    '  ]',
    ' a.length'
  ).willBe(
    [sym("->"),
     [sym("="), sym("a"), [sym("<<array>>")]],
     [sym("<<dot>>"), sym("a"), sym("length")]]
  );

  parsing(
    '-> a .= [',
    '     10, 30',
    '     4',
    '   ]',
    '   a.length'
  ).willBe(
    [sym("->"),
     [sym("="),
      sym("a"),
      [sym("<<array>>"),
       10,
       30,
       4]],
     dot(sym("a"), sym("length"))]
  );

  parsing(
    '[',
    '  foo:',
    '     13',
    ']'
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), sym("foo"), 13]]
  );

  parsing(
    '{',
    '  foo:',
    '     13',
    '}'
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("foo"), 13]]
  );

  parsing(
    '[',
    '  foo:',
    '     13',
    '  bar: "string"',
    ']'
  ).willBe(
    [sym("<<array>>"),
     [sym(":"), sym("foo"), 13],
     [sym(":"), sym("bar"), "string"]]
  );

  parsing(
    '{',
    '  foo:',
    '     13',
    '  bar: "string"',
    '}'
  ).willBe(
    [sym("<<object>>"),
     [sym(":"), sym("foo"), 13],
     [sym(":"), sym("bar"), "string"]]
  );

  parsing(
    '-> value ->',
    '',
    '     zoo',
    '   z "str"'
  ).willBe(
    [sym("->"),
     [sym("value"),
      [sym("->"),
       sym("zoo")]],
     [sym("z"), "str"]]
  );

  parsing(
    'xx -> foo bar',
    '      zoo',
    '      100',
    '  z "str"'
  ).willBe(
    [sym("xx"),
     [sym("->"),
      [sym("foo"), sym("bar")],
      sym("zoo"),
      100],
     [sym("z"), "str"]]
  );

  parsing(
    'xx |> (foo bar) zoo',
    '       100',
    '  z "str"'
  ).willBe(
    [sym("xx"),
     [[sym("foo"), sym("bar")],
      sym("zoo"),
      100],
     [sym("z"), "str"]]
  );

  parsing(
    'foo.bar |> (a.1) b.100'
  ).willBe(
    [dot(sym("foo"), sym("bar")),
     [dot(sym("a"), 1),
      dot(sym("b"), 100)]]
  );

  parsing(
    'foo.bar -> (a.1)',
    '           b.100'
  ).willBe(
    [dot(sym("foo"), sym("bar")),
     [sym("->"),
      dot(sym("a"), 1),
      dot(sym("b"), 100)]]
  );

  parsing('foo.bar a.1, b.100').failAt(1, 12); // at ","

  parsing(
    'foo *qual 100'
  ).willBe(
    [sym("*qual"),
     sym("foo"),
     100]
  );

  parsing(
    'foo',
    ' *qual 778'
  ).willBe(
    [sym("*qual"),
     sym("foo"),
     778]
  );

  parsing(
    'foo',
    '*qual "qualifier can be placed same column of a node"'
  ).willBe(
    [sym("*qual"),
     sym("foo"),
     "qualifier can be placed same column of a node"]
  );

  parsing(
    'foo *.bar'
  ).willBe(
    [sym("*."),
     sym("foo"),
     sym("bar")]
  );

  parsing(
    'foo ()'
  ).willBe(
    [sym("foo")]
  );

  parsing(
    '(foo.bar ()) ()'
  ).willBe(
    [[dot(sym("foo"), sym("bar"))]]
  );

  parsing(
    'foo 1 aa *.ar 100 '
  ).willBe(
    [sym("*."),
     [sym("foo"), 1, sym("aa")],
     [sym("ar"), 100]]
  );

  parsing(
    'fee 100',
    ' *.ver 100'
  ).willBe(
    [sym("*."),
     [sym("fee"), 100],
     [sym("ver"), 100]]
  );

  parsing(
    'fee 100',
    '  ver 100',
    ' *.bbb'
  ).willBe(
    [sym("*."),
     [sym("fee"),
      100,
      [sym("ver"), 100]],
     sym("bbb")]
  );

  parsing(
    'fee 100',
    ' ver 100',
    ' *.bbb'
  ).willBe(
    [sym("fee"),
     100,
     [sym("*."),
      [sym("ver"), 100],
      sym("bbb")]]
  );

  parsing(
    'fee 100',
    ' *.ver 100',
    ' *.bbb'
  ).willBe(
    [sym("*."),
     [sym("*."),
      [sym("fee"), 100],
      [sym("ver"), 100]],
     sym("bbb")]
  );

  parsing(
    '(a b c)',
    '  d'
  ).willBe(
    [[sym("a"),
      sym("b"),
      sym("c")],
     sym("d")]
  );

  parsing(
    '(left_parenthesis must_be_considered as_head_of_a_sequence)',
    ' hence_this_belongs_the_sequence'
  ).willBe(
    [[sym("left_parenthesis"),
      sym("must_be_considered"),
      sym("as_head_of_a_sequence")],
     sym("hence_this_belongs_the_sequence")]
  );

  parsing(
    '(((((a)))))',
    ' b'
  ).willBe(
    [sym("a"), sym("b")]
  );

  parsing('@').failAt(1, 2);
  parsing(
    '@',
    'foo'
  ).failAt(2, 1);

  parsing(
    '@foo'
  ).willBe(
    [sym("@"), sym("foo")]
  );

  parsing(
    '@foo ()'
  ).willBe(
    [[sym("@"), sym("foo")]]
  );

  parsing(
    '@foo 1 @bar'
  ).willBe(
    [[sym("@"), sym("foo")],
     1,
     [sym("@"), sym("bar")]]
  );

  // Regression: dot accessed properties as the seqneuce head
  parsing(
    'foo.bar',
    ' a'
  ).willBe(
    [[sym("<<dot>>"), sym("foo"), sym("bar")],
     sym("a")]
  );

  parsing(
    'log e *debug'
  ).willBe(
       [sym("*debug"),
        [sym("log"),
         sym("e")]]
  );

  parsing(
    '#() -> v'
  ).willBe(
     [sym("#"),
      [],
      [sym("->"),
       sym("v")]]
  );

  parsing(
    '# a b (c 100) -> v'
  ).willBe(
     [sym("#"),
      sym("a"),
      sym("b"),
      [sym("c"),
       100],
      [sym("->"),
       sym("v")]]
  );

  parsing(
    '->',
    '  window.addEventListener "list" # e ->',
    '    console.log ("event-list" .+ e) *debug'
  ).willBe(
    [sym("->"),
     [dot(sym("window"), sym("addEventListener")),
      "list",
      [sym("#"),
       sym("e"),
       [sym("->"),
        [sym("*debug"),
         [dot(sym("console"), sym("log")),
          [sym("+"), "event-list", sym("e")]]] ]]]]
  );

  parsing(
    '->',
    '  v .= 0',
    '  window.addEventListener "list" # e ->',
    '    console.log ("event-list" .+ e) *debug',
    '    v *++',
    '  #() -> v'
  ).willBe(
    [sym("->"),
     [sym("="), sym("v"), 0],
     [dot(sym("window"), sym("addEventListener")),
      "list",
      [sym("#"),
       sym("e"),
       [sym("->"),
        [sym("*debug"),
         [dot(sym("console"), sym("log")),
          [sym("+"), "event-list", sym("e")]]],
        [sym("*++"), sym("v")]]]],
     [sym("#"),
      [],
      [sym("->"),
       sym("v")]]]
  );

  parsing(
    'a -> foo bar .* 100'
  ).willBe(
    [sym("a"),
     [sym("->"),
      [sym("*"),
       [sym("foo"), sym("bar")],
       100]]]
  );

  parsing(
    'a -> foo bar .* 100 *if v'
  ).willBe(
    [sym("a"),
     [sym("->"),
      [sym("*if"),
       [sym("*"),
        [sym("foo"), sym("bar")],
        100],
       sym("v")]]]
  );

  parsing(
    'a -> b c .* 3 *if v',
    ' *this qualifies.a'
  ).willBe(
    [sym("*this"),
     [sym("a"),
      [sym("->"),
       [sym("*if"),
        [sym("*"),
         [sym("b"), sym("c")],
         3],
        sym("v")]]],
     dot(sym("qualifies"), sym("a"))]
  );

  parsing(
    'a -> b c .* 3 *if v',
    '   *this qualifies.arrow'
  ).willBe(
     [sym("a"),
      [sym("*this"),
       [sym("->"),
        [sym("*if"),
         [sym("*"),
          [sym("b"), sym("c")],
          3],
         sym("v")]],
       dot(sym("qualifies"), sym("arrow"))]]
  );

  parsing(
    'a -> b c .* 3 *if v',
    '       *this qualifies.b'
  ).willBe(
     [sym("a"),
       [sym("->"),
        [sym("*this"),
          [sym("*if"),
           [sym("*"),
            [sym("b"), sym("c")],
            3],
           sym("v")],
         dot(sym("qualifies"), sym("b"))]]]
  );

  parsing(
    'foo bar',
    ' .zoo'
  ).failAt(2, 2);

  parsing(
    'a |> foo',
    '     .bar'
  ).failAt(2, 6);

  parsing(
    '{ a: # -> "foo" }'
  ).willBe(
    [sym("<<object>>"),
     [sym(":"),
      sym("a"),
      [sym("#"),
       [sym("->"),
        "foo"]]]]
  );

  parsing(
    '{ toString: # -> "foo" }.toString 1'
  ).willBe(
    [dot([sym("<<object>>"),
          [sym(":"),
           sym("toString"),
           [sym("#"),
            [sym("->"),
             "foo"]]]],
         sym("toString")),
     1]
  );

  // regression ,foo.bar should be (,foo).bar but not ,(foo.bar)
  parsing(",',foo.bar").willBe(
    dot(unquote(quote(unquote(sym("foo")))),
        sym("bar"))
  );

});

