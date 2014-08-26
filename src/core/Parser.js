// vim: set ts=2 sw=2 sts=2 et ai:

// Copyright (c) 2014 Kaname Kizu
// Released under the MIT License.

var klass = require("./../base/klass");
var devel = require("./../base/devel");
var util = require("./../base/util");
var Token = require("./Token");
var Node = require("./Node");
var Lexer = require("./Lexer");
var CompilerMessage = require("./CompilerMessage");

var Parser = klass({

  // The Grammar
  // ===========
  //
  // The following is an informal description of the grammar of the language,
  // written in a context free grammar:
  //  - Lowercased identifiers are non-terminal symbols.
  //  - Uppercased identifiers and strings surrounded by '"' are terminal symbols.
  //  - The start symbol is *value*.
  // It is not strict in a precise sence. See NOTE below.
  //
  //     value ::
  //        simplevalue
  //      | IMPLICIT_OPEN expression quantifiers* IMPLICIT_CLOSE
  //      | block
  //      | "#" value* block
  //      | "#*" value* block
  //      | "'" value
  //      | "`" value
  //      | "," value
  //      | ",@" value
  //     expression ::
  //        callexpr (OPERATOR callexpr)*
  //     callexpr
  //        value+
  //     quantifiers
  //        QUALIFIER value*
  //     block
  //        IMPLICIT_OPEN "->" value+ IMPLICIT_CLOSE
  //     simplevalue
  //        primitivevalue ("." primitivevalue)*
  //     primitivevalue
  //      | NUM
  //      | STR
  //      | IDENT
  //      | "(" value ")"
  //      | tuple
  //      | objarray_literal
  //     tuple
  //        "(" (value ",")+ ")"
  //
  // NOTE:
  // As their names suggest, two terminal symbols IMPLICIT_OPEN and IMPLICIT_CLOSE
  // cannot be written in source code explicitly.  They are implicitly generated
  // by the parser.
  //

  initialize: function (onerror) {
    onerror || (onerror = function () { throw CompilerMessage.FATAL });
    this.onerror_ = onerror;
    this.lexer_ = new Lexer(onerror);
    this.reset();
  },

  reset: function (src) {
    src || (src = "");
    this.yet_unclosed_ = { type: "root", col: 0 };
    this.yet_unclosed_stack_ = [];
    this.ungotten_tokens_ = [];
    this.explicit_nest_count = 0;
    this.lexer_.setInput(src);
    return this;
  },

  setInput: function (src) {
    return this.reset(src);
  },

  skipToRecoverUntil_: function (toktype) {
    var next;
    next = this.lex_();
    while (next.toktype !== "EOF" && next.toktype !== "ERROR") {
      if (next.toktype === toktype) {
        this.unlex_(next);
        return;
      }
      next = this.lex_();
    }
    throw CompilerMessage.FATAL;
  },

  // rawLex_().
  //
  // Lex and do one-off stuff for each tokens:
  // insert IMPLICIT_OPEN and add the "squash_array" property to tokens.
  //
  rawLex_: (function () {
    var dic = util.dictionarize;
    var PERMIT_SHALLOW_INDENT      = dic(["(", "[", "{", "->"]);
    var DONT_PERMIT_SHALLOW_BEFORE = dic([")", "]", "}"]);
    var IMPLICIT_OPEN_AFTER        = dic(["INDENT", "|>", "(", "[", "{", ",", "->", ":",
                                          "ISTR_HEAD", "ISTR_PART", "REGEXP_HEAD", "REGEXP_PART"]);
    var IMPLICIT_OPEN_BEFORE       = dic(["->", "HASH_IDENTIFIER"]);
    var DONT_OPEN_BEFORE           = dic([

      "INDENT",          // inserts IMPLICIT_OPEN/CLOSE instead itself
      "|>", "->",        // inserts IMPLICIT_OPEN instead/before itself
      "HASH_IDENTIFIER", // ditto.
      ")", "]", "}",     // inserts IMPLICIT_CLOSE before itself
      ",", "EOF",        // ditto.
      "ISTR_PART",   "ISTR_TAIL",    // ditto.
      "REGEXP_PART", "REGEXP_TAIL",  // ditto.

      // Exceptional Case: QUALIFIER. They are always parsed as a non-head part
      // of implicit-array, never be a head (except written in parentheses (i.e. (*foo)).
      // This is because we want to accept the code like:
      //
      //     foo.bar()
      //       *if zoo ()
      //
      // We don't want to start implicit array for the qualifier *if.
      "QUALIFIER",
      // Ditto for colon. See parseColonedExpression_().
      ":",
    ]);

    return function () {

      // If we have an already-processed one, just return it.
      if (this.ungotten_tokens_.length > 0)
        return this.ungotten_tokens_.pop();

      var token, next, next2;
      token = this.lexer_.lex();
      next = this.lexer_.lex();
      next2 = this.lexer_.lex();
      this.lexer_.unget(next2);
      this.lexer_.unget(next);

      // Add "squash_array" property
      if (PERMIT_SHALLOW_INDENT[token.toktype]
          && next.toktype === "INDENT"
          && !DONT_PERMIT_SHALLOW_BEFORE[next2.toktype]) {
        token.squash_array = { col: next.val };
      }

      // Insert IMPLICIT_OPEN
      if (IMPLICIT_OPEN_AFTER[token.toktype] && !DONT_OPEN_BEFORE[next.toktype]) {
        this.unlex_(Token.make("IMPLICIT_OPEN", undefined, next.line, next.col));
      }
      if (IMPLICIT_OPEN_BEFORE[token.toktype]) {
        this.unlex_(token);
        token = Token.make("IMPLICIT_OPEN", undefined, token.line, token.col);
      }

      return token;
    };
  })(),

  // lex_(): Lex with IMPLICIT_CLOSE generation.
  lex_: function () {
    var empty_lines = 0;

    for (;;) {
      var token = this.rawLex_();
      var next = this.rawLex_();
      this.unlex_(next);

      // Generate IMPLICIT_CLOSE preceding the next token, if required.
      switch (token.toktype) {
      case "INDENT":
        if (this.yet_unclosed_.implicit &&
            ((token.val < this.yet_unclosed_.col) ||
             (token.val == this.yet_unclosed_.col && next.toktype !== "QUALIFIER"))) {
          this.unlex_(token);
          return Token.make("IMPLICIT_CLOSE", undefined, token.line, token.col);
        }
        if (token.empty_lines)
          empty_lines = token.empty_lines;
        continue; // Skip itself.
      case "|>":
        // Just ignore: all we need to do for "|>", done in rawLex_().
        continue;
      case ")": case "]": case "}": case "EOF": //case ":":
      case "ISTR_PART": case "ISTR_TAIL":
      case "REGEXP_PART": case "REGEXP_TAIL":
        if (this.yet_unclosed_.implicit) {
          this.unlex_(token);
          return Token.make("IMPLICIT_CLOSE", undefined, token.line, token.col);
        }
        break;
      case ",":
        if (this.explicit_nest_count <= 0) {
          this.onerror_(this.makeError_("A comma must be inside (), {} or [].", token));
          continue;  // Ignore the error and skip ","
        }
        if (this.yet_unclosed_.implicit) {
          this.unlex_(token);
          return Token.make("IMPLICIT_CLOSE", undefined, token.line, token.col);
        }
        break;
      default:
        break;
      }

      if (empty_lines > 0)
        token.empty_lines = empty_lines;
      return token;
    }
  },

  unlex_: function (t) {
    this.ungotten_tokens_.push(t);
  },

  peek_: function () {
    var t = this.lex_();
    this.unlex_(t);
    return t;
  },

  lexIf_: function (toktypes__) {
    toktypes__ = Array.prototype.slice.call(arguments);
    var nexttoktype = this.peek_().toktype;
    var found = toktypes__.some(function (tt) { return nexttoktype === tt; });
    return found ? this.lex_() : undefined;
  },

  dropIf_: function (toktypes__) {
    return !!(this.lexIf_.apply(this, arguments));
  },

  makeError_: function (msg, tok, loc) {
    tok || (tok = this.lex_());
    loc || (loc = tok);
    msg || (msg = "");
    return CompilerMessage.Error.unexpected(loc, tok.toString(), "ParseError", msg);
  },

  parse: function (env) {
    var v = this.parseValue_();
    if (v === undefined && !this.dropIf_("EOF"))
      throw this.makeError_();
    return v;
  },

  parseAll: function (env) {
    var v;
    var vs = [];
    while (v = this.parse(env))
      vs.push(v);
    return vs;
  },

  openArray_: function (col, type) {
    this.yet_unclosed_stack_.push(this.yet_unclosed_);
    var t = {};
    t.col = col;
    t.implicit = (type !== "(" && type !== "[" && type !== "{"
                   && type !== "ISTR_HEAD" && type !== "REGEXP_HEAD");
    t.type = type;  // Never used. Just a debug info.
    this.yet_unclosed_ = t;
    if (!this.yet_unclosed_.implicit) ++this.explicit_nest_count;
  },

  closeArray_: function () {
    if (!this.yet_unclosed_.implicit) --this.explicit_nest_count;
    if (this.yet_unclosed_stack_.length == 0)
      devel.dthrow("LogicalError: No sequence to close we have.");
    this.yet_unclosed_ = this.yet_unclosed_stack_.pop();
  },

  squashArrayHeadColumns_: function (col) {
    var ind = col - 1;
    if (this.yet_unclosed_.col > ind)
      this.yet_unclosed_.col = ind;
    var idx = this.yet_unclosed_stack_.length - 1;
    while (idx >= 0 && this.yet_unclosed_stack_[idx].col > ind)
      this.yet_unclosed_stack_[idx--].col = ind;
  },


  parsePrimitiveValue_: (function () {
    var QUOTE_DISPLAYABLE = { "'": "'", "`": "`", "UNQUOTE": ",", "UNQUOTE_S": ",@", };
    var QUOTE_MAPPING = {
      "'": "<<quote>>",
      "`": "<<quasiquote>>",
      "UNQUOTE": "<<unquote>>",
      "UNQUOTE_S": "<<unquote-splicing>>",
    };

    return function () {
      var t, next;
      var node, nodes;

      t = this.lex_();
      switch (t.toktype) {
      case "IMPLICIT_OPEN":
        this.openArray_(t.col, t.toktype);
        node = this.parseColonedExpression_();
        if (!node) debugger;
        (t.empty_lines > 0) && (node.empty_lines = t.empty_lines);
        if (!this.dropIf_("IMPLICIT_CLOSE")) {
          this.onerror_(this.makeError_());
          // Just continue.
        }
        this.closeArray_();
        return node;
      case "->":
        if (t.squash_array)
          this.squashArrayHeadColumns_(t.squash_array.col)
        // fallthrough
      case "IDENTIFIER": case "HASH_IDENTIFIER":
        return Node.symbolFromToken(t);
      case "NUM": case "STR": case "REGEXP":
        return Node.fromToken(t);
      case "ISTR_HEAD":
        return this.parseInterpolatedString_(t);
      case "REGEXP_HEAD":
        return this.parseMultilineRegExp_(t);
      case "(":
        return this.parseTupleOrValue_(t);
      case "[":
        return this.parseArrayLiteral_(t);
      case "{":
        return this.parseObjectLiteral_(t);
      case "@":
        var head = Node.makeSymbol(t.toktype, t);
        if ((node = this.parseValue_()) === undefined) {
          this.onerror_(this.makeError_("No value followed to " + t.toktype));
          return head;  // Return a dummy.
        }
        return Node.makeArray([head, node], t);
      case "'": case "`": case "UNQUOTE": case "UNQUOTE_S":
        head = Node.makeSymbol(QUOTE_MAPPING[t.toktype], t);
        if ((node = this.parsePrimitiveValue_()) === undefined) {
          this.onerror_(this.makeError_("No value followed to " + QUOTE_DISPLAYABLE[t.toktype]));
          return head;  // Return a dummy.
        }
        return Node.makeArray([head, node], t);
      default:
        this.unlex_(t);
        return undefined;
      }
      devel.neverReach();
    };
  })(),

  parseValue_: function () {
    var t;
    var node, prop_node;

    node = this.parsePrimitiveValue_();
    if (node === undefined)
      return node;

    while (t = this.lexIf_(".", "?.")) {
      if ((prop_node = this.parsePrimitiveValue_()) === undefined) {
        this.onerror_(this.makeError_("A dot '.' must be followed by a value"));
        return node;
      }

      // Note that we here set the column of the `'<<dot>>` to `node.col`
      // but not column of the token that represent the dot.  This is intentional
      // behaviour to parse multi-line list.
      var headname = (t.toktype === ".") ? "<<dot>>" : "<<question-dot>>";
      node = Node.makeArray([Node.makeSymbol(headname, node), node, prop_node], node);
    }
    return node;
  },

  parseColonedExpression_: function () {
    var node = this.parseQualifiedExpression_();
    if (node === undefined)
      return node;

    var token;
    var next_node;
    if (token = this.lexIf_(":")) {
      if ((next_node = this.parseValue_()) === undefined) {
        this.onerror_(this.makeError_("No value given after ':'"));
      } else {
        node = Node.makeArray([Node.symbolFromToken(token), node, next_node], token);
      }
    }
    return node;
  },

  parseQualifiedExpression_: function () {
    var token;
    var node, qual_args;
    var array;

    node = this.parseOperatorExpression_();
    if (node === undefined)
      return node;

    while (token = this.lexIf_("QUALIFIER")) {
      array = [Node.symbolFromToken(token), node];
      qual_args = this.parseOperatorExpression_();
      qual_args && array.push(qual_args);
      node = Node.makeArray(array, token);
    }
    return node;
  },

  parseOperatorExpression_: function () {
    var token;
    var lhs, rhs;

    lhs = this.parseCallExpression_();
    if (lhs === undefined)
      return lhs;

    if (token = this.lexIf_("OPERATOR")) {
      rhs = this.parseOperatorExpression_();
      if (rhs === undefined) {
        var err = this.makeError_("The right hand side of the operator "
                                     + token.val + " is expected but not given");
        this.onerror_(err);
        return lhs;
      }
      var arr = [Node.makeSymbol(token.val, token), lhs, rhs];
      return Node.makeArray(arr, token);
    } else {
      return lhs;
    }
  },

  parseCallExpression_: function () {
    var node, head;
    var nodes = [];

    head = node = this.parseValue_();
    if (node === undefined)
      return node;

    do {
      nodes.push(node);
    } while ((node = this.parseValue_()) !== undefined);

    if (nodes.length === 1)
      return head;

    node = nodes[nodes.length - 1];
    if (Node.isType(node, "ARRAY") && node.length === 0)
      nodes.pop();
    return Node.makeArray(nodes, head);
  },


  parseInterpolatedString_: function (t) {
    var found_tail = false;
    var node;

    this.openArray_(this.peek_().col, t.toktype);
    node = Node.makeStrFromLiteralized(t.val, t);
    var nodes = [Node.makeSymbol("+", t), node];
    do {
      node = this.parseValue_();
      if (node === undefined)
        return this.onerror_(this.makeError_('An interpolated string is not terminated.'));
      nodes.push(node);
      if (t = this.lexIf_("ISTR_PART", "ISTR_TAIL")) {
        found_tail = (t.toktype === "ISTR_TAIL");
        nodes.push(Node.makeStrFromLiteralized(t.val, t));
      } else {
        devel.neverReach();
      }
    } while (!found_tail);

    this.closeArray_();

    return Node.makeArray(nodes, t);
  },

  parseMultilineRegExp_: function (t) {
    var found_tail = false;
    var node;
    var token;

    this.openArray_(this.peek_().col, t.toktype);
    node = Node.makeStr(t.val, t);
    var nodes = [Node.makeSymbol("+", t), node];
    do {
      node = this.parseValue_();
      if (node === undefined)
        return this.onerror_(this.makeError_('An interpolated regexp is not terminated.'));
      nodes.push(node);
      if (token = this.lexIf_("REGEXP_PART")) {
        nodes.push(Node.makeStr(token.val, token));
      } else if (token = this.lexIf_("REGEXP_TAIL")) {
        found_tail = true;
        nodes.push(Node.makeStr(token.val.body, token));
      } else {
        devel.neverReach();
      }
    } while (!found_tail);
    this.closeArray_();

    var whole = [Node.makeSymbol("RegExp", t), Node.makeArray(nodes, t), Node.makeStr(token.val.flags, t)];
    return Node.makeArray(whole, t);
  },

  parseTupleOrValue_: function (t) {
    // precondition: t.toktype === "("
    var token, close_token;
    var node;
    var nodes = [];
    var first_comma = undefined;

    this.openArray_(t.col, t.toktype);
    if (t.squash_array)
      this.squashArrayHeadColumns_(t.squash_array.col);

    if (token = this.lexIf_("QUALIFIER", ":")) {
      nodes.push(Node.symbolFromToken(token));
      if (!(close_token = this.lexIf_(")"))) {
        this.onerror_(this.makeError_("A qualifiyer appered by itself must be followed by ')'."));
        this.skipToRecoverUntil_(")");
        close_token = this.lex_();
      }
    } else {
      while (!(close_token = this.lexIf_(")"))) {
        if ((node = this.parseValue_()) === undefined) {
          this.onerror_(this.makeError_());
          this.skipToRecoverUntil_(")");
          continue;
        }
        nodes.push(node);
        if (!first_comma)
          first_comma = this.lexIf_(",");
        else
          this.dropIf_(",");
      }
    }
    this.closeArray_();
    if (close_token.squash_array)
      this.squashArrayHeadColumns_(close_token.squash_array.col);

    if (nodes.length > 1 || first_comma) {
      // parsed a tuple: ex. `(foo, bar)` or `(foo,)`.
      nodes.unshift(Node.makeSymbol("<<tuple>>", first_comma));
      return Node.makeArray(nodes, first_comma);
    } else if (nodes.length === 0) {
      // parsed an empty array: ()
      return Node.makeArray(nodes, t);
    } else {
      // parsed a single value
      return nodes[0];
    }
  },

  parseArrayLiteral_: function (t) {
    var head;
    var token, close_token;
    var node, next_node;
    var nodes;

    this.openArray_(t.col, t.toktype);
    if (t.squash_array)
      this.squashArrayHeadColumns_(t.squash_array.col);

    nodes = [];
    while (!(close_token = this.lexIf_("]"))) {
      if ((node = this.parseValue_()) === undefined) {
        this.onerror_(this.makeError_());
        this.skipToRecoverUntil_("]");
        continue;
      }

      nodes.push(node);
      this.dropIf_(",");
    }
    nodes.unshift(Node.makeSymbol("<<array>>", t));

    this.closeArray_();
    if (close_token.squash_array)
      this.squashArrayHeadColumns_(close_token.squash_array.col);
    return Node.makeArray(nodes, t);
  },

  parseObjectLiteral_: function (t) {
    var token, close_token;
    var node, next_node;
    var nodes;

    this.openArray_(t.col, t.toktype);
    if (t.squash_array)
      this.squashArrayHeadColumns_(t.squash_array.col);

    nodes = [];
    while (!(close_token = this.lexIf_("}"))) {
      if ((node = this.parseValue_()) === undefined) {
        this.onerror_(this.makeError_());
        this.skipToRecoverUntil_("}");
        continue;
      }

      nodes.push(node);
      this.dropIf_(",");
    }
    nodes.unshift(Node.makeSymbol("<<object>>", t));

    this.closeArray_();
    if (close_token.squash_array)
      this.squashArrayHeadColumns_(close_token.squash_array.col);
    return Node.makeArray(nodes, t);
  },
});

module.exports = Parser;

