/**
 * SpellLevelSlider - EQLegends whole-level spell scaling
 *
 * The extension hooks the rendered output of Template:Spellpage. Both
 * Spellpage and Spellpagesmart full-page mode produce these stable elements:
 *
 *   .eql-spellpage
 *   .eql-spellpage-slot-table
 *   .eql-spellpage-detail-table
 *
 * No spell-page or template changes are required.
 */

( function ( mw ) {
	'use strict';

	var STORAGE_KEY = 'sls-default-level-v1';
	var sliderCounter = 0;
	var configuredDefaultLevel = parseInteger(
		mw.config.get( 'wgSpellLevelDefault', 0 ),
		0
	);
	var maximumLevel = Math.max(
		1,
		parseInteger( mw.config.get( 'wgSpellLevelMaximum', 10 ), 10 )
	);
	var categoryRules = mw.config.get( 'wgSpellLevelSliderRules', {} ) || {};
	var overridesPageName =
		cleanText(
			mw.config.get(
				'wgSpellLevelOverridesPage',
				'SpellLevelSliderOverrides'
			)
		) || 'SpellLevelSliderOverrides';
	var overridesRequest = null;
	var serverOverrides = mw.config.get( 'wgEQLSpellLevelOverrides', null );
	var serverOverridesStatus = cleanText(
		mw.config.get( 'wgEQLSpellLevelOverridesStatus', '' )
	);
	var serverOverridesRevision = parseInteger(
		mw.config.get( 'wgEQLSpellLevelOverridesRevision', 0 ),
		0
	);
	var overridesFallbackCacheKey =
		'sls-overrides-fallback-v2:' + overridesPageName;
	var overridesFallbackTtlMs = 30000;

	var DURATION_NUMBER_PATTERN =
		/(\d+(?:\.\d+)?)(\s*)(ticks?|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/gi;
	var DURATION_NUMBER_TEST =
		/\d+(?:\.\d+)?\s*(?:ticks?|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/i;

	function parseInteger( value, fallback ) {
		var parsed = parseInt( value, 10 );
		return isNaN( parsed ) ? fallback : parsed;
	}

	function clampLevel( level ) {
		return Math.max( 0, Math.min( maximumLevel, parseInteger( level, 0 ) ) );
	}

	function normalizeText( value ) {
		return String( value || '' )
			.replace( /\u00a0/g, ' ' )
			.replace( /\s+/g, ' ' )
			.trim()
			.toLowerCase();
	}

	function cleanText( value ) {
		return String( value || '' )
			.replace( /\u00a0/g, ' ' )
			.replace( /\s+/g, ' ' )
			.trim();
	}

	function normalizeCategoryKey( value ) {
		var key = normalizeText( value )
			.replace( /[\/-]+/g, '_' )
			.replace( /\s+/g, '_' )
			.replace( /_+/g, '_' )
			.replace( /^_|_$/g, '' );
		var aliases = {
			'nuke': 'nuke_lifetap',
			'lifetap': 'nuke_lifetap',
			'nuke_lifetap': 'nuke_lifetap',
			'dot': 'dot',
			'damage_over_time': 'dot',
			'heal': 'heal',
			'hot': 'hot',
			'heal_over_time': 'hot',
			'debuff': 'debuff',
			'charm': 'charm_mez',
			'mez': 'charm_mez',
			'mesmerize': 'charm_mez',
			'charm_mez': 'charm_mez',
			'pet': 'pet',
			'summon_pet': 'pet',
			'summoned_pet': 'pet',
			'buff': 'buff'
		};

		return aliases[ key ] || '';
	}

	function getRule( categoryKey ) {
		var rule = categoryRules[ categoryKey ];

		if ( !rule || typeof rule !== 'object' ) {
			return null;
		}

		return rule;
	}

	function normalizePageTitle( value ) {
		var title = cleanText( value );
		var wikiLink = title.match(
			/^\[\[\s*([^|\]#]+)(?:#[^|\]]*)?(?:\|[^\]]*)?\s*\]\]$/
		);

		if ( wikiLink ) {
			title = wikiLink[ 1 ];
		}

		return normalizeText( title.replace( /_/g, ' ' ) );
	}

	function parseOverridesWikitext( wikitext ) {
		var source = String( wikitext || '' );
		var blockMatch = source.match(
			/<pre\b[^>]*\bid\s*=\s*["']?spell-level-slider-overrides["']?[^>]*>([\s\S]*?)<\/pre\s*>/i
		);
		var overrides = Object.create( null );
		var block;

		if ( !blockMatch ) {
			return {
				overrides: overrides,
				status: source.trim() ? 'invalid' : 'missing'
			};
		}

		block = blockMatch[ 1 ].replace( /<!--[\s\S]*?-->/g, '' );

		block.split( /\r?\n/ ).forEach( function ( rawLine ) {
			var line = cleanText( rawLine );
			var separator;
			var pageKey;
			var categoryKey;

			if ( !line || line.charAt( 0 ) === '#' ) {
				return;
			}

			separator = line.indexOf( '=' );

			if ( separator < 1 ) {
				return;
			}

			pageKey = normalizePageTitle( line.slice( 0, separator ) );
			categoryKey = normalizeCategoryKey(
				line.slice( separator + 1 )
			);

			if ( pageKey && categoryKey && getRule( categoryKey ) ) {
				overrides[ pageKey ] = categoryKey;
			}
		} );

		return {
			overrides: overrides,
			status: 'ok'
		};
	}

	function getRevisionContent( data ) {
		var pages =
			data &&
			data.query &&
			Array.isArray( data.query.pages )
				? data.query.pages
				: [];
		var revisions;
		var revision;
		var mainSlot;

		if ( !pages.length || pages[ 0 ].missing ) {
			return '';
		}

		revisions = pages[ 0 ].revisions || [];

		if ( !revisions.length ) {
			return '';
		}

		revision = revisions[ 0 ];
		mainSlot = revision.slots && revision.slots.main
			? revision.slots.main
			: null;

		if ( mainSlot ) {
			return String( mainSlot.content || mainSlot[ '*' ] || '' );
		}

		return String( revision.content || revision[ '*' ] || '' );
	}

	function normalizeOverrideMap( values ) {
		var normalized = Object.create( null );

		if ( !values || typeof values !== 'object' ) {
			return normalized;
		}

		Object.keys( values ).forEach( function ( pageTitle ) {
			var pageKey = normalizePageTitle( pageTitle );
			var categoryKey = normalizeCategoryKey( values[ pageTitle ] );

			if ( pageKey && categoryKey && getRule( categoryKey ) ) {
				normalized[ pageKey ] = categoryKey;
			}
		} );

		return normalized;
	}

	function readFallbackOverridesCache() {
		var parsed;

		try {
			parsed = JSON.parse(
				window.localStorage.getItem( overridesFallbackCacheKey ) || 'null'
			);

			if (
				parsed &&
				parsed.expiresAt > Date.now() &&
				parsed.overrides &&
				typeof parsed.overrides === 'object'
			) {
				return {
					overrides: normalizeOverrideMap( parsed.overrides ),
					status: parsed.status || 'ok'
				};
			}
		} catch ( error ) {}

		return null;
	}

	function writeFallbackOverridesCache( state ) {
		try {
			window.localStorage.setItem(
				overridesFallbackCacheKey,
				JSON.stringify( {
					overrides: state.overrides,
					status: state.status,
					expiresAt: Date.now() + overridesFallbackTtlMs
				} )
			);
		} catch ( error ) {}
	}

	function loadWikiOverrides() {
		var fallbackState;

		if ( overridesRequest ) {
			return overridesRequest;
		}

		/*
		 * EQLClientData embeds a revision-aware cached override map only on
		 * pages that contain spell UI. This is the normal production path and
		 * performs no browser API request.
		 */
		if ( serverOverrides && typeof serverOverrides === 'object' ) {
			overridesRequest = Promise.resolve( {
				overrides: normalizeOverrideMap( serverOverrides ),
				status: serverOverridesStatus || 'ok',
				revision: serverOverridesRevision
			} );

			return overridesRequest;
		}

		/* Compatibility fallback for a partial deployment. */
		fallbackState = readFallbackOverridesCache();

		if ( fallbackState ) {
			overridesRequest = Promise.resolve( fallbackState );
			return overridesRequest;
		}

		overridesRequest = new Promise( function ( resolve ) {
			var api;

			if ( typeof mw.Api !== 'function' ) {
				resolve( {
					overrides: Object.create( null ),
					status: 'error'
				} );
				return;
			}

			api = new mw.Api();
			api.get( {
				action: 'query',
				prop: 'revisions',
				titles: overridesPageName,
				rvprop: 'content',
				rvslots: 'main',
				formatversion: 2,
				maxage: 30,
				smaxage: 30
			} ).then(
				function ( data ) {
					var state = parseOverridesWikitext(
						getRevisionContent( data )
					);

					writeFallbackOverridesCache( state );
					resolve( state );
				},
				function () {
					resolve( {
						overrides: Object.create( null ),
						status: 'error'
					} );
				}
			);
		} );

		return overridesRequest;
	}

	function getSpellPageTitle( spellPage ) {
		return cleanText(
			spellPage.getAttribute( 'data-sls-page-title' ) ||
			mw.config.get( 'wgPageName', '' )
		);
	}

	function getOverrideCategory( spellPage, wikiOverrides ) {
		var pageKey = normalizePageTitle( getSpellPageTitle( spellPage ) );
		var configuredOverride = pageKey && wikiOverrides
			? wikiOverrides[ pageKey ]
			: '';

		configuredOverride = normalizeCategoryKey( configuredOverride );

		return configuredOverride && getRule( configuredOverride )
			? configuredOverride
			: '';
	}

	function findDetailCell( detailTable, label ) {
		var expected = normalizeText( label );
		var headings = detailTable.querySelectorAll( 'th' );
		var i;
		var cell;

		for ( i = 0; i < headings.length; i++ ) {
			if ( normalizeText( headings[ i ].textContent ) !== expected ) {
				continue;
			}

			cell = headings[ i ].nextElementSibling;

			if ( cell ) {
				return cell;
			}
		}

		return null;
	}

	function createField( cell ) {
		if ( !cell ) {
			return null;
		}

		return {
			cell: cell,
			originalHtml: cell.innerHTML,
			originalText: cleanText( cell.textContent )
		};
	}

	function parseFirstNumber( value ) {
		var match = String( value || '' ).match( /-?\d+(?:\.\d+)?/ );
		return match ? parseFloat( match[ 0 ] ) : NaN;
	}

	function countPrimaryEffectRows( slotTable ) {
		var rows;
		var count = 0;

		if ( !slotTable ) {
			return 0;
		}

		rows = slotTable.querySelectorAll( 'tr' );

		Array.prototype.forEach.call( rows, function ( row ) {
			if ( /^\s*\d+\s*:/.test( cleanText( row.textContent ) ) ) {
				count++;
			}
		} );

		return count;
	}

	function durationUnitToSeconds( unit ) {
		unit = normalizeText( unit );

		if ( /^tick/.test( unit ) ) {
			return 6;
		}

		if ( /^(?:s|sec|secs|second|seconds)$/.test( unit ) ) {
			return 1;
		}

		if ( /^(?:m|min|mins|minute|minutes)$/.test( unit ) ) {
			return 60;
		}

		if ( /^(?:h|hr|hrs|hour|hours)$/.test( unit ) ) {
			return 3600;
		}

		return 0;
	}

	function getLongestDurationComponentSeconds( durationText ) {
		var pattern = new RegExp( DURATION_NUMBER_PATTERN.source, 'gi' );
		var match;
		var longest = 0;
		var seconds;

		while ( ( match = pattern.exec( durationText ) ) !== null ) {
			seconds = parseFloat( match[ 1 ] ) * durationUnitToSeconds( match[ 3 ] );
			longest = Math.max( longest, seconds );
		}

		return longest;
	}

	function isInstantDuration( durationText ) {
		return /^instant\b/i.test( cleanText( durationText ) );
	}

	function hasScalableDuration( durationText ) {
		return DURATION_NUMBER_TEST.test( String( durationText || '' ) );
	}

	function readSpellContext( spellPage ) {
		var detailTable = spellPage.querySelector( '.eql-spellpage-detail-table' );
		var slotTable = spellPage.querySelector( '.eql-spellpage-slot-table' );
		var summary = spellPage.querySelector( '.eql-spellpage-summary-text' );
		var context;

		if ( !detailTable ) {
			return null;
		}

		context = {
			spellPage: spellPage,
			summary: summary,
			detailTable: detailTable,
			slotTable: slotTable,
			mana: createField( findDetailCell( detailTable, 'Mana' ) ),
			cast: createField( findDetailCell( detailTable, 'Casting Time' ) ),
			duration: createField( findDetailCell( detailTable, 'Duration' ) ),
			spellType: createField( findDetailCell( detailTable, 'Spell Type' ) ),
			targetType: createField( findDetailCell( detailTable, 'Target Type' ) ),
			effectsText: cleanText( slotTable ? slotTable.textContent : '' ),
			descriptionText: cleanText( summary ? summary.textContent : '' ),
			effectRowCount: countPrimaryEffectRows( slotTable )
		};

		context.baseMana = context.mana
			? parseFirstNumber( context.mana.originalText )
			: NaN;
		context.baseCast = context.cast
			? parseFirstNumber( context.cast.originalText )
			: NaN;
		context.baseDuration = context.duration
			? context.duration.originalText
			: '';

		return context;
	}

	function classifySpell( context, wikiOverrides ) {
		var override = getOverrideCategory(
			context.spellPage,
			wikiOverrides
		);
		var spellType = normalizeText(
			context.spellType ? context.spellType.originalText : ''
		);
		var targetType = normalizeText(
			context.targetType ? context.targetType.originalText : ''
		);
		var duration = normalizeText( context.baseDuration );
		var effects = normalizeText( context.effectsText );
		var description = normalizeText( context.descriptionText );
		var combined = effects + ' ' + description;
		var isInstant = isInstantDuration( duration );
		var hasDamage =
			/\bdecrease\s+(?:hitpoints?|hit\s+points?|hp)\b/.test( effects ) ||
			/\b(?:deal|deals|dealing|cause|causes|causing|inflict|inflicts|inflicting)\b[^.]{0,80}\bdamage\b/.test(
				combined
			);
		var damagePerTick =
			/\b(?:decrease\s+(?:hitpoints?|hit\s+points?|hp)|damage)\b[^.]{0,100}\bper\s+tick\b/.test(
				effects
			) ||
			/\bper\s+tick\b[^.]{0,100}\b(?:decrease\s+(?:hitpoints?|hit\s+points?|hp)|damage)\b/.test(
				effects
			);
		var healingPerTick =
			/\bincrease\s+(?:current\s+)?(?:hitpoints?|hit\s+points?|hp)\b[^.]{0,100}\bper\s+tick\b/.test(
				effects
			) ||
			/\bheal(?:s|ing|ed)?\b[^.]{0,100}\bper\s+tick\b/.test( combined );
		var shortDuration =
			getLongestDurationComponentSeconds( context.baseDuration ) > 0 &&
			getLongestDurationComponentSeconds( context.baseDuration ) <= 60;
		var isCharmOrMez =
			/\bcharm(?:ed|ing)?\b/.test( combined ) ||
			/\bmesmeri[sz](?:e|ed|ing|ation)\b/.test( combined );
		var isHeal =
			spellType === 'heal' ||
			(
				isInstant &&
				/\bincrease\s+(?:current\s+)?(?:hitpoints?|hit\s+points?|hp)\b/.test(
					effects
				)
			);
		var isLifetap =
			/\blifetap\b/.test( spellType ) ||
			/\blifetap\b/.test( targetType );
		var isBeneficial =
			/\bbeneficial\b/.test( spellType ) ||
			/\bbuff\b/.test( spellType );
		var isDetrimental = /\bdetrimental\b/.test( spellType );

		if ( override ) {
			return override;
		}

		/*
		 * Precedence matters:
		 * - DoT arrows may otherwise look like direct nukes.
		 * - HoTs are beneficial and would otherwise become generic buffs.
		 * - Charm and mez are detrimental but use their own rate profile.
		 */
		if ( /\bdamage\s+over\s+time\b/.test( spellType ) || damagePerTick ) {
			return 'dot';
		}

		if (
			/\bheal\s+over\s+time\b/.test( spellType ) ||
			(
				healingPerTick &&
				context.effectRowCount <= 1 &&
				shortDuration
			)
		) {
			return 'hot';
		}

		// Explicit-level pet summons get their own scaling category.
		if ( containsSummonedPetLevelText( combined ) ) {
			return 'pet';
		}
		if ( isCharmOrMez ) {
			return 'charm_mez';
		}

		if ( isHeal ) {
			return 'heal';
		}

		if ( isLifetap || hasDamage ) {
			return 'nuke_lifetap';
		}

		if ( isDetrimental ) {
			return 'debuff';
		}

		/*
		 * Beneficial instant utility spells (teleports, summons, and similar
		 * effects) are deliberately left unsupported rather than guessing
		 * that they are buffs. Timed and permanent beneficial effects are
		 * treated as buffs.
		 */
		if (
			isBeneficial &&
			( !isInstant || /\bbuff\b/.test( spellType ) )
		) {
			return 'buff';
		}

		return '';
	}

	function roundTo( value, digits ) {
		var factor = Math.pow( 10, digits );
		return Math.round( ( value + Number.EPSILON ) * factor ) / factor;
	}

	function valuesDiffer( left, right ) {
		return Math.abs( Number( left ) - Number( right ) ) > 0.0000001;
	}

	function getScaleFactor( rate, level ) {
		return Math.max( 0, 1 + ( Number( rate ) * level ) );
	}

	function scaleCastTime( baseValue, rate, level ) {
		return roundTo( baseValue * getScaleFactor( rate, level ), 2 );
	}

	function scaleMana( baseValue, rate, level ) {
		return Math.max(
			0,
			Math.round( baseValue * getScaleFactor( rate, level ) )
		);
	}

	function trimDecimal( value, digits ) {
		var text = Number( value ).toFixed( digits );
		return text.replace( /\.?0+$/, '' );
	}

	function scaleDurationText( baseText, rate, level ) {
		var factor;
		var pattern;

		if (
			level <= 0 ||
			rate === null ||
			rate === undefined ||
			!hasScalableDuration( baseText )
		) {
			return baseText;
		}

		factor = getScaleFactor( rate, level );
		pattern = new RegExp( DURATION_NUMBER_PATTERN.source, 'gi' );

		return baseText.replace(
			pattern,
			function ( match, number, spacing, unit ) {
				var scaled = roundTo( parseFloat( number ) * factor, 2 );
				return trimDecimal( scaled, 2 ) + spacing + unit;
			}
		);
	}

	function restoreField( field ) {
		if ( !field ) {
			return;
		}

		field.cell.innerHTML = field.originalHtml;
		field.cell.classList.remove( 'sls-field-modified' );
		field.cell.removeAttribute( 'data-sls-current-value' );
	}

	function renderModifiedField( field, value ) {
		var span;

		if ( !field ) {
			return;
		}

		span = document.createElement( 'span' );
		span.className = 'sls-stat sls-modified';
		span.textContent = value;

		field.cell.textContent = '';
		field.cell.appendChild( span );
		field.cell.classList.add( 'sls-field-modified' );
		field.cell.setAttribute( 'data-sls-current-value', value );
	}

	function formatSignedPercent( rate, level ) {
		var percentage = roundTo( Math.abs( Number( rate ) * level * 100 ), 2 );
		var sign = Number( rate ) < 0 ? '−' : '+';
		return sign + trimDecimal( percentage, 2 ) + '%';
	}

	// Explicit effectiveness caps increase by +1 per rank in every category.
	var effectCapBaseText = new WeakMap();
	var effectCapHighlights = new WeakMap();
	var EFFECT_CAP_PATTERN = /(\bup\s+to\s+(?:level\s+|L\s*))(\d+)|(\b(?:Mesmerize|Frenzy Radius|Reaction Radius)\s*\(\s*\d+(?:\.\d+)?\s*\/\s*)(\d+)/gi;

	function hasEffectCapText( slotTable ) {
		return !!(
			slotTable &&
			new RegExp( EFFECT_CAP_PATTERN.source, 'i' ).test(
				String( slotTable.textContent || '' )
			)
		);
	}

	function applyEffectCapScaling( slotTable, level, highlightNumbers ) {
		if (
			!slotTable ||
			!document.createTreeWalker ||
			typeof NodeFilter === 'undefined'
		) {
			return;
		}

		Array.prototype.forEach.call( slotTable.querySelectorAll( 'td, p' ), function ( cell ) {
			// Restore original text nodes before rebuilding the number-only highlights.
			( effectCapHighlights.get( cell ) || [] ).forEach( function ( entry ) {
				entry.rendered[ 0 ].replaceWith( entry.node );
				entry.rendered.slice( 1 ).forEach( function ( node ) { node.remove(); } );
			} );
			var highlights = [];
			effectCapHighlights.set( cell, highlights );
			var walker = document.createTreeWalker( cell, NodeFilter.SHOW_TEXT );
			var nodes = [];
			var text = '';
			var node;
			var pattern = new RegExp( EFFECT_CAP_PATTERN.source, 'gi' );
			var match;

			// Match the complete cell so links/spans may split the label or number.
			while ( ( node = walker.nextNode() ) ) {
				var base = effectCapBaseText.has( node )
					? effectCapBaseText.get( node ) : String( node.nodeValue || '' );
				nodes.push( { node: node, base: base, start: text.length, edits: [] } );
				text += base;
			}
			while ( ( match = pattern.exec( text ) ) ) {
				var prefix = match[ 1 ] || match[ 3 ];
				var number = match[ 2 ] || match[ 4 ];
				var start = match.index + prefix.length;
				var end = start + number.length;
				var replacement = String( parseInt( number, 10 ) + level );
				nodes.forEach( function ( entry ) {
					var left = Math.max( start, entry.start );
					var right = Math.min( end, entry.start + entry.base.length );
					if ( left < right ) {
						entry.edits.push( { start: left - entry.start, end: right - entry.start,
							value: left === start ? replacement : '' } );
					}
				} );
			}
			nodes.forEach( function ( entry ) {
				if ( !entry.edits.length ) {
					return;
				}
				effectCapBaseText.set( entry.node, entry.base );
				if ( highlightNumbers && level > 0 ) {
					var fragment = document.createDocumentFragment();
					var offset = 0;
					entry.edits.forEach( function ( edit ) {
						fragment.appendChild( document.createTextNode( entry.base.slice( offset, edit.start ) ) );
						if ( edit.value ) {
							var span = document.createElement( 'span' );
							span.className = 'sls-stat sls-modified';
							span.textContent = edit.value;
							fragment.appendChild( span );
						}
						offset = edit.end;
					} );
					fragment.appendChild( document.createTextNode( entry.base.slice( offset ) ) );
					highlights.push( { node: entry.node, rendered: Array.from( fragment.childNodes ) } );
					entry.node.replaceWith( fragment );
					return;
				}
				var scaled = entry.base;
				entry.edits.reverse().forEach( function ( edit ) {
					scaled = scaled.slice( 0, edit.start ) + edit.value + scaled.slice( edit.end );
				} );
				entry.node.nodeValue = scaled;
			} );
			if ( hasEffectCapText( { textContent: text } ) ) {
				cell.classList.toggle( 'sls-slot-modified', !highlightNumbers && level > 0 );
			}
		} );
	}
	// SpellLevelSlider summoned pet level scaling and slot highlighting.
	var summonedPetLevelBaseText = new WeakMap();

	var SUMMONED_PET_LEVEL_TEST_A =
		/\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\b(?:lvl|level)\s*\d+[^.\n]{0,160}?\bpet\b/i;

	var SUMMONED_PET_LEVEL_TEST_B =
		/\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\bpet\b[^.\n]{0,160}?\b(?:lvl|level)\s*\d+/i;

	function containsSummonedPetLevelText( value ) {
		var text = String( value || '' );

		return (
			SUMMONED_PET_LEVEL_TEST_A.test( text ) ||
			SUMMONED_PET_LEVEL_TEST_B.test( text )
		);
	}

	function hasSummonedPetLevelText( slotTable ) {
		return !!(
			slotTable &&
			containsSummonedPetLevelText( slotTable.textContent )
		);
	}

	function getSummonedPetLevelPerRank( instance ) {
		var configured = instance && instance.rule
			? Number( instance.rule.pet_level )
			: NaN;

		return isFinite( configured ) ? configured : 1;
	}

	function markSlotNodeModified( node, modified ) {
		var element = node ? node.parentElement : null;
		var cell = element && element.closest
			? element.closest( 'td' )
			: null;

		if ( cell ) {
			cell.classList.toggle(
				'sls-slot-modified',
				!!modified
			);
		}
	}

	function scaleSummonedPetLevelText(
		baseText,
		perRank,
		level
	) {
		var delta;
		var scaled;
		var patternA;
		var patternB;

		if (
			level <= 0 ||
			!isFinite( Number( perRank ) )
		) {
			return baseText;
		}

		delta = Math.round(
			Number( perRank ) * level
		);

		/*
		 * Supports forms such as:
		 *
		 * Summon Lvl 16 Skeletal Pet
		 * Summon Level 16 Fire Pet
		 * Summon a level 16 skeletal pet
		 */
		patternA =
			/(\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\b(?:lvl|level)\s*)(\d+)([^.\n]{0,160}?\bpet\b)/gi;

		/*
		 * Also supports:
		 *
		 * Summon Skeletal Pet Level 16
		 */
		patternB =
			/(\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\bpet\b[^.\n]{0,160}?\b(?:lvl|level)\s*)(\d+)/gi;

		scaled = String( baseText || '' ).replace(
			patternA,
			function (
				match,
				prefix,
				number,
				suffix
			) {
				return (
					prefix +
					String(
						parseInt( number, 10 ) + delta
					) +
					suffix
				);
			}
		);

		return scaled.replace(
			patternB,
			function ( match, prefix, number ) {
				return (
					prefix +
					String(
						parseInt( number, 10 ) + delta
					)
				);
			}
		);
	}

	function applySummonedPetLevelScaling(
		slotTable,
		perRank,
		level
	) {
		var cells;
		var delta;

		if (
			!slotTable ||
			!document.createTreeWalker ||
			typeof NodeFilter === 'undefined'
		) {
			return;
		}

		delta = Math.round(
			Number( perRank || 0 ) * level
		);

		cells = slotTable.querySelectorAll( 'td' );

		Array.prototype.forEach.call(
			cells,
			function ( cell ) {
				var walker;
				var node;
				var baseText;
				var changed = false;

				/*
				 * Check the COMPLETE cell text first.
				 *
				 * This is important because MediaWiki links can split:
				 *
				 *   Summon Lvl 16 [[...|Skeletal Pet]]
				 *
				 * into separate text and <a> nodes.
				 */
				if (
					!containsSummonedPetLevelText(
						cell.textContent
					)
				) {
					cell.classList.remove(
						'sls-slot-modified'
					);
					return;
				}

				walker = document.createTreeWalker(
					cell,
					NodeFilter.SHOW_TEXT
				);

				while ( ( node = walker.nextNode() ) ) {
					if (
						summonedPetLevelBaseText.has(
							node
						)
					) {
						baseText =
							summonedPetLevelBaseText.get(
								node
							);
					} else {
						baseText =
							String(
								node.nodeValue || ''
							);

						/*
						 * Once the whole cell has been identified
						 * as a summoned-pet effect, the particular
						 * text node only needs to contain:
						 *
						 *   Lvl 16
						 *   Level 16
						 *
						 * The word "Pet" may live inside a link
						 * in another DOM node.
						 */
						if (
							!/\b(?:lvl|level)\s*\d+/i.test(
								baseText
							)
						) {
							continue;
						}

						summonedPetLevelBaseText.set(
							node,
							baseText
						);
					}

					node.nodeValue = baseText.replace(
						/(\b(?:lvl|level)\s*)(\d+)/i,
						function (
							match,
							prefix,
							number
						) {
							return (
								prefix +
								String(
									parseInt(
										number,
										10
									) +
									delta
								)
							);
						}
					);

					if (
						level > 0 &&
						node.nodeValue !== baseText
					) {
						changed = true;
					}
				}

				/*
				 * Green styling applies to the entire effect cell,
				 * including linked text such as "Skeletal Pet".
				 */
				cell.classList.toggle(
					'sls-slot-modified',
					changed
				);
			}
		);
	}
	function buildRateSummary( instance, level ) {
		var parts = [];
		var rule = instance.rule;
		var context = instance.context;

		if ( level <= 0 ) {
			return 'Base values';
		}

		if (
			rule.cast !== null &&
			rule.cast !== undefined &&
			!isNaN( context.baseCast )
		) {
			parts.push( 'Cast ' + formatSignedPercent( rule.cast, level ) );
		}

		if (
			rule.mana !== null &&
			rule.mana !== undefined &&
			!isNaN( context.baseMana )
		) {
			parts.push( 'Mana ' + formatSignedPercent( rule.mana, level ) );
		}

		if (
			rule.duration !== null &&
			rule.duration !== undefined &&
			hasScalableDuration( context.baseDuration )
		) {
			parts.push(
				'Duration ' + formatSignedPercent( rule.duration, level )
			);
		}

		if (
			hasEffectCapText( context.slotTable ) || hasEffectCapText( context.summary )
		) {
			parts.push(
				'Level cap +' + level +
				( level === 1 ? ' level' : ' levels' )
			);
		}
		if (
			hasSummonedPetLevelText(
				context.slotTable
			)
		) {
			var petGain =
				getSummonedPetLevelPerRank( instance ) *
				level;

			parts.push(
				'Pet level +' +
				trimDecimal( petGain, 2 ) +
				(
					petGain === 1
						? ' level'
						: ' levels'
				)
			);
		}
		return parts.join( ' · ' ) || 'No numeric change';
	}

	function applyLevel( instance, requestedLevel, persist ) {
		var level = clampLevel( requestedLevel );
		var context = instance.context;
		var rule = instance.rule;
		var newCast;
		var newMana;
		var newDuration;

		if (
			rule.cast !== null &&
			rule.cast !== undefined &&
			!isNaN( context.baseCast ) &&
			level > 0
		) {
			newCast = scaleCastTime( context.baseCast, rule.cast, level );

			if ( valuesDiffer( newCast, context.baseCast ) ) {
				renderModifiedField( context.cast, newCast.toFixed( 2 ) );
			} else {
				restoreField( context.cast );
			}
		} else {
			restoreField( context.cast );
		}

		if (
			rule.mana !== null &&
			rule.mana !== undefined &&
			!isNaN( context.baseMana ) &&
			level > 0
		) {
			newMana = scaleMana( context.baseMana, rule.mana, level );

			if ( valuesDiffer( newMana, context.baseMana ) ) {
				renderModifiedField( context.mana, String( newMana ) );
			} else {
				restoreField( context.mana );
			}
		} else {
			restoreField( context.mana );
		}

		newDuration = scaleDurationText(
			context.baseDuration,
			rule.duration,
			level
		);

		if (
			context.duration &&
			level > 0 &&
			newDuration !== context.baseDuration
		) {
			renderModifiedField( context.duration, newDuration );
		} else {
			restoreField( context.duration );
		}

		applySummonedPetLevelScaling(
			context.slotTable,
			getSummonedPetLevelPerRank( instance ),
			level
		);

		applyEffectCapScaling( context.slotTable, level );
		applyEffectCapScaling( context.summary, level, true );
		instance.level = level;
		instance.slider.value = String( level );
		instance.slider.setAttribute(
			'aria-valuetext',
			'Spell level ' + level
		);
		instance.levelDisplay.textContent = String( level );
		instance.rateDisplay.textContent = buildRateSummary( instance, level );
		instance.context.spellPage.setAttribute(
			'data-sls-current-level',
			String( level )
		);

		if ( persist ) {
			saveLevel( level );
		}
	}

	function loadSavedLevel() {
		var saved;

		try {
			saved = localStorage.getItem( STORAGE_KEY );

			if ( saved !== null ) {
				return clampLevel( saved );
			}
		} catch ( e ) {}

		return clampLevel( configuredDefaultLevel );
	}

	function saveLevel( level ) {
		try {
			localStorage.setItem( STORAGE_KEY, String( clampLevel( level ) ) );
		} catch ( e ) {}
	}

	function buildSlider( context, categoryKey, rule ) {
		var sliderId = 'sls-slider-' + sliderCounter++;
		var container = document.createElement( 'div' );
		var label = document.createElement( 'label' );
		var downButton = document.createElement( 'button' );
		var slider = document.createElement( 'input' );
		var upButton = document.createElement( 'button' );
		var levelDisplay = document.createElement( 'span' );
		var categoryDisplay = document.createElement( 'span' );
		var rateDisplay = document.createElement( 'span' );
		var instance;

		container.className = 'sls-slider-container';
		container.setAttribute( 'data-sls-category', categoryKey );

		label.className = 'sls-slider-label';
		label.setAttribute( 'for', sliderId );
		label.textContent = 'Spell Level:';

		downButton.type = 'button';
		downButton.className = 'sls-step-button sls-step-down';
		downButton.setAttribute( 'aria-label', 'Decrease spell level' );
		downButton.textContent = '−';

		slider.type = 'range';
		slider.id = sliderId;
		slider.className = 'sls-slider';
		slider.min = '0';
		slider.max = String( maximumLevel );
		slider.step = '1';

		upButton.type = 'button';
		upButton.className = 'sls-step-button sls-step-up';
		upButton.setAttribute( 'aria-label', 'Increase spell level' );
		upButton.textContent = '+';

		levelDisplay.className = 'sls-level-display';
		levelDisplay.setAttribute( 'aria-live', 'polite' );

		categoryDisplay.className = 'sls-category-display';
		categoryDisplay.textContent = String( rule.label || categoryKey );

		rateDisplay.className = 'sls-rate-display';

		container.appendChild( label );
		container.appendChild( downButton );
		container.appendChild( slider );
		container.appendChild( upButton );
		container.appendChild( levelDisplay );
		container.appendChild( categoryDisplay );
		container.appendChild( rateDisplay );

		instance = {
			context: context,
			categoryKey: categoryKey,
			rule: rule,
			container: container,
			slider: slider,
			levelDisplay: levelDisplay,
			rateDisplay: rateDisplay,
			level: 0
		};

		slider.addEventListener( 'input', function () {
			applyLevel( instance, slider.value, true );
		} );

		downButton.addEventListener( 'click', function () {
			applyLevel( instance, instance.level - 1, true );
		} );

		upButton.addEventListener( 'click', function () {
			applyLevel( instance, instance.level + 1, true );
		} );

		context.spellPage.insertBefore(
			container,
			context.spellPage.firstChild
		);
		context.spellPage.setAttribute( 'data-sls-category', categoryKey );
		context.spellPage.slsInstance = instance;

		applyLevel( instance, loadSavedLevel(), false );

		return instance;
	}

	function getOverridesPageUrl() {
		if ( mw.util && typeof mw.util.getUrl === 'function' ) {
			return mw.util.getUrl( overridesPageName );
		}

		return '/wiki/' + encodeURIComponent(
			overridesPageName.replace( / /g, '_' )
		);
	}

	function buildMissingCategoryNotice( context, overrideState ) {
		var container = document.createElement( 'div' );
		var message = document.createElement( 'span' );
		var link = document.createElement( 'a' );

		container.className =
			'sls-slider-container sls-missing-category';
		container.setAttribute(
			'data-sls-overrides-status',
			overrideState.status || 'unknown'
		);

		message.className = 'sls-missing-message';
		message.textContent =
			'Spell Scaling Unknown. Adjust Category or ';

		link.className = 'sls-override-link';
		link.href = getOverridesPageUrl();
		link.textContent = 'Override';
		link.title =
			'Open ' + overridesPageName + ' to classify this spell';

		container.appendChild( message );
		container.appendChild( link );

		context.spellPage.insertBefore(
			container,
			context.spellPage.firstChild
		);
		context.spellPage.slsNotice = container;

		return container;
	}

	function initSpellPage( spellPage ) {
		var context;

		if ( !spellPage ) {
			return Promise.resolve( null );
		}

		if ( spellPage.getAttribute( 'data-sls-ready' ) === '1' ) {
			return Promise.resolve(
				spellPage.slsInstance ||
				spellPage.slsNotice ||
				null
			);
		}

		if ( spellPage.slsInitPromise ) {
			return spellPage.slsInitPromise;
		}

		context = readSpellContext( spellPage );

		if ( !context ) {
			return Promise.resolve( null );
		}

		spellPage.slsInitPromise = loadWikiOverrides().then(
			function ( overrideState ) {
				var categoryKey = classifySpell(
					context,
					overrideState.overrides
				);
				var rule = getRule( categoryKey );

				spellPage.setAttribute( 'data-sls-ready', '1' );

				if ( !categoryKey || !rule ) {
					spellPage.removeAttribute( 'data-sls-category' );
					spellPage.setAttribute(
						'data-sls-unsupported',
						'1'
					);
					return buildMissingCategoryNotice(
						context,
						overrideState
					);
				}

				spellPage.removeAttribute( 'data-sls-unsupported' );
				return buildSlider( context, categoryKey, rule );
			}
		);

		return spellPage.slsInitPromise;
	}

	function getRootNodes( root ) {
		if ( root && root.jquery && typeof root.toArray === 'function' ) {
			return root.toArray();
		}

		return [ root || document ];
	}

	function initSpellLevelSliders( root ) {
		var tasks = [];

		getRootNodes( root ).forEach( function ( rootNode ) {
			var spellPages = [];

			if ( !rootNode || !rootNode.querySelectorAll ) {
				return;
			}

			if (
				rootNode.matches &&
				rootNode.matches( '.eql-spellpage' )
			) {
				spellPages.push( rootNode );
			}

			spellPages = spellPages.concat(
				Array.prototype.slice.call(
					rootNode.querySelectorAll( '.eql-spellpage' )
				)
			);

			spellPages.forEach( function ( spellPage ) {
				tasks.push( initSpellPage( spellPage ) );
			} );
		} );

		return Promise.all( tasks );
	}

	function setAllSpellLevels( level, root, persist ) {
		var requestedLevel = clampLevel( level );

		return initSpellLevelSliders( root || document ).then( function () {
			getRootNodes( root || document ).forEach( function ( rootNode ) {
				var spellPages = [];

				if ( !rootNode || !rootNode.querySelectorAll ) {
					return;
				}

				if (
					rootNode.matches &&
					rootNode.matches( '.eql-spellpage' )
				) {
					spellPages.push( rootNode );
				}

				spellPages = spellPages.concat(
					Array.prototype.slice.call(
						rootNode.querySelectorAll(
							'.eql-spellpage[data-sls-ready="1"]'
						)
					)
				);

				spellPages.forEach( function ( spellPage ) {
					if ( spellPage.slsInstance ) {
						applyLevel(
							spellPage.slsInstance,
							requestedLevel,
							persist !== false
						);
					}
				} );
			} );
		} );
	}

	window.eqlSpellLevelSliderRefresh = function ( root ) {
		return initSpellLevelSliders( root || document );
	};

	window.eqlSpellLevelSliderSetLevel = function ( level, root, persist ) {
		return setAllSpellLevels(
			level,
			root || document,
			persist
		);
	};

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', function () {
			initSpellLevelSliders( document );
		} );
	} else {
		initSpellLevelSliders( document );
	}

	if ( mw.hook ) {
		mw.hook( 'wikipage.content' ).add( function ( content ) {
			initSpellLevelSliders( content );
		} );
	}

}( mediaWiki ) );
mw.loader.state({
    "ext.spellLevelSlider": "ready"
});