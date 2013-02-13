// AdoT.js - async doT templates
// 2012, Josh Dague
// 
// ...based on
// doT.js
// 2011, Laura Doktorova, https://github.com/olado/doT
//
// doT.js is an open source component of http://bebedo.com
// Licensed under the MIT license.
//
(function() {
	"use strict";

	var doT = {
		version: 'A.2.0',
		templateSettings: {
			evaluate:    /\{\{([\s\S]+?)\}\}/g,
			interpolate: /\{\{=([\s\S]+?)\}\}/g,
			encode:      /\{\{!([\s\S]+?)\}\}/g,
			use:         /\{\{#([\s\S]+?)\}\}/g,
			deferredExec:/\{\{\*([\s\S]+?)\);?\s*\}\}/g,
			define:      /\{\{##\s*([\w\.$]+)\s*(\:|=)([\s\S]+?)#\}\}/g,
			conditional: /\{\{\?(\?)?\s*([\s\S]*?)\s*\}\}/g,
			iterate:     /\{\{~\s*(?:\}\}|([\s\S]+?)\s*\:\s*([\w$]+)\s*(?:\:\s*([\w$]+))?\s*\}\})/g,
			varname: 'it',
			strip: true,
			append: true,
			selfcontained: false
		},
		template: undefined, //fn, compile template
		compile:  undefined  //fn, for express
	};

	var global = (function(){ return this || (0||eval)('this'); }());

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = doT;
	} else if (typeof define === 'function' && define.amd) {
		define(function(){return doT;});
	} else {
		global.AdoT = doT;
	}

	function encodeHTMLSource() {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;' },
			matchHTML = /&(?!\\w+;)|<|>|"|'|\//g;
		return function(code) {
			return code ? code.toString().replace(matchHTML, function(m) {return encodeHTMLRules[m] || m;}) : code;
		};
	}
	global.encodeHTML = encodeHTMLSource();

	var startend = {
		append: { start: "'+(",      end: ")+'",      startencode: "'+encodeHTML(" },
		//split:  { start: "';out+=(", end: ");out+='", startencode: "';out+=encodeHTML("}
		split:  { start: "');out.push(", end: ");out.push('", startencode: "');out.push(encodeHTML("}
	}, skip = /$^/;

	function resolveDefs(c, block, def) {
		return ((typeof block === 'string') ? block : block.toString())
		.replace(c.define || skip, function(m, code, assign, value) {
			if (code.indexOf('def.') === 0) {
				code = code.substring(4);
			}
			if (!(code in def)) {
				if (assign === ':') {
					def[code]= value;
				} else {
					eval("def['"+code+"']=" + value);
				}
			}
			return '';
		})
		.replace(c.use || skip, function(m, code) {
			var v = eval(code);
			return v ? resolveDefs(c, v, def) : v;
		});
	}

	function unescape(code) {
		return code.replace(/\\('|\\)/g, "$1").replace(/[\r\t\n]/g, ' ');
	}

	doT.template = function(tmpl, c, def) {
		c = c || doT.templateSettings;
		var cse = /*c.append ? startend.append :*/ startend.split, str, needhtmlencode, sid=0, indv;

		if (c.use || c.define) {
			var olddef = global.def; global.def = def || {}; // workaround minifiers
			str = resolveDefs(c, tmpl, global.def);
			global.def = olddef;
		} else str = tmpl;

		str = ("var dfds=[],out=[];out.push('" + (c.strip ? str.replace(/(^|\r|\n)\t* +| +\t*(\r|\n|$)/g,' ')
					.replace(/\s*<!\[CDATA\[\s*|\s*\]\]>\s*|[\r\n\t]|(\/\*[\s\S]*?\*\/)/g,''): str)
			.replace(/'|\\/g, '\\$&')
			.replace(c.interpolate || skip, function(m, code) {
				return cse.start + unescape(code) + cse.end;
			})
			.replace(c.encode || skip, function(m, code) {
				needhtmlencode = true;
				return cse.startencode + unescape(code) + ')' + cse.end;
			})
			.replace(c.conditional || skip, function(m, elsecase, code) {
				return elsecase ?
					(code ? "');}else if(" + unescape(code) + "){out.push('" : "');}else{out.push('") :
					(code ? "');if(" + unescape(code) + "){out.push('" : "');}out.push('");
			})
			.replace(c.iterate || skip, function(m, iterate, vname, iname) {
				if (!iterate) return "');} } out.push('";
				sid+=1; indv=iname || "i"+sid; iterate=unescape(iterate);
				return "');var arr"+sid+"="+iterate+";if(arr"+sid+"){var "+indv+"=-1,l"+sid+"=arr"+sid+".length-1;while("+indv+"<l"+sid+"){"
					+vname+"=arr"+sid+"["+indv+"+=1];out.push('";
			})
			.replace(c.deferredExec || skip, function(m, code) {
				return "'); !function(i) { var dfd = $.Deferred(); dfds.push(dfd.promise()); var cb=function(r) { out[i]=r; dfd.resolve(); }, err=function(e) { debugger; dfd.reject(e); }; " + unescape(code) + ", err, cb); }(out.length); out.push(''); out.push('";
			})
			.replace(c.evaluate || skip, function(m, code) {
				return "');" + unescape(code) + "out.push('";
			})
			+ "'); var dfd=$.Deferred(); $.whenall(dfds).done(function() { dfd.resolve(out.join('')); }).fail(dfd.reject); return dfd.promise();")
			.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r')
			.replace(/(\s|;|}|^|{)out\+='';/g, '$1').replace(/\+''/g, '')
			.replace(/(\s|;|}|^|{)out\+=''\+/g,'$1out+=');

		if (needhtmlencode && c.selfcontained) {
			str = "var encodeHTML=(" + encodeHTMLSource.toString() + "());" + str;
		}
		try {
			var fn = new Function(c.varname, str);
			fn.src = tmpl;
			return fn;
		} catch (e) {
			if (typeof console !== 'undefined') console.log("Could not create a template function: " + str);
			throw e;
		}
	};

	doT.compile = function(tmpl, def) {
		return doT.template(tmpl, null, def);
	};
}());


