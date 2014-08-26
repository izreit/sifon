// vim: set ts=2 sw=2 sts=2 et ai:

var devel = require("../src/base/devel");
var util = require("../src/base/util");
var Lexer = require("../src/core/Lexer");
var Token = require("../src/core/Token");
var expect = require("chai").expect;

// The token comparator.
//
// Returns the empty string if `a` is same with `b`.
// If not, returns a string describing the reason why they aren't identical.
//
function compareToken(a, b) {

  function reason(why) {
    return why + " " + JSON.stringify(a) + " and " + JSON.stringify(b) + ("// " + a.val + " " + b.val);
  }

  function regexflagcheck(fa, fb) {
    if ((fa.indexOf("g") !== -1) !== (fb.indexOf("g") !== -1))
      return reason("RegExpGlobalMismatch");
    if ((fa.indexOf("i") !== -1) !== (fb.indexOf("i") !== -1))
      return reason("RegExpIgnoreCaseMismatch");
    if ((fa.indexOf("m") !== -1) !== (fb.indexOf("m") !== -1))
      return reason("RegExpMultilineMismatch");
    return undefined;
  }

  if (a === b && a === undefined || a === null)
    return "BothNil";
  if (!!a != !!b)
    return reason("NotAndNotNil");
  if (a.toktype != b.toktype)
    return reason("TypeMismatch");
  if (a.toktype === "REGEXP") {
    if (a.val.source !== b.val.source)
      return reason("RegExpSourceMismatch");
    var ch = regexflagcheck(a.val.flags, b.val.flags);
    if (ch !== undefined)
      return ch;
  } else if (a.toktype === "REGEXP_TAIL") {
    if (a.val.body !== b.val.body)
      return reason("RegExpTailBodyMismatch");
    var ch = regexflagcheck(a.val.flags, b.val.flags);
    if (ch !== undefined)
      return ch;
  } else {
    if (a.val != b.val)
      return reason("ValueMismatch");
  }
  if (a.line != -1 && b.line != -1 && a.line != b.line)
    return reason("LineMismatch");
  if (a.col != -1 && b.col != -1 && a.col != b.col)
    return reason("ColumnMismatch");
  return "";
}

// DSL
// ---
//
// Helpers to describe test data.  The return values
// of the following functions can be passed to asToken().
//
var id       = function (name)    { return { identifier: name }; };
var hash_id  = function (name)    { return { hash_identifier: name } };
var indent   = function (indent)  { return { indent: indent }; };
var sym      = function (name)    { return { symbol: name }; };
var op       = function (name)    { return { operator: name }; };
var qual     = function (name)    { return { qualifier: name }; };
var comment  = function (comment) { return { comment: comment }; };
var istrhead = function (str)     { return { istrhead: str }; };
var istrpart = function (str)     { return { istrpart: str }; };
var istrtail = function (str)     { return { istrtail: str }; };
var regexphead = function (str)   { return { regexphead: str }; };
var regexppart = function (str)   { return { regexppart: str }; };
var regexptail = function (s, f)  { return { regexptail: s, flags: f }; };
var eof = { eof: 1 };
var unquote = { unquote: 1 };
var unquote_s = { unquote_s: 1 };

// *asToken()*: a JavaScript-value-to-Token converter.
//
// The argument must be either a value or an array which
// can be described as `[ value, line, col ]`. The latter
// form is used to confirm locations of tokens.  The value
// can be a string, a number, a boolean or an object
// created by the above helpers.
//
function asToken(v) {
  var line = -1, col = -1;
  if (v instanceof Array) {
    line = v[1];
    col = v[2];
    v = v[0];
  }

  if (typeof v == "string") {
    return Token.makeStr('"' + v + '"', line, col);
  } else if (typeof v == "number") {
    return Token.makeNum(v, line, col);
  } else if (v instanceof RegExp) {
    var flags = (v.global ? "g" : "") + (v.multiline ? "m" : "") + (v.ignoreCase ? "i" : "");
    return Token.make("REGEXP", { body: v.source, flags: flags }, line, col);
  } else if (typeof v == "object") {
    if (v === eof) {
      return Token.makeEof(line, col);
    } else if (v === unquote) {
      return Token.makeUnquote(line, col);
    } else if (v === unquote_s) {
      return Token.makeUnquoteSplicing(line, col);
    } else if (v.identifier !== undefined) {
      return Token.makeIdent(v.identifier, line, col);
    } else if (v.hash_identifier !== undefined) {
      return Token.make("HASH_IDENTIFIER", v.hash_identifier, line, col);
    } else if (v.indent !== undefined) {
      return Token.makeIndent(v.indent, line, col)
    } else if (v.symbol !== undefined) {
      return Token.make(v.symbol, v.symbol, line, col);
    } else if (v.operator !== undefined) {
      return Token.make("OPERATOR", v.operator, line, col);
    } else if (v.qualifier !== undefined) {
      return Token.make("QUALIFIER", v.qualifier, line, col);
    } else if (v.comment !== undefined) {
      return Token.makePreservedComment(v.comment, line, col);
    } else if (v.istrhead !== undefined) {
      return Token.makeInterpolatedStrHead(v.istrhead, line, col);
    } else if (v.istrpart !== undefined) {
      return Token.makeInterpolatedStrPart(v.istrpart, line, col);
    } else if (v.istrtail !== undefined) {
      return Token.makeInterpolatedStrTail(v.istrtail, line, col);
    } else if (v.regexphead !== undefined) {
      return Token.makeInterpolatedRegexpHead(v.regexphead, line, col);
    } else if (v.regexppart !== undefined) {
      return Token.makeInterpolatedRegexpPart(v.regexppart, line, col);
    } else if (v.regexptail !== undefined) {
      return Token.makeInterpolatedRegexpTail(v.regexptail, v.flags, line, col);
    } else {
      throw "asToken: Unknown type " + JSON.stringify(v);
    }
  } else {
    throw "asToken: Unknown type " + JSON.stringify(v);
  }
}

// An unessential wrapper to describe test cases using chai and mocha.
function lexing(src__) {
  src__ = Array.prototype.slice.apply(arguments);
  var caption = src__.join("//")
                     .replace(/([\s\S]{0,48})([\s\S]*)/,
                              function(s, a, b) { return a + (b ? "..." : ""); });
  var src = src__.join("\n");

  var errors = [];
  var errrecv = function (e) { errors.push(e) };

  var lexer = new Lexer(errrecv);
  function lexAll(s) {
    var t, a = [];
    lexer.setInput(s);
    do {
      a.push(t = lexer.lex());
    } while (!t.isEnd());
    return a;
  }

  var ts = lexAll(src);

  var gets = function (vs__) {
    vs__ = Array.prototype.slice.apply(arguments);
    vs__.unshift(indent(0));
    vs__.push(eof);
    var i, result, expected = vs__.map(asToken);
    //console.log("");
    for (i = 0; i < expected.length; ++i) {
      result = compareToken(ts[i], expected[i]);
      if (result != "") {
        var ii = (i + 1) + ([, "st", "nd", "rd"][(i + 1) > 20 ? ((i + 1) % 10) : (i + 1)] || "th");
        result = "The " + ii + " token does not match: " + result;
        break;
      }
    }
    it("should lex: " + caption, function () {
      expect(result).equal("");
    });
    return this;
  };

  var noWarning = function () {
    it("should not warn: " + caption, function () {
      var warnings = errors.filter(function (e) { return e.type === "warning"; });
      if (warnings.length > 0)
        warnings.forEach(function (w) { console.log("UNEXPECTED-WARN " + JSON.stringify(w)) });
      expect(warnings.length).equal(0);
    });
    return this;
  };

  var warnsAt = function (line, col) {
    it("should warn: " + caption + " at (" + line + ", " + col + ")", function () {
      var warnings = errors.filter(function (e) { return e.type === "warning"; });
      var found = warnings.some(function (w) {
        return (w.line === line) && (w.col === col);
      });
      if (!found)
        console.log("WARNINGS: " + JSON.stringify(warnings));
      expect(found).equal(true);
    });
    return this;
  };

  var failsAt = function (line, col) {
    it("should fail: " + caption + " at (" + line + ", " + col + ")", function () {
      var es = errors.filter(function (e) { return e.type === "error"; });
      var found = es.some(function (w) {
        return (w.line === line) && (w.col === col);
      });
      if (!found)
        console.log("ERRORS: " + JSON.stringify(es));
      expect(found).equal(true);
    });
    return this;
  };

  return {
    gets: gets,
    warnsAt: warnsAt,
    failsAt: failsAt,
    noWarning: noWarning,
  }
}

// Test cases
// ----------

describe("Lexer", function () {

  describe("Basic", function () {
    lexing("3").gets(3);
    lexing("-42.032").gets(-42.032);
    lexing("0xfeff").gets(0xfeff);
    lexing("+1e100").gets(1e100);
    lexing('"3foo"').gets("3foo");
    lexing('"3\\"foo"').gets('3\\"foo');
    lexing("true").gets(id("true"));
    lexing("false").gets(id("false"));
    lexing("foo").gets(id("foo"));
    lexing("call-with-current-continuation").gets(id("call-with-current-continuation"));
    lexing("call/cc").gets(id("call/cc"));
    lexing("...rest-params").gets(id("...rest-params"));
    lexing('[]').gets(sym("["), sym("]"));

    // regexp

    lexing('//foobar/').gets(/foobar/);
    lexing('//foo bar/gi').gets(/foo bar/gi);
    lexing('//foo bar\\/zoo/m').gets(/foo bar\/zoo/m);
    lexing('//foo (?:\\d+|bca)bar\\/zoo/m').gets(/foo (?:\d+|bca)bar\/zoo/m);

    lexing(
      '///fo',
      '  o\\ bar///'
    ).gets(/foo bar/);

    lexing(
      '///fo  ## comments',
      '  o\\ bar///gi'
    ).gets(/foo bar/gi);

    lexing(
      '///',
      '  foo\\ ',
      '  (?:\\d+|bca)\t ## comments',
      '  bar\\/zo\\#o',
      '///m'
    ).gets(/foo (?:\d+|bca)bar\/zo#o/m);
  });

  describe("Non-trivial", function () {
    lexing("foo: bar 100 zoo").gets(
      id("foo"), sym(":"), id("bar"), 100, id("zoo")
    );

    lexing("foo: (bar, 100) ...zoo").gets(
      id("foo"), sym(":"), sym("("), id("bar"), sym(","), 100, sym(")"), id("...zoo")
    );

    lexing(
      'foo:',
      '  bar, "a string"'
    ).gets(
                 id("foo"), sym(":"),
      indent(2), id("bar"), sym(","), "a string"
    );

    lexing(
      'x .=  #(a b) ->',
      '  s .= (+ a "a string" b)',
      '  `(foo ,s ,@zoo)'
    ).gets(
                 id("x"), op("="),
                 hash_id("#"), sym("("), id("a"), id("b"), sym(")"), sym("->"),
      indent(2), id("s"), op("="), sym("("),
                 id("+"), id("a"), "a string", id("b"), sym(")"),
      indent(2), sym("`"), sym("("), id("foo"),
                 unquote, id("s"), unquote_s, id("zoo"), sym(")")
    );

    lexing(
      '@foo'
    ).gets(
      sym("@"), id("foo")
    );

    lexing(
      '#* -> a'
    ).gets(
      hash_id("#*"), sym("->"), id("a")
    );

    lexing('"foo" "bar"').gets("foo", "bar");

    lexing(
      '{  "@v+": v }: { type: "HOGE"  }'
    ).gets(
      sym("{"), "@v+", sym(":"), id("v"), sym("}"),
      sym(":"),
      sym("{"), id("type"), sym(":"), "HOGE", sym("}")
    )
  });

  describe("Commas and Unquotes", function () {
    lexing('( 1,)').gets(
      sym("("), 1, sym(","), sym(")")
    );

    lexing('( 1 ,)').gets(
      sym("("), 1, unquote, sym(")")
    ).noWarning();

    lexing('(, 1)').gets(
      sym("("), unquote, 1, sym(")")
    ).warnsAt(1, 4);

    lexing('(,1)').gets(
      sym("("), unquote, 1, sym(")")
    ).noWarning();

    lexing('(,@1)').gets(
      sym("("), unquote_s, 1, sym(")")
    ).noWarning();

    lexing('[, 1, ,]').gets(
      sym("["), unquote, 1, sym(","), unquote, sym("]")
    ).warnsAt(1, 4);

    lexing('[,@ 1, ,@]').gets(
      sym("["), unquote_s, 1, sym(","), unquote_s, sym("]")
    ).warnsAt(1, 5);
  });

  describe("Regression: ,',foo", function () {
    lexing(",',foo").gets(
      unquote, sym("'"), unquote, id("foo")
    );

    lexing(",@',@foo").gets(
      unquote_s, sym("'"), unquote_s, id("foo")
    );

    lexing(",',@foo").gets(
      unquote, sym("'"), unquote_s, id("foo")
    );

    lexing(",@',foo").gets(
      unquote_s, sym("'"), unquote, id("foo")
    );
  });

  describe("Warning: CONFUSING_ARRAY_LITERAL", function () {
    lexing(
      'foo[bar]'
    ).gets(
      id("foo"), sym("["), id("bar"), sym("]")
    ).warnsAt(1, 4);

    lexing(
      'foo [bar]'
    ).gets(
      id("foo"), sym("["), id("bar"), sym("]")
    ).noWarning();

    lexing(
      'foo.[bar]'
    ).gets(
      id("foo"), sym("."), sym("["), id("bar"), sym("]")
    ).noWarning();
  });

  describe("Warning: INDENT_INCLUDING_TAB", function () {
    lexing(
      'foo',
      ' \t \t100'
    ).warnsAt(2, 1)
     .gets(
                  id("foo"),
      indent(10), 100
    );
  });

  describe("String Interpolation", function () {
    lexing('#"foo bar zoo#aa"').gets("foo bar zoo#aa");

    lexing('#"#{"foo"}"').gets(
      istrhead('""'), "foo", istrtail('""')
    );

    lexing('#"aa {bb #{xx} cc}"').gets(
      istrhead('"aa {bb "'), id("xx"), istrtail('" cc}"')
    );

    lexing('#"foo #{ 1 }dsa"').gets(
      istrhead('"foo "'), 1, istrtail('"dsa"')
    );

    lexing('#"foo #{ foo 1 "sl" }dsa"').gets(
      istrhead('"foo "'), id("foo"), 1,"sl", istrtail('"dsa"')
    );

    lexing('#"foo #{ foo 1 "sl" }dsa#{- x}"').gets(
      istrhead('"foo "'),
        id("foo"), 1,"sl",
      istrpart('"dsa"'),
        id("-"), id("x"),
      istrtail('""')
    );

    lexing('#"foo #{ foo #"inside #{ x "foo" } endinside" }dsa"').gets(
      istrhead('"foo "'),
        id("foo"), istrhead('"inside "'),
          id("x"), "foo",
        istrtail('" endinside"'),
      istrtail('"dsa"')
    );
  });

  describe("Multiline String", function () {

    lexing(
      '"foo',
      ' bar',
      '   zoo"'
    ).gets("foo\\nbar\\n  zoo")
     .noWarning();

    lexing(
      '"foo',
      ' bar\\',
      '   zoo"'
    ).gets("foo\\nbar zoo")
     .noWarning();

    lexing(
      '"foo',
      '\t\tbar\\',
      '   zoo"'
    ).gets("foo\\n       bar zoo")
     .warnsAt(1, 1);

    lexing(
      ' "foo',
      '  bar',
      ' zoo"'
    ).failsAt(1, 2);

    lexing(
      '#"foo',
      '  bar',
      '    zoo"'
    ).gets("foo\\nbar\\n  zoo")
     .noWarning();

    lexing(
      '#"foo',
      '  bar\\',
      '    zoo"'
    ).gets("foo\\nbar zoo")
     .noWarning();

    lexing(
      '#"foo',
      '\t\tbar\\',
      '   zoo"'
    ).gets("foo\\n      bar zoo")
     .warnsAt(1, 1);

    lexing(
      '#"foo',
      '  bar#{100}zzoo',
      '    zoo"'
    ).gets(
       istrhead('"foo\\nbar"'), 100, istrtail('"zzoo\\n  zoo"')
    ).noWarning();

    lexing(
      '#"foo',
      '  bar#{100',
      '   }zzo#{1}o',
      '    zoo"'
    ).gets(
       istrhead('"foo\\nbar"'), 100, indent(3), istrpart('"zzo"'), 1, istrtail('"o\\n  zoo"')
    ).noWarning();

    lexing(
      '#"foo',
      '  bar#{100',
      '   }zzo#{1}o',
      ' zoo"'
    ).failsAt(1, 1);

  });

  describe("Multiline RegExp", function () {

    lexing(
      '///f\\oo bfoo///'
    ).gets(
      /f\oobfoo/
    );

    lexing(
      '///fo',
      '  o\\ b#{x}ar///'
    ).gets(
      regexphead("foo b"), id("x"), regexptail("ar", "")
    );

    lexing(
      '///fo  ## comments',
      '  o\\ b#{foo .+ 100}a#{foo}r///gi'
    ).gets(
      regexphead("foo b"),
        id("foo"), op("+"), 100,
      regexppart("a"),
        id("foo"),
      regexptail("r", "gi")
    );

    lexing(
      '///',
      '  foo\\ ',
      '  (?:\\d+|bca)\t ## comments',
      '  b#{foo}a#{zzz 1}r\\/zo\\#o',
      '///m'
    ).gets(
      regexphead("foo (?:\\d+|bca)b"),
        id("foo"),
      regexppart("a"),
        id("zzz"), 1,
      regexptail("r/zo#o", "m")
    );

  });

});

