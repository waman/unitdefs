class DefaultPrefixer{
    constructor(){}
    putName(prefixedUnit, prefix, unit){
        prefixedUnit.name = prefix.name + unit.name;
    }
    putInterval(prefixedUnit, prefix, unit){
        if(unit.interval)
            prefixedUnit.interval = unit.interval + ' * ' + prefix.scale;
        else
            prefixedUnit.interval = prefix.scale;
    }
    putBaseUnit(prefixedUnit, _, unit){
        if(unit.base_unit) prefixedUnit.base_unit = unit.base_unit;
    }
}

const defaultPrefixer = new DefaultPrefixer();

class MetrePoweredPrefixer{
    constructor(powerName, power){
        this.powerName = powerName;  // 'square' or 'cubic'
        this.power = power;  // '2' or '3'
    }
    putName(prefixedUnit, prefix, _){
        prefixedUnit.name = `${this.powerName} ${prefix.name}metre`;
    }
    putInterval(_){}
    putBaseUnit(prefixedUnit, prefix, _){
        prefixedUnit.base_unit = `Length.${prefix.name}metre^${this.power}`
    }
}

class SecondSquaredPrefixer{
    constructor(){}
    putName(prefixedUnit, prefix, _){
        prefixedUnit.name = `${prefix.name}second squared`;
    }
    putInterval(_){}
    putBaseUnit(prefixedUnit, prefix, _){
        prefixedUnit.base_unit = `Time.${prefix.name}second^2`
    }
}

exports.get = function(unitName){
    switch(unitName){
        case 'square metre':
            return new MetrePoweredPrefixer('square', '2');
        case 'cubic metre':
            return new MetrePoweredPrefixer('cubic', '3');
        case 'second squared':
            return new SecondSquaredPrefixer();
        default:
            return defaultPrefixer;
    }
}