/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Internet

export const DOMAIN_REGEX = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
export const URL_REGEX = /^(https?):\/\/[^\s/$.?#].[^\s]*$/;
export const URL_EXTENDED_REGEX = /^(https?|ftp|file|mailto|data):\/\/[^\s/$.?#].[^\s]*$/;
export const PHONE_REGEX = /^\+?[0-9]{1,3}-?[0-9]{3,14}$/;
export const IP_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
export const IPV4_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
export const IPV6_REGEX = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
export const IPV4_RANGE_REGEX = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/[0-9]{1,2}$/;

// IDs
export const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
