const fs = require('fs');
const path = require('path');

const util = require('./util.js');

exports.simplify = function(src, dest, unitdefs){
    const customSrc = path.join(src, 'unit', 'custom');
    const customDest = path.join(dest, 'unit', 'custom');
    if(!fs.existsSync(customDest)) fs.mkdirSync(customDest);

    fs.readdir(customSrc, function(err, files){
        if(err) return console.error(err.message);
        files.forEach(f => {
            const json = JSON.parse(fs.readFileSync(path.join(customSrc, f), 'utf8'));
            const types = extractTypesOfUsedUnits(json);
            json.use = { 'units': types };

            const destFile = path.join(customDest, f)
            fs.writeFile(destFile, JSON.stringify(json, null, 2), function(err){
                if(err) return console.log(err.message);
                else return console.log('[Write] '+ destFile);
            });
        });
    });

    function extractTypesOfUsedUnits(json){
        const usedTypes = new Set();

        json.units.map(u => u.unit).forEach(unit => {
            usedTypes.add(unit.split('.')[0]);
        });

        return util.resolveSubpackages(usedTypes, unitdefs);
    }
}