export interface Shelf { aisle: string; level: number }
export declare enum Stock { In = "in", Out = "out" }
export declare class Crate { #private; size: number; label(): string }
