"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const no_typeof_runtype_1 = __importDefault(require("./rules/no-typeof-runtype"));
const plugin = {
    rules: {
        'no-typeof-runtype': no_typeof_runtype_1.default,
    },
};
module.exports = plugin;
exports.default = plugin;
