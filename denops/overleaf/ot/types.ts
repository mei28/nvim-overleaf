// OT operation types matching Overleaf's ShareJS-based protocol.
// Positions are Unicode character offsets (not byte offsets).

export interface InsertOp {
  /** Text to insert */
  i: string;
  /** Position (0-based Unicode character offset) */
  p: number;
}

export interface DeleteOp {
  /** Text to delete (used for verification) */
  d: string;
  /** Position (0-based Unicode character offset) */
  p: number;
}

export type Op = InsertOp | DeleteOp;

export type OpList = Op[];

export function isInsert(op: Op): op is InsertOp {
  return 'i' in op;
}

export function isDelete(op: Op): op is DeleteOp {
  return 'd' in op;
}
