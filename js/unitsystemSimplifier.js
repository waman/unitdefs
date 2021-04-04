const fs = require('fs');
const path = require('path');

const util = require('./util.js');

exports.simplify = function(src, dest, unitdefs){
    const unitsystemSrc = path.join(src, 'unitsystem');
    const unitsystemDest = path.join(dest, 'unitsystem');
    if(!fs.existsSync(unitsystemDest)) fs.mkdirSync(unitsystemDest);

    const unitRegex = util.getUnitRegex();

    fs.readdir(unitsystemSrc, function(err, files){
        if(err) return console.error(err.message);
        files.forEach(f => {
            const json = JSON.parse(fs.readFileSync(path.join(unitsystemSrc, f), 'utf8'));
            json.use = extractUse(json);

            const destFile = path.join(unitsystemDest, f)
            fs.writeFile(destFile, JSON.stringify(json, null, 2), function(err){
                if(err) return console.log(err.message);
                else return console.log('[Write] '+ destFile);
            });
        });
    });

    function extractUse(json){
        const types = new Set();

        json.evaluations.forEach(eval => {
            types.add(eval.quantity);
            eval.unit.match(unitRegex).forEach(unit => {
                if(unit.includes('.'))
                    types.add(unit.split('.')[0]);
            });
        });

        const sps = util.resolveSubpackages(types, unitdefs);
        return { 'subpackages': sps };
    }
}