const util = require('./util.js');
const prefixerProvider = require('./prefixer.js');

exports.simplify = function(unitdefs){
    const simplifiedUnitdefs = unitdefs.map(j => simplifyUnitdef(j));
    constructOperations(simplifiedUnitdefs, unitdefs);
    constructAttributes(simplifiedUnitdefs);
    constructUse(simplifiedUnitdefs);
    return simplifiedUnitdefs;
}

function simplifyUnitdef(unitdef){
    const simplified = util.cloneProps(unitdef.json, ['composites', 'units'])

    if(unitdef.json.units){
        simplified.units = unitdef.json.units.flatMap(u => simplifyUnit(u));
    }

    return { 'id': unitdef.id, 'subpackage': unitdef.subpackage, 'json': simplified };
}

function simplifyUnit(u){
    if(u.symbol === undefined) u.symbol = u.name.replace(/\s/ig, '_');
    
    // remove optional aliases (parenthesised alias like { ... "aliases": ["(min)"] ...})
    if(u.aliases && u.aliases.filter(a => a.startsWith('('))){
        const as = u.aliases.filter(a => !a.startsWith('('));
        if(as.length > 0){
            u.aliases = as;
        }else{
            delete u.aliases;
        }
    }

    if(u.scalePrefixes){
        const su = util.cloneProps(u, ['scalePrefixes', 'excludePrefixes']);  // simplified unit

        const prefixer = prefixerProvider.get(u.name);
        const prefixed = util.getPrefixes(u.scalePrefixes, u.excludePrefixes).map(p => {
            const pu = {};  // prefixed unit
            prefixer.putName(pu, p, u);
            pu.symbol = p.prefix + u.symbol;

            if(u.aliases){
                if(p.aliases){
                    const unitSymbols = [u.symbol, ...u.aliases];
                    const prefixSymbols = [p.prefix, ...p.aliases];
                    pu.aliases = unitSymbols.flatMap(a => prefixSymbols.map(pa => pa + a))
                                    .filter(a => a !== pu.symbol);
                }else{
                    pu.aliases = u.aliases.map(a => p.prefix + a);
                }
            }else{
                if(p.aliases)
                    pu.aliases = p.aliases.map(pa => pa + u.symbol);
            }

            prefixer.putInterval(pu, p, u);
            prefixer.putBaseUnit(pu, p, u);

            if(u.notExact) pu.notExact = u.notExact;

            return pu;
        });

        return [su].concat(prefixed);

    }else if(u.attributes){
        const su = util.cloneProps(u, ['attributes']);
        su.attributes = u.attributes.map(a => a.name);

        const atteds = u.attributes.map(att => {
            // attributed unit
            const atted = {
                'name': `${u.name}(${att.name})`,
                'symbol': `${u.symbol}(${att.name})`
            };
            util.copyProps(att, atted, ['name']);
            
            if(u.aliases !== undefined){
                const attedAtts = u.aliases.map(a => `${a}(${att.name})`);
                if(atted.aliases != undefined)
                    atted.aliases.concat(attedAtts);
                else
                    atted.aliases = attedAtts;
            }

            return atted;
        });
        return [su].concat(atteds);

    }else{
        return [u];
    }
}

/* construct 'operations' element to the top of unitdef json:
{
  "operations": [
    { "operation": "*", "argument": "Length", "result": "Area" },
    { "operation": "/", "argument": "TimeSquared", "result": "Acceleration" },
    ...
}
*/
function constructOperations(simplifiedUnitdefs, unitdefs){
    const opes = unitdefs.filter(ud => ud.json.composites).flatMap(unitdef => {
        return unitdef.json.composites.flatMap(c => {
            if(c.includes('*')){
                const ss = c.split('*').map(s => s.trim());
                return [
                    {'operation': '*', 'target': ss[0], 'argument': ss[1], 'result': unitdef.id },
                    {'operation': '*', 'target': ss[1], 'argument': ss[0], 'result': unitdef.id,
                     'reverse': true }
                ];
            }else if(c.includes('/')){
                const ss = c.split('/').map(s => s.trim());
                const resultType = extractResultType(unitdef)
                return [
                    {'operation': '/', 'target': ss[0], 'argument': ss[1], 'result': resultType },
                ];
            }else{
                throw new Error('Necessary operators ("*" or "/") do not appear');
            }

            // radio.freq.SpectralIrradiance returns freq.SpectralIrradiance
            function extractResultType(unitdef){
                const subpackage = unitdef.subpackage;
                if(subpackage.includes('.')){
                    const i = subpackage.indexOf('.');
                    return subpackage.substring(i+1) + '.' + unitdef.id;
                }else{
                    return unitdef.id
                }
            }
        });
    });

    opes.forEach(ope => {
        const json = simplifiedUnitdefs.find(ud => ud.id === ope.target).json;
        delete ope.target;
        if(json.operations === undefined) json.operations = new Array();

        if(ope.operation === '*'){
            const o2 = json.operations.find(o => o.operation === '*' && o.argument === ope.argument);
            if(o2 === undefined){
                json.operations.push(ope);
            }else{
                if(o2.result !== ope.result)
                    throw new Error(`The result types are inconsistent: ${ope.result} and ${o2.result}`)
                if(o2.reverse) 
                    delete o2.reverse;
            }
        }else{
            json.operations.push(ope);
        }
    });
}

/* construct 'attributes' element to the top of unitdef json:
{
    ...
    'attributes': [
        {'name': 'US', 'parent': ['foot', 'mile', ...] },
        {'name': 'imp', 'parent': ['cable', ...] },
        ...
    ]
}
*/
function constructAttributes(unitdefs){
    unitdefs.filter(ud => ud.json.units).forEach(ud => {
        const json = ud.json
        const atts = json.units.filter(u => u.name.includes('('));
        if(atts.length > 0){
            json.attributes = new Array();
            atts.forEach(u => {
                // decompose 'uName(aName)' to uName and aName
                const i = u.name.indexOf('(');
                const uName = u.name.substring(0, i);
                const aName = u.name.substring(i+1, u.name.length-1);

                const att = json.attributes.find(a => a.name === aName);
                if(att === undefined)
                    json.attributes.push({'name': aName, 'parents': [uName]});
                else
                    att.parents.push(uName);
            });
        }
    });
}

/* construct 'use' element to the top of unitdef json:
{
    'use': {
        'type': ['foot', 'mile', ...] ,
        'unit': ['cable', ...] ,
        'constants': true
    }
    ...
}
*/
function constructUse(unitdefs){
    unitdefs.forEach(unitdef => {
        let hasUse = false;
        const use = {};
        const json = unitdef.json

        // constants
        if(isUsingConstants(json)){
            use.constants = true;
            hasUse = true;
        }

        // used subpackages
        const typeSet = new Set();

        //*** types in si_unit */
        ['*', '/'].forEach(sep => {
            if(json.si_unit.includes(sep)){
                json.si_unit.split(sep).forEach(s => typeSet.add(s.trim()));
            }
        });

        //*** types in 'convertibles'
        if(json.convertibles){
            json.convertibles.forEach(c => {
                typeSet.add(c.result)
                util.appendSubpackages(c.from, typeSet);
                util.appendSubpackages(c.to, typeSet);
            });
        }

        //*** types in 'operations'
        if(json.operations){
            json.operations.forEach(op => {
                typeSet.add(op.argument);
                // exclude freq.SpectralIrradiance
                if(!op.result.includes('.')) typeSet.add(op.result);
            });
        }

        //*** types in 'interval'
        if(json.units){
            json.units.filter(u => u.baseUnit)
                .forEach(u => util.appendSubpackages(u.baseUnit, typeSet));
        }

        const sps = util.resolveSubpackages(typeSet, unitdefs, unitdef.subpackage);
        if(sps.length > 0){
            use.subpackages = sps;
            hasUse = true;
        }

        if(hasUse) unitdef.json.use = use;
    });

    function isUsingConstants(json){
        if(json.convertibles
             && json.convertibles.filter(c => c.factor).find(c => c.factor.includes('Constants')))
            return true;
        else if(json.units
             && json.units.filter(u => u.interval).find(u => u.interval.includes('Constants')))
            return true;
        else
            return false;

    }
}