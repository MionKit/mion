# Scaffolding

This directory contain the files to scaffold a new JIT compiler for a new format XYZ.
It is intended for serialization formats as contains from/to XYZ functions. but could be used for any other jit compiled functions.

Each JIT compiler is basically a giant switch statement that handles all node types. and return the src code for the operation on that node type.
