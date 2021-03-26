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
    // remove optional aliases (parenthesised aliase like { ... "aliases": ["(min)"] ...})
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
                    pu.aliases = u.aliases.flatMap(a => p.aliases.map(pa => pa + a))
                                    .filter(a => a != pu.symbol);
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

        const atteds = u.attributes.map(a => {
            const atted = util.cloneProps(u, ['interval', 'baseUnit', 'attributes']);  // attributed unit
            atted.attribute = a.name;
            util.copyProps(a, atted, ['name']);
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
        return unitdef.json.composites.map(c => {
            if(c.includes('*')) return mkop(c, '*', unitdef.id);
            else if(c.includes('/')) return mkop(c, '/', unitdef.id);
            else throw new Error('Necessary operators ("*" or "/") do not appear');
        })
    });

    opes.forEach(ope => {
        const json = simplifiedUnitdefs.find(ud => ud.id == ope.target).json;
        const op = util.cloneProps(ope, ['target']);
        if(json.operations == undefined) json.operations = new Array();
        json.operations.push(op)
    })

    function mkop(comp, op, result){
        const ss = comp.split(op);
        return {'operation': op, 'target': ss[0].trim(), 'argument': ss[1].trim(), 'result': result };
    }
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
    unitdefs.map(ud => ud.json).filter(j => j.units != undefined).forEach(json => {
        const atts = json.units.filter(u => u.attribute != undefined)
        if(atts.length > 0){
            json.attributes = new Array();
            atts.forEach(u => {
                const att = json.attributes.find(a => a.name == u.attribute);
                if(att == undefined)
                    json.attributes.push({'name': u.attribute, 'parents': [u.name]});
                else
                    att.parents.push(u.name);
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

        // used types
        const usedTypes = getUsedTypes(unitdef);
        if(usedTypes.length > 0){
            use.types = usedTypes; 
            hasUse = true;
        }

        // used units
        const uus = getUsedUnits(unitdef);
        if(uus.usedUnits.length > 0){
            use.units = uus.usedUnits; 
            hasUse = true;
        }
        if(uus.useSelfUnits){
            use.selfUnits = true;
            hasUse = true;
        }

        // constants
        if(isUsingConstants(unitdef)){
            use.constants = true;
            hasUse = true;
        }

        if(hasUse) unitdef.json.use = use
    });

    function getUsedTypes(unitdef){
        const json = unitdef.json;
        const typeSet = new Set();

        // types under 'operations'
        if(json.operations){
            json.operations.flatMap(op => [op.argument, op.result])
                .forEach(t => typeSet.add(t));
        }
        // types under 'convertibles'
        if(json.convertibles){
            json.convertibles.forEach(c => typeSet.add(c.result))
        }

        return resolveSubpackages(unitdef, typeSet, unitdefs, true);
    }

    function getUsedUnits(unitdef){
        const json = unitdef.json;

        let useSelfUnits = false;
        const typeSet = new Set();

        // units in 'interval'
        if(json.units){
            const unitRegex = util.getUnitRegex();
            json.units.filter(u => u.baseUnit).flatMap(u => u.baseUnit.match(unitRegex)).forEach(u => {
                if(u.includes('.')){
                    typeSet.add(u.split('.')[0]);
                }else{
                    useSelfUnits = true;
                }
            });
        }

        const types = resolveSubpackages(unitdef, typeSet, unitdefs, false);
        return { 'usedUnits': types, 'useSelfUnits': useSelfUnits };
    }

    function isUsingConstants(unitdef){
        const json = unitdef.json;
        if(json.convertibles
             && json.convertibles.filter(c => c.factor).find(c => c.factor.includes('Constants')))
            return true;
        else if(json.units
             && json.units.filter(u => u.interval).find(u => u.interval.includes('Constants')))
            return true;
        else
            return false;

    }

    function resolveSubpackages(unitdef, typeSet, unitdefs, isRemovingSamePackage){
        typeSet.delete(unitdef.id);
        if(isRemovingSamePackage){
            const sp = unitdef.subpackage;
            const rms = new Array();
            for(let t of typeSet) if(t.startsWith(sp)) rms.push(t);
            rms.forEach(t => typeSet.delete(t));
        }

        return util.resolveSubpackages(typeSet, unitdefs);
    }
}