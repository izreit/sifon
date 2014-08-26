// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var util = require("./../base/util");
var Token = require("./Token");
var CompilerMessage = require("./CompilerMessage");

// DSL
// ---

function rule_base(re, handler, always_call, only_after) {
  if (re instanceof Array)
    re = new RegExp(re.join(""), "g")
  handler || (handler = function () { return true });
  always_call = !!always_call;
  if (only_after)
    only_after = util.dictionarize(only_after);

  return function () {
    this.last_char_ = (this.start_ > 0) ? this.src_[this.start_ - 1] : "";

    if (only_after && !(this.last_char_ in only_after))
      return false;

    re.lastIndex = this.start_;
    var m = re.exec(this.src_);
    if (m && (m[0] !== undefined) && (m[0].length > 0 || always_call)) {
      var col = this.col_;
      this.col_ += m[0].length;
      this.start_ = re.lastIndex;
      var ret = handler.call(this, m, this.line_, col, this.start_);
      return ret;
    }
    return false;
  }
}

function rule(re, handler, always_call) {
  return rule_base(re, handler, always_call, undefined);
}
function after(only_after, re, handler, always_call) {
  return rule_base(re, handler, always_call, only_after);
}


var IDENT = [
  "(?:",
         "(?:",                         // ordinary ones,
             "[a-zA-Z_*/=!&%<>|^~]",
             "[\\w\\-*+/=!&%<>|^~]*",
         ")",
    "|", "(?:",                         // ones confusing with numbers,
             "[+\\-](?!\\d)",
             "[a-zA-Z_\\-*+/=!&%<>|^~]?",
             "[\\w\\-*+/=!&%<>|^~]*",
         ")",
    "|", "\\?(?!\\.)",                  // or the exceptional one: ?
  ")",
].join("");

// A dummy marker to notify the parent lexer of
// "reached to the end of a string/regexp interpolation."
// Only used by a child lexer (`!!this.parent_`).
var UNMATCHED_CLOSE_BRACKET = { UNMATCHED: 0 };

// Klass Lexer
// -----------
//
var Lexer = klass({

  initialize: function (onerror, parent) {
    onerror || (onerror = function () { throw CompilerMessage.FATAL; });
    this.onerror_ = onerror;
    this.parent_ = parent;
    this.setInput();
  },

  setInput: function (src, start, line, col) {
    src = src || "";
    this.src_ = src;
    this.end_ = this.src_.length;
    this.start_ = start | 0;
    this.line_ = line | 0;
    this.col_ = col | 0;
    this.lexing_indent = (this.col_ === 0);
    this.last_char_ = undefined;
    this.prev_token_ = undefined;

    // A lexer may have a child lexer that scans the expressions inside of
    // string interpolations.  When `this.child_` is not undefined `this.lex()`
    // should be redirected to it.
    this.child_ = undefined;

    // Counts the current 'yet closed' open-bracket symbols ({).
    // When this count goes negative while `this.parent_` is not undefined,
    // we found that the close-bracket symbol (}) (that decrements the count)
    // is 'unmatched'.  This means the expression inside of a string/regexp
    // interpolation is terminated there and hence the control have to be
    // brought back to the parent lexer.
    this.open_brackets_ = 0;

    this.ungotten_ = [];
    return this;
  },

  unget: function (t) {
    this.ungotten_.push(t);
  },

  peek: function () {
    if (this.ungotten_.length > 0)
      return this.ungotten_[this.ungotten_.length - 1];
    var t = this.lex();
    this.unget(t);
    return t;
  },

  drop: function () {
    if (this.ungotten_.length == 0) {
      devel.dthrow("Lexer#drop: Invalid call. Must be called after peek.")
      return;
    }
    this.ungotten_.pop(); // Drop it.
  },

  dropIf: function (toktype) {
    var t = this.peek();
    if (t.toktype == toktype) {
      this.drop();
      return true;
    } else {
      return false;
    }
  },

  // Lexing methods
  // --------------
  //
  // The following lexXXX_() are called by lex(), the only public method to lex.
  //

  lexIndent_:
    rule(
      /([ \t\u000b\u000c\ufeff]*)/g,
      function (m, l, c) {
        var s = m[1].replace(/\t/g, "    ");
        var ret = Token.makeIndent(s.length, l, c);
        if (m[1].length !== s.length)
          this.onerror_(CompilerMessage.Warning.indentIncludingTab(ret));
        return ret;
      },
      true),

  lexWhitespaces_:
    rule(
      /(?:[ \t\u000b\u000c\ufeff]+)|(?=.?)/g,
      function (m, l, c) {
        return false;
      }),

  // Lex unquote (,) and unquote-splicing (,@).
  lexUnquotes_:
    after(
      [" ", "\t", "\u000b", "\u000c", "\ufeff", "\n", "\r", "", "(", "[", "{", ",", ".", ":", "'", "@"],
      /(?:(,@?))|(?=.?)/g,
      function (m, l, c) {
        return (m[1].length == 1) ? Token.makeUnquote(l, c)
                                  : Token.makeUnquoteSplicing(l, c);
      }),

  lexOperator_:
    after(
      [" ", "\t", "\u000b", "\u000c", "\ufeff"],
      [
        "\\.", "(", IDENT, ")",
        "|(?=.?)"
      ],
      function (m, l, c) {
        return Token.make("OPERATOR", m[1], l, c)
      }),

  lexQualifier_:
    rule(
      [
        "(",
           "\\*",
           "(?:",
                   "\\.",
              "|", IDENT,
           ")",
        ")",
        "|(?=.?)"
      ],
      function (m, l, c) {
        return Token.make("QUALIFIER", m[1], l, c);
      }),

  lexRegexp_:
    rule(
      /\/\/((?:[^\\\/]|\\.)+)\/([a-z]*)|(?=.?)/g,
      function (m, l, c) {
        return Token.makeRegExp(m[1], m[2] || "", l, c);
      }),

  stripMultilineRegExpBody_: function (s, unescape_slash) {
    // Remove comments.
    s = s.replace(/##[^\r\n\u2028\u2029]*/g, "");
    // Remove whitespaces.
    s = s.replace(/^[ \t\u000b\u000c\ufeff\r\n\u2028\u2029]+/, "");
    s = s.replace(/([^\\])[ \t\u000b\u000c\ufeff\r\n\u2028\u2029]+/g, function (_, s) { return s; });
    // Unescape escaped characters.
    s = unescape_slash ? s.replace(/\\([\s#\/])/g, function (_, s) { return s; })
                       : s.replace(/\\([\s#])/g,   function (_, s) { return s; });
    return s;
  },

  lexMultilineRegExp_:
    rule(
      /\/\/\/((?:[^\\\/#]|\\[\s\S]|#(?!{))+)(\/\/\/([a-z]*)|#{)|(?=.?)/g,
      function (m, l, c) {
        if (m[2] !== '#{') {
          // No interpolations are.  Just return a plain regexp.
          var s = this.stripMultilineRegExpBody_(m[1], false);
          return Token.makeRegExp(s, m[3] || "", l, c);
        }

        this.startInterpolation_("regexp");
        var s = this.stripMultilineRegExpBody_(m[1], true);
        return Token.makeInterpolatedRegexpHead(s, l, c);
      }),

  lexMultilineRegExpPart_:
    rule(
      /((?:[^\\\/#]|\\[\s\S]|#(?!{))+)(\/\/\/([a-z]*)|#{)|(?=.?)/g,
      function (m, l, c) {
        var s = this.stripMultilineRegExpBody_(m[1], true);

        if (m[2] !== '#{') {
          // The end of the interpolated string.
          return Token.makeInterpolatedRegexpTail(s, m[3] || "", l, c);
        }

        // Another interpolation found.
        this.startInterpolation_("regexp");
        return Token.makeInterpolatedRegexpPart(s, l, c);
      }),

  lexSpecialSymbols_:
    rule(
      /(\.(?!\.)|\.\.(?!\.)|\?\.(?!\.)|->|:(?!:)|::|@(?!@)|\|>|[\(\)\[\]{},'`\;])|(?=.?)/g,
      function (m, l, c) {
        return Token.make(m[1], m[1], l, c);
      }),

  startInterpolation_: function (type) {
    this.child_ = new Lexer(this.onerror_, this);
    this.child_.type = type;
    this.child_.setInput(this.src_, this.start_, this.line_, this.col_);
  },

  makeIndentStripper_: function (n, l, c) {
    var indent = util.spacer(n);
    var cont_re = /\\(?:\r\n|\r(?!\n)|[\n\u2028\u2029])\s*/g;
    var indent_re = new RegExp("(?:\\r\\n|\\r(?!\\n)|[\\n\\u2028\\u2029])" + indent, "g");
    var self = this;
    return function (s) {

      var ss = s.replace(/([\r\n\u2028\u2029])(\s*)/g, function (m, nl, indent) {
        var notab = indent.replace(/\t/g, "    ");
        if (indent.length !== notab.length)
          self.onerror_(CompilerMessage.Warning.indentIncludingTab(Token.make("DUMMY", 0, l, c)));
        return nl + notab;
      });

      var ret = ss.replace(cont_re, " ").replace(indent_re, "\\n");
      if (ret.indexOf("\n") !== -1)
        self.onerror_(CompilerMessage.Error.invalidShallowIndentInMultilineString(Token.make("DUMMY", 0, l, c)));
      return ret;
    };
  },

  lexStringInterpolation_:
    rule(
      /#"((?:[^\\"#]|\\[\s\S]|#(?!{))*)("|#{)|(?=.?)/g,
      function (m, l, c) {
        var strip_indent = this.makeIndentStripper_(c + 2, l, c);  // Two in (c + 2) for the length of '#"'
        var s = strip_indent(m[1]);

        if (m[2] === '"') {
          // No interpolations are.  Just return a plain string.
          return Token.makeStr('"' + s + '"', l, c);
        }

        this.startInterpolation_("str");
        this.strip_indent_ = strip_indent;  // Used and cleared only by `lexStringInterpolationPart_()`.
        return Token.makeInterpolatedStrHead('"' + s + '"', l, c);
      }),

  lexStringInterpolationPart_:
    rule(
      /((?:[^\\"#]|\\[\s\S]|#(?!{))*)("|#{)|(?=.?)/g,
      function (m, l, c) {
        var s = this.strip_indent_(m[1]);

        if (m[2] === '"') {
          // The end of the interpolated string.
          this.strip_indent_ = undefined;
          return Token.makeInterpolatedStrTail('"' + s + '"', l, c);
        }

        // Another interpolation found.
        this.startInterpolation_("str");
        return Token.makeInterpolatedStrPart('"' + s + '"', l, c);
      }),

  lexString_:
    rule(
      /("(?:[^\\"]|\\[\s\S])*")|(?=.?)/g,
      function (m, l, c) {
        var strip_indent = this.makeIndentStripper_(c + 1, l, c);  // One in (c + 1) for the length of '"'
        return Token.makeStr(strip_indent(m[1]), l, c);
      }),

  lexHashIdentifier_:
    rule(
      [
        "(",
               "#", IDENT,  // an identifier preceded by a hash, or
          "|", "#(?!#)",    // just a hash
        ")",
        "|(?=.?)"
      ],
      function (m, l, c) {
        return Token.make("HASH_IDENTIFIER", m[1], l, c);
      }),

  lexIdentifier_:
    rule(
      [
        "(",
               "(?:\\.\\.\\.)?", IDENT,
          "|", "\\.\\.\\.",             // or just the three-dots "...".
        ")",
        "|(?=.?)"  // Empty to recognize match failure.
      ],
      function (m, l, c) {
        return Token.makeIdent(m[1], l, c);
      }),

  lexNumber_:
    rule(
      [
        "(",
                "0x[\\da-fA-F]+",                   // a hexadecimal one, or
           "|", "(?:",
                    "[+\\-]?",                      // a sign,
                    "(?:0|[1-9]\\d*)",              // an integral part,
                    "(?:\\.\\d*)?",                 // the decimal point and a decimal part, and
                    "(?:e[+\\-]?(?:0|[1-9]\\d*))?", // an exponential part
                ")",
        ")",
        "(?![a-zA-Z_\\-*+/=!&?%<>])", // Reject confusing ones...
        "|(?=.?)",
      ],
      function (m, l, c) {
        return Token.makeNum(m[1], l, c);
      }),

  lexNewline_:
    rule(
      /(?:\r\n|\r(?!\n)|[\n\u2028\u2029])|(?=.?)/g,
      function (m) {
        ++this.line_;
        this.col_ = 0;
        this.lexing_indent = true;
        return true;
      }),

  lexMultilineComment_:
    rule(
      /###([^;][\s\S]*)(?:###[^\r\n\u2028\u2029\S]*)|(?=.?)/g,
      function (m, l, c) {
        return Token.makePreservedComment(m[1], l, c);
      }),

  lexComment_: rule(/##[^\r\n\u2028\u2029]*|(?=.?)/g),

  // *lex()*: the main interface
  lex: function () {
    next: while (this.start_ < this.end_ || this.ungotten_.length > 0 || this.child_) {

      if (this.ungotten_.length > 0)
        return this.ungotten_.pop();

      // `this.child_` is truthy iff we are lexing the expressions inside of
      // a string/regexp interpolation.  Redirect to the child.
      if (this.child_) {
        var ret = this.child_.lex();
        if (ret !== UNMATCHED_CLOSE_BRACKET)
          return ret;

        // Here we found an 'unmatched' close bracket that indeicates the end of
        // a string/regexp interpolation.  Continue after proceeding the position.
        var type = this.child_.type;
        this.start_ = this.child_.start_;
        this.line_ = this.child_.line_;
        this.col_ = this.child_.col_;
        this.child_ = undefined;
        if (type === "str")
          return this.lexStringInterpolationPart_();
        else
          return this.lexMultilineRegExpPart_();
      }

      if (this.lexing_indent) {
        this.lexing_indent = false;

        var empty_lines = 0;
        var indent = this.lexIndent_();
        while ((next = this.lex()).toktype === "INDENT") {  // Actually this never repeats because of recursive call...?
          ++empty_lines;
          indent = next;
        }
        this.unget(next);
        if (empty_lines)
          indent.empty_lines = empty_lines;
        return indent;
      }

      var ret = this.lexWhitespaces_()
             || this.lexUnquotes_()
             || this.lexOperator_()
             || this.lexQualifier_()
             || this.lexRegexp_()
             || this.lexMultilineRegExp_()
             || this.lexSpecialSymbols_()
             || this.lexStringInterpolation_()
             || this.lexString_()
             || this.lexHashIdentifier_()
             || this.lexIdentifier_()
             || this.lexNumber_()
             || this.lexNewline_()
             || this.lexMultilineComment_()
             || this.lexComment_();

      if (!ret) {
        if (this.start_ < this.end_) {
          return Token.makeError(this.line_, this.col_);
        } else {
          return Token.makeEof(this.line_, this.col_);
        }
      }

      if (!(ret instanceof Token))
        continue next;

      if (ret.toktype === "{") {
        ++this.open_brackets_;
      } else if (ret.toktype === "}") {
        --this.open_brackets_;
        if (this.open_brackets_ < 0)
          return UNMATCHED_CLOSE_BRACKET;
      }

      this.checkSuspiciousToken_(ret);

      this.prev_token_ = ret;
      return ret;
    }
    return Token.makeEof(this.line_, this.col_);
  },

  // Perform Ad-hoc validation...
  checkSuspiciousToken_: (function () {
    var MAY_BE_END_OF_VALUE = util.dictionarize(["HASH_IDENTIFIER", "IDENTIFIER", ")", "]", "}"]);
    var SPACES = util.dictionarize([" ", "\t", "\u000b", "\u000c", "\ufeff", "\n", "\r"]);

    return function (token) {
      var prev_token = this.prev_token_;
      var prev_toktype = prev_token ? prev_token.toktype : undefined;

      if (token.toktype === "[") {
        if (!SPACES[this.last_char_] && MAY_BE_END_OF_VALUE[prev_toktype]) {
          this.onerror_(CompilerMessage.Warning.confusingArrayLiteral(token));
        }
      }

      if (prev_toktype === "UNQUOTE" || prev_toktype === "UNQUOTE_S") {
        if (SPACES[this.last_char_]) {
          this.onerror_(CompilerMessage.Warning.unquoteFollowedBySpace(token));
        }

      } else if (prev_toktype === ",") {
        if (!SPACES[this.last_char_]) {
          this.onerror_(CompilerMessage.Warning.commaNotFollowedBySpace(token));
        }
      }
    };
  })(),

});

module.exports = Lexer;

