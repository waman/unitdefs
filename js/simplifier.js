const fs = require('fs');
const path = require('path');

const src = 'def';
const dest = 'simplified';

const util = require('./util.js');
const prefixerProvider = require('./prefixer.js');

const srcRoot = path.join('json', 'unit', src);
const destRoot = path.join('json', 'unit', dest);
const unitRegex = /(\w+\.)?\w+([(]\w+[)])?/ig;  // gallon, gallon(US_fl), Length.mile etc.

if(fs.existsSync(destRoot)) util.rmdirs(destRoot);
const jsons = readUnitdefs('');
const simplifiedJsons = jsons.map(j => simplify(j));
constructOperations(jsons, simplifiedJsons);
constructAttributes(simplifiedJsons);
constructUse(simplifiedJsons);

writeUnitdefs(simplifiedJsons);

function readUnitdefs(subpackage){
    const dir = path.join(srcRoot, subpackage);
    return fs.readdirSync(dir).flatMap(f => {
        const fn = path.join(dir, f);
        if(fs.statSync(fn).isDirectory()){
            const sp = subpackage == '' ? f : path.join(subpackage, f);
            return readUnitdefs(sp);
        }else{
            const id = f.replace('.json', '');
            const json = JSON.parse(fs.readFileSync(fn, 'utf8'));
            return [{ 'id': id, 'subpackage': subpackage, 'json': json }];
        }
    });
}

function simplify(rsrc){
    const simplified = util.cloneProps(rsrc.json, ['composites', 'units'])

    if(rsrc.json.units){
        simplified.units = rsrc.json.units.flatMap(u => simplifyUnit(u));
    }

    return { 'id': rsrc.id, 'subpackage': rsrc.subpackage, 'json': simplified };
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

/* construct 'operations' element to the top of rsrc.json:
{
  "operations": [
    { "operation": "*", "argument": "Length", "result": "Area" },
    { "operation": "/", "argument": "TimeSquared", "result": "Acceleration" },
    ...
}
*/
function constructOperations(jsons, simplifiedJsons){
    const opes = jsons.filter(rsrc => rsrc.json.composites != undefined).flatMap(rsrc => {
        return rsrc.json.composites.map(c => {
            if(c.includes('*')) return mkop(c, '*', rsrc.id);
            else if(c.includes('/')) return mkop(c, '/', rsrc.id);
            else throw new Error('Necessary operators ("*" or "/") do not appear');
        })
    });

    opes.forEach(ope => {
        const json = simplifiedJsons.find(rsrc => rsrc.id == ope.target).json;
        const op = util.cloneProps(ope, ['target']);
        if(json.operations == undefined) json.operations = new Array();
        json.operations.push(op)
    })

    function mkop(comp, op, result){
        const ss = comp.split(op);
        return {'operation': op, 'target': ss[0].trim(), 'argument': ss[1].trim(), 'result': result };
    }
}

/* construct 'attributes' element to the top of rsrc.json:
{
    ...
    'attributes': [
        {'name': 'US', 'parent': ['foot', 'mile', ...] },
        {'name': 'imp', 'parent': ['cable', ...] },
        ...
    ]
}
*/
function constructAttributes(simplifiedJsons){
    simplifiedJsons.map(rsrc => rsrc.json).filter(j => j.units != undefined).forEach(json => {
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

/* construct 'use' element to the top of rsrc.json:
{
    'use': {
        'type': ['foot', 'mile', ...] ,
        'unit': ['cable', ...] ,
        'constants': true
    }
    ...
}
*/
function constructUse(simplifiedJsons){
    simplifiedJsons.forEach(rsrc => {
        let hasUse = false;
        const use = {};

        // used types
        const usedTypes = getUsedTypes(rsrc);
        if(usedTypes.length > 0){
            use.types = usedTypes; 
            hasUse = true;
        }

        // used units
        const uus = getUsedUnits(rsrc);
        if(uus.usedUnits.length > 0){
            use.units = uus.usedUnits; 
            hasUse = true;
        }
        if(uus.useSelfUnits){
            use.selfUnits = true;
            hasUse = true;
        }

        // constants
        if(isUsingConstants(rsrc.json)){
            use.constants = true;
            hasUse = true;
        }

        if(hasUse) rsrc.json.use = use
    });

    function getUsedTypes(rsrc){
        const json = rsrc.json;
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

        return resolveSubpackage(rsrc, typeSet);
    }

    function getUsedUnits(rsrc){
        const json = rsrc.json;

        let useSelfUnits = false;
        const typeSet = new Set();

        // units in 'interval'
        if(json.units){
            json.units.filter(u => u.baseUnit).flatMap(u => u.baseUnit.match(unitRegex)).forEach(u => {
                if(u.includes('.')){
                    typeSet.add(u.split('.')[0]);
                }else{
                    useSelfUnits = true;
                }
            });
        }

        const types = resolveSubpackage(rsrc, typeSet);
        return { 'usedUnits': types, 'useSelfUnits': useSelfUnits };
    }

    function resolveSubpackage(rsrc, typeSet){
        const types = new Array();
        typeSet.forEach(t => {
            if(t == rsrc.id) return;
            const r = simplifiedJsons.find(j => j.id == t);
            if(r.subpackage) types.push(r.subpackage + '.' + t);
            else types.push(t);
        });
        return types;
    }

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

function writeUnitdefs(simplifiedJsons){
    simplifiedJsons.forEach(rsrc => {
        const destDir = path.join(destRoot, rsrc.subpackage);
        if(!fs.existsSync(destDir)) util.mkdirs(destDir);

        const dest = path.join(destDir, rsrc.id + '.json');
        fs.writeFileSync(dest, JSON.stringify(rsrc.json, null, 2));
        console.log('[Write] '+ dest);
    });
}