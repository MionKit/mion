/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// number & length
export type Max<N extends number> = {__max: N};
export type Min<N extends number> = {__min: N};
export type Mod<M extends number> = {__module: M};
export type Range<Mi extends number, Ma extends number> = {__range: [Mi, Ma]};
export type GT<N extends number> = {__gt: N};
export type GTE<N extends number> = {__gte: N};
export type LT<N extends number> = {__lt: N};
export type LTE<N extends number> = {__lte: N};
export type Odd = {__odd: true};
export type Even = {__even: true};
export type Positive = {__positive: true};
export type Negative = {__negative: true};
export type Integer = {__integer: true};
export type Float = {__float: true};
