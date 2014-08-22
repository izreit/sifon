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

  if (a === b && a === undefined || a === null)
    return "BothNil";
  if (!!a != !!b)
    return reason("NotAndNotNil");
  if (a.toktype != b.toktype)
    return reason("TypeMismatch");
  if (a.val != b.val)
    return reason("ValueMismatch");
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
var id      = function (name)    { return { identifier: name }; };
var hash_id = function (name)    { return { hash_identifier: name } };
var indent  = function (indent)  { return { indent: indent }; };
var sym     = function (name)    { return { symbol: name }; };
var op      = function (name)    { return { operator: name }; };
var qual    = function (name)    { return { qualifier: name }; };
var comment = function (comment) { return { comment: comment }; };
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

  return {
    gets: gets,
    warnsAt: warnsAt,
    noWarning: noWarning,
  }
}

// Test cases
// ----------

describe("Lexer", function () {

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

  lexing('"foo" "bar"').gets("foo", "bar");

  lexing(
    '{  "@v+": v }: { type: "HOGE"  }'
  ).gets(
    sym("{"), "@v+", sym(":"), id("v"), sym("}"),
    sym(":"),
    sym("{"), id("type"), sym(":"), "HOGE", sym("}")
  )

  // regression ,',foo

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

  // Warning: CONFUSING_ARRAY_LITERAL

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

  // Warning: INDENT_INCLUDING_TAB

  lexing(
    'foo',
    ' \t \t100'
  ).warnsAt(2, 1)
   .gets(
               id("foo"),
    indent(10), 100
  );

});

