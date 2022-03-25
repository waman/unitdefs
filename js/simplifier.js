const fs = require('fs');
const path = require('path');

const util = require('./util.js');

const src = 'json';
const dest = 'json_simplified';

// initialize directories
if(fs.existsSync(dest)) util.rmdirs(dest);
util.mkdirs(dest);

// Simple Resources (Properties.json, Cnstants.json, ScalePrefixes.json)
const simpleResources = ['Properties.json', 'Constants.json', 'ScalePrefixes.json'];
simpleResources.forEach(rsrc => copyResource(rsrc));

// json/unit/def
const unitdefsSimplifier = require('./unit_def_simplifier.js');
const unitdefs = readUnitdefs(src);

const simplifiedUnitdefs = unitdefsSimplifier.simplify(unitdefs);
writeUnitdefs(dest, simplifiedUnitdefs);

// json/unit/custom
const unitCustomsSimplifier = require('./unit_custom_simplifier.js');
unitCustomsSimplifier.simplify(src, dest, simplifiedUnitdefs);

// json/unitsystem
const unitsystemSimplifier = require('./unitsystem_simplifier.js');
unitsystemSimplifier.simplify(src, dest, simplifiedUnitdefs);


function copyResource(filename){
    const from = path.join(src, filename);
    const to = path.join(dest, filename);
    fs.copyFile(from, to, function(err){
        if(err) return console.log(err.message);
        else return console.log('[Write] '+ to);
    });
}

function readUnitdefs(srcRoot){
    const def = path.join(srcRoot, 'unit', 'def')
    return read(def, '');

    function read(def, subdir){
        const dir = path.join(def, subdir);
        return fs.readdirSync(dir).flatMap(f => {
            const fn = path.join(dir, f);
            if(fs.statSync(fn).isDirectory()){
                const sp = subdir === '' ? f : path.join(subdir, f);
                return read(def, sp);
            }else{
                const id = f.replace('.json', '');
                const json = JSON.parse(fs.readFileSync(fn, 'utf8'));
                const subpackage = subdir.replace(path.sep, '.');
                return [{ 'id': id, 'subpackage': subpackage, 'json': json }];
            }
        });

    }
}

function writeUnitdefs(destRoot, unitdefs){
    const def = path.join(destRoot, 'unit', 'def')
    unitdefs.forEach(unitdef => {
        const destDir = path.join(def, unitdef.subpackage.replace('.', path.sep));
        if(!fs.existsSync(destDir)) util.mkdirs(destDir);

        const dest = path.join(destDir, unitdef.id + '.json');
        fs.writeFile(dest, JSON.stringify(unitdef.json, null, 2), function(err){
            if(err) return console.log(err.message);
            else return console.log('[Write] '+ dest);
        });
    });
}