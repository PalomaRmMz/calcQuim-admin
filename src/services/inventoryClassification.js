// La clasificación auditada es independiente del tipo técnico y del motivo histórico.
export function inventoryMovementClassification(movement,changes){
    return movement.reference?.classification??changes.find(c=>c.action==='initial_classification'&&c.reference.movementId===movement.id)?.reference.classification??null;
}
