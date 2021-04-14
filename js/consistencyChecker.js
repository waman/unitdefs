const auxiliaryMechanicalUnits = ['AreaFrequency', 'TimePerLength', 'TimeSquaredPerLength'];
const auxiliaryElectromagneticUnits = ["ElectricalConductance"];

exports.checkUnitSystem = function(unitsystem, unitdefs){  // unitsystem: {'id': id, 'json': json}
    switch (unitsystem.id) {
        case 'MKS':
        case 'CGS':
            checkNecessaryEntriesExist(unitsystem, unitdefs, "mechanical", isNecessaryMechanicalUnit)
            break;
    
        case 'MKSA':
            checkNecessaryEntriesExist(unitsystem, unitdefs, "electromagnetic", isNecessaryElectromagneticUnit)
            break;
    }

}
  
function checkNecessaryEntriesExist(unitsystem, unitdefs, unitKind, cond){
     const necessaryUnits = unitdefs.filter(ud => cond(ud)).map(ud => ud.id);
     const entries = unitsystem.json.evaluations.map(e => e.quantity);
     necessaryUnits.forEach(nu => {
       if(!entries.includes(nu))
         throw new Error(`${unitsystem.id} must contain the ${unitKind} unit "${nu}".`)
     });
}
  
const isNecessaryMechanicalUnit = function(unitdef){
    const dim = unitdef.json.dimension
    return !auxiliaryMechanicalUnits.includes(unitdef.id) &&
            dim.I == undefined && dim.J == undefined && dim.Θ == undefined && dim.N == undefined;
}
  
const isNecessaryElectromagneticUnit = function(unitdef){
    return !auxiliaryElectromagneticUnits.includes(unitdef.id) &&
             unitdef.json.dimension.I != undefined;
}
  