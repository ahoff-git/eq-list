/**
 * ItemLevelSlider - EQLegends item level scaling
 *
 * Fractional model:
 *   full level = G2
 *   fractional progress = G3 / 2^G2
 *
 * Examples:
 *   1 + 0/2, 1 + 1/2
 *   2 + 0/4, 2 + 1/4, 2 + 2/4, 2 + 3/4
 *   4 + 0/16 through 4 + 15/16
 *   10 is the cap and displays simply as 10.
 *
 * Formula model:
 *   effectiveLevel = fullLevel + fraction / 2^fullLevel
 *
 * Spreadsheet formula groups:
 *   AC / STR / STA / AGI / DEX / HP / MP / END / INT / WIS / CHA / saves:
 *     B = 0: unchanged
 *     0 < B <= 10: B + fullLevel
 *     B > 10: INT( B + ROUND( B * effectiveLevel / 10 ) )
 *     B < 0, |B| <= 10: B + fullLevel, capped at 0
 *     B < 0, |B| > 10: B + ROUND( |B| * effectiveLevel / 10 ), capped at 0
 *     (negative penalties improve by at least 1 full point per whole tier)
 *
 *   DMG:
 *     Only a standalone "DMG:" / "DAMAGE:" field scales.
 *     Elemental/Bane/Backstab/etc. damage fields remain unchanged.
 *     B > 0: B + INT( B * effectiveLevel / 10 )
 *
 *   Ranged weapon / ammo Range:
 *     Any listed Range field
 *     Range = B + ( 10 * fullLevel )
 *
 *   Delay:
 *     unchanged
 *
	 *   HP / Mana / Endurance Regen:
	 *     B > 0: B + fullLevel
 *
 *   WT:
 *     B > 0.1:
 *       totalProgression = 2^fullLevel + fraction
 *       B * ( 1 - 0.09 * log2( totalProgression ) )
 *       rounded up to 0.1
 *
 *   Haste:
 *     B > 0: B + fullLevel
 *
 *   SV Void:
 *     +fullLevel if the item has 2+ qualifying stat/save fields
 *
 * Slider mapping:
 *   The slider uses a compressed exponential visual curve.
 *   It is not one physical slider unit per fractional state.
 *   +/- buttons still move by one exact fractional state.
 */

( function ( $, mw ) {
	'use strict';

	var MAX_FULL_LEVEL = 10;
	var STORAGE_KEY = 'ils-default-level-v2';
	var LEGACY_STORAGE_KEY = 'ils-default-level';

	var SLIDER_MAX = 10000;
	var SLIDER_CURVE = 0.25;
	var SLIDER_BASE_WEIGHT = 0.25;

	var sliderCounter = 0;

	var configuredDefaultLevel = mw.config.get( 'wgItemLevelDefault', 0 );
	var configuredDefaultFraction = mw.config.get( 'wgItemLevelDefaultFraction', 0 );

	var scalableStats = [
		'ENDURANCE REGENERATION',
		'MANA REGENERATION',
		'HP REGENERATION',
		'ENDURANCE REGEN',
		'ENDUR REGEN',
		'END REGEN',
		'MANA REGEN',
		'MP REGEN',
		'HP REGEN',

		'SV DISEASE',
		'SV POISON',
		'SV MAGIC',
		'SV COLD',
		'SV FIRE',

		'DAMAGE',
		'DMG',

		'AC',
		'HP',
		'MP',
		'MANA',
		'ENDUR',
		'END',

		'STR',
		'STA',
		'AGI',
		'DEX',
		'WIS',
		'INT',
		'CHA',

		'MAGIC',
		'FIRE',
		'COLD',
		'POISON',
		'DISEASE',

		'RANGE',

		'HASTE',
		'WEIGHT',
		'WT'
	];

	var spreadsheetPrimaryStats = [
		'AC',
		'HP',
		'MP',
		'END',
		'STR',
		'STA',
		'AGI',
		'DEX',
		'WIS',
		'INT',
		'CHA',
		'SV_MAGIC',
		'SV_FIRE',
		'SV_COLD',
		'SV_POISON',
		'SV_DISEASE'
	];

	var flatFullLevelStats = [
		'HP_REGEN',
		'MANA_REGEN',
		'END_REGEN',
		'HASTE'
	];

	var svVoidQualifiers = [
		'STR',
		'STA',
		'INT',
		'AGI',
		'DEX',
		'CHA',
		'WIS',
		'SV_FIRE',
		'SV_COLD',
		'SV_POISON',
		'SV_MAGIC',
		'SV_DISEASE'
	];

	function canonicalStatKey( statName ) {
		var name = String( statName || '' )
			.toUpperCase()
			.replace( /\s+/g, ' ' )
			.trim();

		var aliases = {
			'DAMAGE': 'DMG',

			'MANA': 'MP',
			'MP': 'MP',

			'ENDUR': 'END',
			'END': 'END',

			'SV MAGIC': 'SV_MAGIC',
			'SV FIRE': 'SV_FIRE',
			'SV COLD': 'SV_COLD',
			'SV POISON': 'SV_POISON',
			'SV DISEASE': 'SV_DISEASE',

			'MAGIC': 'SV_MAGIC',
			'FIRE': 'SV_FIRE',
			'COLD': 'SV_COLD',
			'POISON': 'SV_POISON',
			'DISEASE': 'SV_DISEASE',

			'HP REGEN': 'HP_REGEN',
			'HP REGENERATION': 'HP_REGEN',
			'MANA REGEN': 'MANA_REGEN',
			'MANA REGENERATION': 'MANA_REGEN',
			'MP REGEN': 'MANA_REGEN',
			'END REGEN': 'END_REGEN',
			'ENDUR REGEN': 'END_REGEN',
			'ENDURANCE REGEN': 'END_REGEN',
			'ENDURANCE REGENERATION': 'END_REGEN',

			'RANGE': 'RANGE',

			'WEIGHT': 'WT',
			'WT': 'WT'
		};

		return aliases[ name ] || name.replace( /\s+/g, '_' );
	}

	function buildStatRegex() {
		var sorted = scalableStats.slice().sort( function ( a, b ) {
			return b.length - a.length;
		} );

		var escaped = sorted.map( function ( s ) {
			return s.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
		} );

		return new RegExp(
			'(\\b(?:' + escaped.join( '|' ) + ')\\b)' +
			'(:\\s*)' +
			'([+\\-]?)' +
			'(\\d+(?:\\.\\d+)?)' +
			'(\\s*%?)',
			'gi'
		);
	}

	function getStatLinePrefix( html, offset ) {
		var before = String( html || '' ).slice( 0, offset );
		var boundaryRegex = /(?:<br\b[^>]*>|<\/(?:div|p|li|td|tr)>|\r?\n)/gi;
		var match;
		var boundaryEnd = 0;
		var segment;

		while ( ( match = boundaryRegex.exec( before ) ) !== null ) {
			boundaryEnd = boundaryRegex.lastIndex;
		}

		segment = before.slice( boundaryEnd )
			.replace( /<[^>]*>/g, '' )
			.replace( /&nbsp;/gi, ' ' )
			.replace( /\u00a0/g, ' ' )
			.replace( /\s+/g, ' ' )
			.trim();

		return segment;
	}

	function isStandaloneDamageField( html, offset ) {
		/*
		 * DMG is only scalable when it is the actual field label:
		 *     DMG: 11
		 *
		 * Do not treat the DMG token inside these as weapon damage:
		 *     Cold DMG: 4
		 *     Backstab DMG: 15
		 *     Bane DMG: 3
		 */
		return getStatLinePrefix( html, offset ) === '';
	}

	function excelRound( value, digits ) {
		var factor = Math.pow( 10, digits || 0 );
		var scaled = value * factor;

		if ( value >= 0 ) {
			return Math.floor( scaled + 0.5 ) / factor;
		}

		return Math.ceil( scaled - 0.5 ) / factor;
	}

	function excelRoundUp( value, digits ) {
		var factor = Math.pow( 10, digits || 0 );
		var scaled = value * factor;

		if ( value >= 0 ) {
			return Math.ceil( scaled ) / factor;
		}

		return Math.floor( scaled ) / factor;
	}

	function intFloor( value ) {
		return Math.floor( value );
	}

	function log2( value ) {
		return Math.log( value ) / Math.LN2;
	}

	function buildLevelStates() {
		var states = [
			{
				full: 0,
				fraction: 0,
				denom: 1
			}
		];

		for ( var full = 1; full <= MAX_FULL_LEVEL; full++ ) {
			var denom = Math.pow( 2, full );
			var maxFraction = full === MAX_FULL_LEVEL ? 0 : denom - 1;

			for ( var fraction = 0; fraction <= maxFraction; fraction++ ) {
				states.push( {
					full: full,
					fraction: fraction,
					denom: denom
				} );
			}
		}

		return states;
	}

	function getSliderLevelWeight( full ) {
		if ( full <= 0 ) {
			return SLIDER_BASE_WEIGHT;
		}

		return Math.pow( 2, full * SLIDER_CURVE );
	}

	function buildSliderBands() {
		var bands = [];
		var total = 0;
		var full;
		var weight;

		for ( full = 0; full < MAX_FULL_LEVEL; full++ ) {
			weight = getSliderLevelWeight( full );

			bands.push( {
				full: full,
				start: total,
				end: total + weight,
				weight: weight
			} );

			total += weight;
		}

		return {
			bands: bands,
			total: total
		};
	}

	var levelStates = buildLevelStates();
	var sliderBands = buildSliderBands();

	function getSliderBandByFullLevel( full ) {
		var i;

		for ( i = 0; i < sliderBands.bands.length; i++ ) {
			if ( sliderBands.bands[ i ].full === full ) {
				return sliderBands.bands[ i ];
			}
		}

		return null;
	}

	function stateToSliderPosition( state ) {
		var band;
		var fractionProgress;
		var weightedPosition;

		if ( !state || state.full <= 0 ) {
			return 0;
		}

		if ( state.full >= MAX_FULL_LEVEL ) {
			return SLIDER_MAX;
		}

		band = getSliderBandByFullLevel( state.full );

		if ( !band ) {
			return 0;
		}

		fractionProgress = state.fraction / state.denom;
		weightedPosition = band.start + ( band.weight * fractionProgress );

		return Math.round( weightedPosition / sliderBands.total * SLIDER_MAX );
	}

	/*
	 * Keep the exact visual position assigned to every valid level state.
	 * There are fewer states than slider positions, so these positions are
	 * unique and can be decoded with a small binary search.
	 *
	 * This also makes stateToSliderPosition -> sliderPositionToStateIndex a
	 * stable round trip at whole-level band boundaries.
	 */
	var stateSliderPositions = levelStates.map( stateToSliderPosition );

	function sliderPositionToStateIndex( position ) {
		var low = 0;
		var high = stateSliderPositions.length - 1;
		var middle;
		var middlePosition;
		var lowerDistance;
		var upperDistance;

		position = parseInt( position, 10 );

		if ( isNaN( position ) || position <= 0 ) {
			return 0;
		}

		if ( position >= SLIDER_MAX ) {
			return stateSliderPositions.length - 1;
		}

		while ( low <= high ) {
			middle = Math.floor( ( low + high ) / 2 );
			middlePosition = stateSliderPositions[ middle ];

			if ( middlePosition === position ) {
				return middle;
			}

			if ( middlePosition < position ) {
				low = middle + 1;
			} else {
				high = middle - 1;
			}
		}

		if ( low >= stateSliderPositions.length ) {
			return stateSliderPositions.length - 1;
		}

		if ( high < 0 ) {
			return 0;
		}

		lowerDistance = position - stateSliderPositions[ high ];
		upperDistance = stateSliderPositions[ low ] - position;

		return upperDistance < lowerDistance ? low : high;
	}

	function getEffectiveLevel( state ) {
		if ( !state || state.full <= 0 ) {
			return 0;
		}

		return state.full + ( state.fraction / state.denom );
	}

	function getTotalProgression( state ) {
		if ( !state || state.full <= 0 ) {
			return 0;
		}

		return Math.pow( 2, state.full ) + state.fraction;
	}

	function clampIndex( index ) {
		index = parseInt( index, 10 );

		if ( isNaN( index ) ) {
			return 0;
		}

		return Math.max( 0, Math.min( levelStates.length - 1, index ) );
	}

	function findStateIndex( full, fraction ) {
		full = parseInt( full, 10 );
		fraction = parseInt( fraction, 10 );

		if ( isNaN( full ) ) {
			full = 0;
		}

		if ( isNaN( fraction ) ) {
			fraction = 0;
		}

		full = Math.max( 0, Math.min( MAX_FULL_LEVEL, full ) );

		if ( full === 0 || full === MAX_FULL_LEVEL ) {
			fraction = 0;
		}

		for ( var i = 0; i < levelStates.length; i++ ) {
			if ( levelStates[ i ].full === full && levelStates[ i ].fraction === fraction ) {
				return i;
			}
		}

		for ( var j = 0; j < levelStates.length; j++ ) {
			if ( levelStates[ j ].full === full && levelStates[ j ].fraction === 0 ) {
				return j;
			}
		}

		return 0;
	}

	function getConfiguredDefaultIndex() {
		var full = parseInt( configuredDefaultLevel, 10 );
		var fraction = parseInt( configuredDefaultFraction, 10 );

		if ( isNaN( full ) ) {
			full = 0;
		}

		if ( isNaN( fraction ) ) {
			fraction = 0;
		}

		return findStateIndex( full, fraction );
	}

	function loadSavedIndex( fallbackIndex ) {
		try {
			var stored = localStorage.getItem( STORAGE_KEY );

			if ( stored !== null ) {
				var parsed = JSON.parse( stored );

				if (
					parsed &&
					typeof parsed === 'object' &&
					parsed.full !== undefined &&
					parsed.fraction !== undefined
				) {
					return findStateIndex( parsed.full, parsed.fraction );
				}
			}

			var oldStored = localStorage.getItem( LEGACY_STORAGE_KEY );

			if ( oldStored !== null ) {
				var oldLevel = parseInt( oldStored, 10 );

				if ( !isNaN( oldLevel ) ) {
					return findStateIndex( oldLevel, 0 );
				}
			}
		} catch ( e ) {}

		return fallbackIndex;
	}

	function saveState( state ) {
		try {
			localStorage.setItem( STORAGE_KEY, JSON.stringify( {
				full: state.full,
				fraction: state.fraction
			} ) );
		} catch ( e ) {}
	}

	function formatLevelLabel( state ) {
		if ( !state || state.full === 0 ) {
			return '0';
		}

		if ( state.full === MAX_FULL_LEVEL && state.fraction === 0 ) {
			return String( MAX_FULL_LEVEL );
		}

		return state.full + ' + ' + state.fraction + '/' + state.denom;
	}

	function trimNumber( value, decimals ) {
		var text = Number( value ).toFixed( decimals );
		return text.replace( /\.?0+$/, '' );
	}

	function formatSignedValue( value, originalSign, statKey ) {
		var text;

		if ( statKey === 'WT' ) {
			return Number( value ).toFixed( 1 );
		}

		if ( Math.abs( value - Math.round( value ) ) < 0.0000001 ) {
			text = String( Math.round( value ) );
		} else {
			text = trimNumber( value, 3 );
		}

		if ( value > 0 && originalSign === '+' ) {
			return '+' + text;
		}

		return text;
	}

	function scalePrimarySpreadsheetStat( signedBase, state ) {
		var full = state.full;
		var effective = getEffectiveLevel( state );

		if ( signedBase === 0 ) {
			return 0;
		}

		if ( signedBase > 0 && signedBase <= 10 ) {
			return signedBase + full;
		}

		if ( signedBase > 10 ) {
			return intFloor( signedBase + excelRound( signedBase * effective / 10, 0 ) );
		}

		/*
		 * Negative stats mirror positive-stat growth in reverse:
		 *   - penalties of 10 or less improve by 1 full point per whole tier;
		 *   - larger penalties improve by 10% per effective tier, rounded
		 *     with the same spreadsheet rule as positive stats.
		 * Never cross above zero.
		 */
		if ( Math.abs( signedBase ) <= 10 ) {
			return Math.min( 0, signedBase + full );
		}

		return Math.min(
			0,
			signedBase + excelRound( Math.abs( signedBase ) * effective / 10, 0 )
		);
	}

	function scaleDamage( signedBase, state ) {
		var effective = getEffectiveLevel( state );

		if ( signedBase <= 0 ) {
			return signedBase;
		}

		return signedBase + intFloor( signedBase * effective / 10 );
	}

	function scaleRange( base, state ) {
		if ( base < 0 ) {
			return base;
		}

		return base + ( 10 * state.full );
	}

	function scaleFlatFullLevelStat( signedBase, state ) {
		if ( signedBase > 0 ) {
			return signedBase + state.full;
		}

		return signedBase;
	}

	function scaleWeight( base, state ) {
		var totalProgression;
		var rawWeight;

		if ( !state || state.full <= 0 || base <= 0.1 ) {
			return base;
		}

		totalProgression = getTotalProgression( state );

		if ( totalProgression <= 0 ) {
			return base;
		}

		rawWeight = base * ( 1 + ( -0.09 * log2( totalProgression ) ) );

		return Math.max( 0, excelRoundUp( rawWeight, 1 ) );
	}

	function valuesDiffer( a, b ) {
		return Math.abs( Number( a ) - Number( b ) ) > 0.0000001;
	}

	function placeDamageBonusBeforeRatio( $itemdata ) {
		var $ratio = $itemdata.find( '.ils-ratio' ).first();
		var $bonus = $itemdata.find( '.eql-generated-damage-bonus' ).first();
		var node;
		var match;
		var field;
		var before;
		var after;

		if ( !$ratio.length ) {
			return;
		}

		if ( !$bonus.length ) {
			// Explicit values remain authoritative; move their existing text only.
			var walker = document.createTreeWalker( $itemdata[ 0 ], NodeFilter.SHOW_TEXT );
			var bonusRegex = /\b(?:DMG|Damage)\s+Bon(?:us)?\s*:\s*[+\-]?\d+(?:\.\d+)?(?:\s*@\s*lvl\s*\d+)?/i;
			while ( ( node = walker.nextNode() ) ) {
				match = node.nodeValue.match( bonusRegex );
				if ( !match ) {
					continue;
				}
				node = node.splitText( match.index );
				node.splitText( match[ 0 ].length );
				field = document.createElement( 'span' );
				field.className = 'ils-damage-bonus';
				node.parentNode.replaceChild( field, node );
				field.appendChild( node );
				$bonus = $( field );
				break;
			}
		}

		if ( !$bonus.length ) {
			return;
		}

		// Remove the old row's break only when the bonus occupied that row alone.
		before = $bonus[ 0 ].previousSibling;
		after = $bonus[ 0 ].nextSibling;
		while ( before && before.nodeType === 3 && !before.nodeValue.trim() ) {
			before = before.previousSibling;
		}
		while ( after && after.nodeType === 3 && !after.nodeValue.trim() ) {
			after = after.nextSibling;
		}
		if ( ( !before || before.nodeName === 'BR' ) && after && after.nodeName === 'BR' ) {
			$( after ).remove();
		}
		if ( !/^\s/.test( $bonus.text() ) ) {
			$bonus.prepend( '\u00a0\u00a0' );
		}
		$bonus.insertBefore( $ratio );
	}

	function instrumentStats( $itemdata ) {
		var html = $itemdata.html();
		var regex = buildStatRegex();
		var rawText = $itemdata.text();
		var delayMatch = rawText.match( /Atk[\s\u00a0]+Delay:\s*(\d+(?:\.\d+)?)/i );
		var delay = delayMatch ? parseFloat( delayMatch[ 1 ] ) : 0;
		var foundQualifiers = {};

		if ( $itemdata.attr( 'data-ils-instrumented' ) === '1' ) {
			return;
		}

		$itemdata.attr( 'data-ils-instrumented', '1' );

		html = html.replace( regex, function ( match, statName, colon, sign, num, pct, offset, sourceHtml ) {
			var baseVal = parseFloat( num );
			var statKey = canonicalStatKey( statName );

			/*
			 * The generic stat regex can see the "DMG:" token inside labels such as
			 * "Cold DMG:" or "Backstab DMG:". Only instrument a standalone DMG field.
			 */
			if ( statKey === 'DMG' && !isStandaloneDamageField( sourceHtml, offset ) ) {
				return match;
			}

			if ( svVoidQualifiers.indexOf( statKey ) !== -1 ) {
				foundQualifiers[ statKey ] = true;
			}

			var span = statName + colon +
				'<span class="ils-stat" ' +
					'data-ils-base="' + baseVal + '" ' +
					'data-ils-sign="' + sign + '" ' +
					'data-ils-stat="' + statKey + '">' +
					sign + num +
				'</span>' + pct;

			if ( statKey === 'DMG' && delay > 0 ) {
				var ratio = ( baseVal / delay ).toFixed( 2 );

				span += '<span class="ils-ratio" data-ils-delay="' + delay + '">' +
					'&nbsp;&nbsp;<span class="ils-ratio-label">Ratio:</span> ' +
					'<span class="ils-ratio-value">(' + ratio + ')</span>' +
				'</span>';
			}

			return span;
		} );

		var qualifierCount = Object.keys( foundQualifiers ).length;
		var svVoidEligible = qualifierCount >= 2;

		html += '<span class="ils-void-resist" data-ils-svvoid-eligible="' +
			( svVoidEligible ? '1' : '0' ) +
		'"></span>';

		$itemdata.html( html );
		placeDamageBonusBeforeRatio( $itemdata );
	}

	function applyLevel( $container, state ) {
		var effective = getEffectiveLevel( state );

		$container.find( '.ils-stat' ).each( function () {
			var $span = $( this );
			var baseAbs = parseFloat( $span.attr( 'data-ils-base' ) );
			var originalSign = $span.attr( 'data-ils-sign' ) || '';
			var statKey = $span.attr( 'data-ils-stat' );
			var signedBase = originalSign === '-' ? -baseAbs : baseAbs;
			var newVal;

			if ( spreadsheetPrimaryStats.indexOf( statKey ) !== -1 ) {
				newVal = scalePrimarySpreadsheetStat( signedBase, state );
			} else if ( statKey === 'DMG' ) {
				newVal = scaleDamage( signedBase, state );
			} else if ( statKey === 'RANGE' ) {
				newVal = scaleRange( baseAbs, state );
			} else if ( flatFullLevelStats.indexOf( statKey ) !== -1 ) {
				newVal = scaleFlatFullLevelStat( signedBase, state );
			} else if ( statKey === 'WT' ) {
				newVal = scaleWeight( baseAbs, state );
			} else {
				newVal = signedBase;
			}

			$span
				.text( formatSignedValue( newVal, originalSign, statKey ) )
				.attr( 'data-ils-current-value', newVal );

			if ( effective > 0 && valuesDiffer( newVal, signedBase ) ) {
				$span.addClass( 'ils-modified' );
			} else {
				$span.removeClass( 'ils-modified' );
			}
		} );

		$container.find( '.ils-ratio' ).each( function () {
			var $ratio = $( this );
			var ratioDelay = parseFloat( $ratio.attr( 'data-ils-delay' ) );

			if ( !ratioDelay ) {
				return;
			}

			var $dmgSpan = $container.find( '.ils-stat[data-ils-stat="DMG"]' ).first();

			if ( !$dmgSpan.length ) {
				return;
			}

			var dmgVal = parseFloat( $dmgSpan.attr( 'data-ils-current-value' ) );
			var baseDmg = parseFloat( $dmgSpan.attr( 'data-ils-base' ) );

			if ( isNaN( dmgVal ) || dmgVal <= 0 ) {
				return;
			}

			var $ratioVal = $ratio.find( '.ils-ratio-value' );

			$ratioVal.text( '(' + ( dmgVal / ratioDelay ).toFixed( 2 ) + ')' );

			if ( valuesDiffer( dmgVal, baseDmg ) ) {
				$ratioVal.addClass( 'ils-modified' );
			} else {
				$ratioVal.removeClass( 'ils-modified' );
			}
		} );

		var $vr = $container.find( '.ils-void-resist' );

		if ( $vr.length ) {
			var eligible = $vr.attr( 'data-ils-svvoid-eligible' ) === '1';

			if ( state.full > 0 && eligible ) {
				$vr
					.text( 'SV VOID: +' + state.full )
					.addClass( 'ils-vr-active ils-modified' );
			} else {
				$vr
					.text( '' )
					.removeClass( 'ils-vr-active ils-modified' );
			}
		}
	}

	function insertSlider( $itemtop, $itemdata, index ) {
		var sliderId = 'ils-slider-' + index;
		var labelId = 'ils-label-' + index;
		var defaultIndex = getConfiguredDefaultIndex();
		var savedIndex = loadSavedIndex( defaultIndex );
		var initialState = levelStates[ savedIndex ];
		var currentIndex = savedIndex;

		var $sliderWrap = $(
			'<div class="ils-slider-container">' +
				'<label class="ils-slider-label" for="' + sliderId + '">Item Level:</label>' +
				'<button type="button" class="ils-step-button ils-step-down" aria-label="Decrease item level">−</button>' +
				'<input type="range" id="' + sliderId + '" class="ils-slider" min="0" max="' + SLIDER_MAX + '" step="1" value="' + stateToSliderPosition( initialState ) + '">' +
				'<button type="button" class="ils-step-button ils-step-up" aria-label="Increase item level">+</button>' +
				'<span class="ils-level-display" id="' + labelId + '">' + formatLevelLabel( initialState ) + '</span>' +
				'<span class="ils-level-pct"></span>' +
			'</div>'
		);

		var $itembg = $itemtop.next( '.itembg' );
		var $itembot = $itembg.next( '.itembotbg' );
		var $wrapper = $( '<div class="ils-item-wrapper"></div>' );

		$itemtop.before( $wrapper );
		$wrapper
			.append( $sliderWrap )
			.append( $itemtop )
			.append( $itembg )
			.append( $itembot );

		var $slider = $sliderWrap.find( '.ils-slider' );
		var $label = $sliderWrap.find( '#' + labelId );
		var $pct = $sliderWrap.find( '.ils-level-pct' );

		function updatePctDisplay( state ) {
			var effective = getEffectiveLevel( state );

			if ( effective <= 0 ) {
				$pct.text( '' );
				return;
			}

			$pct.text( '(+' + trimNumber( effective * 10, 3 ) + '%)' );
		}

		function setSliderIndex( newIndex, persist ) {
			newIndex = clampIndex( newIndex );
			currentIndex = newIndex;

			var state = levelStates[ newIndex ];

			$slider.val( stateToSliderPosition( state ) );
			$label.text( formatLevelLabel( state ) );
			updatePctDisplay( state );
			applyLevel( $itemdata, state );

			if ( persist ) {
				saveState( state );
			}
		}

		function getCurrentIndex() {
			return currentIndex;
		}

		$slider.on( 'input', function () {
			setSliderIndex( sliderPositionToStateIndex( this.value ), true );
		} );

		$sliderWrap.find( '.ils-step-down' ).on( 'click', function () {
			setSliderIndex( getCurrentIndex() - 1, true );
		} );

		$sliderWrap.find( '.ils-step-up' ).on( 'click', function () {
			setSliderIndex( getCurrentIndex() + 1, true );
		} );

		setSliderIndex( savedIndex, false );
	}

	function initItemLevelSliders( root ) {
		var $root = root ? $( root ) : $( document );
		var $itemBoxes = $root.find( '.itemtopbg' );

		if ( $root.is && $root.is( '.itemtopbg' ) ) {
			$itemBoxes = $itemBoxes.add( $root );
		}

		if ( $itemBoxes.length === 0 ) {
			return;
		}

		$itemBoxes.each( function () {
			var $itemtop = $( this );
			var $itembg = $itemtop.next( '.itembg' );
			var $itemdata = $itembg.find( '.itemdata' );

			if ( $itemdata.length === 0 ) {
				return;
			}

			if ( $itemtop.closest( '.ils-item-wrapper' ).length ) {
				return;
			}

			if ( $itemtop.attr( 'data-ils-ready' ) === '1' ) {
				return;
			}

			$itemtop.attr( 'data-ils-ready', '1' );

			instrumentStats( $itemdata );
			insertSlider( $itemtop, $itemdata, sliderCounter++ );
		} );
	}

	window.eqlItemLevelSliderRefresh = function ( root ) {
		initItemLevelSliders( root || document );
	};

	$( function () {
		initItemLevelSliders( document );
	} );

	if ( window.mw && mw.hook ) {
		mw.hook( 'wikipage.content' ).add( function ( $content ) {
			initItemLevelSliders( $content );
		} );
	}

}( jQuery, mediaWiki ) );
mw.loader.state({
    "ext.itemLevelSlider": "ready"
});