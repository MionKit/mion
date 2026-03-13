/**
 * Test fixture for pure server functions.
 *
 * ⚠️ DO NOT MODIFY: These functions MUST contain TypeScript type annotations
 * to test that the plugin correctly handles TypeScript in function bodies.
 * The plugin should strip types when generating the virtual module.
 */
import {pureServerFn} from '@mionjs/core';

/** Maps users to their preferences - uses TypeScript type annotations */
export const mapUsersToPreferences = pureServerFn(function mapUsersToPreferences(users: any[]) {
    return users.map((u: any) => ({userId: u.id, prefs: u.preferences}));
});

/** Adds one to a number - uses TypeScript type annotation */
export const addOne = pureServerFn(function addOne(x: number) {
    return x + 1;
});

/** Combines two arrays - uses TypeScript type annotations */
export const combineArrays = pureServerFn(function combineArrays(a: any[], b: any[]) {
    return [...a, ...b];
});

/** Filters items by a threshold - uses TypeScript type annotations */
export const filterByThreshold = pureServerFn(function filterByThreshold(items: any[]) {
    const threshold: number = 10;
    return items.filter((item: any) => item.value > threshold);
});
