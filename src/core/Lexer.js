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
      //console.log(JSON.stringify(Array.prototype.slice.apply(m)) + " / " + re.toString().substr(0, 40));
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


// Klass Lexer
// -----------
//
module.exports = klass({

  initialize: function (onerror) {
    // Migration check. TODO Remove.
    if (typeof onerror === "string") {
      devel.dthrow("Lexer.initialize() invoked with wrong arguments...");
      debugger;
    }

    onerror || (onerror = function () { throw CompilerMessage.FATAL; });
    this.onerror_ = onerror;
    this.setInput();
  },

  setInput: function (src) {
    src = src || "";
    this.src_ = src;
    this.end_ = this.src_.length;
    this.start_ = this.line_ = this.col_ = 0;
    this.parsing_indent_ = true;
    this.last_char_ = undefined;

    this.prev_token_ = undefined;

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
      ///(?:(,@?)(?![ \t\u000b\u000c\u000a\ufeff]))|(?=.?)/g,
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

  lexSpecialSymbols_:
    rule(
      /(\.(?!\.)|\.\.(?!\.)|\?\.(?!\.)|->|:(?!:)|::|@(?!@)|\|>|[\(\)\[\]{},'`\;])|(?=.?)/g,
      function (m, l, c) {
        return Token.make(m[1], m[1], l, c);
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

  lexString_:
    rule(
      /("(?:[^\\"]|\\.)*")|(?=.?)/g,
      function (m, l, c) {
        return Token.makeStr(m[1], l, c);
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
        this.parsing_indent_ = true;
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
    next: while (this.start_ < this.end_ || this.ungotten_.length > 0) {

      if (this.ungotten_.length > 0)
        return this.ungotten_.pop();

      if (this.parsing_indent_) {
        this.parsing_indent_ = false;

        var empty_lines = 0;
        var indent = this.lexIndent_();
        while ((next = this.lex()).toktype === "INDENT") {  // Actually this never repeats because of recursive call...
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
             || this.lexSpecialSymbols_()
             || this.lexHashIdentifier_()
             || this.lexIdentifier_()
             || this.lexString_()
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

