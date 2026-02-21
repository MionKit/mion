/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Test setup file that imports the AOT virtual modules.
 * These modules self-register the AOT caches into core.
 */

// Import virtual modules to register AOT caches
import 'virtual:mion-aot/jit-fns';
import 'virtual:mion-aot/router-cache';
