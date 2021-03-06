/**
 * Parsed resources (snippets, abbreviations, variables, etc.) for Emmet.
 * Contains convenient method to get access for snippets with respect of 
 * inheritance. Also provides ability to store data in different vocabularies
 * ('system' and 'user') for fast and safe resource update
 * @author Sergey Chikuyonok (serge.che@gmail.com)
 * @link http://chikuyonok.ru
 */
if (typeof module === 'object' && typeof define !== 'function') {
	var define = function (factory) {
		module.exports = factory(require, exports, module);
	};
}

define(function(require, exports, module) {
	var _ = require('lodash');
	var prefs = require('./preferences');

	prefs.define('caniuse.enabled', true, 'Enable support of Can I Use database. When enabled,\
		CSS abbreviation resolver will look at Can I Use database first before detecting\
		CSS properties that should be resolved');
	
	prefs.define('caniuse.vendors', 'all', 'A comma-separated list vendor identifiers\
		(as described in Can I Use database) that should be supported\
		when resolving vendor-prefixed properties. Set value to <code>all</code>\
		to support all available properties');
	
	prefs.define('caniuse.era', 'e-2', 'Browser era, as defined in Can I Use database.\
		Examples: <code>e0</code> (current version), <code>e1</code> (near future)\
		<code>e-2</code> (2 versions back) and so on.');
	
	var cssSections = {
		'border-image': ['border-image'],
		'css-boxshadow': ['box-shadow'],
		'css3-boxsizing': ['box-sizing'],
		'multicolumn': ['column-width', 'column-count', 'columns', 'column-gap', 'column-rule-color', 'column-rule-style', 'column-rule-width', 'column-rule', 'column-span', 'column-fill'],
		'border-radius': ['border-radius', 'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
		'transforms2d': ['transform'],
		'css-hyphens': ['hyphens'],
		'css-transitions': ['transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
		'font-feature': ['font-feature-settings'],
		'css-animation': ['animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-iteration-count', 'animation-direction', 'animation-play-state', 'animation-delay', 'animation-fill-mode', '@keyframes'],
		'css-gradients': ['linear-gradient'],
		'css-masks': ['mask-image', 'mask-source-type', 'mask-repeat', 'mask-position', 'mask-clip', 'mask-origin', 'mask-size', 'mask', 'mask-type', 'mask-box-image-source', 'mask-box-image-slice', 'mask-box-image-width', 'mask-box-image-outset', 'mask-box-image-repeat', 'mask-box-image', 'clip-path', 'clip-rule'],
		'css-featurequeries': ['@supports'],
		'flexbox': ['flex', 'inline-flex', 'flex-direction', 'flex-wrap', 'flex-flow', 'order', 'flex'],
		'calc': ['calc'],
		'object-fit': ['object-fit', 'object-position'],
		'css-grid': ['grid', 'inline-grid', 'grid-template-rows', 'grid-template-columns', 'grid-template-areas', 'grid-template', 'grid-auto-rows', 'grid-auto-columns', ' grid-auto-flow', 'grid-auto-position', 'grid', ' grid-row-start', 'grid-column-start', 'grid-row-end', 'grid-column-end', 'grid-column', 'grid-row', 'grid-area', 'justify-self', 'justify-items', 'align-self', 'align-items'],
		'css-repeating-gradients': ['repeating-linear-gradient'],
		'css-filters': ['filter'],
		'user-select-none': ['user-select'],
		'intrinsic-width': ['min-content', 'max-content', 'fit-content', 'fill-available'],
		'css3-tabsize': ['tab-size']
	};

	/** @type {Object} The Can I Use database for CSS */
	var cssDB = null;
	/** @type {Object} A list of available vendors (browsers) and their prefixes */
	var vendorsDB = null;
	var erasDB = null;

	/**
	 * Parses raw Can I Use database for better lookups
	 * @param  {String} data Raw database
	 * @return {Object}
	 */
	function parseDB(data) {
		if (typeof data == 'string') {
			data = JSON.parse(data);
		}

		vendorsDB = parseVendors(data);
		cssDB = parseCSS(data);
		erasDB = parseEra(data);
	}

	/**
	 * Parses vendor data
	 * @param  {Object} data
	 * @return {Object}
	 */
	function parseVendors(data) {
		var out = {};
		_.each(data.agents, function(agent, name) {
			out[name] = {
				prefix: agent.prefix,
				versions: agent.versions
			};
		});
		return out;
	}

	/**
	 * Parses CSS data from Can I Use raw database
	 * @param  {Object} data
	 * @return {Object}
	 */
	function parseCSS(data) {
		var out = {};
		var cssCategories = data.cats.CSS;
		
		_.each(data.data, function(section, name) {
			if (name in cssSections) {
				_.each(cssSections[name], function(kw) {
					out[kw] = section.stats;
				});
			}
		});

		return out;
	}

	/**
	 * Parses era data from Can I Use raw database
	 * @param  {Object} data
	 * @return {Array}
	 */
	function parseEra(data) {
		// some runtimes (like Mozilla Rhino) does not preserves
		// key order so we have to sort values manually
		return _.keys(data.eras).sort(function(a, b) {
			return parseInt(a.substr(1)) - parseInt(b.substr(1));
		});
	}
	
	/**
	 * Returs list of supported vendors, depending on user preferences
	 * @return {Array}
	 */
	function getVendorsList() {
		var allVendors = _.keys(vendorsDB);
		var vendors = prefs.getArray('caniuse.vendors');
		if (!vendors || vendors[0] == 'all') {
			return allVendors;
		}

		return _.intersection(allVendors, vendors);
	}

	/**
	 * Returns size of version slice as defined by era identifier
	 * @return {Number}
	 */
	function getVersionSlice() {
		var era = prefs.get('caniuse.era');
		var ix = _.indexOf(erasDB, era);
		if (!~ix) {
			ix = _.indexOf(erasDB, 'e-2');
		}

		return ix;
	}

	// try to load caniuse database
	var db = null;
	try {
		var fs = require('fs');
		var path = require('path');

		db = fs.readFileSync(path.join(__dirname, '../caniuse.json'), {encoding: 'utf8'});
		
	} catch(e) {}

	if (db) {
		parseDB(db);
	}

	return {
		load: parseDB,
		/**
		 * Resolves prefixes for given property
		 * @param {String} property A property to resolve. It can start with `@` symbol
		 * (CSS section, like `@keyframes`) or `:` (CSS value, like `flex`)
		 * @return {Array} Array of resolved prefixes or <code>null</code>
		 * if prefixes can't be resolved. Empty array means property has no vendor
		 * prefixes
		 */
		resolvePrefixes: function(property) {
			if (!prefs.get('caniuse.enabled') || !cssDB || !(property in cssDB)) {
				return null;
			}

			var prefixes = [];
			var propStats = cssDB[property];
			var versions = getVersionSlice();

			_.each(getVendorsList(), function(vendor) {
				var vendorVesions = vendorsDB[vendor].versions.slice(versions);
				for (var i = 0, v; i < vendorVesions.length; i++) {
					v = vendorVesions[i];
					if (!v) {
						continue;
					}

					if (~propStats[vendor][v].indexOf('x')) {
						prefixes.push(vendorsDB[vendor].prefix);
						break;
					}
				}
			});

			return _.unique(prefixes).sort(function(a, b) {
				return b.length - a.length;
			});
		}
	};
});