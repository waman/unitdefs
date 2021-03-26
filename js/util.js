const fs = require('fs');
const path = require('path');
        
exports.rmdirs = function(dir){
    fs.readdirSync(dir).forEach(f => {
        const fn = path.join(dir, f);
        if(fs.statSync(fn).isDirectory())
            exports.rmdirs(fn);
        else
            fs.rmSync(fn);
    });
    fs.rmdirSync(dir);
}

exports.mkdirs = function(dir){
    const parent = path.dirname(dir);
    if(!fs.existsSync(parent)) exports.mkdirs(parent);
    if(!fs.existsSync(dir)) fs.mkdirSync(dir);
}

exports.copyProps = function(fromObj, toObj, excludes){
    for(let prop in fromObj){
        if(!excludes.includes(prop)) toObj[prop] = fromObj[prop];
    }
}

exports.cloneProps = function(fromObj, excludes){
    const result = {};
    exports.copyProps(fromObj, result, excludes);
    return result;
}

const scalePrefixes = getScalePrefixes();

function getScalePrefixes(){
    const prefixes = JSON.parse(fs.readFileSync(path.join('json', 'ScalePrefixes.json')));
    prefixes.smaller = prefixes.filter(p => p.scale.includes('e-'));
    prefixes.larger = prefixes.filter(p => !p.scale.includes('e-'));
    return prefixes;
}

exports.getPrefixes = function(scalePrefixKind, excludePrefixes){
    let ps;
    switch(scalePrefixKind){
        case 'all': 
            ps = scalePrefixes;
            break;
        case 'smaller': 
            ps = scalePrefixes.smaller;
            break;
        case 'larger':
            ps = scalePrefixes.larger;
            break;
    }
    if(excludePrefixes){
        return ps.filter(p => !excludePrefixes.includes(p.prefix));
    }else{
        return ps;
    }
}

const unitRegex = /(\w+\.)?\w+([(]\w+[)])?/ig;  // gallon, gallon(US_fl), Length.mile etc.

exports.getUnitRegex = function(){
    return unitRegex;
}

exports.resolveSubpackages = function(typeSet, unitdefs){
    const types = new Array();
    typeSet.forEach(t => {
        const ud = unitdefs.find(u => u.id == t);
        if(ud.subpackage)
            types.push(ud.subpackage + '.' + t);
        else
            types.push(t);
    });
    return types;
}